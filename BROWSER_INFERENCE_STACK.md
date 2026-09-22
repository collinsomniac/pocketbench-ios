# PocketBench: zero-inference-server browser stack and runtime bake-off

Research date: 2026-09-21 (Phoenix); experiment version 1.0.0. [Run the independent GGUF experiment](ai-wllama.html). Existing WebLLM controls: [Crash Lab](ai-diagnose.html), [context experiment](ai-context.html). This is an architectural research note, not proof the new page works on iPhone.

## Device evidence, not hypothetical capacity

The user's complete WebLLM 0.2.85 diagnostic ran SmolLM2 135M q0f16 in a dedicated Safari WebGPU worker: one, four, sixteen and sixty-four token probes all completed. Model-reported decode: 51.55 tokens/s for the 16-token request and 46.81 tokens/s for the 64-token request; the one-token response contained text despite `completion_tokens:0`. A 1,024-context SmolLM2 run reported 51.39 tokens/s over a 64-token request. These are distinct short runs. User reports that Qwen3 0.6B reloads the tab on first inference in WebLLM, including a later context experiment, but no Qwen crash checkpoint or OS process log was supplied in that turn. Do not infer that Qwen cannot fit or run natively, that the context override failed at a known stage, or that a particular iOS memory budget has been measured. A previous WebGPU benchmark measured maxBufferSize=256 MiB on one device: **per-buffer limit, not total GPU RAM**.

## Execution stack and actual boundaries

- GitHub Pages: static HTML, JS, Wasm, manifests, optional Service Worker and client-side caches. It does NOT execute llama.cpp, a GPU server, native code, model conversion, or inference on GitHub infrastructure. Preconverted model weights and runtime binaries can be fetched from external public hosts after user consent; repeat availability/offline depends on cache and quota.
- Apple hardware: CPU, unified memory, Apple GPU, Neural Engine. In a browser: JS/worker/WebAssembly with SIMD (and threads when isolation permits), WebGPU shader/compute via WebKit's Metal mapping, WebGL 2 for graphics/FBO techniques, and WebNN only if a working `navigator.ml` and backend exist. GitHub Pages JavaScript has **no direct CUDA, native Metal/MPS, Core ML or ANE API**; native benchmarks only provide upper-level research context, not a comparable browser speed.
- Model path: weights/format and quantization -> download/file/cache -> tokenizer/CPU pre/postprocess -> WASM runtime + GPU kernels -> GPU-resident activations/KV -> sampled output. Repeated transfers, duplicate weight copies, large context reservation and first-use shader compilation are workload variables. A generic `navigator.gpu` check says nothing about successful model-specific kernels.

## Independent runtimes and how to actually test them

| Option | Browser execution | Key distinguishing factor | Present boundary |
|---|---|---|---|
| WebLLM 0.2.85 | WebGPU + TVM model-specific compiled libraries, worker optional | Known-working SmolLM2 control and broken Qwen3 route in these reports | Model ID must match compiled runtime lib; GPU device init != inference success |
| wllama 3.7.0 | llama.cpp GGUF via Wasm CPU or WebGPU offloaded layers | **Same GGUF weights** across CPU/4-layer/full GPU tests, Safari compat when needed, independent backend | Safari compatibility uses Asyncify without default JSPI/MEMORY64: may be slower; CPU performance is not proof of GPU speed |
| LiteRT-LM JS | Browser WebGPU early preview; web-specific `.litertlm` | Independent compiled runtime and web model artifacts | Published JS catalog currently explicitly names Gemma 4 E2B/E4B web variants; check package contents and iPhone support before a large download |
| Transformers.js | ONNX Runtime Web WebGPU/Wasm where supported, task pipelines | Broader classification/embedding/speech and alternate model kernels | Exact model/quant/ORT/browser build compatibility must be checked; an upstream release notes Safari WebGPU enablement |
| Magnitude | Native desktop profiling + llama.cpp-based inference orchestration | Model fit/speed estimates, workload-aware model chooser, adaptive context/offload/cache heuristics | Its native server and filesystem inspection cannot be embedded in GitHub Pages |

