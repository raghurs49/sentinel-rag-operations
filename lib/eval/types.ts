/**
 * Data contracts for the Sentinel evaluation engine.
 *
 * The engine is deliberately independent of how answers were produced. Anything that can emit a
 * `RunOutput` for the cases in an `EvalDataset` (a real RAG pipeline, a replayed trace, or the
 * seeded simulator in `simulate.ts`) can be scored, compared, drift-checked and gated.
 */

export type KnowledgeDoc = {
  id: string;
  title: string;
  text: string;
};

/** One atomic fact the reference ("gold") answer asserts, with the documents that support it. */
export type GoldClaim = {
  id: string;
  text: string;
  supportedBy: string[];
};

export type EvalCase = {
  id: string;
  query: string;
  /** True when a correct system must decline (out of scope, advice, speculation). */
  shouldAbstain: boolean;
  goldClaims: GoldClaim[];
};

export type EvalDataset = {
  docs: KnowledgeDoc[];
  cases: EvalCase[];
};

/** A claim made by the system. `goldClaimId` is the evaluator's alignment label (null = not in gold). */
export type SystemClaim = {
  text: string;
  citations: string[];
  goldClaimId: string | null;
};

export type CaseOutput = {
  caseId: string;
  /** Retrieved document ids, best first. */
  retrieved: string[];
  retrievalScores: number[];
  abstained: boolean;
  /** Full answer text as shown to the user. */
  answer: string;
  /** The model's unprocessed output, kept so traces can be rescored without calling the model again. */
  raw?: string;
  /** Ids of the documents that were given to the model as context. */
  context?: string[];
  claims: SystemClaim[];
  latencyMs: number;
};

export type RunOutput = {
  version: string;
  label: string;
  outputs: CaseOutput[];
};

export type FailureCategory =
  | "Missing evidence"
  | "Weak citation"
  | "Should abstain"
  | "Retrieval miss"
  | "Off-target answer"
  | "Over-abstention";

export type Severity = "High" | "Medium" | "Low";

export type CaseResult = {
  caseId: string;
  query: string;
  failures: FailureCategory[];
  /** Fraction of the answer's claims that are grounded (1 when abstaining correctly). */
  groundingScore: number;
  passed: boolean;
};

export type RunMetrics = {
  version: string;
  cases: number;
  answerableCases: number;
  abstainCases: number;
  groundedAnswerRate: number;
  /** Counts behind groundedAnswerRate, so a confidence interval can be shown. */
  groundedAnswers: number;
  answeredAnswerable: number;
  claimSupportRate: number;
  citationCoverage: number;
  safeAbstention: number;
  overAbstention: number;
  recallAtK: number;
  mrr: number;
  p95LatencyMs: number;
  passRate: number;
};

export type Failure = {
  id: string;
  caseId: string;
  category: FailureCategory;
  severity: Severity;
  query: string;
  signal: string;
  score: number;
  owner: string;
};

export type DriftStatus = "stable" | "watch" | "drift";

export type FeatureDrift = {
  feature: string;
  label: string;
  goldMean: number;
  baselineMean: number;
  candidateMean: number;
  /** Two-sample Kolmogorov–Smirnov statistic of candidate vs gold (0 = identical, 1 = disjoint). */
  ks: number;
  ksCritical: number;
  /** Standardised mean difference (Cohen's d, candidate minus gold). */
  effectSize: number;
  relativeChange: number;
  status: DriftStatus;
  explanation: string;
};

export type ItemDriftReason = "Too long" | "Unsupported specificity" | "Missing citation" | "Filler phrasing";

export type ItemDrift = {
  caseId: string;
  query: string;
  reasons: ItemDriftReason[];
  words: number;
  goldWords: number;
  answer: string;
};

export type DriftReport = {
  /** 0–100. 100 means the candidate is indistinguishable from gold on every tracked feature. */
  fidelity: number;
  baselineFidelity: number;
  features: FeatureDrift[];
  items: ItemDrift[];
  driftingFeatures: number;
};

export type GateStatus = "pass" | "fail" | "wait";

export type GateCheck = {
  id: string;
  label: string;
  result: string;
  status: GateStatus;
};

export type Gate = {
  checks: GateCheck[];
  /** The machine verdict. A release never ships on this alone: human sign-off is always required. */
  verdict: "HOLD" | "READY FOR REVIEW";
  blockers: number;
};

export type Regression = {
  caseId: string;
  query: string;
  newFailures: FailureCategory[];
};

export type ClaimVerdictView = {
  text: string;
  citations: string[];
  verdict: "grounded" | "weak citation" | "unsupported";
};
