---
name: browser-throughput
description: Empirical optimization of client-side WebGPU, WebGL, Wasm and in-browser LLM inference; prioritize correctly completed useful work, not display refresh caps.
---

# PocketBench: local-throughput skill

## Scope and objective
Maximize correct, useful completed work on the **actual** client. Distinguish simulation steps/s; GPU-queue-completed iterations/s; observed offscreen images/s; JavaScript draw submissions/s; actual presented frames/s; LLM prefill, decode tokens/s and first-token latency. Never reinterpret offscreen throughput as screen FPS or cap compute at 60/120 Hz without a user request. Browser-local GPU-resident operations and offscreen passes are first-class architecture options, not inherently wasted work.

## Start here
- Live app: [`../website/`](../website/). Current curated routes: `gpu.html`, `throughput.html`, `ai.html`, `gguf.html`.
- Recorded benchmark figures and provenance: [`EVIDENCE.md`](EVIDENCE.md); raw observed summary: [`observed-summary.json`](observed-summary.json).
- GPU patterns and workload taxonomy: [`GPU_FIELD_GUIDE.md`](GPU_FIELD_GUIDE.md).
- Mobile inference backends, memory and quality: [`AI_FIELD_GUIDE.md`](AI_FIELD_GUIDE.md) and [`INFERENCE_STACK.md`](INFERENCE_STACK.md).
- Current known failures and validation status: [`KNOWN_ISSUES.md`](KNOWN_ISSUES.md).
- Historical experimental pages, notes and tests: Git branch `archive/pre-two-folder-cleanup-2026-09-22`. Do not silently resurrect an old page without evidence it is needed.

## Repeatable performance procedure
1. Define the output contract (state, offscreen texture, CPU-readable values, visible frame, or generated tokens) and correctness tolerance. Record exact device, browser context, dimensions, power, model IDs, quantization and versions.
2. Establish a measured working control, preferably equivalent JS/Wasm/WebGL/WebGPU paths; feature detection alone does not prove inference compatibility.
3. Warm up, alternate comparable configurations, save individual raw results, measure GPU queue completion and end-to-end elapsed time. Separate transfer, shader/dispatch, allocation, cache, render and presentation costs.
4. Check state or output really changes. Report observation scope; two sampled patches do not prove every complete image is unique.
5. Change one variable, verify correct results, report regressions and memory/thermal limitations. Prefer removing redundant copies and keeping reusable intermediates resident.
6. For LLMs, distinguish model download and cache, initialization, prefill, first text, sustained decode, tokens counted by model (never stream chunks), output quality, and failure stage. Never auto-retry a configuration that reloads an iPhone tab.
7. When diagnosing a failed website, first validate static ESM import graph, every relative asset URL, DOM element IDs, and button handler installation **before** attempting another large model download. Treat a completed download as distinct from model initialization.

## Dependency hygiene and deployment
Maintain only `website/` (all slugs and runtime assets) and `skills/` (guides, evidence, skills). Root `index.html` is a minimal redirect required by existing branch-root GitHub Pages; root `README.md` is repository metadata. Keep slugs stable and avoid numbered repair pages. A source file moved into a subdirectory must have all relative URL and worker-import paths checked. Avoid import maps that redirect a specifier to a module which re-exports that identical specifier (self-reference). Update the single active page instead of creating an additional variant. Archive before destructive restructuring.

## Decision rule
Optimize for **measured throughput at the requested output contract**. GPU-resident ping-pong fields, offscreen buffers, tile-aware render pass design, shader fusion, reduced data movement, batching, SIMD, selective caching and specialized inference kernels are hypotheses to test against equivalent controls, not guaranteed universal wins. Never invent a speedup, iOS process-kill reason, or on-screen FPS from offscreen work.