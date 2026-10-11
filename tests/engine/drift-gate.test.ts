import assert from "node:assert/strict";
import test from "node:test";
import { computeDrift, fidelityOf } from "../../lib/eval/drift";
import { buildFailures, findRegressions, isHighRisk, primaryCategory, severityOf } from "../../lib/eval/failures";
import { buildGate, THRESHOLDS } from "../../lib/eval/gate";
import { evaluateRun } from "../../lib/eval/metrics";
import { fillerCount, numbersIn, sentenceCount, unsupportedFigures, wordCount } from "../../lib/eval/text";
import type { DriftReport, EvalCase, EvalDataset, RunOutput } from "../../lib/eval/types";
import { output, perfectRun, tiny } from "./fixtures";

/** 20 near-identical single-claim cases so the drift test has enough samples to be meaningful. */
function wideDataset(): EvalDataset {
  const cases: EvalCase[] = Array.from({ length: 20 }, (_, i) => ({
    id: `W${i + 1}`,
    query: `Question ${i + 1}?`,
    shouldAbstain: false,
    // Digit-free wording (apart from the shared "30") so figures never collide with other documents.
    goldClaims: [{ id: `W${i + 1}-1`, text: `Fact ${String.fromCharCode(65 + i)} holds for 30 days.`, supportedBy: ["A"] }],
  }));
  return { docs: tiny.docs, cases };
}

function wideRun(dataset: EvalDataset, version: string, decorate: (text: string, index: number) => string): RunOutput {
  return {
    version,
    label: "Candidate",
    outputs: dataset.cases.map((testCase, index) => {
      const text = decorate(testCase.goldClaims[0].text, index);
      return output({ caseId: testCase.id, retrieved: ["A", "B", "C"], retrievalScores: [0.9, 0.8, 0.7], answer: text, claims: [{ text, citations: ["A"], goldClaimId: testCase.goldClaims[0].id }] });
    }),
  };
}

test("text helpers count words, sentences, figures and filler", () => {
  assert.equal(wordCount("one two  three"), 3);
  assert.equal(sentenceCount("One. Two! Three?"), 3);
  assert.deepEqual(numbersIn("Keep 1,000 files for 30 days at 99.9%"), ["1000", "30", "99.9"]);
  assert.deepEqual(unsupportedFigures("Refund within 60 days, 30 files", "Refund within 14 days, 30 files"), ["60"]);
  assert.equal(fillerCount("Great question! Let me know if I can help."), 2);
  assert.equal(fillerCount("Deleted files stay in the trash for 30 days."), 0);
});

test("drift: answers identical to gold are stable and score 100 fidelity", () => {
  const dataset = wideDataset();
  const same = wideRun(dataset, "same", (text) => text);
  const report = computeDrift(dataset, same, same);
  assert.equal(report.driftingFeatures, 0);
  assert.equal(report.fidelity, 100);
  assert.ok(report.features.every((feature) => feature.status === "stable"));
  assert.equal(report.items.length, 0);
});

test("drift: padded, filler-heavy answers are flagged with a human-readable reason", () => {
  const dataset = wideDataset();
  const gold = wideRun(dataset, "gold-like", (text) => text);
  const wordy = wideRun(dataset, "wordy", (text, i) => (i % 2 === 0 ? `Great question! ${text} It is worth keeping in mind that these details apply consistently across every workspace.` : text));
  const report = computeDrift(dataset, wordy, gold);

  const words = report.features.find((feature) => feature.feature === "words");
  const filler = report.features.find((feature) => feature.feature === "fillerPhrases");
  assert.equal(words?.status, "drift");
  assert.match(words?.explanation ?? "", /longer than gold/);
  assert.equal(filler?.status, "drift");
  assert.match(filler?.explanation ?? "", /10 of 20 answers use filler phrasing/);
  assert.ok(report.fidelity < report.baselineFidelity);
  assert.equal(report.items.length, 10);
  assert.ok(report.items.every((item) => item.reasons.includes("Too long") && item.reasons.includes("Filler phrasing")));
});

test("drift: a figure that is not in the retrieved evidence is surfaced as unsupported specificity", () => {
  const dataset = wideDataset();
  const gold = wideRun(dataset, "gold-like", (text) => text);
  const invented = wideRun(dataset, "invented", (text, i) => (i < 5 ? text.replace("30", "90") : text));
  const report = computeDrift(dataset, invented, gold);
  const figures = report.features.find((feature) => feature.feature === "unsupportedFigures");
  assert.equal(figures?.status, "drift");
  assert.equal(report.items.filter((item) => item.reasons.includes("Unsupported specificity")).length, 5);
});

