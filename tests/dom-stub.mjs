// A tiny DOM for UI tests, so the real controllers run in Node without a browser or jsdom. It has elements
// parsed from HTML (the real src/index.html and the templates' output), simple selectors (tag, #id, .class,
// [attr], [attr="v"], :not(…), descendant combinator, comma lists), events with capture and bubbling,
// focus with focusin/focusout, and the window globals the UI reads. There is no layout or CSS: elements
// report the rect a test gives them.

import { inspect } from "node:util";

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const decode = (text) =>
  text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name) => {
    if (name[0] === "#") return String.fromCodePoint(name[1] === "x" || name[1] === "X" ? Number.parseInt(name.slice(2), 16) : Number(name.slice(1)));
    return ENTITIES[name] ?? whole;
  });
const escapeText = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export class StubEvent {
  constructor(type, init = {}) {
    Object.assign(this, { bubbles: false, relatedTarget: null }, init);
    this.type = type;
    this.target = null;
    this.currentTarget = null;
    this.defaultPrevented = false;
    this.stopped = false;
  }
  preventDefault() {
    this.defaultPrevented = true;
  }
  stopPropagation() {
    this.stopped = true;
  }
}

class Listeners {
  constructor() {
    this.listeners = [];
  }
  addEventListener(type, fn, options) {
    const capture = typeof options === "boolean" ? options : Boolean(options?.capture);
    if (this.listeners.some((l) => l.type === type && l.fn === fn && l.capture === capture)) return;
    this.listeners.push({ type, fn, capture, once: Boolean(options?.once) });
  }
  removeEventListener(type, fn, options) {
    const capture = typeof options === "boolean" ? options : Boolean(options?.capture);
    this.listeners = this.listeners.filter((l) => !(l.type === type && l.fn === fn && l.capture === capture));
  }
  /** Run this node's listeners for one phase. */
  invoke(event, capture) {
    event.currentTarget = this;
    for (const listener of [...this.listeners]) {
      if (listener.type !== event.type || listener.capture !== capture) continue;
      if (listener.once) this.removeEventListener(listener.type, listener.fn, listener.capture);
      listener.fn.call(this, event);
    }
  }
}

export class StubNode extends Listeners {
  constructor(document) {
    super();
    this.ownerDocument = document;
    this.parentNode = null;
    this.childNodes = [];
  }
  get parentElement() {
    return this.parentNode instanceof StubElement ? this.parentNode : null;
  }
  [inspect.custom]() {
    return label(this);
  }
  get isConnected() {
    let node = this;
    while (node.parentNode) node = node.parentNode;
    return node instanceof StubDocument;
  }
  contains(node) {
    for (let n = node; n; n = n.parentNode) if (n === this) return true;
    return false;
  }
  appendChild(node) {
    node.remove();
    node.parentNode = this;
    this.childNodes.push(node);
    return node;
  }
  append(...nodes) {
    for (const node of nodes) this.appendChild(typeof node === "string" ? new StubText(this.ownerDocument ?? this, node) : node);
  }
  remove() {
    if (!this.parentNode) return;
    const siblings = this.parentNode.childNodes;
    siblings.splice(siblings.indexOf(this), 1);
    this.parentNode = null;
  }
  get textContent() {
    return this.childNodes.map((node) => node.textContent).join("");
  }
  set textContent(value) {
    for (const node of this.childNodes) node.parentNode = null;
    this.childNodes = [];
    if (value !== "" && value !== null && value !== undefined) this.append(String(value));
  }
  /** Capture from the window down, then the target, then bubble back up (if the event bubbles). */
  dispatchEvent(event) {
    event.target ??= this;
    const path = [];
    for (let node = this; node; node = node.parentNode) path.push(node);
    if (path.at(-1) instanceof StubDocument && globalThis.window) path.push(globalThis.window);
    for (let i = path.length - 1; i > 0 && !event.stopped; i--) path[i].invoke(event, true);
    if (!event.stopped) {
      this.invoke(event, true);
      this.invoke(event, false);
    }
    if (event.bubbles) for (let i = 1; i < path.length && !event.stopped; i++) path[i].invoke(event, false);
    return !event.defaultPrevented;
  }
}

class StubText extends StubNode {
  constructor(document, data) {
    super(document);
    this.data = data;
  }
  get textContent() {
    return this.data;
  }
  set textContent(value) {
    this.data = String(value);
  }
}

class StubStyle {
  #props = new Map();
  setProperty(name, value) {
    this.#props.set(name, String(value));
  }
  getPropertyValue(name) {
    return this.#props.get(name) ?? "";
  }
  removeProperty(name) {
    const old = this.getPropertyValue(name);
    this.#props.delete(name);
    return old;
  }
}

