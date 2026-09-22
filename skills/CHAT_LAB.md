# Browser-local chat lab · 2026-09-22

## Evidence, not device claims

A user-exported PocketBench WebLLM 0.2.85 run on an iPhone reports successful dedicated-worker **Qwen3 0.6B q4f16_1** loading from browser cache and successful one-token and 64-token inference. The 64-token request took 1,447 ms, first text 137 ms, and reported 48.7239 decode tokens/s with 63 completion tokens. The one-token request returned `<think>` but reported zero completion tokens; do not infer throughput from that request. This is a single short test, not sustained throughput or a quality assessment. Earlier SmolLM2-135M tests also completed. The GGUF/wllama 3.6.1 path remains independent and not confirmed for successful inference on this phone.

The chat page uses the same working pinned WebLLM runtime, `@mlc-ai/web-llm@0.2.85`, and `website/ai-bench-worker.mjs`. It offers exactly three Qwen model configurations found in the **v0.2.85 prebuilt catalog**:

| Candidate | Role | Catalog estimated GPU memory | Evidence |
|---|---|---:|---|
| Qwen3-0.6B-q4f16_1-MLC | Under 1B control | 1,403.34 MB | Inference succeeded on user's iPhone |
| Qwen3-1.7B-q4f16_1-MLC | Intermediate | 2,036.66 MB | In WebLLM catalog; untested on this phone |
| Qwen3-8B-q4f16_1-MLC | Large stretch candidate | 5,695.78 MB | In WebLLM catalog; **not** known to fit iOS Safari |

These figures are WebLLM catalog estimates, not model download sizes, GPU memory availability, or native app limits. The 8B candidate is not the maximum parameter count theoretically possible on the phone or across all browser engines. A catalogue entry is not a guarantee of practical device support. Model selection and large downloads require a tap; the 8B candidate has an additional warning.

Sources: https://github.com/mlc-ai/web-llm/blob/v0.2.85/src/config.ts ; https://github.com/mlc-ai/web-llm/blob/v0.2.85/examples/qwen3/src/qwen3_example.ts

## Interface and engine comparison

- **WebLLM + native HTML/JS (implemented):** no bundler, static GitHub Pages, OpenAI-like request object, worker WebGPU, stream and model-reported usage. Reuses the proven 0.6B runtime without shipping a larger UI framework. Actual phone performance still needs remeasurement in multi-turn chat.
- **WebLLM Chat / NextChat:** real WebLLM-backed private browser chat with comprehensive UX, Next.js build and static export route; more frontend/deployment complexity than this targeted experiment. https://github.com/mlc-ai/web-llm-chat
- **BrowserLLM:** WebLLM/WebGPU worker chat, conversation persistence, Markdown and per-turn statistics, but its Vite/React/Tailwind framework and broad model catalog are more moving parts. Borrow UX patterns, not its whole application. https://github.com/GautamVhavle/BrowserLLM
- **wllama / llama.cpp:** independent GGUF-compatible Wasm CPU and WebGPU offload, appealing for quantization and cross-runtime comparisons; Safari-specific compatibility and earlier worker failures mean it should remain a separate experimental adapter until first inference is confirmed. https://github.com/ngxson/wllama/tree/3.6.1
- **Open WebUI:** feature-rich server-centric UI, not a drop-in static client-only GitHub Pages stack. Its design patterns can inform chat history, parameter editing and controls without requiring its backend. https://github.com/open-webui/open-webui
- **Transformers.js / LiteRT-LM Web:** candidate specialized and alternate-runtime paths; do not assert they outperform the measured WebLLM worker without same-device same-workload tests. Runtime availability and quantized weights differ.

No external chat UI package is bundled. Text is rendered with `textContent` to avoid untrusted model output being interpreted as HTML. Exports include editable request JSON, generated text, raw completion chunks, model-reported usage and elapsed timings; chunks are **not tokens**. Session checkpoints use sessionStorage and exported JSON is the durable exchange format.

## Next discriminating experiments

1. Confirm basic chat and request editing on iPhone with the already cached Qwen3 0.6B. Compare first-turn and second-turn TTFT, completion tokens, reported decode rate, input history length and output accuracy. Use a non-thinking request first; preserve a separate thinking-enabled request for cost comparison.
2. Load Qwen3 1.7B in an otherwise identical dedicated-worker request, capture uncached/cached loading separately, prompt length, first text, decode, and memory/reload failures. Export **before** changing models.
3. Only after stable smaller-model behavior, explicitly attempt 8B with a fresh Safari tab, adequate storage and no concurrently loaded engine. A tab reset is a failure observation, not an OOM diagnosis; do not automatically retry or silently substitute a smaller model.
4. Cross-runtime comparison: load the **same GGUF** in wllama CPU and offload paths; compare only equivalent prompt, tokenization, context, quantization, temperature, and completed output. WebLLM MLC weights and GGUF are not byte-equivalent.
5. Run repeated, randomized paired comparisons for 0.6B and 1.7B, include sustained 5–10-minute tests, foreground lifecycle, warm-versus-cold cache, quality checks and export complete raw evidence. Larger parameter counts are not automatically better size/speed tradeoffs.

## JSON contract

`website/chat.html` offers Chat, Request JSON and Results tabs. Edit a complete OpenAI-compatible chat completion body (`model`, `messages`, `temperature`, `top_p`, `max_tokens`, `stream`, `stream_options`, `extra_body`) and Apply JSON or Run JSON. The message composer appends one `user` message to the edited array. A model ID must match the loaded engine; unsupported role/content formats are rejected before dispatch. System and assistant history can be edited. Raw request and output are exported without converting characters or chunk counts into token estimates. No cloud inference endpoint exists.
