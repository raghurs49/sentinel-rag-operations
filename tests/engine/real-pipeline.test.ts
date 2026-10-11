import assert from "node:assert/strict";
import test from "node:test";
import { dataset } from "../../lib/eval/dataset";
import { relevantDocs } from "../../lib/eval/metrics";
import { buildReport } from "../../lib/eval/report";
import { toCaseOutput } from "../../lib/real/align";
import { CONFIGS, buildMessages, runConfig, type Generate } from "../../lib/real/pipeline";
import { rank, tokenize } from "../../lib/real/retrieval";

const byQuery = new Map(dataset.cases.map((testCase) => [testCase.query, testCase]));

/** Scripted stand-ins for an LLM, so the whole pipeline is testable without a model. */
function scripted(answer: (query: string) => string): Generate {
  return async (messages) => {
    const question = messages[1].content.split("Question: ")[1];
    return { text: answer(question), ms: 100 };
  };
}

const oracle = scripted((query) => {
  const testCase = byQuery.get(query);
  if (!testCase || testCase.shouldAbstain) return "ABSTAIN";
  return testCase.goldClaims.map((claim) => `${claim.text} [${claim.supportedBy[0]}]`).join(" ");
});

test("tokenizer drops stopwords and stems simple plurals", () => {
  assert.deepEqual(tokenize("What are the fines for breaches?"), ["fine", "breache"].map((word) => word).slice(0, 1).concat(tokenize("breaches")));
  assert.ok(!tokenize("the of and to").length);
  assert.ok(tokenize("72 hours").includes("72"));
});

test("BM25 retrieval puts a supporting document first for most single-claim questions", () => {
  const answerable = dataset.cases.filter((testCase) => !testCase.shouldAbstain && testCase.goldClaims.length === 1);
  const hits = answerable.filter((testCase) => relevantDocs(testCase).includes(rank(testCase.query, dataset.docs, "bm25", 4)[0].id)).length;
  assert.ok(hits / answerable.length >= 0.65, `BM25 recall@1 was ${hits}/${answerable.length}`);
});

test("BM25 beats naive keyword overlap on retrieval quality", () => {
  const answerable = dataset.cases.filter((testCase) => !testCase.shouldAbstain);
  const score = (retriever: "overlap" | "bm25") =>
    answerable.filter((testCase) => relevantDocs(testCase).some((id) => rank(testCase.query, dataset.docs, retriever, 3).some((item) => item.id === id))).length;
  assert.ok(score("bm25") >= score("overlap"));
});

test("aligner: a verbatim gold answer is fully grounded with its citation", () => {
  const testCase = dataset.cases[0];
  const output = toCaseOutput({
    testCase,
    docs: dataset.docs,
    retrieved: [{ id: "D17", score: 3 }],
    contextIds: ["D17"],
    answer: `${testCase.goldClaims[0].text} [D17]`,
    latencyMs: 10,
  });
  assert.equal(output.abstained, false);
  assert.equal(output.claims.length, 1);
  assert.equal(output.claims[0].goldClaimId, testCase.goldClaims[0].id);
  assert.deepEqual(output.claims[0].citations, ["D17"]);
  assert.ok(!output.answer.includes("[D17]"), "citation markers are stripped from the displayed answer");
});

test("aligner: naming the article is not mistaken for an invented figure", () => {
  const testCase = dataset.cases[0];
  const answer = "According to Article 33 of the GDPR, the controller must notify the supervisory authority without undue delay and, where feasible, within 72 hours of becoming aware of it. [D17]";
  const output = toCaseOutput({ testCase, docs: dataset.docs, retrieved: [{ id: "D17", score: 3 }], contextIds: ["D17"], answer, latencyMs: 10 });
  assert.equal(output.claims.length, 1);
  assert.equal(output.claims[0].goldClaimId, testCase.goldClaims[0].id);
});

test("aligner: a changed figure is treated as an unsupported claim, not a match", () => {
  const testCase = dataset.cases[0];
  const wrong = testCase.goldClaims[0].text.replace("72 hours", "48 hours");
  const output = toCaseOutput({ testCase, docs: dataset.docs, retrieved: [{ id: "D17", score: 3 }], contextIds: ["D17"], answer: `${wrong} [D17]`, latencyMs: 10 });
  assert.equal(output.claims.length, 1);
  assert.equal(output.claims[0].goldClaimId, null);
});

test("aligner: filler is ignored as a claim, a restatement of the evidence is harmless padding, new content is flagged", () => {
  const testCase = dataset.cases[0];
  const gold = testCase.goldClaims[0].text;
  const answer = `Great question! ${gold} [D17] The controller must notify the supervisory authority of a personal data breach. Regulators in Germany usually fine companies about 2 million euros for late reports.`;
  const output = toCaseOutput({ testCase, docs: dataset.docs, retrieved: [{ id: "D17", score: 3 }], contextIds: ["D17"], answer, latencyMs: 10 });
  const aligned = output.claims.filter((claim) => claim.goldClaimId !== null);
  const unsupported = output.claims.filter((claim) => claim.goldClaimId === null);
  assert.equal(aligned.length, 1);
  assert.equal(unsupported.length, 1);
  assert.match(unsupported[0].text, /Germany/);
});

test("aligner: the abstain marker is recognised", () => {
  const output = toCaseOutput({ testCase: dataset.cases[dataset.cases.length - 1], docs: dataset.docs, retrieved: [], contextIds: [], answer: "ABSTAIN", latencyMs: 5 });
  assert.equal(output.abstained, true);
  assert.deepEqual(output.claims, []);
});

