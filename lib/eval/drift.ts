import { TOP_K } from "./metrics";
import { effectSize, ksCritical, ksStatistic, mean, median } from "./stats";
import { citationsPerClaim, fillerCount, sentenceCount, unsupportedFigures, wordCount } from "./text";
import type { CaseOutput, DriftReport, DriftStatus, EvalCase, EvalDataset, FeatureDrift, ItemDrift, ItemDriftReason, RunOutput } from "./types";

type FeatureKey = "words" | "sentences" | "citationsPerClaim" | "unsupportedFigures" | "fillerPhrases";

export const FEATURES: Array<{ key: FeatureKey; label: string }> = [
  { key: "words", label: "Answer length (words)" },
  { key: "sentences", label: "Sentences per answer" },
  { key: "citationsPerClaim", label: "Citations per claim" },
  { key: "unsupportedFigures", label: "Figures not in evidence" },
  { key: "fillerPhrases", label: "Filler phrases" },
];

type FeatureVector = Record<FeatureKey, number>;

function goldAnswer(testCase: EvalCase): string {
  return testCase.goldClaims.map((claim) => claim.text).join(" ");
}

/** The gold reference: what a professionally written answer for this case looks like. */
export function goldFeatures(testCase: EvalCase, dataset: EvalDataset): FeatureVector {
  const answer = goldAnswer(testCase);
  const evidence = testCase.goldClaims.flatMap((claim) => claim.supportedBy).map((id) => dataset.docs.find((doc) => doc.id === id)?.text ?? "").join(" ");
  return {
    words: wordCount(answer),
    sentences: sentenceCount(answer),
    citationsPerClaim: citationsPerClaim(testCase.goldClaims.map((claim) => ({ citations: claim.supportedBy.slice(0, 1) }))),
    unsupportedFigures: unsupportedFigures(answer, evidence).length,
    fillerPhrases: fillerCount(answer),
  };
}

/** Features of a system answer. Evidence is the text of the documents it actually retrieved. */
export function systemFeatures(output: CaseOutput, dataset: EvalDataset, k = TOP_K): FeatureVector {
  const evidence = output.retrieved
    .slice(0, k)
    .map((id) => dataset.docs.find((doc) => doc.id === id)?.text ?? "")
    .join(" ");
  return {
    words: wordCount(output.answer),
    sentences: sentenceCount(output.answer),
    citationsPerClaim: citationsPerClaim(output.claims),
    unsupportedFigures: unsupportedFigures(output.answer, evidence).length,
    fillerPhrases: fillerCount(output.answer),
  };
}

function answeredAnswerable(dataset: EvalDataset, run: RunOutput): Array<{ testCase: EvalCase; output: CaseOutput }> {
  const outputs = new Map(run.outputs.map((output) => [output.caseId, output]));
  const rows: Array<{ testCase: EvalCase; output: CaseOutput }> = [];
  for (const testCase of dataset.cases) {
    const output = outputs.get(testCase.id);
    if (!testCase.shouldAbstain && output && !output.abstained) rows.push({ testCase, output });
  }
  return rows;
}

function percent(value: number): string {
  return `${Math.round(Math.abs(value) * 100)}%`;
}

function explain(key: FeatureKey, gold: number[], candidate: number[], status: DriftStatus, relativeChange: number): string {
  if (status === "stable") return "Matches the gold distribution.";
  const longer = relativeChange > 0;
  switch (key) {
    case "words":
      return `Answers are ${percent(relativeChange)} ${longer ? "longer" : "shorter"} than gold (median ${median(candidate).toFixed(0)} vs ${median(gold).toFixed(0)} words).`;
    case "sentences":
      return `Answers use ${percent(relativeChange)} ${longer ? "more" : "fewer"} sentences than gold, which usually means added explanation the user did not ask for.`;
    case "citationsPerClaim":
      return longer ? "Claims carry more citations than gold; check for citation padding." : `Claims carry ${percent(relativeChange)} fewer citations than gold, so users cannot verify them.`;
    case "unsupportedFigures": {
      const affected = candidate.filter((value) => value > 0).length;
      return `${affected} of ${candidate.length} answers state a figure that is not in the retrieved evidence. Gold has none.`;
    }
    case "fillerPhrases": {
      const affected = candidate.filter((value) => value > 0).length;
      return `${affected} of ${candidate.length} answers use filler phrasing that the gold set avoids.`;
    }
  }
}

