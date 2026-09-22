# PocketBench AI crash investigation — 2026-09-21

## Incident and evidence

A user-provided ~18-second iPhone screen recording of `ai-bench.html` shows the dedicated-worker Qwen3 0.6B q4f16 model reaching **Model ready after 941 ms**, followed by **Warmup: short synthetic prompt, 16 max tokens…**, then the benchmark resets to its initial state without a caught exception visible in the recording. The 941 ms is cached/initialized load wall time, not weight-download speed or actual GPU allocation. The recording does not distinguish tab process termination from GPU process/worker failure or external page navigation. Do not diagnose OOM from a tab reset alone.

The previous benchmark (v0.1) persisted a report only after model load and at certain test boundaries, not an actionable stage checkpoint immediately before each awaited inference. Its default test included a 16-token warmup, a 96-token output limit, two repeats and short+medium prompts. Changing those settings does not repair the root cause: it creates smaller, discriminating experiments.

## Diagnostic protocol

Open `ai-diagnose.html`. It imports the same pinned WebLLM 0.2.85 runtime without downloading weights. Select the smallest catalog-supported SmolLM2 135M first, dedicated worker, tap Load, then one-token nonstream; export. On success try four-token nonstream, 16-token streaming, 64-token streaming. On failure, reopen the *same origin and Safari browsing context*, save the restored checkpoint **before loading anything again**, and record whether Safari said the page reloaded. Compare the failing Qwen3 0.6B model at the exact same probe; compare main-thread execution with worker path. Only perform an optional runtime-version regression test after verifying the model exists in both version-specific catalogs and recording the compiler/model library differences.

## Interpreting outcomes

- Tiny model runs, Qwen crashes on first token: test model-specific memory, quantization, context/KV and generated kernels; neither memory pressure nor compiler issue is proven.
- Both crash on first token: test WebGPU shader/driver/runtime or repeated browser-process failure, not just weight size.
- Nonstream works and streaming fails on same model and output length: investigate stream/RPC and client accumulation separately from GPU prefill.
- Worker fails while main thread passes same model and probe: inspect worker WebGPU capability, resource lifetime and worker messaging. Main-thread success does not establish equal sustained performance.
- Checkpoint ends at `probe-before-await` or `request-start`: the request had begun but there is no evidence of text generation. If `first-text` is present, the crash happened after some output was generated. `pagehide` may be ordinary navigation, not proof of crash.

## Existing external evidence (not confirmed root cause)

- [WebLLM iOS Safari issue #753](https://github.com/mlc-ai/web-llm/issues/753): smaller model worked; large model caused tab termination after download on iOS 26, a *different stage and model*.
- [WebLLM issue #844](https://github.com/mlc-ai/web-llm/issues/844): reported 0.2.83+ GPU-hang regression in shape cache on AMD Windows and larger prompts; not established on Apple GPUs.
- [WebKit issue #311598](https://bugs.webkit.org/show_bug.cgi?id=311598): discussion of WebGPU command submission limits and inference-runtime behavior on iOS; applies only as a research lead.

## Validation and exclusions

Node test `node tests/ai-diagnose.mjs` checks serializable recovery metadata, one-token nonstream and streaming accounting with mocks. JavaScript syntax checks are not real GPU tests. This probe cannot detect actual RAM, GPU utilization, thermal limits, iOS kill reasons, physical NPU usage or on-device LLM speed until the iPhone completes a run. Do not interpret `navigator.gpu` success as inference compatibility. Do not automatically retry a crash-loop or clear the original cached weights.