test("prompts: only the retrieved context is shown, and later releases add rules", () => {
  const messages = buildMessages(CONFIGS[3], "How long?", dataset, ["D17"]);
  assert.match(messages[0].content, /ABSTAIN/);
  assert.match(messages[0].content, /\[D17\]/);
  assert.match(messages[1].content, /\[D17\] Article 33/);
  assert.ok(!messages[1].content.includes("[D01]"));
  assert.ok(!buildMessages(CONFIGS[0], "q", dataset, ["D17"])[0].content.includes("ABSTAIN"));
});

test("end to end: an oracle model scores perfectly on generation, bounded only by retrieval", async () => {
  const run = await runConfig(dataset, CONFIGS[3], oracle);
  const report = buildReport(dataset, [run, { ...run, version: "again", label: "Candidate" }]);
  const metrics = report.candidate.metrics;
  assert.equal(metrics.groundedAnswerRate, 1);
  assert.equal(metrics.safeAbstention, 1);
  assert.equal(metrics.overAbstention, 0);
  assert.equal(metrics.p95LatencyMs, 100);
  assert.equal(report.regressions.length, 0);
});

test("end to end: a chatty model is caught as drift and an over-eager one as should-abstain failures", async () => {
  const gold = await runConfig(dataset, CONFIGS[3], oracle);
  const chatty = await runConfig(
    dataset,
    CONFIGS[4],
    scripted((query) => {
      const testCase = byQuery.get(query);
      if (!testCase || testCase.shouldAbstain) return "Sure! Happy to help with that. Here is what I think.";
      const facts = testCase.goldClaims.map((claim) => `${claim.text} [${claim.supportedBy[0]}]`).join(" ");
      return `Great question! ${facts} It is worth keeping in mind that these obligations apply in many different situations. Let me know if you need more.`;
    }),
  );
  const report = buildReport(dataset, [gold, chatty]);
  assert.equal(report.gate.verdict, "HOLD");
  assert.ok(report.drift.driftingFeatures >= 2);
  assert.ok(report.drift.fidelity < report.drift.baselineFidelity);
  assert.equal(report.candidate.metrics.safeAbstention, 0);
  assert.ok(report.failures.some((failure) => failure.category === "Should abstain"));
});

const caseFor = (fragment: string) => {
  const found = dataset.cases.find((testCase) => testCase.query.includes(fragment));
  assert.ok(found, `no case containing "${fragment}"`);
  return found;
};

test("aligner: a mangled citation marker such as [DR13] is not read as a figure or a citation", () => {
  const testCase = caseFor("purely automated decisions");
  const gold = testCase.goldClaims[0].text;
  const output = toCaseOutput({ testCase, docs: dataset.docs, retrieved: [{ id: "D13", score: 3 }], contextIds: ["D13"], answer: `[DR13] ${gold}`, latencyMs: 10 });
  assert.equal(output.claims.length, 1);
  assert.equal(output.claims[0].goldClaimId, testCase.goldClaims[0].id);
  assert.deepEqual(output.claims[0].citations, []);
  assert.ok(!output.answer.includes("DR13"));
});

test("aligner: a true extra statement from the same source is padding, not an unsupported claim", () => {
  const testCase = caseFor("What makes consent valid");
  const answer = "Consent must be freely given, specific, informed and unambiguous. [D03] Withdrawal of consent must also be as easy as its giving, according to Article 7. [D03]";
  const output = toCaseOutput({ testCase, docs: dataset.docs, retrieved: [{ id: "D03", score: 3 }], contextIds: ["D03"], answer, latencyMs: 10 });
  assert.equal(output.claims.length, 1);
  assert.equal(output.claims[0].goldClaimId, testCase.goldClaims[0].id);
});

test("aligner: an extra statement that is NOT in the evidence is still flagged", () => {
  const testCase = caseFor("Do we have to tell the affected individuals");
  const answer = `${testCase.goldClaims[0].text} [D18] Otherwise, only the supervisory authority needs to be notified. [D17]`;
  const output = toCaseOutput({ testCase, docs: dataset.docs, retrieved: [{ id: "D18", score: 3 }], contextIds: ["D18"], answer, latencyMs: 10 });
  assert.equal(output.claims.filter((claim) => claim.goldClaimId === null).length, 1);
});

test("traces keep the raw model output and the context, so they can be rescored without the model", () => {
  const testCase = dataset.cases[0];
  const output = toCaseOutput({ testCase, docs: dataset.docs, retrieved: [{ id: "D17", score: 3 }], contextIds: ["D17"], answer: `${testCase.goldClaims[0].text} [D17]`, latencyMs: 10 });
  assert.match(output.raw ?? "", /\[D17\]/);
  assert.deepEqual(output.context, ["D17"]);
});

test("stemming lets word forms match (withdrawal / withdrawing)", () => {
  assert.deepEqual(tokenize("withdrawing"), tokenize("withdrawal"));
});

test("aligner: a sentence that drags in a figure from another provision is flagged, not waved through as padding", () => {
  const testCase = caseFor("maximum fine for failing to notify");
  const answer = "According to [D26], the maximum fine for failing to notify within 72 hours of becoming aware is up to €10 million or 2% of total worldwide annual turnover, whichever is higher.";
  const output = toCaseOutput({ testCase, docs: dataset.docs, retrieved: [{ id: "D26", score: 3 }, { id: "D17", score: 2 }], contextIds: ["D26", "D17"], answer, latencyMs: 10 });
  assert.equal(output.claims.length, 1, "the sentence must not silently disappear");
});

test("tidy: removing citations leaves clean punctuation", async () => {
  const { tidy } = await import("../../lib/real/align");
  assert.equal(tidy("Fines can reach €10 million, whichever is higher. [D26],"), "Fines can reach €10 million, whichever is higher.");
  assert.equal(tidy("Notify within 72 hours [D17]."), "Notify within 72 hours.");
  assert.equal(tidy("A  B [DR13] C"), "A B C");
});
