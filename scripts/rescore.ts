/**
 * Re-scores stored traces from the model's raw output, without calling the model again.
 * Use it after changing the aligner (lib/real/align.ts): npx tsx scripts/rescore.ts
 */
import { readFile, writeFile } from "node:fs/promises";
import { dataset } from "../lib/eval/dataset";
import { toCaseOutput } from "../lib/real/align";
import type { RunOutput } from "../lib/eval/types";

const path = process.argv[2] ?? "data/real-runs.json";
const data = JSON.parse(await readFile(path, "utf8")) as { runs: RunOutput[] };

for (const run of data.runs) {
  run.outputs = run.outputs.map((output) => {
    if (output.raw === undefined || !output.context) return output;
    const testCase = dataset.cases.find((item) => item.id === output.caseId);
    if (!testCase) return output;
    const retrieved = output.retrieved.map((id, index) => ({ id, score: output.retrievalScores[index] }));
    return toCaseOutput({ testCase, docs: dataset.docs, retrieved, contextIds: output.context, answer: output.raw, latencyMs: output.latencyMs });
  });
}
await writeFile(path, `${JSON.stringify(data, null, 1)}\n`);
console.log(`Re-scored ${data.runs.length} releases in ${path}`);
