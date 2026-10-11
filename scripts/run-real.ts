/**
 * Runs the real pipeline (BM25 retrieval + a real LLM) over the evaluation set for every release in
 * CONFIGS and writes the traces to data/real-runs.json, which the dashboard then displays.
 *
 *   npx tsx scripts/run-real.ts --model qwen2.5:3b-instruct                       # local Ollama
 *   LLM_API_KEY=... npx tsx scripts/run-real.ts --api openai \
 *       --base-url https://api.openai.com/v1 --model <model-name>                # any OpenAI-compatible API
 *   npx tsx scripts/run-real.ts --limit 3 --model ...                             # quick smoke test
 */
import { writeFile } from "node:fs/promises";
import { dataset, useCase } from "../lib/eval/dataset";
import { makeGenerator } from "../lib/real/llm";
import { CONFIGS, runConfig } from "../lib/real/pipeline";

function arg(name: string, fallback?: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}

const api = (arg("api", "ollama") as "ollama" | "openai");
const model = arg("model");
if (!model) throw new Error("Pass --model <name>");
const baseUrl = arg("base-url", api === "ollama" ? "http://localhost:11434" : "https://api.openai.com/v1") as string;
const limit = Number(arg("limit", "0"));
const out = arg("out", "data/real-runs.json") as string;

const generate = makeGenerator({ baseUrl, model, api, apiKey: process.env.LLM_API_KEY });
const subset = limit > 0 ? { ...dataset, cases: [...dataset.cases.filter((c) => !c.shouldAbstain).slice(0, limit), ...dataset.cases.filter((c) => c.shouldAbstain).slice(0, Math.max(1, Math.floor(limit / 3)))] } : dataset;

const runs = [];
for (const config of CONFIGS) {
  process.stdout.write(`${config.version} (${config.change}) `);
  const run = await runConfig(subset, config, generate, (done, total) => process.stdout.write(`\r${config.version} ${done}/${total}   `));
  process.stdout.write("\n");
  runs.push(run);
}

const payload = {
  meta: { model, api, temperature: 0, seed: 7, cases: subset.cases.length, generatedAt: new Date().toISOString(), useCase: useCase.name },
  releases: CONFIGS.map(({ version, label, date, change }) => ({ version, label, date, change })),
  runs,
};
await writeFile(out, `${JSON.stringify(payload, null, 1)}\n`);
console.log(`Wrote ${out} (${runs.length} releases × ${subset.cases.length} cases)`);
