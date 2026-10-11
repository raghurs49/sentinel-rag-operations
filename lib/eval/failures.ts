import { evaluateRun, judgeClaim } from "./metrics";
import type { CaseResult, EvalDataset, Failure, FailureCategory, Regression, RunOutput, Severity } from "./types";

/** Order in which a failing case's categories are considered when choosing the headline one. */
const PRIORITY: FailureCategory[] = ["Should abstain", "Missing evidence", "Off-target answer", "Retrieval miss", "Weak citation", "Over-abstention"];

const SEVERITY: Record<FailureCategory, Severity> = {
  "Should abstain": "High",
  "Missing evidence": "High",
  "Retrieval miss": "Medium",
  "Off-target answer": "Medium",
  "Weak citation": "Medium",
  "Over-abstention": "Low",
};

const OWNER: Record<FailureCategory, string> = {
  "Should abstain": "Policy",
  "Missing evidence": "Generation",
  "Retrieval miss": "Retrieval",
  "Off-target answer": "Generation",
  "Weak citation": "Retrieval",
  "Over-abstention": "Policy",
};

const SEVERITY_ORDER: Record<Severity, number> = { High: 0, Medium: 1, Low: 2 };

export function severityOf(category: FailureCategory): Severity {
  return SEVERITY[category];
}

export function primaryCategory(failures: FailureCategory[]): FailureCategory | undefined {
  return PRIORITY.find((category) => failures.includes(category));
}

function shorten(text: string, max = 96): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

function describe(category: FailureCategory, caseId: string, dataset: EvalDataset, run: RunOutput): string {
  const testCase = dataset.cases.find((item) => item.id === caseId);
  const output = run.outputs.find((item) => item.caseId === caseId);
  if (!testCase || !output) return "No output was recorded for this case.";

  switch (category) {
    case "Should abstain":
      return "The question is out of scope, but the assistant answered instead of routing the user to a person.";
    case "Over-abstention":
      return "The assistant declined a question that the knowledge base can answer.";
    case "Off-target answer":
      return "The answer did not state any of the facts the reference answer contains.";
    case "Retrieval miss":
      return "None of the supporting documents were in the top results, so the answer had no evidence to use.";
    case "Missing evidence": {
      const claim = output.claims.find((item) => judgeClaim(item, testCase) === "unsupported");
      return claim ? `Claim “${shorten(claim.text)}” is not supported by the reference answer or retrieved evidence.` : "A claim is not supported by the evidence.";
    }
    case "Weak citation": {
      const claim = output.claims.find((item) => judgeClaim(item, testCase) === "weak citation");
      return claim ? `Claim “${shorten(claim.text)}” is accurate, but its citation does not support it.` : "A citation does not support its claim.";
    }
  }
}

/** Failing cases for a run, most severe first (safety failures lead). Each case contributes one headline failure. */
export function buildFailures(dataset: EvalDataset, run: RunOutput, results = evaluateRun(dataset, run)): Failure[] {
  const failures: Failure[] = [];
  for (const result of results) {
    const category = primaryCategory(result.failures);
    if (!category) continue;
    failures.push({
      id: `F-${result.caseId.replace(/\D/g, "").padStart(3, "0")}`,
      caseId: result.caseId,
      category,
      severity: SEVERITY[category],
      query: result.query,
      signal: describe(category, result.caseId, dataset, run),
      score: Number(result.groundingScore.toFixed(2)),
      owner: OWNER[category],
    });
  }
  return failures.sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      PRIORITY.indexOf(a.category) - PRIORITY.indexOf(b.category) ||
      a.score - b.score ||
      a.id.localeCompare(b.id),
  );
}

/** Cases that passed in the baseline release and fail in the candidate. */
export function findRegressions(candidate: CaseResult[], baseline: CaseResult[]): Regression[] {
  const before = new Map(baseline.map((result) => [result.caseId, result]));
  return candidate
    .filter((result) => !result.passed && before.get(result.caseId)?.passed)
    .map((result) => ({ caseId: result.caseId, query: result.query, newFailures: result.failures }));
}

export function isHighRisk(regression: Regression): boolean {
  return regression.newFailures.some((category) => SEVERITY[category] === "High");
}
