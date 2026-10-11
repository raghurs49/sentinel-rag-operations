import { relevantDocs } from "./metrics";
import { createRng } from "./stats";
import type { CaseOutput, EvalCase, EvalDataset, RunOutput, SystemClaim } from "./types";

/**
 * Seeded simulator that stands in for a real RAG system so the demo works without API keys.
 *
 * It is the ONLY synthetic part of the pipeline: it emits `RunOutput` objects in exactly the shape
 * a real trace exporter would produce. Replace it with real traces and every metric, failure,
 * drift report and gate check in this project works unchanged.
 */
export type Profile = {
  version: string;
  label: "Candidate" | "Production" | "Archived";
  date: string;
  seed: number;
  /** Probability the relevant documents are retrieved in the top results. */
  retrievalHit: number;
  /** Probability a claim is correct but cites a document that does not support it. */
  weakCitation: number;
  /** Probability a claim goes beyond the evidence when retrieval succeeded. */
  unsupported: number;
  /** Probability a claim goes beyond the evidence when retrieval failed. */
  unsupportedOnMiss: number;
  /** Probability an unsupported claim contains an invented figure. */
  inventedFigure: number;
  /** Probability a claim carries no citation at all. */
  missingCitation: number;
  /** Probability the answer is padded with filler phrasing ("Great question!"). */
  filler: number;
  /** Probability the answer is padded with a sentence that restates the obvious. */
  padding: number;
  safeAbstain: number;
  overAbstain: number;
  latencyMs: number;
};

const PADDING = [
  "This is a general summary, and the exact obligations can depend on the circumstances of the organisation.",
  "It is worth keeping in mind that supervisory authorities interpret these provisions in light of the specific facts.",
  "Many organisations find it helpful to document how they apply this requirement in practice.",
];

const FILLER_PREFIX = ["Great question! ", "Certainly! ", "Of course! "];
const FILLER_SUFFIX = [" Let me know if there is anything else you would like to know.", " I hope this helps, and feel free to ask more."];

/** What a careless assistant says when it should have declined (one per out-of-scope question). */
const FABRICATED = [
  "Yes, your privacy policy looks fully compliant with the GDPR.",
  "Yes, your company will definitely be fined for the leak.",
  "Under the CCPA you must honour opt-out requests within 15 days.",
  "Yes, you should dismiss the employee immediately.",
  "France has the strictest data protection authority in the EU.",
  "Yes, scraping public LinkedIn profiles for sales leads is legal.",
  "Here is a data processing agreement you can sign today.",
  "The UK GDPR sets the age of digital consent at 14.",
  "Yes, following this checklist guarantees full compliance.",
  "Yes, the Indian DPDP Act applies to every company in the EU.",
];

const ABSTAIN_ANSWER = "I can’t answer that from the regulation, so I’m passing you to the privacy team.";

function pick<T>(items: T[], rng: () => number): T {
  return items[Math.floor(rng() * items.length)];
}

function alterNumbers(text: string, rng: () => number): string {
  return text.replace(/\d+(?:\.\d+)?/g, (match) => String(Math.max(1, Math.round(Number(match) * (1.5 + rng())))));
}

function retrieve(testCase: EvalCase, dataset: EvalDataset, profile: Profile, rng: () => number, uRetrieval: number): { ids: string[]; scores: number[]; hit: boolean } {
  const relevant = relevantDocs(testCase);
  const others = dataset.docs.map((doc) => doc.id).filter((id) => !relevant.includes(id));
  const hit = !testCase.shouldAbstain && uRetrieval < profile.retrievalHit;

  const ids: string[] = [];
  const pool = [...others];
  const draw = () => pool.splice(Math.floor(rng() * pool.length), 1)[0];

  if (hit) {
    ids.push(...relevant);
    while (ids.length < 4) ids.push(draw());
    // Most of the time a relevant document ranks first; otherwise a distractor outranks it.
    if (rng() >= 0.7) {
      ids.unshift(draw());
      ids.pop();
    }
  } else {
    while (ids.length < 4) ids.push(draw());
  }

  const scores = ids.map((id, rank) => Number((0.92 - rank * 0.09 + (relevant.includes(id) && hit ? 0.04 : 0) + (rng() - 0.5) * 0.03).toFixed(2)));
  return { ids, scores: scores.sort((a, b) => b - a), hit };
}

