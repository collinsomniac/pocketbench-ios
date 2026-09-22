---
name: browser-throughput
description: Empirical optimization of client-side WebGPU, WebGL, Wasm and in-browser LLM inference; prioritize correctly completed useful work, not display refresh caps.
---

# PocketBench: local-throughput skill

## Scope and objective
Maximize correct, useful completed work on the **actual** client. Distinguish simulation steps/s; GPU-queue-completed iterations/s; observed offscreen images/s; JavaScript draw submissions/s; actual presented frames/s; LLM prefill, decode tokens/s and first-token latency. Never reinterpret offscreen throughput as screen FPS or cap compute at 60/120 Hz without a user request. Browser-local GPU-resident operations and offscreen passes are first-class architecture options, not inherently wasted work.

## Start here
- Live app: [`../website/`](../website/). Curated routes: `gpu.html`, `throughput.html`, `ai.html`, `gguf.html`, and **`chat.html`** for full editable inference JSON and three-model conversations.
- Chat UX, model-memory estimates and cross-runtime comparisons: [`CHAT_LAB.md`](CHAT_LAB.md).
- **Latent Scope browser-chat reference, source-access limits and controlled Safari experiments: [`LATENT_SCOPE_COMPARISON.md`](LATENT_SCOPE_COMPARISON.md).** This is a different project from `enjalot/latent-scope`.
- Recorded benchmark figures and provenance: [`EVIDENCE.md`](EVIDENCE.md); raw observed summary: [`observed-summary.json`](observed-summary.json).
- GPU patterns and workload taxonomy: [`GPU_FIELD_GUIDE.md`](GPU_FIELD_GUIDE.md).
- Mobile inference backends, memory and quality: [`AI_FIELD_GUIDE.md`](AI_FIELD_GUIDE.md) and [`INFERENCE_STACK.md`](INFERENCE_STACK.md).
- Current known failures and validation status: [`KNOWN_ISSUES.md`](KNOWN_ISSUES.md).
- Historical experimental pages, notes and tests: Git branch `archive/pre-two-folder-cleanup-2026-09-22`. Do not silently resurrect an old page without evidence it is needed.

## Repeatable performance procedure
1. Define the output contract (state, offscreen texture, CPU-readable values, visible frame, or generated tokens) and correctness tolerance. Record exact device, browser context, dimensions, power, model IDs, quantization and versions.
2. Establish a measured working control, preferably equivalent JS/Wasm/WebGL/WebGPU paths; feature detection alone does not prove inference compatibility. **Qwen3 0.6B q4f16_1 in WebLLM 0.2.85 worker has one successful 64-token user-exported run: 48.72 model-reported decode tokens/s, first text 137 ms, total 1,447 ms.** Earlier and later first-inference page reloads remain true; do not claim the Chat route is fixed or that the 1.7B/8B candidates succeed.
3. Warm up, alternate comparable configurations, save individual raw results, measure GPU queue completion and end-to-end elapsed time. Separate transfer, shader/dispatch, allocation, cache, render and presentation costs.
4. Check state or output really changes. Report observation scope; two sampled patches do not prove every complete image is unique.
5. Change one variable, verify correct results, report regressions and memory/thermal limitations. Prefer removing redundant copies and keeping reusable intermediates resident.
6. For LLMs, distinguish model download and cache, initialization, prefill, first text, sustained decode, tokens counted by model (never stream chunks), output quality, and failure stage. Never auto-retry a configuration that reloads an iPhone tab. Use `chat.html` Request JSON tab for exact prompt/messages/max_tokens/temperature/top_p/stream/extra_body, Results for raw completions and Export for a reproducible report. Keep an equal request across model comparisons and explicitly test thinking on/off for Qwen.
7. **Before another speculative chat-UI patch, compare the same Llama 3.2 1B q4f16_1 build in PocketBench's existing `ai.html` with the Qwen controls and the prior Latent Scope reference.** Latent Scope's exact source/quantization/runtime version were not available in this review; do not invent them. Published WebLLM estimates (879 MB Llama1B q4f16, 1403 MB Qwen0.6B, 2037 MB Qwen1.7B) are not Safari peak memory. WebLLM issue #844 describes a Qwen shape-cache regression on Windows AMD, **not a proved iOS cause**. Record exact runtime and model_lib/WASM IDs before any 0.2.82 vs 0.2.85 comparison.
8. When diagnosing a failed website, first validate static ESM import graph, every relative asset URL, DOM element IDs, and button handler installation **before** attempting another large model download. Treat a completed download as distinct from model initialization. Model switching must not allow an abandoned promise to overwrite or unload a later worker.

## Dependency hygiene and deployment
Maintain only `website/` (all slugs and runtime assets) and `skills/` (guides, evidence, skills). Root `index.html` is a minimal redirect required by existing branch-root GitHub Pages; root `README.md` is repository metadata. Keep slugs stable and avoid numbered repair pages. A source file moved into a subdirectory must have all relative URL and worker-import paths checked. Avoid import maps that redirect a specifier to a module which re-exports that identical specifier (self-reference). Update the single active page instead of creating an additional variant. Archive before destructive restructuring.

## Decision rule
Optimize for **measured throughput at the requested output contract**. GPU-resident ping-pong fields, offscreen buffers, tile-aware render pass design, shader fusion, reduced data movement, batching, SIMD, selective caching and specialized inference kernels are hypotheses to test against equivalent controls, not guaranteed universal wins. Never invent a speedup, iOS process-kill reason, or on-screen FPS from offscreen work.
