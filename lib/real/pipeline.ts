import { toCaseOutput } from "./align";
import { rank, type Retriever } from "./retrieval";
import type { EvalDataset, RunOutput } from "../eval/types";

export type Message = { role: "system" | "user"; content: string };
export type Generate = (messages: Message[]) => Promise<{ text: string; ms: number }>;

export type PromptStyle = "plain" | "cited" | "strict" | "friendly";

export type PipelineConfig = {
  version: string;
  label: "Candidate" | "Production" | "Archived";
  date: string;
  /** What changed in this release, in one line. Shown in the dashboard and the README. */
  change: string;
  retriever: Retriever;
  /** How many retrieved documents are given to the model as context. */
  k: number;
  prompt: PromptStyle;
};

const BASE = "You are an assistant that answers questions about the GDPR for a company's privacy team. Use the provided documents.";
const CITE = " After each statement, cite the document id in square brackets, for example [D17].";
const STRICT =
  " Answer in one or two sentences using only the documents. If the documents do not contain the answer, or the question asks for legal advice, a guarantee, an opinion, a comparison, or covers another law or country, reply with exactly: ABSTAIN";
const FRIENDLY = " Be warm and thorough: greet the user, explain the reasoning in a few sentences, and offer further help.";

export function systemPrompt(style: PromptStyle): string {
  switch (style) {
    case "plain":
      return BASE;
    case "cited":
      return BASE + CITE;
    case "strict":
      return BASE + CITE + STRICT;
    case "friendly":
      return BASE + CITE + STRICT + FRIENDLY;
  }
}

/**
 * A realistic release history: each step is a real change an engineer might ship, measured on the
 * same evaluation set. The last release is a "friendlier tone" prompt change, the kind of tweak that
 * improves a demo and quietly drifts from the gold answers.
 */
export const CONFIGS: PipelineConfig[] = [
  { version: "r1", label: "Archived", date: "Baseline", change: "Keyword-overlap retrieval, 1 document, citations required", retriever: "overlap", k: 1, prompt: "cited" },
  { version: "r2", label: "Archived", date: "+ BM25", change: "BM25 retrieval, still 1 document", retriever: "bm25", k: 1, prompt: "cited" },
  { version: "r3", label: "Archived", date: "+ context", change: "Give the model the top 3 documents", retriever: "bm25", k: 3, prompt: "cited" },
  { version: "r4", label: "Production", date: "+ abstain rule", change: "Concise answers and an explicit abstain rule", retriever: "bm25", k: 3, prompt: "strict" },
  { version: "r5", label: "Candidate", date: "+ friendly tone", change: "Warmer, more thorough tone", retriever: "bm25", k: 3, prompt: "friendly" },
];

export function buildMessages(config: PipelineConfig, question: string, dataset: EvalDataset, contextIds: string[]): Message[] {
  const context = contextIds
    .map((id) => dataset.docs.find((doc) => doc.id === id))
    .filter((doc): doc is NonNullable<typeof doc> => Boolean(doc))
    .map((doc) => `[${doc.id}] ${doc.title}: ${doc.text}`)
    .join("\n");
  return [
    { role: "system", content: systemPrompt(config.prompt) },
    { role: "user", content: `Documents:\n${context}\n\nQuestion: ${question}` },
  ];
}

export async function runConfig(dataset: EvalDataset, config: PipelineConfig, generate: Generate, onProgress?: (done: number, total: number) => void): Promise<RunOutput> {
  const outputs = [];
  for (const testCase of dataset.cases) {
    const ranked = rank(testCase.query, dataset.docs, config.retriever, 4);
    const contextIds = ranked.slice(0, config.k).map((item) => item.id);
    const { text, ms } = await generate(buildMessages(config, testCase.query, dataset, contextIds));
    outputs.push(toCaseOutput({ testCase, docs: dataset.docs, retrieved: ranked, contextIds, answer: text, latencyMs: ms }));
    onProgress?.(outputs.length, dataset.cases.length);
  }
  return { version: config.version, label: config.label, outputs };
}
