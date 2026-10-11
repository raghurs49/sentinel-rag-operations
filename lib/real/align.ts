import { tokenize } from "./retrieval";
import { numbersIn, withoutArticleRefs } from "../eval/text";
import type { CaseOutput, EvalCase, KnowledgeDoc, SystemClaim } from "../eval/types";

/** Marker the model is told to output when it should decline. */
export const ABSTAIN_MARKER = "ABSTAIN";

const CITATION = /\[?\bD\d{2}\b\]?/g;
/** Any bracketed id-like marker, including malformed ones such as [DR13]. It is never part of a claim. */
const MARKER = /\[[A-Za-z]{1,3}\d{1,3}\]/g;

export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    // Keep a trailing citation with the sentence it supports: "…of it. [D17]" -> "…of it [D17]."
    .replace(/([.!?])\s*((?:\[D\d{2}\][\s,;]*)+)(?=\s|$)/g, " $2$1")
    .split(/(?<=[.!?])\s+(?=[A-Z0-9“"([])/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function contentTokens(text: string): string[] {
  return tokenize(withoutArticleRefs(text).replace(CITATION, " "));
}

function f1(claim: string[], gold: string[]): number {
  if (claim.length === 0 || gold.length === 0) return 0;
  const goldSet = new Set(gold);
  const claimSet = new Set(claim);
  const shared = [...claimSet].filter((token) => goldSet.has(token)).length;
  if (shared === 0) return 0;
  const precision = shared / claimSet.size;
  const recall = shared / goldSet.size;
  return (2 * precision * recall) / (precision + recall);
}

function containment(claim: string[], evidence: Set<string>): number {
  const unique = [...new Set(claim)];
  return unique.length === 0 ? 1 : unique.filter((token) => evidence.has(token)).length / unique.length;
}

export type AlignOptions = {
  /** Minimum F1 with a gold claim for a sentence to count as that claim. */
  alignThreshold?: number;
  /** Sentences with fewer content words than this are treated as filler, not claims. */
  minClaimTokens?: number;
  /** A non-gold sentence this contained in the retrieved text is padding, not a new claim. */
  paddingContainment?: number;
};

/**
 * Turns a raw model answer into the engine's `CaseOutput`, with no human labels:
 * 1. The answer is split into sentences; very short sentences are filler.
 * 2. Each remaining sentence is aligned to the gold claim it best matches (content-word F1), but only
 *    if every figure it states also appears in that gold claim.
 * 3. A sentence that matches no gold claim but is made of words found in the retrieved documents is
 *    treated as harmless padding (it still counts toward length and filler drift).
 * 4. Anything else is an unsupported claim: new content the evidence does not back.
 * Citations are the document ids the model wrote in the sentence.
 */
export function toCaseOutput(args: {
  testCase: EvalCase;
  docs: KnowledgeDoc[];
  retrieved: Array<{ id: string; score: number }>;
  contextIds: string[];
  answer: string;
  latencyMs: number;
  options?: AlignOptions;
}): CaseOutput {
  const { testCase, docs, retrieved, contextIds, answer, latencyMs } = args;
  const { alignThreshold = 0.5, minClaimTokens = 3, paddingContainment = 0.75 } = args.options ?? {};

  const base = {
    raw: answer,
    context: contextIds,
    caseId: testCase.id,
    retrieved: retrieved.map((item) => item.id),
    retrievalScores: retrieved.map((item) => Number(item.score.toFixed(3))),
    latencyMs,
  };

  const trimmed = answer.trim();
  if (trimmed.toUpperCase().startsWith(ABSTAIN_MARKER)) {
    return { ...base, abstained: true, answer: trimmed, claims: [] };
  }

  const contextText = contextIds.map((id) => docs.find((doc) => doc.id === id)?.text ?? "").join(" ");
  const evidenceTokens = new Set(contentTokens(contextText));
  const evidenceNumbers = new Set(numbersIn(contextText));

  const claims: SystemClaim[] = [];
  for (const sentence of splitSentences(trimmed)) {
    const tokens = contentTokens(sentence.replace(MARKER, " "));
    if (tokens.length < minClaimTokens) continue;

    const citations = [...new Set((sentence.match(/\bD\d{2}\b/g) ?? []) as string[])].filter((id) => docs.some((doc) => doc.id === id));
    const text = sentence.replace(MARKER, "").replace(CITATION, "").replace(/\s+([.,;])/g, "$1").replace(/\s{2,}/g, " ").trim();
    const figures = numbersIn(withoutArticleRefs(text));

    let best: { id: string; score: number; numbersOk: boolean } | undefined;
    for (const gold of testCase.goldClaims) {
      const score = f1(tokens, contentTokens(gold.text));
      const goldNumbers = new Set(numbersIn(gold.text));
      const numbersOk = figures.every((figure) => goldNumbers.has(figure));
      if (!best || score > best.score) best = { id: gold.id, score, numbersOk };
    }

    if (best && best.score >= alignThreshold && best.numbersOk) {
      claims.push({ text, citations, goldClaimId: best.id });
      continue;
    }
    // A sentence carrying a figure that no gold claim states cannot be harmless padding: it may be a
    // swapped or misplaced number, which is exactly the error a compliance assistant must not make.
    const goldFigures = new Set(testCase.goldClaims.flatMap((claim) => numbersIn(claim.text)));
    const padding = containment(tokens, evidenceTokens) >= paddingContainment && figures.every((figure) => evidenceNumbers.has(figure) && goldFigures.has(figure));
    if (padding) continue;
    claims.push({ text, citations, goldClaimId: null });
  }

  return { ...base, abstained: false, answer: trimmed.replace(MARKER, "").replace(CITATION, "").replace(/\s+([.,;])/g, "$1").replace(/\s{2,}/g, " ").trim(), claims };
}