function driftFor(key: FeatureKey, goldValues: number[], baselineValues: number[], candidateValues: number[]): Omit<FeatureDrift, "feature" | "label"> {
  const ks = ksStatistic(candidateValues, goldValues);
  const critical = ksCritical(candidateValues.length, goldValues.length);
  const effect = effectSize(candidateValues, goldValues);
  const goldMean = mean(goldValues);
  const candidateMean = mean(candidateValues);
  const relativeChange = (candidateMean - goldMean) / Math.max(goldMean, 1);

  let status: DriftStatus = "stable";
  if (goldValues.every((value) => value === 0)) {
    // The gold set never does this (no filler, no invented figures), so any recurring occurrence is drift.
    const share = candidateValues.length === 0 ? 0 : candidateValues.filter((value) => value > 0).length / candidateValues.length;
    status = share >= 0.15 ? "drift" : share > 0 ? "watch" : "stable";
  } else if (ks > critical) {
    status = Math.abs(effect) >= 0.5 || Math.abs(relativeChange) >= 0.2 ? "drift" : "watch";
  }

  return {
    goldMean,
    baselineMean: mean(baselineValues),
    candidateMean,
    ks,
    ksCritical: critical,
    effectSize: effect,
    relativeChange,
    status,
    explanation: explain(key, goldValues, candidateValues, status, relativeChange),
  };
}

function itemReasons(output: CaseOutput, testCase: EvalCase, dataset: EvalDataset): ItemDriftReason[] {
  const gold = goldFeatures(testCase, dataset);
  const features = systemFeatures(output, dataset);
  const reasons: ItemDriftReason[] = [];
  if (features.words > Math.max(gold.words * 1.5, gold.words + 8)) reasons.push("Too long");
  if (features.unsupportedFigures > 0) reasons.push("Unsupported specificity");
  if (output.claims.some((claim) => claim.citations.length === 0)) reasons.push("Missing citation");
  if (features.fillerPhrases > 0) reasons.push("Filler phrasing");
  return reasons;
}

/**
 * Detects when generated answers drift away from the gold distribution and says why.
 * Each tracked feature is compared with a two-sample KS test (is the shape different?) and an
 * effect size (is the difference big enough to matter?), so large datasets do not flag trivia.
 */
export function computeDrift(dataset: EvalDataset, candidate: RunOutput, baseline: RunOutput): DriftReport {
  const candidateRows = answeredAnswerable(dataset, candidate);
  const baselineRows = answeredAnswerable(dataset, baseline);
  const goldRows = dataset.cases.filter((testCase) => !testCase.shouldAbstain).map((testCase) => goldFeatures(testCase, dataset));
  const candidateFeatures = candidateRows.map((row) => systemFeatures(row.output, dataset));
  const baselineFeatures = baselineRows.map((row) => systemFeatures(row.output, dataset));

  const features: FeatureDrift[] = FEATURES.map(({ key, label }) => ({
    feature: key,
    label,
    ...driftFor(
      key,
      goldRows.map((row) => row[key]),
      baselineFeatures.map((row) => row[key]),
      candidateFeatures.map((row) => row[key]),
    ),
  }));

  const baselineFidelity = fidelityOf(
    FEATURES.map(({ key }) =>
      ksStatistic(
        baselineFeatures.map((row) => row[key]),
        goldRows.map((row) => row[key]),
      ),
    ),
  );

  const items: ItemDrift[] = candidateRows
    .map(({ testCase, output }) => ({
      caseId: testCase.id,
      query: testCase.query,
      reasons: itemReasons(output, testCase, dataset),
      words: wordCount(output.answer),
      goldWords: wordCount(goldAnswer(testCase)),
      answer: output.answer,
    }))
    .filter((item) => item.reasons.length > 0)
    .sort((a, b) => b.reasons.length - a.reasons.length || b.words - a.words);

  return {
    fidelity: fidelityOf(features.map((feature) => feature.ks)),
    baselineFidelity,
    features,
    items,
    driftingFeatures: features.filter((feature) => feature.status === "drift").length,
  };
}

/** Gold fidelity: 100 minus the average KS distance across tracked features, as a 0–100 score. */
export function fidelityOf(distances: number[]): number {
  return Math.round(100 * (1 - mean(distances)));
}