const FOCUSABLE = new Set(["button", "input", "select", "textarea", "summary"]);

export class StubElement extends StubNode {
  constructor(document, tag) {
    super(document);
    this.localName = tag.toLowerCase();
    this.tagName = this.localName.toUpperCase();
    this.attributes = new Map();
    this.style = new StubStyle();
    this.scrollTop = 0;
    /** The rect getBoundingClientRect reports: an object, or a function of the element. */
    this.rect = null;
    this.dataset = new Proxy(
      {},
      {
        get: (_, key) => (typeof key === "string" ? (this.getAttribute(dataName(key)) ?? undefined) : undefined),
        set: (_, key, value) => {
          this.setAttribute(dataName(key), value);
          return true;
        },
        has: (_, key) => this.hasAttribute(dataName(key)),
        deleteProperty: (_, key) => {
          this.removeAttribute(dataName(key));
          return true;
        },
      },
    );
    this.classList = {
      contains: (name) => classes(this).includes(name),
      add: (...names) => this.setAttribute("class", [...new Set([...classes(this), ...names])].join(" ")),
      remove: (...names) =>
        this.setAttribute(
          "class",
          classes(this)
            .filter((name) => !names.includes(name))
            .join(" "),
        ),
      toggle: (name, force) => {
        const on = force ?? !this.classList.contains(name);
        if (on) this.classList.add(name);
        else this.classList.remove(name);
        return on;
      },
    };
  }
  getAttribute(name) {
    return this.attributes.get(name.toLowerCase()) ?? null;
  }
  setAttribute(name, value) {
    this.attributes.set(name.toLowerCase(), String(value));
  }
  hasAttribute(name) {
    return this.attributes.has(name.toLowerCase());
  }
  removeAttribute(name) {
    this.attributes.delete(name.toLowerCase());
  }
  toggleAttribute(name, force) {
    const on = force ?? !this.hasAttribute(name);
    if (on) this.setAttribute(name, this.getAttribute(name) ?? "");
    else this.removeAttribute(name);
    return on;
  }
  get id() {
    return this.getAttribute("id") ?? "";
  }
  set id(value) {
    this.setAttribute("id", value);
  }
  get className() {
    return this.getAttribute("class") ?? "";
  }
  set className(value) {
    this.setAttribute("class", value);
  }
  get hidden() {
    return this.hasAttribute("hidden");
  }
  set hidden(value) {
    this.toggleAttribute("hidden", Boolean(value));
  }
  get disabled() {
    return this.hasAttribute("disabled");
  }
  set disabled(value) {
    this.toggleAttribute("disabled", Boolean(value));
  }
  get inert() {
    return this.hasAttribute("inert");
  }
  set inert(value) {
    this.toggleAttribute("inert", Boolean(value));
  }
  get tabIndex() {
    const value = this.getAttribute("tabindex");
    if (value !== null) return Number(value);
    return this.#nativelyFocusable() ? 0 : -1;
  }
  set tabIndex(value) {
    this.setAttribute("tabindex", value);
  }
  get value() {
    return this.getAttribute("value") ?? "";
  }
  set value(value) {
    this.setAttribute("value", value);
  }
  get children() {
    return this.childNodes.filter((node) => node instanceof StubElement);
  }
  get firstElementChild() {
    return this.children[0] ?? null;
  }
  get offsetWidth() {
    return this.getBoundingClientRect().width;
  }
  get offsetHeight() {
    return this.getBoundingClientRect().height;
  }
  get innerHTML() {
    return this.childNodes.map(serialize).join("");
  }
  set innerHTML(html) {
    this.textContent = "";
    parseInto(this, html);
  }
  getBoundingClientRect() {
    const rect = (typeof this.rect === "function" ? this.rect(this) : this.rect) ?? {};
    const { x = 0, y = 0, width = 0, height = 0 } = rect;
    return { x, y, left: x, top: y, width, height, right: x + width, bottom: y + height };
  }
  matches(selector) {
    return compile(selector)(this);
  }
  closest(selector) {
    const test = compile(selector);
    for (let node = this; node instanceof StubElement; node = node.parentNode) if (test(node)) return node;
    return null;
  }
  querySelectorAll(selector) {
    const test = compile(selector);
    return descendants(this).filter(test);
  }
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }
  #nativelyFocusable() {
    return FOCUSABLE.has(this.localName) || (this.localName === "a" && this.hasAttribute("href"));
  }
  /** Like a browser: only connected, rendered, enabled, focusable elements take focus. */
  focus() {
    if (!this.isConnected || this.closest("[hidden], [inert]") || this.disabled) return;
    if (!this.#nativelyFocusable() && !this.hasAttribute("tabindex")) return;
    this.ownerDocument.moveFocus(this);
  }
  blur() {
    if (this.ownerDocument.activeElement === this) this.ownerDocument.moveFocus(null);
  }
  scrollIntoView() {}
  setPointerCapture() {}
  releasePointerCapture() {}
  hasPointerCapture() {
    return false;
  }
}

