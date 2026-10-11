import assert from "node:assert/strict";
import test from "node:test";
import { dataset } from "../../lib/eval/dataset";
import { buildReport } from "../../lib/eval/report";
import { profiles, simulateRun } from "../../lib/eval/simulate";
import { output, perfectRun, tiny } from "./fixtures";

test("the bundled dataset is internally consistent", () => {
  const docIds = new Set(dataset.docs.map((doc) => doc.id));
  const caseIds = new Set(dataset.cases.map((testCase) => testCase.id));
  assert.equal(caseIds.size, dataset.cases.length, "case ids are unique");
  for (const testCase of dataset.cases) {
    assert.equal(testCase.shouldAbstain, testCase.goldClaims.length === 0, `${testCase.id}: abstain cases have no gold claims`);
    for (const claim of testCase.goldClaims) {
      assert.ok(claim.supportedBy.length > 0 && claim.supportedBy.every((id) => docIds.has(id)), `${testCase.id} cites real documents`);
      // Every gold claim must actually be stated by its supporting document, so the gold set is trustworthy.
      const evidence = claim.supportedBy.map((id) => dataset.docs.find((doc) => doc.id === id)?.text ?? "").join(" ");
      const figures = claim.text.match(/\d+(?:\.\d+)?/g) ?? [];
      for (const figure of figures) assert.ok(evidence.includes(figure), `${testCase.id}: figure ${figure} appears in the evidence`);
    }
  }
});

test("the simulator is deterministic", () => {
  const profile = profiles[profiles.length - 1];
  assert.deepEqual(simulateRun(dataset, profile), simulateRun(dataset, profile));
});

test("the demo release history tells the intended story", () => {
  const report = buildReport();
  assert.equal(report.releases.length, 12);
  assert.equal(report.candidate.label, "Candidate");
  assert.equal(report.production.label, "Production");

  // Quality improved overall...
  assert.ok(report.candidate.metrics.groundedAnswerRate > report.production.metrics.groundedAnswerRate);
  assert.ok(report.candidate.metrics.groundedAnswerRate > report.releases[0].metrics.groundedAnswerRate + 0.2);

  // ...yet the gate still holds, because of a regression and drift away from gold.
  assert.equal(report.gate.verdict, "HOLD");
  assert.equal(report.regressions.length, 1);
  assert.ok(report.drift.driftingFeatures >= 2);
  assert.ok(report.drift.fidelity < report.drift.baselineFidelity - 10);
  assert.ok(report.failures.length >= 1);
  assert.equal(report.failures[0].severity, "High");

  // A human is always the last step.
  assert.equal(report.gate.checks.at(-1)?.status, "wait");
});

test("every reported failure has a retrievable trace", () => {
  const report = buildReport();
  for (const failure of report.failures) {
    const trace = report.trace(failure.caseId);
    assert.ok(trace, `${failure.caseId} has a trace`);
    assert.equal(trace?.retrieved.length, 3);
  }
  assert.equal(report.trace("does-not-exist"), undefined);
});

test("the engine scores any dataset and traces, not just the simulator", () => {
  const worse = perfectRun("v2");
  worse.label = "Candidate";
  worse.outputs[1] = output({ caseId: "Q2", retrieved: ["A", "C", "D"], retrievalScores: [0.9, 0.8, 0.7], answer: "Refunds last 60 days.", claims: [{ text: "Refunds last 60 days.", citations: ["A"], goldClaimId: null }] });
  const report = buildReport(tiny, [perfectRun("v1"), worse]);
  assert.equal(report.candidate.version, "v2");
  assert.equal(report.production.version, "v1");
  assert.equal(report.regressions.length, 1);
  assert.equal(report.regressions[0].caseId, "Q2");
  assert.equal(report.gate.verdict, "HOLD");
});
