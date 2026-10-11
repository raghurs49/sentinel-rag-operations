import type { SystemClaim } from "./types";

/** Phrases that pad an answer without adding evidence. Gold answers avoid them. */
export const FILLER_PHRASES = ["great question", "let me know", "happy to help", "i hope this helps", "of course", "certainly", "feel free"];

export function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export function sentenceCount(text: string): number {
  return text.split(/[.!?]+(?:\s|$)/).filter((part) => part.trim().length > 0).length;
}

/** Numeric tokens such as "30", "99.9" or "600", with thousands separators and percent signs removed. */
export function numbersIn(text: string): string[] {
  return (text.match(/\d+(?:[.,]\d+)*/g) ?? []).map((token) => token.replace(/,/g, ""));
}

/** Figures stated in the answer that do not appear anywhere in the evidence text. */
export function unsupportedFigures(answer: string, evidence: string): string[] {
  const known = new Set(numbersIn(evidence));
  return numbersIn(withoutArticleRefs(answer)).filter((figure) => !known.has(figure));
}

/** "Article 33" or "Articles 44-46" name a source; they are not figures the answer asserts. */
export function withoutArticleRefs(text: string): string {
  return text.replace(/\bArticles?\s+\d+(?:\s*[–-]\s*\d+)?/gi, " ");
}

export function fillerCount(text: string): number {
  const lower = text.toLowerCase();
  return FILLER_PHRASES.reduce((count, phrase) => count + (lower.includes(phrase) ? 1 : 0), 0);
}

export function citationsPerClaim(claims: Pick<SystemClaim, "citations">[]): number {
  if (claims.length === 0) return 0;
  return claims.reduce((sum, claim) => sum + claim.citations.length, 0) / claims.length;
}
