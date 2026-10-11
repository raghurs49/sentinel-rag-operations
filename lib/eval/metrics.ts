import { mean, percentile } from "./stats";
import type { CaseOutput, CaseResult, EvalCase, EvalDataset, FailureCategory, RunMetrics, RunOutput, SystemClaim } from "./types";

/** Number of top-ranked documents that count as "retrieved" for recall and retrieval-miss checks. */
export const TOP_K = 3;

export type ClaimVerdict = "grounded" | "weak citation" | "unsupported";

/** Union of every document that supports at least one gold claim for the case. */
export function relevantDocs(testCase: EvalCase): string[] {
  return [...new Set(testCase.goldClaims.flatMap((claim) => claim.supportedBy))];
}

/**
 * Claim-level verdict:
 * - grounded: aligned to a gold claim AND cites at least one document that supports it
 * - weak citation: the claim is right but its citations do not support it (or it has none)
 * - unsupported: the claim is not part of the reference answer at all
 */
export function judgeClaim(claim: SystemClaim, testCase: EvalCase): ClaimVerdict {
  const gold = claim.goldClaimId ? testCase.goldClaims.find((item) => item.id === claim.goldClaimId) : undefined;
  if (!gold) return "unsupported";
  return claim.citations.some((id) => gold.supportedBy.includes(id)) ? "grounded" : "weak citation";
}

export function evaluateCase(testCase: EvalCase, output: CaseOutput, k = TOP_K): CaseResult {
  const failures: FailureCategory[] = [];

  if (testCase.shouldAbstain) {
    if (!output.abstained) failures.push("Should abstain");
    return {
      caseId: testCase.id,
      query: testCase.query,
      failures,
      groundingScore: output.abstained ? 1 : 0,
      passed: failures.length === 0,
    };
  }

  if (output.abstained) {
    failures.push("Over-abstention");
    return { caseId: testCase.id, query: testCase.query, failures, groundingScore: 0, passed: false };
  }

  const relevant = relevantDocs(testCase);
  const topK = output.retrieved.slice(0, k);
  if (!relevant.some((id) => topK.includes(id))) failures.push("Retrieval miss");

  // An answer that states none of the facts asked for is not a pass, even if nothing in it is wrong.
  if (output.claims.length === 0) failures.push("Off-target answer");

  const verdicts = output.claims.map((claim) => judgeClaim(claim, testCase));
  if (verdicts.includes("unsupported")) failures.push("Missing evidence");
  if (verdicts.includes("weak citation")) failures.push("Weak citation");

  const grounded = verdicts.filter((verdict) => verdict === "grounded").length;
  return {
    caseId: testCase.id,
    query: testCase.query,
    failures,
    groundingScore: output.claims.length === 0 ? 0 : grounded / output.claims.length,
    passed: failures.length === 0 && output.claims.length > 0,
  };
}

export function evaluateRun(dataset: EvalDataset, run: RunOutput, k = TOP_K): CaseResult[] {
  const outputs = new Map(run.outputs.map((output) => [output.caseId, output]));
  return dataset.cases.map((testCase) => {
    const output = outputs.get(testCase.id);
    if (!output) {
      return { caseId: testCase.id, query: testCase.query, failures: ["Missing evidence"], groundingScore: 0, passed: false };
    }
    return evaluateCase(testCase, output, k);
  });
}

export function computeMetrics(dataset: EvalDataset, run: RunOutput, k = TOP_K): RunMetrics {
  const outputs = new Map(run.outputs.map((output) => [output.caseId, output]));
  const answerable = dataset.cases.filter((testCase) => !testCase.shouldAbstain);
  const abstainCases = dataset.cases.filter((testCase) => testCase.shouldAbstain);

  let answeredAnswerable = 0;
  let groundedAnswers = 0;
  let totalClaims = 0;
  let groundedClaims = 0;
  let citedClaims = 0;
  const recalls: number[] = [];
  const reciprocalRanks: number[] = [];
  let overAbstained = 0;

  for (const testCase of answerable) {
    const output = outputs.get(testCase.id);
    if (!output) continue;

    const relevant = relevantDocs(testCase);
    const topK = output.retrieved.slice(0, k);
    recalls.push(relevant.filter((id) => topK.includes(id)).length / relevant.length);
    const firstHit = output.retrieved.findIndex((id) => relevant.includes(id));
    reciprocalRanks.push(firstHit === -1 ? 0 : 1 / (firstHit + 1));

    if (output.abstained) {
      overAbstained += 1;
      continue;
    }

    answeredAnswerable += 1;
    const verdicts = output.claims.map((claim) => judgeClaim(claim, testCase));
    totalClaims += output.claims.length;
    groundedClaims += verdicts.filter((verdict) => verdict === "grounded").length;
    citedClaims += output.claims.filter((claim) => claim.citations.length > 0).length;
    if (output.claims.length > 0 && verdicts.every((verdict) => verdict === "grounded")) groundedAnswers += 1;
  }

  const abstainedCorrectly = abstainCases.filter((testCase) => outputs.get(testCase.id)?.abstained).length;
  const results = evaluateRun(dataset, run, k);

  return {
    version: run.version,
    cases: dataset.cases.length,
    answerableCases: answerable.length,
    abstainCases: abstainCases.length,
    groundedAnswerRate: answeredAnswerable === 0 ? 0 : groundedAnswers / answeredAnswerable,
    groundedAnswers,
    answeredAnswerable,
    claimSupportRate: totalClaims === 0 ? 0 : groundedClaims / totalClaims,
    citationCoverage: totalClaims === 0 ? 0 : citedClaims / totalClaims,
    safeAbstention: abstainCases.length === 0 ? 1 : abstainedCorrectly / abstainCases.length,
    overAbstention: answerable.length === 0 ? 0 : overAbstained / answerable.length,
    recallAtK: mean(recalls),
    mrr: mean(reciprocalRanks),
    p95LatencyMs: percentile(run.outputs.map((output) => output.latencyMs), 95),
    passRate: results.filter((result) => result.passed).length / results.length,
  };
}
