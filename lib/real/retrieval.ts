import type { KnowledgeDoc } from "../eval/types";

/**
 * Two small, dependency-free retrievers so the pipeline runs anywhere:
 * - `overlap`: counts shared words. A deliberately naive baseline.
 * - `bm25`: the standard Okapi BM25 ranking function.
 */
export type Retriever = "overlap" | "bm25";

const STOPWORDS = new Set(
  "a an and are as at be but by can do does for from how i if in is it its me my of on or our so that the their there these they this to up us we what when where which who will with you your also according therefore yes no under article articles gdpr must may can".split(" "),
);

/** Lowercase word tokens with stopwords removed and a light plural/verb-ending stem. */
export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+(?:\.[0-9]+)?/g) ?? [])
    .filter((token) => !STOPWORDS.has(token))
    .map(stem);
}

/** A deliberately light stemmer: enough to match "withdrawing", "withdrawal" and "withdrawn". */
function stem(token: string): string {
  if (/^\d/.test(token)) return token;
  let word = token;
  for (const suffix of ["ing", "ion", "ed", "al", "es", "s"]) {
    if (word.length > suffix.length + 3 && word.endsWith(suffix) && !(suffix === "s" && word.endsWith("ss"))) {
      word = word.slice(0, -suffix.length);
      break;
    }
  }
  return word.endsWith("e") && word.length > 4 ? word.slice(0, -1) : word;
}

export type Ranked = { id: string; score: number };

export function rank(query: string, docs: KnowledgeDoc[], retriever: Retriever, limit = 4): Ranked[] {
  const queryTokens = tokenize(query);
  const docTokens = docs.map((doc) => tokenize(`${doc.title} ${doc.text}`));
  const scores =
    retriever === "overlap" ? overlapScores(queryTokens, docTokens) : bm25Scores(queryTokens, docTokens);
  return docs
    .map((doc, index) => ({ id: doc.id, score: scores[index] }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, limit);
}

function overlapScores(query: string[], docs: string[][]): number[] {
  const wanted = new Set(query);
  return docs.map((tokens) => tokens.filter((token) => wanted.has(token)).length);
}

function bm25Scores(query: string[], docs: string[][], k1 = 1.5, b = 0.75): number[] {
  const n = docs.length;
  const averageLength = docs.reduce((sum, tokens) => sum + tokens.length, 0) / Math.max(n, 1);
  const documentFrequency = new Map<string, number>();
  for (const tokens of docs) for (const token of new Set(tokens)) documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);

  return docs.map((tokens) => {
    const counts = new Map<string, number>();
    for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
    let score = 0;
    for (const term of new Set(query)) {
      const tf = counts.get(term) ?? 0;
      if (tf === 0) continue;
      const df = documentFrequency.get(term) ?? 0;
      const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
      score += idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * tokens.length) / averageLength)));
    }
    return score;
  });
}
