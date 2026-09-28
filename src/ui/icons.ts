const svg = (body: string, className = "") => `<svg${className ? ` class="${className}"` : ""} viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;

const topicIcons: Record<string, string> = {
  attention: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/><circle cx="12" cy="12" r="3"/>',
  loop: '<path d="M20 8a8 8 0 0 0-14-3L3 8m0-5v5h5M4 16a8 8 0 0 0 14 3l3-3m0 5v-5h-5"/>',
  vision: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  hearing: '<path d="M6 10a6 6 0 0 1 12 0c0 4-4 4-4 7a3 3 0 0 1-6 0m2-7a2 2 0 1 1 4 0c0 2-3 2-3 4"/>',
  touch:
    '<path d="M8 12V5a1.5 1.5 0 0 1 3 0v6-8a1.5 1.5 0 0 1 3 0v8-6a1.5 1.5 0 0 1 3 0v7-4a1.5 1.5 0 0 1 3 0v7c0 4-3 7-7 7-3 0-5-2-6-4l-4-6a1.5 1.5 0 0 1 2-2l3 2Z"/>',
  speech: '<path d="M4 4h16v12H9l-5 4V4Z"/><path d="M8 8h8M8 12h5"/>',
};

export const topicIcon = (id: string, className = "") => svg(topicIcons[id], className);
export const arrowIcon = svg('<path d="M5 12h14m-5-5 5 5-5 5"/>');
export const externalIcon = svg('<path d="M7 17 17 7M7 7h10v10"/>');
export const chevronIcon = (className = "") => svg('<path d="m9 18 6-6-6-6"/>', className);
