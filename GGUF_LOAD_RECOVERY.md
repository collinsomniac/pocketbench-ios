# GGUF load recovery: iPhone experiment (2026-09-21/22)

## Device evidence

The user observed build 1.3.0 on an iPhone inside an in-app browser, with SmolLM2 135M Q4_K_M selected, CPU-only Wasm, 1,024-token context, and `Model download: 100% (library-reported)` on screen. The model was not shown as ready; the interface disabled model, load and release controls, and an earlier `Saved report: failed` label remained visible. **No JSON for this particular 100% attempt has yet been supplied.** Do not treat the previous failed report label as the current attempt's outcome, or the download percentage as proof of initialized inference. The prior JSON (build 1.2.0) definitively identified an HTTP 404 for an obsolete model URL, fixed separately in build 1.3.0.

## Source-level explanation and limits

In 1.3.0 the UI sets `busy=true` and awaits `engine.loadModelFromUrl()`. Its buttons remain disabled until the awaited promise resolves or rejects; no user cancel was wired. wllama's progress callback covers weight transfer, whereas the load promise additionally includes cache/model preparation and WebAssembly worker initialization. Upstream `ProxyToWorker` handles some worker abort signals but sets `worker.onerror` to a logger, which may not reject the unresolved task. A stalled worker is a **hypothesis**, not a diagnosed underlying cause. First load of Wasm and model may also take considerable time; no supported timing or memory failure can be concluded from the screenshot alone.

## Build 1.4.0 — recovery apparatus

The new `ai-wllama-v14.mjs` script and `ai-wllama.html` introduce a **Cancel active load** control, an always-accessible **Export current report** control, elapsed-time status and checkpoint messages after 15/45/90 seconds without automatically failing a slow load. A library-reported 100% result is explicitly labelled as weight transfer rather than model readiness. The runtime logger captures bounded worker warnings and errors; downloaded bytes and worker/Wasm readiness are separate events. Cancel requests `AbortController.abort()` for applicable fetches, invokes wllama `exit()` to request worker termination, re-enables controls immediately, and ignores late callbacks/completions from that abandoned run. It does not promise instant memory reclamation or turn an unresolved task into a successful inference. No automatic crash-loop retries.

The `tests/ai-wllama-v14.mjs` mocked regression covers the selected-model 404, preflight and writable OPFS, a deferred load after a simulated 100% download, worker warning capture, cancellation and UI recovery, suppression of a late completion, and a subsequent successful load and one-token response. This **does not** establish successful iOS Wasm startup; the browser cannot be tested on our device from this environment.

## Next evidence collection

Open `https://collinsomniac.github.io/pocketbench-ios/ai-wllama.html?build=1.4.0`; confirm the heading says `recovery 1.4.0`. Export the old saved report before another load. Try the **same SmolLM2 / CPU-only / 1,024 context** configuration and observe whether `Model ready` appears. If loading remains pending, use **Export current report** while it is pending, then **Cancel active load** (do not start repeated concurrent loads). Export the cancelled report, which should include the latest stage, library-reported download completion and any worker errors. If model readiness succeeds, run the one-token probe and export the report. Consider a separately controlled standalone Safari comparison only after capturing the in-app result. Do not escalate to 484 MB Qwen before the smaller GGUF initializes.

Reference: [`wllama 3.6.1 worker implementation`](https://github.com/ngxson/wllama/blob/3.6.1/src/worker.ts).