export class StubDocument extends StubNode {
  #focused = null;
  constructor() {
    super(null);
    this.ownerDocument = this;
  }
  get documentElement() {
    return this.childNodes.find((node) => node instanceof StubElement) ?? null;
  }
  get body() {
    return this.querySelector("body");
  }
  get head() {
    return this.querySelector("head");
  }
  /** The focused element, or the body once it was removed (as in browsers). A hidden element keeps focus
   * until the browser's next rendering update, which never comes here, so tests can see that case too. */
  get activeElement() {
    return this.#focused?.isConnected ? this.#focused : this.body;
  }
  moveFocus(element) {
    const previous = this.#focused?.isConnected ? this.#focused : null;
    if (previous === element) return;
    this.#focused = element;
    previous?.dispatchEvent(new StubEvent("focusout", { bubbles: true, relatedTarget: element }));
    element?.dispatchEvent(new StubEvent("focusin", { bubbles: true, relatedTarget: previous }));
  }
  createElement(tag) {
    return new StubElement(this, tag);
  }
  createTextNode(text) {
    return new StubText(this, text);
  }
  getElementById(id) {
    return descendants(this).find((node) => node.getAttribute("id") === id) ?? null;
  }
  querySelectorAll(selector) {
    const test = compile(selector);
    return descendants(this).filter(test);
  }
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }
}

const dataName = (key) => `data-${String(key).replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
const classes = (element) => (element.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);
function descendants(root) {
  const out = [];
  const walk = (node) => {
    for (const child of node.childNodes)
      if (child instanceof StubElement) {
        out.push(child);
        walk(child);
      }
  };
  walk(root);
  return out;
}
function serialize(node) {
  if (!(node instanceof StubElement)) return escapeText(node.textContent);
  const attrs = [...node.attributes].map(([name, value]) => (value === "" ? ` ${name}` : ` ${name}="${value.replace(/"/g, "&quot;")}"`)).join("");
  return VOID.has(node.localName) ? `<${node.localName}${attrs}>` : `<${node.localName}${attrs}>${node.childNodes.map(serialize).join("")}</${node.localName}>`;
}

/** A forgiving parser for well-formed markup: tags, attributes, text, comments. Unknown closers are skipped. */
function parseInto(parent, html) {
  const document = parent.ownerDocument;
  const stack = [parent];
  const token =
    /<!--[\s\S]*?-->|<![^>]*>|<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)>|[^<]+|</g;
  for (const [whole, close, open, attrs, selfClosing] of html.matchAll(token)) {
    if (whole.startsWith("<!")) continue;
    if (close) {
      const index = stack.findLastIndex((node, i) => i > 0 && node.localName === close.toLowerCase());
      if (index > 0) stack.length = index;
    } else if (open) {
      const element = document.createElement(open);
      for (const [, name, quoted, single, bare] of attrs.matchAll(/([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g))
        element.setAttribute(name, decode(quoted ?? single ?? bare ?? ""));
      stack.at(-1).appendChild(element);
      if (!VOID.has(element.localName) && !selfClosing) stack.push(element);
    } else stack.at(-1).appendChild(document.createTextNode(decode(whole)));
  }
}

/* ---------- Selectors ---------- */

const compiled = new Map();
/** Split on `separator` outside [brackets], (parens) and quotes. */
function splitTop(text, separator) {
  const parts = [];
  let depth = 0,
    quote = "",
    current = "";
  for (const char of text) {
    if (quote) quote = char === quote ? "" : quote;
    else if (char === '"' || char === "'") quote = char;
    else if (char === "[" || char === "(") depth++;
    else if (char === "]" || char === ")") depth--;
    if (!quote && depth === 0 && separator.test(char)) {
      if (current.trim()) parts.push(current.trim());
      current = "";
    } else current += char;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}
/** Simple selectors, each a pattern and the test it builds from the match. */
const SIMPLE = [
  [
    /^#([\w-]+)/,
    ([, id]) =>
      (el) =>
        el.getAttribute("id") === id,
  ],
  [
    /^\.([\w-]+)/,
    ([, name]) =>
      (el) =>
        el.classList.contains(name),
  ],
  [
    /^\[\s*([\w-]+)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\]\s]+)))?\s*\]/,
    ([, name, quoted, single, bare]) => {
      const value = quoted ?? single ?? bare;
      return (el) => (value === undefined ? el.hasAttribute(name) : el.getAttribute(name) === value);
    },
  ],
  [
    /^:not\(([^)]*)\)/,
    ([, inner]) => {
      const test = compile(inner);
      return (el) => !test(el);
    },
  ],
];
function compound(text) {
  const tests = [];
  let rest = text;
  const tag = rest.match(/^(\*|[a-zA-Z][\w-]*)/);
  if (tag) {
    const name = tag[1].toLowerCase();
    if (name !== "*") tests.push((el) => el.localName === name);
    rest = rest.slice(tag[0].length);
  }
  while (rest) {
    const found = SIMPLE.map(([pattern, make]) => [rest.match(pattern), make]).find(([match]) => match);
    if (!found) throw new Error(`dom-stub: unsupported selector "${text}"`);
    const [match, make] = found;
    tests.push(make(match));
    rest = rest.slice(match[0].length);
  }
  return (el) => tests.every((test) => test(el));
}
function compile(selector) {
  let test = compiled.get(selector);
  if (test) return test;
  const alternatives = splitTop(selector, /,/).map((complex) => {
    if (/[>+~]/.test(complex.replace(/\[[^\]]*\]|\([^)]*\)/g, ""))) throw new Error(`dom-stub: unsupported combinator in "${selector}"`);
    const parts = splitTop(complex, /\s/).map(compound);
    return (el) => {
      if (!parts.at(-1)(el)) return false;
      let node = el.parentNode;
      for (let i = parts.length - 2; i >= 0; i--) {
        while (node instanceof StubElement && !parts[i](node)) node = node.parentNode;
        if (!(node instanceof StubElement)) return false;
        node = node.parentNode;
      }
      return true;
    };
  });
  test = (el) => alternatives.some((alternative) => alternative(el));
  compiled.set(selector, test);
  return test;
}

