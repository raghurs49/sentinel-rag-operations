import type { CaseOutput, EvalDataset, RunOutput } from "../../lib/eval/types";

/** A tiny hand-built dataset so every expected number in the tests can be verified by hand. */
export const tiny: EvalDataset = {
  docs: [
    { id: "A", title: "Trash", text: "Deleted files stay in the trash for 30 days." },
    { id: "B", title: "Refunds", text: "You can request a refund within 14 days." },
    { id: "C", title: "Uptime", text: "The Business plan promises 99.9% uptime." },
    { id: "D", title: "Limits", text: "Uploads are limited to 5 GB per file." },
  ],
  cases: [
    { id: "Q1", query: "How long is the trash kept?", shouldAbstain: false, goldClaims: [{ id: "Q1-1", text: "Deleted files stay in the trash for 30 days.", supportedBy: ["A"] }] },
    { id: "Q2", query: "Can I get a refund?", shouldAbstain: false, goldClaims: [{ id: "Q2-1", text: "You can request a refund within 14 days.", supportedBy: ["B"] }] },
    { id: "Q3", query: "What uptime do you promise and what are the upload limits?", shouldAbstain: false, goldClaims: [{ id: "Q3-1", text: "The Business plan promises 99.9% uptime.", supportedBy: ["C"] }, { id: "Q3-2", text: "Uploads are limited to 5 GB per file.", supportedBy: ["D"] }] },
    { id: "Q4", query: "Can you review my contract?", shouldAbstain: true, goldClaims: [] },
  ],
};

export function output(partial: Partial<CaseOutput> & { caseId: string }): CaseOutput {
  return {
    retrieved: [],
    retrievalScores: [],
    abstained: false,
    answer: "",
    claims: [],
    latencyMs: 1000,
    ...partial,
  };
}

/** A run where every answer is correct, grounded and cited, and the out-of-scope question is declined. */
export function perfectRun(version = "v-perfect"): RunOutput {
  return {
    version,
    label: "Archived",
    outputs: [
      output({ caseId: "Q1", retrieved: ["A", "B", "C"], retrievalScores: [0.9, 0.8, 0.7], answer: "Deleted files stay in the trash for 30 days.", claims: [{ text: "Deleted files stay in the trash for 30 days.", citations: ["A"], goldClaimId: "Q1-1" }] }),
      output({ caseId: "Q2", retrieved: ["B", "A", "C"], retrievalScores: [0.9, 0.8, 0.7], answer: "You can request a refund within 14 days.", claims: [{ text: "You can request a refund within 14 days.", citations: ["B"], goldClaimId: "Q2-1" }] }),
      output({
        caseId: "Q3",
        retrieved: ["C", "D", "A"],
        retrievalScores: [0.9, 0.8, 0.7],
        answer: "The Business plan promises 99.9% uptime. Uploads are limited to 5 GB per file.",
        claims: [
          { text: "The Business plan promises 99.9% uptime.", citations: ["C"], goldClaimId: "Q3-1" },
          { text: "Uploads are limited to 5 GB per file.", citations: ["D"], goldClaimId: "Q3-2" },
        ],
      }),
      output({ caseId: "Q4", abstained: true, answer: "I can’t help with that here.", retrieved: ["A", "B", "C"], retrievalScores: [0.5, 0.4, 0.3] }),
    ],
  };
}