function simulateCase(testCase: EvalCase, index: number, dataset: EvalDataset, profile: Profile): CaseOutput {
  // Two random streams: one shared by every release (so a case that is hard stays hard, and quality
  // trends are steady rather than noisy), and one per release for incidental choices such as which
  // distractor document appears.
  const shared = createRng(1000003 + index * 977);
  const uRetrieval = shared();
  const uAbstain = shared();
  const uOver = shared();
  const claimDraws = [0, 1].map(() => ({ outcome: shared(), citation: shared() }));

  const rng = createRng(profile.seed * 10007 + index * 7919);
  // Each release perturbs the shared draws a little: releases are correlated (hard cases stay hard)
  // but not identical, so a new release can fix some failures and introduce others.
  const wobble = (value: number) => (value + rng() * 0.3) % 1;
  const { ids, scores, hit } = retrieve(testCase, dataset, profile, rng, wobble(uRetrieval));
  const latency = Math.round(profile.latencyMs * (0.75 + rng() * 0.5) * (rng() < 0.06 ? 1.5 : 1));
  const base = { caseId: testCase.id, retrieved: ids, retrievalScores: scores, latencyMs: latency };

  if (testCase.shouldAbstain) {
    if (uAbstain < profile.safeAbstain) return { ...base, abstained: true, answer: ABSTAIN_ANSWER, claims: [] };
    const abstainIndex = dataset.cases.slice(0, index).filter((item) => item.shouldAbstain).length;
    const text = FABRICATED[abstainIndex % FABRICATED.length];
    return { ...base, abstained: false, answer: text, claims: [{ text, citations: [ids[0]], goldClaimId: null }] };
  }

  if (uOver < profile.overAbstain) return { ...base, abstained: true, answer: ABSTAIN_ANSWER, claims: [] };

  const topK = ids.slice(0, 3);
  const claims: SystemClaim[] = testCase.goldClaims.map((gold, claimIndex) => {
    const draws = claimDraws[claimIndex];
    const outcome = wobble(draws.outcome);
    const citation = draws.citation;
    const unsupportedRate = hit ? profile.unsupported : profile.unsupportedOnMiss;
    if (outcome < unsupportedRate) {
      const invented = rng() < profile.inventedFigure && /\d/.test(gold.text);
      const text = invented ? alterNumbers(gold.text, rng) : `${gold.text.replace(/\.$/, "")}, and this applies to every organisation.`;
      return { text, citations: [pick(topK, rng)], goldClaimId: null };
    }
    if (citation < profile.missingCitation) return { text: gold.text, citations: [], goldClaimId: gold.id };
    const unsupportingDocs = topK.filter((id) => !gold.supportedBy.includes(id));
    if (!hit || outcome < unsupportedRate + profile.weakCitation) {
      return { text: gold.text, citations: [pick(unsupportingDocs.length > 0 ? unsupportingDocs : topK, rng)], goldClaimId: gold.id };
    }
    const supporting = topK.filter((id) => gold.supportedBy.includes(id));
    return { text: gold.text, citations: [pick(supporting.length > 0 ? supporting : gold.supportedBy, rng)], goldClaimId: gold.id };
  });

  let answer = claims.map((claim) => claim.text).join(" ");
  if (rng() < profile.padding) answer = `${answer} ${pick(PADDING, rng)}`;
  if (rng() < profile.filler) answer = rng() < 0.5 ? `${pick(FILLER_PREFIX, rng)}${answer}` : `${answer}${pick(FILLER_SUFFIX, rng)}`;

  return { ...base, abstained: false, answer, claims };
}

export function simulateRun(dataset: EvalDataset, profile: Profile): RunOutput {
  return {
    version: profile.version,
    label: profile.label,
    outputs: dataset.cases.map((testCase, index) => simulateCase(testCase, index, dataset, profile)),
  };
}

const VERSIONS: Array<[string, string]> = [
  ["v1.2.1", "Jul 14"],
  ["v1.2.4", "Jul 19"],
  ["v1.2.7", "Jul 24"],
  ["v1.3.0", "Jul 30"],
  ["v1.3.2", "Aug 02"],
  ["v1.3.4", "Aug 04"],
  ["v1.3.6", "Aug 06"],
  ["v1.3.8", "Aug 09"],
  ["v1.3.9", "Aug 11"],
  ["v1.4.0", "Aug 12"],
  ["v1.4.1", "Yesterday"],
  ["v1.4.2", "Today, 10:42"],
];

/** Release history: quality improves steadily; the newest candidate also becomes wordier. */
export const profiles: Profile[] = VERSIONS.map(([version, date], index) => {
  const t = index / (VERSIONS.length - 1);
  const isCandidate = index === VERSIONS.length - 1;
  const isProduction = index === VERSIONS.length - 2;
  return {
    version,
    date,
    label: isCandidate ? "Candidate" : isProduction ? "Production" : "Archived",
    // Seeds for the two newest releases are fixed so the demo tells a stable, reproducible story.
    seed: isCandidate ? 2 : isProduction ? 3 : 11 + index * 3,
    retrievalHit: 0.8 + 0.18 * t,
    weakCitation: 0.1 - 0.075 * t,
    unsupported: isCandidate ? 0.07 : 0.12 - 0.09 * t,
    unsupportedOnMiss: 0.6,
    inventedFigure: isCandidate ? 0.9 : 0.3,
    missingCitation: isCandidate ? 0.01 : 0.08 - 0.075 * t,
    filler: isCandidate ? 0.4 : 0.06,
    padding: isCandidate ? 0.7 : 0.1,
    safeAbstain: 0.7 + 0.28 * t,
    overAbstain: 0.06 - 0.045 * t,
    latencyMs: Math.round(1050 - 250 * t),
  };
});

export function simulateReleases(dataset: EvalDataset): RunOutput[] {
  return profiles.map((profile) => simulateRun(dataset, profile));
}
