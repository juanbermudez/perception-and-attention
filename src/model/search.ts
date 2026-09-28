// Tokenize and score. One scorer ranks guide content now and doc blocks later (spec §6.4).
// Plain BM25-style saturation with field weights, prefix matching and a coverage factor;
// small enough to rebuild at startup and fast enough for a few thousand entries.

export type SearchField = "title" | "fact" | "body";
export const FIELD_WEIGHTS: Record<SearchField, number> = { title: 3, fact: 2, body: 1 };
const FIELDS = Object.keys(FIELD_WEIGHTS) as SearchField[];

export interface SearchDoc {
  ref: string;
  /** Kind of the ref (region, step, topic, …), used to narrow a search. */
  kind: string;
  title: string;
  fields: Partial<Record<SearchField, string>>;
}

export interface SearchHit {
  ref: string;
  kind: string;
  title: string;
  score: number;
  snip: string;
}

// Short function words only. Region ids such as "it", "sc" and "a1" must stay searchable.
const STOP_WORDS = new Set(["a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "how", "in", "is", "of", "on", "or", "the", "to", "what", "with"]);
/** Query terms at least this long also match longer words that start with them. */
const PREFIX_MIN = 3;
const PREFIX_CREDIT = 0.6;
const SNIP_BEFORE = 40;
const SNIP_LENGTH = 120;

const fold = (text: string) => text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();

export function tokenize(text: string): string[] {
  return fold(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 0 && !STOP_WORDS.has(token));
}

/** Levenshtein distance, for suggesting ids close to a mistyped one. */
export function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) row[j] = Math.min(previous[j] + 1, row[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    previous = row;
  }
  return previous[b.length];
}

function termFrequency(tokens: string[], term: string) {
  let count = 0;
  for (const token of tokens) {
    if (token === term) count += 1;
    else if (term.length >= PREFIX_MIN && token.startsWith(term)) count += PREFIX_CREDIT;
  }
  return count;
}
/** Saturating term frequency (BM25 with k1 = 1.2 and no length normalization). */
const saturate = (count: number) => (count * 2.2) / (count + 1.2);

interface IndexedDoc {
  doc: SearchDoc;
  tokens: Record<SearchField, string[]>;
  joined: Record<SearchField, string>;
}

export function createSearchIndex(docs: SearchDoc[]) {
  const indexed: IndexedDoc[] = docs.map((doc) => {
    const tokens = {} as Record<SearchField, string[]>;
    const joined = {} as Record<SearchField, string>;
    for (const field of FIELDS) {
      tokens[field] = tokenize(doc.fields[field] ?? "");
      joined[field] = ` ${tokens[field].join(" ")} `;
    }
    return { doc, tokens, joined };
  });

  function inverseFrequency(term: string, pool: IndexedDoc[]) {
    const matching = pool.filter((entry) => FIELDS.some((field) => termFrequency(entry.tokens[field], term) > 0)).length;
    return Math.log(1 + (pool.length - matching + 0.5) / (matching + 0.5));
  }

  /** Ranked hits, best first. `kinds` limits the search to some ref kinds. */
  function search(query: string, { limit = 10, kinds }: { limit?: number; kinds?: string[] } = {}): SearchHit[] {
    const terms = [...new Set(tokenize(query))];
    if (!terms.length) return [];
    const pool = kinds ? indexed.filter((entry) => kinds.includes(entry.doc.kind)) : indexed;
    const weights = terms.map((term) => inverseFrequency(term, pool));
    const phrase = terms.length > 1 ? ` ${terms.join(" ")} ` : null;
    const hits: SearchHit[] = [];
    for (const entry of pool) {
      let score = 0,
        matched = 0;
      terms.forEach((term, i) => {
        let termScore = 0;
        for (const field of FIELDS) {
          const count = termFrequency(entry.tokens[field], term);
          if (count > 0) termScore += FIELD_WEIGHTS[field] * saturate(count);
        }
        if (termScore > 0) matched++;
        score += weights[i] * termScore;
      });
      if (!matched) continue;
      if (phrase) for (const field of FIELDS) if (entry.joined[field].includes(phrase)) score += FIELD_WEIGHTS[field];
      score *= matched / terms.length;
      hits.push({ ref: entry.doc.ref, kind: entry.doc.kind, title: entry.doc.title, score, snip: snippet(entry.doc, terms) });
    }
    return hits.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  return { search, size: indexed.length };
}

export type SearchIndex = ReturnType<typeof createSearchIndex>;

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** About 120 characters of fact or body text around the first query term, cut at word boundaries. */
export function snippet(doc: SearchDoc, terms: string[]): string {
  const texts = [doc.fields.fact, doc.fields.body].filter((text): text is string => Boolean(text));
  for (const text of texts) {
    const folded = fold(text);
    let at = -1;
    for (const term of terms) {
      const match = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(term)}`, "u").exec(folded);
      if (match && (at < 0 || match.index < at)) at = match.index + match[1].length;
    }
    if (at >= 0) return excerpt(text, Math.max(0, at - SNIP_BEFORE));
  }
  return texts.length ? excerpt(texts[0], 0) : "";
}

function excerpt(text: string, from: number) {
  let start = from;
  if (start > 0) {
    const space = text.indexOf(" ", start);
    start = space >= 0 && space < start + 20 ? space + 1 : start;
  }
  let end = Math.min(text.length, start + SNIP_LENGTH);
  if (end < text.length) {
    const space = text.lastIndexOf(" ", end);
    end = space > start + SNIP_LENGTH / 2 ? space : end;
  }
  return `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`;
}
