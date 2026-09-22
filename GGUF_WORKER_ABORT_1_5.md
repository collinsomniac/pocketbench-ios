# wllama 3.6.1 worker abort diagnosis — PocketBench 1.5 (September 22, 2026)

## Direct phone evidence

The user's `pocketbench-wllama-2026-09-22T08-13-57-438Z.json` is from controller 1.4, SmolLM2 135M Q4_K_M, CPU-only Wasm (`n_gpu_layers: 0`), context 1,024. The selected model HEAD returned HTTP 200 and reported 105,454,144 bytes. The wllama cache inventory returned one entry of exactly that size, and the progress callback immediately reported 100% (cache hit). No model-ready event or inference occurred.

About 0.28 seconds after model-load began, an `unhandled-rejection` was saved: `TypeError: message.replace is not a function` in wllama 3.6.1 `esm/index.js:1613:37`, inside `onRecvMsg`. The load was still pending at the diagnostic 15-second checkpoint. This is not evidence of a memory-limit failure or confirmed successful Wasm startup. It demonstrates a secondary error in error reporting that concealed the original worker abort.

## Root of observable hang and scoped diagnostic repair

Upstream tag `3.6.1` `src/worker.ts`, `ProxyToWorker.onRecvMsg`, handles `signal.abort` by destructuring `[signalType, message, rawStack, originalErr]`, then invoking `message.replace(...)` without validating its type. The upstream `src/workers-code/llama-cpp.js` forwards its `onAbort(message)` argument directly, so an object-valued abort is possible and was observed indirectly on this phone. The unsafe call throws inside an async function before rejecting outstanding `resultQueue` / `taskQueue` work. The app cannot catch the original abort because the model-load promise does not settle.

Build 1.5 keeps upstream wllama 3.6.1 and the verified model files. A same-origin, versioned runtime wrapper subclasses its exported `Wllama` and instruments only its instance's `proxy` property. It installs an `onRecvMsg` wrapper before `moduleInit()` binds it to the worker. Ordinary messages still reach the upstream handler. For `signal.abort` alone, the wrapper serializes and records the original type/message/stack/original error, rejects pending proxy tasks with `WllamaWorkerAbort` and a JSON `cause`, and terminates the worker. It deliberately skips upstream's asynchronous stack decoder and preserves raw diagnostic material. Existing Cancel/Export controls remain. This changes failure reporting, **not** inference algorithms or weights.

The HTML import map routes **only this page's** controller import of `ai-wllama-core.mjs?v=1.3.0` through `ai-wllama-core-v15.mjs?v=1.5.0`, whose sole override is the local guarded runtime URL. The original core and other benchmarks remain unchanged. The existing controller's JSON `version` remains `1.4.0`; `runtime.module` identifies the 1.5 guard, and HTML identifies 1.5.0. Do not mistake the controller version for the guard version.

## Next discriminating device test

Open `ai-wllama.html?build=1.5.0` and verify heading `abort diagnostic 1.5.0`. Export the previous report before loading. Choose SmolLM2, CPU-only Wasm, context 1,024; tap Load once. If the worker aborts, export the resulting failed report. Inspect `errors[].message`, `errors[].cause` (JSON containing the original abort payload), and worker logs. If no abort arrives and initialization remains pending, export while pending, then Cancel; that is a distinct path. If Model ready appears, run one token, then export. Do not download Qwen or change offload simultaneously.

A mocked proxy interception test verifies ordinary messages, object/null abort payloads, rejection of both queues, worker termination, a second proxy assignment, and the versioned import-map wiring. It does **not** execute real Safari Wasm or prove successful GGUF inference.

Upstream: [worker abort handler](https://github.com/ngxson/wllama/blob/3.6.1/src/worker.ts), [worker-side onAbort forwarding](https://github.com/ngxson/wllama/blob/3.6.1/src/workers-code/llama-cpp.js).
