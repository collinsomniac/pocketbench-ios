# Browser-local Chat · controlled inference investigation (2026-09-22)

## Device evidence: separate the successful diagnostic from the unstable Chat route

**Llama reference (new):** iPhone user export `pocketbench-ai-diagnostic 3.json` reports WebLLM **0.2.85**, dedicated worker, `Llama-3.2-1B-Instruct-q4f16_1-MLC`, catalog-default context, **all four fixed probes completed with no recorded errors**. Model download/cache read ~664 MB, model-ready in ~25.7 seconds on this first reported load. The 64-token streamed request stopped after **50 actual reported completion tokens**, finished in **3,857 ms**, first text **878 ms**, and WebLLM reported **16.8862 decode tok/s**; output is a complete ten-noun list. One-token text `Here` was reported with zero completion tokens. Do not treat output characters or chunks as tokens.

**Qwen reference:** iPhone export `pocketbench-ai-diagnostic 2.json` confirms `Qwen3-0.6B-q4f16_1-MLC` with the same WebLLM worker completed a 64-token stream in 1,447 ms, first text 137 ms, **63 reported completion tokens** and **48.7239 model-reported decode tok/s**, but output was mainly an unfinished `<think>` passage. A separate earlier and subsequent Qwen Chat run reloaded Safari. Different tokenizers, output lengths, cache histories and model workloads prevent attributing the decode-rate difference solely to architecture, quantization or parameters. Neither completed diagnostic establishes stable multi-turn Chat.

**What differs in Chat:** the original Chat generated an extra system prompt, temperature 0.7, 128 max tokens and a thinking override, and 1.7B failed at first generation. Build 0.2.0 removed those confounds but the user still reported a page reload. The precise device-kill reason remains unknown; model download and GPU initialization alone do not prove generation is safe. Browser memory budgeting, compiled-kernel behavior, prompt formatting and worker/UI state are competing hypotheses, not diagnoses.

## Model configurations (WebLLM 0.2.85 catalog)

| Model | Catalog-estimated runtime GPU memory | Status |
|---|---:|---|
| Qwen3-0.6B-q4f16_1-MLC | 1,403.34 MB | Diagnostic inference succeeded; Chat intermittently reloads |
| Llama-3.2-1B-Instruct-q4f16_1-MLC | 879.04 MB | **User-verified diagnostic inference; Chat build 0.2.1 newly exposes it, not device-tested there** |
| Qwen3-1.7B-q4f16_1-MLC | 2,036.66 MB | User reports first Chat inference reload; no completed phone request |
| Qwen3-8B-q4f16_1-MLC | 5,695.78 MB | Catalog-listed only; no evidence it fits Safari |

These are model catalog estimates, **not** peak browser memory or available device memory. Latent Scope's documented model was Llama 3.2 1B 4-bit, but its exact quantization/build, runtime version, execution path and source code are not available; see [`LATENT_SCOPE_COMPARISON.md`](LATENT_SCOPE_COMPARISON.md).

## Chat build 0.2.1: isolate the working model from the failing page

1. Open `website/chat.html?build=0.2.1` and verify the heading/footer show **0.2.1**. **Export any restored previous pending crash checkpoint before modifying the session.** The existing localStorage key is preserved; 0.2.0 reports can be restored under 0.2.1.
2. Select **Llama 3.2 1B → Catalog default** (not 1,024). The model-picker logic now preserves catalog context for either device-tested model; it still suggests 1,024 for the larger unverified models. Load one worker only; previous model weights remain cached on the browser but old active worker is terminated.
3. Tap **Run proven 64-token probe**. It submits the same bare request as the successful diagnostic: one user message `Write a short list of common nouns separated by spaces.`, temperature 0, `max_tokens:64`, `stream:true`, `stream_options:{include_usage:true}`, no system prompt or thinking override. Export this Chat result. Successful generation here would isolate the diagnostic-to-Chat UI boundary; a reset here would implicate the page/runtime context or intermittent GPU/process behavior rather than the poetry prompt specifically.
4. After exporting, tap **New conversation**, ask **`What do you like about poetry?`** with untouched Request JSON and export. First compare the identical request with Qwen3 0.6B in a **fresh page after exporting/releasing the Llama worker**; record model and context for each case. If output stops mid-thought, distinguish successful decoding from a complete answer.
5. Only after stable Chat generation, test one variable at a time: reasoning override, additional history, increased output length, or larger model. Do not automatically attempt 8B after a reset. Stop repeating a configuration that terminates Safari; export the last checkpoint instead.

`website/chat.html` retains Chat / Request JSON / Results views, full editable request fields, one dedicated worker per active model, stop and force-terminate, sampled raw response chunks, localStorage checkpoints before awaited inference, and exportable per-turn metrics. Browser tests and mocked inference validate wiring, not live Safari memory. The page may retain user prompts in localStorage; browser site data can be cleared when desired. Source-version URLs are bumped to `0.2.1` to avoid mixing a new picker with stale model-catalog JavaScript.

## Competing explanations and falsifying tests

- **Model package / browser budget:** if Llama passes the *same Chat request* where Qwen does not, study package-specific runtime allocations and compiled kernels. Safari reload alone is not an OOM or jetsam log.
- **Chat-specific behavior:** if Llama succeeds in diagnostic but fails with the *same bare probe* in Chat, compare exact request, model asset URLs, worker lifecycle, persistent state, UI events, and browser context. No extra shader runs in the PocketBench Chat page, so don't blame visualizer rasterization by default.
- **Runtime version:** [WebLLM issue #844](https://github.com/mlc-ai/web-llm/issues/844) reports a Qwen shape-cache bug beginning around 0.2.83 on **Windows AMD**. Test 0.2.82 versus 0.2.85 only with verified model/Wasm compatibility; a different compiled library invalidates a strict single-variable claim. That upstream issue is not a proved cause on iOS.
- **Request shape:** control for messages and tokenizer-specific prompt length, thinking, max_tokens, temperature, context, stream and cache state. Two different models with the same text do not necessarily have equal tokenized input length.

Upstream sources: [WebLLM v0.2.85 model catalog](https://github.com/mlc-ai/web-llm/blob/v0.2.85/src/config.ts), [worker API / fourth-argument ChatOptions](https://github.com/mlc-ai/web-llm/blob/v0.2.85/src/web_worker.ts). Maintain `website/` and `skills/` as the only directories; repair existing slugs in place.
