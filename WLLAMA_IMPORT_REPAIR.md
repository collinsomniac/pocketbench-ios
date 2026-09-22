# PocketBench GGUF loader: import and model-load investigation (September 21–22, 2026)

## Evidence, not an inferred crash cause

The original GGUF page requested wllama 3.7.0 based on an upstream development-tree version. That was an unjustified assumption about the published npm release. Version 1.1 pinned matching published 3.6.1 wllama and Safari-compatibility assets.

The user's September 21 screenshots **confirm that version 1.1's runtime preflight imports successfully and receives HTTP 200 for its four runtime asset HEAD requests**. Loading the selected SmolLM2 135M Q4_K_M model with CPU-only Wasm and 1,024-token context subsequently displays a JavaScript stack starting at `@wllama/wllama@3.6.1/esm/index.js:2076:24`, followed by an async `fulfilled` frame. The previous UI formatted `error.stack` before `error.message`; the screenshot therefore does **not** supply the underlying exception name or message. It does not prove Wasm incompatibility, an unreachable GGUF, an OPFS storage error, or insufficient device memory.

The screenshots show an **in-app webview**, with a close control and an affordance to open Safari. A webview-versus-Safari storage or worker difference is a hypothesis to test, not a diagnosis.

## Why the previous preflight missed this stage

The four checks covered only the JavaScript module, default Wasm, Safari compatibility Wasm, and compatibility worker. They did **not** test Hugging Face's selected model URL, browser storage writes and reads, existing cached-model enumeration, actual Wasm compilation, a real worker launch, or inference. HEAD is not GET and HTTP 200 is not an executed program. The upstream wllama model-loading path traverses `ModelManager.getModels()` and a CacheManager using an origin-private filesystem backend by default before or during a model download. The selected SmolLM2 GGUF filename is independently listed in its Hugging Face repository; actual fetch behavior in this webview remains unmeasured.

## Repair 1.2: changes made, not a claimed completed phone fix

`ai-wllama.html` now imports a new `ai-wllama-repair.mjs?v=1.2.0`. The old version 1.1 implementation remains available in Git history. The model and inference algorithms and 3.6.1 runtime are unchanged. The repair: (1) displays exception **name, message, and cause** rather than a stack-only banner, while retaining the full bounded stack in JSON; (2) adds a separate user-initiated **Check model URL & browser storage** action using a model HEAD and a tiny OPFS write/read/delete roundtrip, without downloading weights; (3) explicitly pins matching compatibility Wasm and worker URLs instead of relying on implicit CDN-version selection; (4) checks cached-model enumeration before model loading; (5) persists per-stage checkpoints and preserves the actual failure stage during cleanup. An inaccessible HEAD is diagnostic rather than an automatic model-load veto. A successful tiny OPFS write is not proof that a 105 MB cache allocation will work.

## Discriminating device sequence

1. Open the existing `ai-wllama.html` page and check that it says **repair 1.2.0**. If an earlier `failed` report is present, use **Share JSON** or **Save diagnostic JSON** **before** another action overwrites it.
2. Keep SmolLM2, CPU-only Wasm, and 1,024 context selected. Tap **Check model URL & browser storage (no weights download)**. Export the report. Its `checks` separate runtime HEAD, selected-model HEAD, and `opfs-roundtrip` results.
3. If the model URL and OPFS roundtrip succeed, tap **Load selected model** once; export the report whether it succeeds or shows an error. Examine `errors[].name`, `errors[].message`, `errors[].cause`, and the last `events[].stage`. A failure at `cache-inventory-before-await` differs from one after `model-load-before-await`.
4. If the OPFS check fails in the in-app browser, repeat the same **no-weights preflight** in standalone Safari. Do not jump straight to downloading Qwen. If the storage check passes but weight loading fails, investigate the reported error, a real GGUF GET/CORS and worker/Wasm initialization next.

Only after SmolLM2 completes a real one-token request should Qwen's CPU-only GGUF route be tested. A browser tab reload is not an OS crash log or an out-of-memory diagnosis; never automatically retry potentially crash-inducing configurations.

## Validation limits

`tests/ai-wllama-repair.mjs` mocks successful asset checks, model-URL HEAD, a writable storage roundtrip, model load, first inference, and an injected OPFS-style failure with preserved error message and cause. Existing metrics and preflight checks pass. These are apparatus tests: **no Safari GGUF model load has yet been confirmed after repair 1.2.0**. The browser's HTTP HEAD responses and actual model runtime must be measured on the user's device.

Upstream source references: [wllama model manager](https://github.com/ngxson/wllama/blob/3.6.1/src/model-manager.ts), [cache manager](https://github.com/ngxson/wllama/blob/3.6.1/src/cache-manager.ts), [storage backend](https://github.com/ngxson/wllama/blob/3.6.1/src/storage/cos.ts).