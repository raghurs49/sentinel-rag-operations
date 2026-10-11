import { dataset as defaultDataset } from "./dataset";
import { computeDrift } from "./drift";
import { buildFailures, findRegressions } from "./failures";
import { buildGate } from "./gate";
import { computeMetrics, evaluateRun, judgeClaim } from "./metrics";
import { profiles, simulateReleases } from "./simulate";
import type { CaseResult, ClaimVerdictView, DriftReport, EvalDataset, Failure, Gate, Regression, RunMetrics, RunOutput } from "./types";

export type ReleaseMeta = {
  version: string;
  date: string;
  label: "Candidate" | "Production" | "Archived";
  /** One line describing what changed in this release. */
  change?: string;
};

export type ReleaseRow = ReleaseMeta & { metrics: RunMetrics };

export type Source = { kind: "simulated" } | { kind: "measured"; model: string };

export type Trace = {
  caseId: string;
  retrieved: Array<{ id: string; title: string; text: string; score: number; relevant: boolean }>;
  answer: string;
  claims: ClaimVerdictView[];
};

export type Report = {
  source: Source;
  dataset: EvalDataset;
  releases: ReleaseRow[];
  candidate: ReleaseRow;
  production: ReleaseRow;
  candidateResults: CaseResult[];
  failures: Failure[];
  failureMix: Array<{ label: string; value: number; tone: "red" | "amber" | "violet" }>;
  regressions: Regression[];
  /** Cases that failed in production and pass in the candidate. */
  improvements: number;
  drift: DriftReport;
  gate: Gate;
  trace: (caseId: string) => Trace | undefined;
};

/**
 * Runs the full evaluation pipeline for the release history and returns everything the dashboard
 * needs. Pass your own `dataset` and `runs` (real traces) to score a real system.
 */
export function buildReport(
  dataset: EvalDataset = defaultDataset,
  runs: RunOutput[] = simulateReleases(defaultDataset),
  releaseMeta: ReleaseMeta[] = profiles,
  source: Source = { kind: "simulated" },
): Report {
  const meta = new Map(releaseMeta.map((release) => [release.version, release]));
  const releases: ReleaseRow[] = runs.map((run) => ({
    version: run.version,
    date: meta.get(run.version)?.date ?? "",
    label: meta.get(run.version)?.label ?? "Archived",
    change: meta.get(run.version)?.change,
    metrics: computeMetrics(dataset, run),
  }));

  const candidateRun = runs[runs.length - 1];
  const productionRun = runs[runs.length - 2];
  const candidate = releases[releases.length - 1];
  const production = releases[releases.length - 2];

  const candidateResults = evaluateRun(dataset, candidateRun);
  const productionResults = evaluateRun(dataset, productionRun);
  const failures = buildFailures(dataset, candidateRun, candidateResults);
  const regressions = findRegressions(candidateResults, productionResults);
  const improvements = findRegressions(productionResults, candidateResults).length;
  const drift = computeDrift(dataset, candidateRun, productionRun);
  const gate = buildGate(candidate.metrics, regressions, drift);

  const mix = new Map<string, number>();
  for (const failure of failures) mix.set(failure.category, (mix.get(failure.category) ?? 0) + 1);
  const total = failures.length || 1;
  const failureMix = [...mix.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([label, count], index) => ({ label, value: Math.round((count / total) * 100), tone: (["red", "amber", "violet"] as const)[index] }));

  const trace = (caseId: string): Trace | undefined => {
    const testCase = dataset.cases.find((item) => item.id === caseId);
    const output = candidateRun.outputs.find((item) => item.caseId === caseId);
    if (!testCase || !output) return undefined;
    const relevant = new Set(testCase.goldClaims.flatMap((claim) => claim.supportedBy));
    return {
      caseId,
      retrieved: output.retrieved.slice(0, 3).map((id, rank) => {
        const doc = dataset.docs.find((item) => item.id === id);
        return { id, title: doc?.title ?? id, text: doc?.text ?? "", score: output.retrievalScores[rank], relevant: relevant.has(id) };
      }),
      answer: output.answer,
      claims: output.claims.map((claim) => ({ text: claim.text, citations: claim.citations, verdict: judgeClaim(claim, testCase) })),
    };
  };

  return { source, dataset, releases, candidate, production, candidateResults, failures, failureMix, regressions, improvements, drift, gate, trace };
}
