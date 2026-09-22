# AI inference: successful controls and context-isolation round (2026-09-21–22)

## Evidence ledger — PHONE MEASURED

The user-exported `pocketbench-ai-diagnostic.json` is a **complete** PocketBench AI Crash Lab 1.0.0 report on an iPhone browser reporting Safari Version/27.0. WebLLM 0.2.85; dedicated worker; `SmolLM2-135M-Instruct-q0f16-MLC`, catalog runtime GPU memory estimate 359.69 MB (not actual allocation). Model reached `model-ready`, followed by four completed probes; no recorded errors. Load and first inference must not be collapsed into one rate.

| Probe | Response mode | Request cap | Reported completion tokens | Wall time | First text | Model-reported decode rate |
|---|---|---:|---:|---:|---:|---:|
| 1 | nonstream | 1 | 0 **despite 4 output characters** | 984 ms | 984 ms | unavailable |
| 4 | nonstream | 4 | 3 | 359 ms | 359 ms | 13.16 tokens/s |
| 16 | stream | 16 | 15 | 423 ms | 128 ms | 51.55 tokens/s |
| 64 | stream | 64 | 63 | 1,486 ms | 132 ms | 46.81 tokens/s |

**Second user-exported report:** `pocketbench-ai-context-2026-09-22T03-40-38-164Z.json`, complete PocketBench AI Context Isolation 2.0.0, same WebLLM runtime / SmolLM2 135M model / worker, with an **explicit 1,024-token context override**. Catalog default override listed in this report is 4,096 tokens, but the preceding Crash Lab export did not record its actual applied context. Weight-cache status is unknown (the load progress says loading from cache). Model load took 940 ms; the standalone **64-token streaming** request completed without error in 1,475 ms, first visible text 241 ms, 63 reported completion tokens, model-reported decode **51.3866 tokens/s**, 204 output characters. The report records zero errors and no token-usage discrepancy. Do not infer actual RAM savings from the context override or estimated catalog memory. Exact raw reports remain with the user; these values are a sourced transcription, not newly executed tests.

**Comparison is exploratory, not an A/B speedup claim:** the prior 64-token SmolLM2 probe reported 46.8053 tokens/s and first text 132 ms; the new one reported 51.3866 tokens/s and first text 241 ms. Runs differ in context, preceding requests, cache/warmup history and timing. The new report repeated the noun prompt and output preview, including repeated `bookshelf`; generated quality is not validated by throughput alone.

Do not infer that output had zero tokens because one-token API usage reports zero; preserve reported counts and mark inconsistency. The small model's successful worker streaming rules out a *universal* worker, streaming, or WebGPU inference failure on this device. It does **not** fix the Qwen3 0.6B first-inference crash, establish comparable accuracy, longer-context speed, actual GPU/RAM usage, or sustained throughput. The four original probes were sequential (warm cache, variable max tokens and streaming mode), so they are not randomized model comparisons.

## Experiment: `ai-context.html`

Run only one selected model/configuration per export, with the original Crash Lab and `ai-bench.html` unchanged. WebLLM 0.2.85 supports `chatOpts.context_window_size` at model load, including `CreateWebWorkerMLCEngine(worker,model,engineConfig,chatOpts)`. A smaller KV cache reservation is **a testable candidate** for allocation pressure, not a workaround proven to work and not necessarily a reduction in compiled model scratch buffers. Context defaults, model library, quantization and GPU features are captured in the JSON. Weight download occurs only on explicit Load; no automatic retry after a reset.

**Next discriminating sequence** (the latest export selected SmolLM2 rather than the Qwen reproduction model): (1) choose **Qwen3 0.6B**, worker, **catalog default**, run **one token nonstream**, export; (2) if it crashes, reopen the *same* `ai-context.html` in the same browsing context and export the restored checkpoint **before** changing configuration; (3) compare **Qwen3 0.6B**, same worker, **1,024-token context**, same one-token nonstream request; (4) only after a success, advance to four and 16 streamed tokens. Use main thread as a separate worker-variable test, not simultaneously with context. The 512 option is exploratory; unsupported or under-capacity configurations may fail at load. Do not repeatedly crash-loop a phone. No Qwen context-isolation result has yet been provided.

The checkpoint records events before awaiting model load and inference, and exposes actual completion counts, model decode reports, and nonzero-output/zero-token discrepancies. A checkpoint is evidence of the **last observable JavaScript stage**, not an OS crash log or proof of out-of-memory. `pagehide` also occurs during ordinary navigation. If the same model/probe succeeds at lower context and fails at default across controlled repetitions, a context-dependent resource requirement becomes a stronger hypothesis; GPU compiler or scheduling effects remain possible. A fair speed comparison requires equal prompt, output length, worker path, runtime and context; the final retained output cannot be judged only by tokens/s.

## Additional controls after first Qwen success

Run warm-cached repeated short/medium prompts with the same model at a fixed context; save reported model-prefill and decode throughput, first-visible-text latency and total wall time. Compare worker/main only after one configuration is stable. Longer prompts must fit selected context; label truncation or rejected requests instead of silently pretending full prefill occurred. Repeat in randomized paired order when multiple variants are safe, record peak versus 1–5-minute throughput separately, and retain all failures and dropped tabs. No device validation of Qwen's context override has yet been reported.

Sources: [WebLLM configuration interface](https://github.com/mlc-ai/web-llm/blob/main/src/config.ts), [WebLLM API reference](https://webllm.mlc.ai/docs/user/api_reference.html), [WebKit compute submission report 311598](https://bugs.webkit.org/show_bug.cgi?id=311598). This document's measured numbers come only from the user-exported diagnostics.