test("fidelity is 100 minus the mean KS distance", () => {
  assert.equal(fidelityOf([0, 0, 0, 0]), 100);
  assert.equal(fidelityOf([1, 1]), 0);
  assert.equal(fidelityOf([0.2, 0.4]), 70);
});

test("failures are ranked by severity and carry an owner and explanation", () => {
  const run: RunOutput = {
    version: "bad",
    label: "Candidate",
    outputs: [
      output({ caseId: "Q1", retrieved: ["B", "C", "D"], claims: [{ text: "Trash lasts 90 days.", citations: ["B"], goldClaimId: null }] }),
      output({ caseId: "Q2", retrieved: ["B"], claims: [{ text: "You can request a refund within 14 days.", citations: ["A"], goldClaimId: "Q2-1" }] }),
      output({ caseId: "Q3", abstained: true }),
      output({ caseId: "Q4", abstained: false, claims: [{ text: "Looks fine.", citations: [], goldClaimId: null }] }),
    ],
  };
  const failures = buildFailures(tiny, run);
  assert.deepEqual(failures.map((failure) => `${failure.caseId}:${failure.category}:${failure.severity}`), [
    "Q4:Should abstain:High",
    "Q1:Missing evidence:High",
    "Q2:Weak citation:Medium",
    "Q3:Over-abstention:Low",
  ]);
  assert.match(failures.find((failure) => failure.caseId === "Q1")?.signal ?? "", /Trash lasts 90 days/);
  assert.equal(severityOf("Retrieval miss"), "Medium");
  assert.equal(primaryCategory(["Weak citation", "Missing evidence"]), "Missing evidence");
});

test("regressions are cases that passed before and fail now", () => {
  const baseline = evaluateRun(tiny, perfectRun("prod"));
  const broken = perfectRun("cand");
  broken.outputs[0] = output({ caseId: "Q1", retrieved: ["A"], claims: [{ text: "Trash lasts 90 days.", citations: ["A"], goldClaimId: null }] });
  const regressions = findRegressions(evaluateRun(tiny, broken), baseline);
  assert.equal(regressions.length, 1);
  assert.equal(regressions[0].caseId, "Q1");
  assert.equal(isHighRisk(regressions[0]), true);
  // A case that was already failing is not a regression.
  assert.equal(findRegressions(evaluateRun(tiny, broken), evaluateRun(tiny, broken)).length, 0);
});

const cleanDrift: DriftReport = { fidelity: 98, baselineFidelity: 98, features: [], items: [], driftingFeatures: 0 };

test("gate: a clean release is READY FOR REVIEW but a human is always still pending", async () => {
  const { computeMetrics } = await import("../../lib/eval/metrics");
  const gate = buildGate(computeMetrics(tiny, perfectRun()), [], cleanDrift);
  assert.equal(gate.verdict, "READY FOR REVIEW");
  assert.equal(gate.blockers, 0);
  const human = gate.checks.find((check) => check.id === "human");
  assert.equal(human?.status, "wait");
});

test("gate: each threshold can independently block a release", async () => {
  const { computeMetrics } = await import("../../lib/eval/metrics");
  const base = computeMetrics(tiny, perfectRun());

  const lowGrounding = buildGate({ ...base, groundedAnswerRate: THRESHOLDS.groundedAnswerRate - 0.01 }, [], cleanDrift);
  assert.equal(lowGrounding.checks.find((check) => check.id === "grounding")?.status, "fail");

  const slow = buildGate({ ...base, p95LatencyMs: THRESHOLDS.p95LatencyMs + 1 }, [], cleanDrift);
  assert.equal(slow.checks.find((check) => check.id === "latency")?.status, "fail");

  const unsafe = buildGate({ ...base, safeAbstention: 0.5 }, [], cleanDrift);
  assert.equal(unsafe.checks.find((check) => check.id === "safety")?.status, "fail");

  const drifting = buildGate(base, [], { ...cleanDrift, driftingFeatures: 2, fidelity: 70 });
  assert.equal(drifting.checks.find((check) => check.id === "fidelity")?.status, "fail");
  assert.equal(drifting.verdict, "HOLD");

  const regressed = buildGate(base, [{ caseId: "Q1", query: "x", newFailures: ["Missing evidence"] }], cleanDrift);
  assert.equal(regressed.checks.find((check) => check.id === "regressions")?.status, "fail");
  // A low-severity regression alone does not block.
  const minor = buildGate(base, [{ caseId: "Q1", query: "x", newFailures: ["Over-abstention"] }], cleanDrift);
  assert.equal(minor.checks.find((check) => check.id === "regressions")?.status, "pass");
});
