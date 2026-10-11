import type { Generate, Message } from "./pipeline";

export type LlmOptions = {
  baseUrl: string;
  model: string;
  /** "ollama" talks to a local Ollama server; "openai" to any OpenAI-compatible /chat/completions API. */
  api: "ollama" | "openai";
  /** Sent as a bearer token for the "openai" style. Read from the environment, never logged. */
  apiKey?: string;
  temperature?: number;
  seed?: number;
  maxTokens?: number;
};

/** Deterministic settings (temperature 0, fixed seed) so a run can be repeated and compared. */
export function makeGenerator(options: LlmOptions): Generate {
  const { baseUrl, model, api, apiKey, temperature = 0, seed = 7, maxTokens = 220 } = options;
  const root = baseUrl.replace(/\/$/, "");

  return async (messages: Message[]) => {
    const started = performance.now();
    const response =
      api === "ollama"
        ? await fetch(`${root}/api/chat`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ model, messages, stream: false, options: { temperature, seed, num_predict: maxTokens } }),
          })
        : await fetch(`${root}/chat/completions`, {
            method: "POST",
            headers: { "content-type": "application/json", ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) },
            body: JSON.stringify({ model, messages, temperature, seed, max_tokens: maxTokens }),
          });

    if (!response.ok) throw new Error(`LLM request failed: ${response.status} ${(await response.text()).slice(0, 200)}`);
    const data = (await response.json()) as { message?: { content?: string }; choices?: Array<{ message?: { content?: string } }> };
    const text = api === "ollama" ? data.message?.content : data.choices?.[0]?.message?.content;
    return { text: (text ?? "").trim(), ms: Math.round(performance.now() - started) };
  };
}
