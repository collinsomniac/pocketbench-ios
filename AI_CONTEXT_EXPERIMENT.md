# AI inference: successful control and context-isolation round (2026-09-21)

## Evidence ledger — PHONE MEASURED

The user-exported `pocketbench-ai-diagnostic.json` is a **complete** PocketBench AI Crash Lab 1.0.0 report on an iPhone browser reporting Safari Version/27.0. WebLLM 0.2.85; dedicated worker; `SmolLM2-135M-Instruct-q0f16-MLC`, catalog runtime GPU memory estimate 359.69 MB (not actual allocation). Model reached `model-ready`, followed by four completed probes; no recorded errors. Load and first inference must not be collapsed into one rate.

| Probe | Response mode | Request cap | Reported completion tokens | Wall time | First text | Model-reported decode rate |
|---|---|---:|---:|---:|---:|---:|
| 1 | nonstream | 1 | 0 **despite 4 output characters** | 984 ms | 984 ms | unavailable |
| 4 | nonstream | 4 | 3 | 359 ms | 359 ms | 13.16 tokens/s |
| 16 | stream | 16 | 15 | 423 ms | 128 ms | 51.55 tokens/s |
| 64 | stream | 64 | 63 | 1,486 ms | 132 ms | 46.81 tokens/s |

Do not infer that output had zero tokens because one-token API usage reports zero; preserve reported counts and mark inconsistency. The small model's successful worker streaming rules out a *universal* worker, streaming, or WebGPU inference failure on this device. It does **not** fix the Qwen3 0.6B first-inference crash, establish comparable accuracy, longer-context speed, actual GPU/RAM usage, or sustained throughput. These four probes were sequential (warm cache, variable max tokens and streaming mode), so they are not randomized model comparisons. Exact original report stays with user, not published in this repository.

## New experiment: `ai-context.html`

Run only one selected model/configuration per export, with the original Crash Lab and `ai-bench.html` unchanged. WebLLM 0.2.85 supports `chatOpts.context_window_size` at model load, including `CreateWebWorkerMLCEngine(worker,model,engineConfig,chatOpts)`. A smaller KV cache reservation is **a testable candidate** for allocation pressure, not a workaround proven to work and not necessarily a reduction in compiled model scratch buffers. Context defaults, model library, quantization and GPU features are captured in the JSON. Weight download occurs only on explicit Load; no automatic retry after a reset.

Suggested low-risk sequence: (1) export the successful small-model control; (2) choose Qwen3 0.6B, worker, **catalog default**, run **one token nonstream**, export; (3) if it crashes, reopen the *same* `ai-context.html` in the same browsing context and export the restored checkpoint **before** changing configuration; (4) compare Qwen3 0.6B, same worker, **1,024-token context**, one-token nonstream; (5) only after a success, advance to four and then 16 streamed tokens. Use main thread as a separate worker-variable test, not simultaneously with a context change. The 512 option is exploratory; unsupported or under-capacity configurations may fail at load. Do not repeatedly crash-loop a phone.

The checkpoint records events before awaiting model load and inference, and exposes actual completion counts, model decode reports, and nonzero-output/zero-token discrepancies. A checkpoint is evidence of the **last observable JavaScript stage**, not an OS crash log or proof of out-of-memory. `pagehide` also occurs during ordinary navigation. If the same model/probe succeeds at lower context and fails at default across controlled repetitions, a context-dependent resource requirement becomes a stronger hypothesis; GPU compiler or scheduling effects remain possible. A fair speed comparison requires equal prompt, output length, worker path, runtime and context; the final retained output cannot be judged only by tokens/s.

## Additional controls after first Qwen success

Run warm-cached repeated short/medium prompts with the same model at a fixed context; save reported model-prefill and decode throughput, first-visible-text latency and total wall time. Compare worker/main only after one configuration is stable. Longer prompts must fit selected context; label truncation or rejected requests instead of silently pretending full prefill occurred. Repeat in randomized paired order when multiple variants are safe, record peak versus 1–5-minute throughput separately, and retain all failures and dropped tabs. No new iPhone tests have been executed for context overrides yet.

Sources: [WebLLM configuration interface](https://github.com/mlc-ai/web-llm/blob/main/src/config.ts), [WebLLM API reference](https://webllm.mlc.ai/docs/user/api_reference.html), [WebKit compute submission report 311598](https://bugs.webkit.org/show_bug.cgi?id=311598). This document's measured numbers come only from the user-exported diagnostic.