Research sources: [Magnitude](https://github.com/magnitudedev/magnitude), [llama.cpp WebGPU/Emscripten build](https://github.com/ggml-org/llama.cpp/blob/master/docs/build.md), [wllama](https://github.com/ngxson/wllama), [wllama Safari compat](https://github.com/ngxson/wllama/blob/master/compat/README.md), [LiteRT-LM web docs](https://developers.google.com/edge/litert-lm/js), [Transformers.js WebGPU](https://github.com/huggingface/transformers.js/blob/main/packages/transformers/docs/source/guides/webgpu.md), [Safari 26 WebGPU implementation](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/). [LiteRT-LM 0.16.0 package bug report](https://github.com/google-ai-edge/LiteRT-LM/issues/3364) is a release-specific concern, not blanket rejection.

## New experiment, minimal discriminating ladder

1. New [ai-wllama.html](ai-wllama.html), choose **SmolLM2 135M Q4_K_M, CPU-only, 1024 context**. This establishes whether independent Safari-compatible Wasm can load and execute GGUF. Download ~105 MB is explicit, not automatic. Run 1 nonstream then 64 stream, save JSON.
2. Same page, choose **Qwen3 0.6B Q4_K_M, CPU-only, 1024 context** (~397 MB public Qwen GGUF). This tests the *model family* using an independent runtime and CPU; successful output would rule out a universal model-family/browser loading prohibition but would not identify the WebLLM shader bug. Change only model.
3. Keep Qwen GGUF and context; test **4 GPU layers**; then *only if successful* test **full GPU offload**. GPU/CPU path changes require unloading and recreating engine. Compare model-reported usage and first-token/wall times, and output semantics. An interrupted checkpoint identifies the last observable stage, not the OS kill reason.
4. If GGUF CPU works but GPU fails, investigate WebGPU feature/limit/quant-kernel support and layer allocation; do not keep switching prompt, weights and runtime simultaneously. If wllama also fails in CPU, check Safari Wasm compatibility, cache duplication, model file URL/CORS and Wasm limits. If both work, revisit original WebLLM Qwen model library, context and runtime-version controls.
5. Once two runtimes complete the *same* model family, create a longer-run matrix: cold/cached startup, 64/256-token generation, 128/512/1024-token prefill, repeated A-B-B-A, peak vs multi-minute retention, output quality, resource failures, and optional offline reload. Report quantization mismatch when exact weights do not match. Record download bytes separately from runtime allocation. Never infer tokens from streamed chunk count.

## Optimization hypotheses to A/B, not magic switches

Weight compression Q4/Q5/Q6 vs quality; GPU layer partition and residual CPU-GPU transfers; f16 vs f32 where model/runtime supports it; KV cache size/precision and reuse; model-specific kernel fusion/attention; batched prompt prefill and cached prefixes; speculative decoding only when measured acceptance cost wins; minimize tokenizer-main-worker copies and synchronous readback; keep one GPU model resident and release aggressively *between* configurations; cache immutable chunks and avoid repeated temporary model Blob copies. Prefer a small quality-adequate model completing quickly over a larger model which cannot finish a browser request. A short model can run at a high decode rate while producing repetitive, unusable content: retain output review.

## Platform and hosting constraints

GitHub Pages does not offer arbitrary response header control. This origin earlier reported `crossOriginIsolated=false`: use the single-thread CPU baseline first. `coi-serviceworker` may enable isolation after a reload but can disrupt external CDN/Hugging Face requests and cache behavior; test it on a separate page and verify actual `crossOriginIsolated` before claiming multithreaded Wasm. A service worker does not grant Metal or Neural Engine access. `GPUAdapter.limits.maxBufferSize`, JS heap restrictions, site storage quotas and browser process memory are distinct. Safari compat Wasm may be slower than Chromium's regular build; never extrapolate browser speed from native Arbiter/AI Edge Gallery.

## Evidence-update contract

Add only exported device runs to the measured ledger. Report successful path by `runtime + version + exact model artifact + quant + context + GPU layers + prompt + usage`, retain failures; separate author-reported demos and engineering hypotheses. Do not call an author benchmark or a smoke-test a reproduced iPhone result. The independent page has unit tests but no verified real iPhone execution yet.