/* ---------- Window ---------- */

class StubMediaQuery extends Listeners {
  constructor(media) {
    super();
    this.media = media;
    this.matches = false;
  }
  /** Test hook: change whether the query matches and fire `change`. */
  set(matches) {
    if (matches === this.matches) return;
    this.matches = matches;
    this.invoke(Object.assign(new StubEvent("change"), { matches, media: this.media }), false);
  }
}

class StubWindow extends Listeners {
  dispatchEvent(event) {
    event.target ??= this;
    this.invoke(event, true);
    this.invoke(event, false);
    return !event.defaultPrevented;
  }
}

/**
 * Parse `html` into a fresh document and install it, with window, location, history, matchMedia and the
 * other globals the UI reads. Returns the pieces tests drive: `media(query)` gives the query's stub.
 */
export function installDom(html, { url = "http://localhost:8769/", width = 1280, height = 800 } = {}) {
  const document = new StubDocument();
  parseInto(document, html);
  const window = new StubWindow();
  let current = new URL(url);
  const location = {
    get href() {
      return current.href;
    },
    get pathname() {
      return current.pathname;
    },
    get search() {
      return current.search;
    },
    get hash() {
      return current.hash;
    },
    set hash(value) {
      current = new URL(`#${String(value).replace(/^#/, "")}`, current);
    },
  };
  const history = {
    state: null,
    replaceState(state, _title, next) {
      this.state = state;
      current = new URL(next, current);
    },
  };
  const queries = new Map();
  const matchMedia = (query) => {
    if (!queries.has(query)) queries.set(query, new StubMediaQuery(query));
    return queries.get(query);
  };
  Object.assign(window, { document, location, history, matchMedia, innerWidth: width, innerHeight: height });
  Object.assign(globalThis, {
    window,
    document,
    location,
    history,
    matchMedia,
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
    getSelection: () => null,
    HTMLElement: StubElement,
    Element: StubElement,
    Node: StubNode,
  });
  return { document, window, location, media: matchMedia };
}

/**
 * A short description of a node, for assertions: `<button#step-toggle-2.step-toggle>`. Compare these rather
 * than the nodes, because assert's diff walks the whole tree through every getter and never finishes.
 */
export function label(node) {
  if (node === null || node === undefined) return String(node);
  if (node instanceof StubDocument) return "#document";
  if (!(node instanceof StubElement)) return `#text ${JSON.stringify(node.textContent.slice(0, 40))}`;
  const id = node.id ? `#${node.id}` : "";
  const classes = node.className.trim() ? `.${node.className.trim().split(/\s+/).join(".")}` : "";
  return `<${node.localName}${id}${classes}>`;
}

/** Focus a control and click it, as a mouse click does in Chrome and Firefox. */
export function click(element) {
  element.focus();
  element.dispatchEvent(new StubEvent("click", { bubbles: true, detail: 1 }));
}

/** Wait for queued microtasks (the explorer writes the hash in one). */
export const settle = () => new Promise((resolve) => setImmediate(resolve));
