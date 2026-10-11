# Sentinel — RAG Quality & Safety Operations

![Sentinel product overview](public/og.png)

Sentinel is an interactive portfolio demonstration of how an AI engineering team can evaluate, investigate, and govern RAG releases before they reach users.

**The use case: a GDPR compliance assistant.** Imagine a privacy team's internal tool that answers questions such as "How quickly must we report a breach?" and "Do we need a DPO?", cites the article, and refuses to give legal advice. A wrong answer there is a compliance risk (a 72-hour deadline that becomes 48 is exactly the kind of error that ships unnoticed), which is why a release should have to pass a measurable gate.

**Live demo:** [sentinel-rag-operations.vercel.app](https://sentinel-rag-operations.vercel.app)

> The knowledge base is a set of short plain-language **summaries** of provisions of Regulation (EU) 2016/679 ([EUR-Lex](https://eur-lex.europa.eu/eli/reg/2016/679/oj)), written for this demonstration. They are not the legal text and not legal advice. No client, patient, employee, or proprietary data is included.

## Why this exists

RAG systems need more than a good-looking answer. A production release should make it possible to answer:

- Did retrieval return the evidence needed to answer the question?
- Are material claims supported by citations?
- Did a candidate release improve quality without introducing regressions?
- Does the system abstain when evidence is insufficient?
- Who reviewed and approved the release?

Sentinel turns those questions into an operations workflow rather than a collection of disconnected metrics.

## Product surfaces

- **Operations overview** — grounding, citation coverage, gold fidelity, latency, and readiness signals
- **Evaluation runs** — candidate-versus-production comparison across the evaluation set
- **Failure explorer** — retrieval trace, answer audit, root cause and owner for every failing case
- **Drift & calibration** — feature-by-feature comparison of generated answers against a gold reference set, with plain-English reasons
- **Release gate** — measurable checks plus explicit human sign-off before shipment

## The evaluation engine

Every number in the dashboard is computed by the engine in [`lib/eval`](lib/eval), not typed in. The engine is independent of how answers were produced: anything that emits a `RunOutput` for the cases in an `EvalDataset` can be scored.

| Module | What it does |
| --- | --- |
| `metrics.ts` | Claim-level grounding, citation coverage, safe abstention, over-abstention, recall@3, MRR, P95 latency |
| `failures.ts` | Classifies failing cases (missing evidence, weak citation, retrieval miss, should-abstain, over-abstention), ranks them by severity, and finds regressions against the previous release |
| `drift.ts` | Compares answers with the gold distribution on length, sentences, citations per claim, figures absent from the evidence, and filler phrasing |
| `gate.ts` | Turns results into release checks. The verdict is only ever HOLD or READY FOR REVIEW; a human is always the last step |
| `simulate.ts` | A seeded stand-in for a real RAG system, so the demo runs without API keys |

### How claims are judged

A claim is **grounded** when it is aligned to a gold claim *and* cites at least one document that supports it. It is a **weak citation** when the claim is right but its citations do not support it, and **unsupported** when it is not part of the reference answer at all. An answer counts as grounded only if every one of its claims is.

### How drift is detected

Plausible answers are easy to generate; matching a reference set is the hard part. For each tracked feature the candidate's distribution is compared with the gold distribution using a two-sample Kolmogorov–Smirnov test (is the shape different?) and a standardised effect size (is the difference large enough to matter?). A feature is flagged as drift only when both agree, so a large sample does not flag trivia. Where the gold set never does something at all (invented figures, filler phrases), any recurring occurrence counts as drift. **Gold fidelity** is 100 minus the mean KS distance across features.

The output is a revision target ("answers are 102% longer than gold, median 27 vs 13 words") rather than an instruction to "sound more like the examples", and per-answer reasons ("Too long", "Filler phrasing", "Unsupported specificity") that show where to make a surgical edit instead of rewriting the whole answer.

### Measured runs with a real model

`npm run run:real` runs the real pipeline (BM25 retrieval, a prompt, and an LLM) for a five-release history over the 50-case evaluation set and writes the traces to `data/real-runs.json`, which the dashboard then displays. The sidebar shows whether you are looking at **Measured** or **Synthetic** data.

```bash
# local model through Ollama
npm run run:real -- --model qwen2.5:3b-instruct

# or any OpenAI-compatible API (the key is read from the environment and never logged)
LLM_API_KEY=... npm run run:real -- --api openai --base-url https://api.openai.com/v1 --model <model-name>
```

Settings are deterministic (temperature 0, fixed seed). Each release is a realistic change, such as adding BM25 retrieval, requiring citations, adding an abstain rule, and finally a friendlier tone. Answers are scored automatically: sentences are aligned to gold claims by content-word overlap, any changed figure counts as an unsupported claim, and text that merely restates the retrieved evidence is treated as padding.

### Using your own data

```ts
import { buildReport } from "@/lib/eval/report";

// dataset: { docs, cases }   runs: RunOutput[]  (oldest first, candidate last, production second to last)
const report = buildReport(dataset, runs);
report.gate.verdict; // "HOLD" | "READY FOR REVIEW"
```

Each `CaseOutput` carries the retrieved document ids, the answer text, and its claims with the citations they used and the gold claim they align to (or `null`). See [`lib/eval/types.ts`](lib/eval/types.ts).

## Measured results

A real run, not a simulation: `qwen2.5:3b-instruct` running locally through Ollama (temperature 0, fixed seed), BM25 retrieval, 50 cases (40 answerable, 10 it must refuse). Raw model outputs are committed in [`data/real-runs.json`](data/real-runs.json), and `npm run rescore` re-scores them without calling the model again.

| Release | Change | Grounded answers | Claim support | Citation coverage | Refused out-of-scope | P95 latency |
| --- | --- | --- | --- | --- | --- | --- |
| r1 | Keyword search, 1 document, citations required | 32.5% | 16.8% | 27.4% | 0 / 10 | 3.66s |
| r2 | BM25 retrieval, 1 document | 32.5% | 16.9% | 28.1% | 0 / 10 | 2.83s |
| r3 | Top 3 documents as context | 25.0% | 29.3% | 46.7% | 0 / 10 | 4.03s |
| **r4** (production) | Concise answers + explicit abstain rule | **57.9%** | 63.6% | 70.5% | 9 / 10 | 1.88s |
| **r5** (candidate) | Friendlier, more thorough tone | **51.3%** | 47.1% | 54.9% | 9 / 10 | 2.39s |

What the harness found:

- **No release passes the gate.** The grounding bar is 90%; the best release reached 57.9% (95% CI 42–72%).
- **The abstain rule did what it was meant to.** Refusals of out-of-scope questions went from 0/10 to 9/10 in r4.
- **The one refusal it missed is instructive.** Asked what the *UK* GDPR says about the age of consent, both r4 and r5 answered from the EU text instead of refusing. The question is outside the knowledge base on purpose.
- **The friendlier tone (r5) moved every quality number the wrong way,** and answers became 81% longer than the gold answers (median 33 words vs 18). With 40 answerable questions the grounding difference between r4 and r5 is **within the margin of error** (the confidence intervals overlap), so the dashboard reports it as a direction to investigate, not a proven regression. Citation coverage and claim support dropped by more.
- **Citation formatting is a real failure mode.** The model sometimes wrote ids like `[DR13]` instead of `[D13]`. Those are treated as missing citations.

Caveats: a 3B model is a deliberately modest system under test, 50 cases is small, latency was measured on one laptop, and scoring is automatic and strict (a sentence the sources do not back counts against the answer, even if it is a reasonable inference).

## Run locally

Requirements: Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Production validation:

```bash
npm run lint
npm run test:engine   # 28 unit tests for the evaluation engine
npm test              # engine tests, build, rendered-output checks
```

## Stack

- TypeScript
- React 19
- Vinext / Vite
- Cloudflare-compatible server runtime
- CSS-driven responsive data visualization

## Scope and limitations

This is a reference implementation, not a claim of a live customer monitoring deployment.

- **The release history is simulated.** The two newest releases are tuned (with fixed seeds) to tell a clear story: grounding improves, one regression appears, and answers drift from gold. The engine itself is real and scores any traces in the documented shape.
- **Claim alignment is heuristic.** In the simulator it is a label; in measured runs it is content-word overlap plus a figure check. In production it would come from an NLI model or LLM judge calibrated against human labels, with confidence intervals on every metric.
- **The evaluation set is small** (50 cases) so the demo stays readable. Thresholds and drift tests are configurable, and drift needs both statistical and practical significance for that reason.
- **Production would add** versioned datasets, trace storage, evaluator services, access control, audit logs, and CI/CD release policies.

## Author

**Raghu Sharma** — Senior AI/ML Engineer

- [Portfolio](https://rs-portfolio-teal.vercel.app/)
- [GitHub](https://github.com/raghurs49)
- [LinkedIn](https://www.linkedin.com/in/raghu-sharma-7091b4115/)
