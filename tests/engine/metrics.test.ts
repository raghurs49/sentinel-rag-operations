import assert from "node:assert/strict";
import test from "node:test";
import { computeMetrics, evaluateCase, evaluateRun, judgeClaim, relevantDocs } from "../../lib/eval/metrics";
import type { RunOutput } from "../../lib/eval/types";
import { output, perfectRun, tiny } from "./fixtures";

const [q1, q2, q3, q4] = tiny.cases;

test("relevantDocs unions the supporting documents of every gold claim", () => {
  assert.deepEqual(relevantDocs(q3), ["C", "D"]);
});

test("a claim is grounded only when it aligns to gold AND cites a supporting document", () => {
  assert.equal(judgeClaim({ text: "x", citations: ["A"], goldClaimId: "Q1-1" }, q1), "grounded");
  assert.equal(judgeClaim({ text: "x", citations: ["B"], goldClaimId: "Q1-1" }, q1), "weak citation");
  assert.equal(judgeClaim({ text: "x", citations: [], goldClaimId: "Q1-1" }, q1), "weak citation");
  assert.equal(judgeClaim({ text: "x", citations: ["A"], goldClaimId: null }, q1), "unsupported");
  assert.equal(judgeClaim({ text: "x", citations: ["A"], goldClaimId: "does-not-exist" }, q1), "unsupported");
});

test("a perfect run scores perfectly on every metric", () => {
  const metrics = computeMetrics(tiny, perfectRun());
  assert.equal(metrics.groundedAnswerRate, 1);
  assert.equal(metrics.claimSupportRate, 1);
  assert.equal(metrics.citationCoverage, 1);
  assert.equal(metrics.safeAbstention, 1);
  assert.equal(metrics.overAbstention, 0);
  assert.equal(metrics.recallAtK, 1);
  assert.equal(metrics.passRate, 1);
});

test("metrics are computed correctly on a mixed run (worked by hand)", () => {
  const run: RunOutput = {
    version: "mixed",
    label: "Candidate",
    outputs: [
      // Q1: retrieval hit at rank 2, claim grounded.
      output({ caseId: "Q1", retrieved: ["B", "A", "C"], retrievalScores: [0.9, 0.8, 0.7], answer: "Deleted files stay in the trash for 30 days.", claims: [{ text: "ok", citations: ["A"], goldClaimId: "Q1-1" }], latencyMs: 800 }),
      // Q2: retrieval miss, invented claim.
      output({ caseId: "Q2", retrieved: ["A", "C", "D"], retrievalScores: [0.9, 0.8, 0.7], answer: "Refunds last 60 days.", claims: [{ text: "Refunds last 60 days.", citations: ["A"], goldClaimId: null }], latencyMs: 1200 }),
      // Q3: one claim grounded, one correct but cited wrongly; only C is retrieved of C and D.
      output({
        caseId: "Q3",
        retrieved: ["C", "A", "B"],
        retrievalScores: [0.9, 0.8, 0.7],
        answer: "x",
        claims: [
          { text: "a", citations: ["C"], goldClaimId: "Q3-1" },
          { text: "b", citations: [], goldClaimId: "Q3-2" },
        ],
        latencyMs: 1000,
      }),
      // Q4: should abstain, but answered.
      output({ caseId: "Q4", retrieved: ["A"], retrievalScores: [0.5], answer: "Looks fine.", claims: [{ text: "Looks fine.", citations: ["A"], goldClaimId: null }], latencyMs: 2000 }),
    ],
  };

  const metrics = computeMetrics(tiny, run);
  // Answerable cases answered: Q1, Q2, Q3. Fully grounded answers: Q1 only -> 1/3.
  assert.ok(Math.abs(metrics.groundedAnswerRate - 1 / 3) < 1e-9);
  // Claims across answerable answers: Q1(1) + Q2(1) + Q3(2) = 4; grounded: Q1 + Q3-1 = 2.
  assert.equal(metrics.claimSupportRate, 0.5);
  // Claims with at least one citation: Q1, Q2, Q3-1 = 3 of 4.
  assert.equal(metrics.citationCoverage, 0.75);
  assert.equal(metrics.safeAbstention, 0);
  assert.equal(metrics.overAbstention, 0);
  // Recall@3: Q1 1.0, Q2 0.0, Q3 relevant {C,D} with only C retrieved = 0.5 -> mean 0.5.
  assert.equal(metrics.recallAtK, 0.5);
  // MRR: Q1 first hit at rank 2 = 0.5, Q2 none = 0, Q3 rank 1 = 1 -> mean 0.5.
  assert.equal(metrics.mrr, 0.5);
  // Latencies 800,1200,1000,2000: p95 interpolates between 1200 and 2000 at 0.85.
  assert.ok(Math.abs(metrics.p95LatencyMs - 1880) < 1e-9);
  // Only Q1 passes outright (Q2 invents a claim, Q3 has a weak citation, Q4 should have abstained).
  assert.equal(metrics.passRate, 0.25);
});

test("failure categories are assigned per case", () => {
  assert.deepEqual(evaluateCase(q4, output({ caseId: "Q4", abstained: false, claims: [{ text: "x", citations: [], goldClaimId: null }] })).failures, ["Should abstain"]);
  assert.deepEqual(evaluateCase(q1, output({ caseId: "Q1", abstained: true })).failures, ["Over-abstention"]);
  const miss = evaluateCase(q1, output({ caseId: "Q1", retrieved: ["B", "C", "D"], claims: [{ text: "x", citations: ["B"], goldClaimId: null }] }));
  assert.deepEqual(miss.failures, ["Retrieval miss", "Missing evidence"]);
  const weak = evaluateCase(q1, output({ caseId: "Q1", retrieved: ["A"], claims: [{ text: "x", citations: ["B"], goldClaimId: "Q1-1" }] }));
  assert.deepEqual(weak.failures, ["Weak citation"]);
});

test("an answer with no claims never counts as passing, and says why", () => {
  const result = evaluateCase(q1, output({ caseId: "Q1", retrieved: ["A"], claims: [] }));
  assert.equal(result.passed, false);
  assert.deepEqual(result.failures, ["Off-target answer"]);
  assert.equal(result.groundingScore, 0);
});

test("cases missing from a run are reported as failures, not silently skipped", () => {
  const results = evaluateRun(tiny, { version: "empty", label: "Archived", outputs: [] });
  assert.equal(results.length, tiny.cases.length);
  assert.ok(results.every((result) => !result.passed));
});

test("tiny dataset sanity: q2 and q3 are answerable", () => {
  assert.equal(q2.shouldAbstain, false);
  assert.equal(q3.goldClaims.length, 2);
});
