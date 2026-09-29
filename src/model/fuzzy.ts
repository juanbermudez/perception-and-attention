// Client-side fuzzy search for the command palette. Every word of the query has to match a word of the
// entry: exactly, as the start of a word, in another form of the word ("recognition", "recognizing"),
// inside a word, within one typo, or as the initials of the title ("lgn"). Matches in the title count most, then keywords, the detail line and the body text.
// The scoring follows beUI's command palette (beui.dev): an exact title wins outright, a title that
// starts with the query comes next, and the rest add up per word.

export interface SearchEntry {
  label: string;
  keywords?: string;
  detail?: string;
  text?: string;
}

interface Field {
  words: string[];
  stems: string[];
  joined: string;
  weight: number;
}

export interface Prepared<T extends SearchEntry> {
  entry: T;
  label: string;
  initials: string;
  fields: Field[];
}

export interface Match<T> {
  entry: T;
  score: number;
}

const WEIGHTS = { label: 1, keywords: 0.8, detail: 0.6, text: 0.3 } as const;
const SUFFIXES = ["ations", "ation", "ings", "ing", "ions", "ion", "ness", "ment", "ies", "ied", "ity", "ed", "es", "al", "ly", "s"];

/** A rough English stem: the word without one common ending, for words long enough to have one. */
export function stem(word: string) {
  if (word.length <= 4) return word;
  for (const suffix of SUFFIXES) if (word.endsWith(suffix) && word.length - suffix.length >= 3) return word.slice(0, -suffix.length);
  return word;
}

/** Two stems of the same word: one starts the other, or they differ only in their last letter. */
function sameStem(a: string, b: string) {
  if (a.startsWith(b) || b.startsWith(a)) return Math.min(a.length, b.length) >= 3;
  let shared = 0;
  while (shared < a.length && shared < b.length && a[shared] === b[shared]) shared++;
  return shared >= Math.max(5, Math.min(a.length, b.length) - 1);
}

/** Lower case, without accents, with runs of anything but letters and digits as one space. */
export function normalize(text: string) {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Prepare entries once, so each keystroke only compares words. */
export function prepare<T extends SearchEntry>(entries: T[]): Prepared<T>[] {
  return entries.map((entry) => {
    const label = normalize(entry.label);
    const fields = (Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[])
      .map((key) => {
        const joined = normalize(entry[key] ?? "");
        const words = joined ? joined.split(" ") : [];
        return { words, stems: words.map(stem), joined, weight: WEIGHTS[key] };
      })
      .filter((field) => field.joined);
    return {
      entry,
      label,
      initials: label
        .split(" ")
        .map((word) => word[0] ?? "")
        .join(""),
      fields,
    };
  });
}

/** True when `a` becomes `b` with at most one insertion, deletion, substitution or swap of neighbours. */
export function withinOneEdit(a: string, b: string) {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) {
    // A substitution, or two neighbours swapped.
    if (a.slice(i + 1) === b.slice(i + 1)) return true;
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
  }
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

/** How well one query word matches one field, before the field's weight. */
function wordScore(token: string, field: Field) {
  let best = 0;
  const tokenStem = stem(token);
  for (let i = 0; i < field.words.length; i++) {
    const word = field.words[i];
    if (word === token) return 100;
    if (word.startsWith(token)) best = Math.max(best, 80);
    else if (token.length >= 4 && sameStem(field.stems[i], tokenStem)) best = Math.max(best, 70);
    else if (token.length >= 4 && (withinOneEdit(word, token) || withinOneEdit(word.slice(0, token.length), token))) best = Math.max(best, 40);
  }
  if (!best && token.length >= 2 && field.joined.includes(token)) best = 60;
  return best;
}

function entryScore<T extends SearchEntry>(item: Prepared<T>, query: string, tokens: string[]) {
  if (item.label === query) return 10000;
  let score = item.label.startsWith(query) ? 2000 : 0;
  for (const token of tokens) {
    let best = token.length >= 2 && item.initials.startsWith(token) ? 90 : 0;
    for (const field of item.fields) best = Math.max(best, wordScore(token, field) * field.weight);
    if (!best) return 0;
    score += best;
  }
  return score;
}

/** Entries matching every word of the query, best first; shorter titles win ties. */
export function fuzzySearch<T extends SearchEntry>(items: Prepared<T>[], query: string, limit = 50): Match<T>[] {
  const normal = normalize(query);
  if (!normal) return [];
  const tokens = normal.split(" ");
  const matches: (Match<T> & { length: number })[] = [];
  for (const item of items) {
    const score = entryScore(item, normal, tokens);
    if (score > 0) matches.push({ entry: item.entry, score, length: item.label.length });
  }
  matches.sort((a, b) => b.score - a.score || a.length - b.length);
  return matches.slice(0, limit).map(({ entry, score }) => ({ entry, score }));
}
