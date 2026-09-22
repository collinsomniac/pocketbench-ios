---
name: browser-throughput
description: Empirical optimization of client-side WebGPU, WebGL, Wasm and in-browser LLM inference; prioritize correctly completed useful work, not display refresh caps.
---

# PocketBench: local-throughput skill

## Scope and objective
Maximize correct, useful completed work on the **actual** client. Distinguish simulation steps/s; GPU-queue-completed iterations/s; observed offscreen images/s; JavaScript draw submissions/s; actual presented frames/s; LLM prefill, decode tokens/s and first-token latency. Never reinterpret offscreen throughput as screen FPS or cap compute at 60/120 Hz without a user request. Browser-local GPU-resident operations and offscreen passes are first-class architecture options, not inherently wasted work.

## Start here
- Live app: [`../website/`](../website/). Curated routes: `gpu.html`, `throughput.html`, `ai.html`, `gguf.html`, and **`chat.html`** with editable inference JSON and four model choices, only two of which have completed the **separate diagnostic**.
- Chat UX, model-memory estimates and controlled tests: [`CHAT_LAB.md`](CHAT_LAB.md).
- **Latent Scope browser-chat reference, source-access limits and Safari comparison: [`LATENT_SCOPE_COMPARISON.md`](LATENT_SCOPE_COMPARISON.md).** Different project from `enjalot/latent-scope`.
- Recorded benchmark figures and provenance: [`EVIDENCE.md`](EVIDENCE.md); raw observed summary: [`observed-summary.json`](observed-summary.json).
- GPU patterns and workload taxonomy: [`GPU_FIELD_GUIDE.md`](GPU_FIELD_GUIDE.md).
- Mobile inference backends, memory and quality: [`AI_FIELD_GUIDE.md`](AI_FIELD_GUIDE.md) and [`INFERENCE_STACK.md`](INFERENCE_STACK.md).
- Current known failures: [`KNOWN_ISSUES.md`](KNOWN_ISSUES.md).
- Historical experimental pages: branch `archive/pre-two-folder-cleanup-2026-09-22`. Do not silently resurrect old pages.

## Repeatable performance procedure
1. Define the useful output contract (state, offscreen texture, CPU-readable values, visible frame, or generated tokens) and correctness tolerance. Record device, browsing context, dimensions, power, model ID, quantization, versions and compiled model-library identity.
2. Establish a measured working control rather than relying on feature detection. **iPhone WebLLM 0.2.85 worker diagnostics:** Qwen3 0.6B q4f16_1 completed a 64-token request with 63 reported tokens, 48.72 reported decode tok/s, first text 137 ms, total 1,447 ms; Llama 3.2 1B q4f16_1 completed all 1/4/16/64 probes, with the last producing 50 reported tokens, 16.89 reported decode tok/s, first text 878 ms, total 3,857 ms. Different output/tokenization and cache histories mean these are **not equal-workload model rankings**. Neither proves `website/chat.html` itself works on the phone. Earlier and later Chat page reloads remain unresolved.
3. Warm up, alternate comparable configurations, save raw results, measure GPU queue completion and end-to-end elapsed. Separate transfer, shader/dispatch, allocation, cache, render and presentation.
4. Check output or state changes. State the observation scope; two sampled patches do not prove every whole image is unique.
5. Change one variable, check correctness and report regressions. Prefer eliminating redundant copies and retaining intermediates on GPU.
6. For LLMs, separate download/cache, model ready, first prefill, first text, sustained decode, reported tokens (never chunks), output quality and failure stage. Never automatically retry a tab-killing configuration. Preserve request JSON and crash checkpoint *before* generating.
7. **Next experiment is the diagnostic-to-Chat boundary, not an 8B download.** Export any prior checkpoint, choose `Llama-3.2-1B-Instruct-q4f16_1-MLC` in `website/chat.html` build **0.2.1**, leave **catalog context** unchanged, run its identical 64-token bare probe, export, start a fresh conversation and ask the poetry question with untouched JSON. Then repeat with Qwen3 0.6B in a fresh browsing context. The Chat code now preserves catalog context for both measured controls, suggests 1024 only for unverified larger models and restores 0.2.0 sessions. A mock passing is not Safari validation.
8. The Latent Scope exact source/quant/runtime are not available; do not invent them. Published estimates (879 MB Llama1B q4f16, 1403 MB Qwen0.6B, 2037 MB Qwen1.7B) are not Safari peak memory. WebLLM issue #844 is on Windows AMD, **not an established iOS cause**. Verify model/Wasm identities before 0.2.82-vs-0.2.85 comparisons.
9. When diagnosing a failed page, first check ESM import graph, relative assets, DOM IDs, handler installation and cache/version linkage before downloading weights. Download completion differs from model initialization. Abandoned worker promises must not replace a newer model.

## Dependency hygiene and deployment
Maintain only `website/` (all slugs/assets) and `skills/` (guides, evidence, skill). The root `index.html` redirects for branch-root Pages and root README is metadata. Avoid numbered repair pages and import-map self-references; update the active page. Archive before destructive restructuring.

## Decision rule
Optimize for **measured completed throughput at the requested output contract**. GPU-resident fields, offscreen buffers, tile-aware passes, shader fusion, reduced data movement, batching, SIMD, caching and specialized inference kernels are testable hypotheses, not universally guaranteed wins. Never invent a speedup, Safari process-kill reason or on-screen FPS from offscreen work.
