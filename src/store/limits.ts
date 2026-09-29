// Limits from spec §13, in one place so the store, the docs API and the tool schemas agree.
// The store enforces the docs and quiz limits; tours and captions belong to the walkthrough tool.

export const LIMITS = {
  artifacts: 200,
  blocksPerArtifact: 500,
  charsPerBlock: 8000,
  opsPerCall: 50,
  /** Not in the spec: the user's editor saves in one transaction; a full reorder of 500 blocks with edits stays under this. */
  opsPerSave: 2000,
  questionsPerQuiz: 30,
  promptChars: 300,
  tourStops: 20,
  captionChars: 280,
  /** Not in the spec: keeps titles readable in lists and window headers. */
  titleChars: 200,
  /** Not in the spec: an agent's read(full) or read(markdown) stops near this many characters and says how to read on. */
  readChars: 24_000,
  /** List pages (spec §6 conventions). */
  listDefault: 20,
  listMax: 100,
  /** Retention (spec §11.2). */
  historyPerBlock: 20,
  activityRows: 500,
  activityPerRead: 30,
  purgeAfterDays: 30,
  indentMax: 3,
} as const;
