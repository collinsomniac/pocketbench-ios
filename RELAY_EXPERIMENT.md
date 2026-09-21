# Main-thread paced WebGPU particle-suite experiment

Open `suite-relay.html` (defaults to Quick suite and autoruns; `?preset=balanced` or `?preset=extended` select other workloads, `?autorun=0` disables autorun). Save all results as JSON, preferably using Share to Files on iPhone.

## What is held constant

The exact existing `engine.js`, `optimized-engine.js` and `suite-plan.js` from PocketBench main are imported unmodified. This experimental page copies suite controls and suite runner into separate files, preserving `suite.html` and its worker as the control. It uses original/fused kernels, seeded reset, warmup, duration, and timestamp reads in the same way.

## What is changed

Instead of worker `requestAnimationFrame`, `suite-relay-runner.js` requests a frame from the main page. The page schedules exactly one main-thread rAF callback and replies with a pulse. Only after receiving the pulse does the worker encode/submit the GPU frame and request the next one. No free-running message queue is created. This may incur one message roundtrip and miss some display ticks; the result is measured rather than assumed. If worker creation fails, the page falls back to the existing main-thread runner and records that in the environment; do not compare it as if it were relay mode.

The report marks `experiment: main-thread-rAF-worker-relay-v1`, reports the scheduler and per-case frame requests, delivered pulses, and request-to-receipt timing. Worker `performance.now()` is used on receipt, avoiding cross-context clock assumptions. The main/worker request-to-receipt includes waiting until main rAF and messaging delay; it is not one-way postMessage latency or display latency. Timestamp queries still measure GPU pass spans only. No claim is made about actual compositor presentation or photons.

`render:false` is a **compute-only** workload: it still updates all particle states but does not change the canvas image. The application pauses after the suite. Keep the page visible and use the same Safari feature flags for control and experiment.

## Suggested comparison

Use `suite.html?preset=quick` versus `suite-relay.html?preset=quick` for short integration check. Then use `preset=balanced` on both, alternating order and preserving power/thermal conditions. Compare submitted frame interval distributions, actual million updates/sec, GPU compute/render medians, and missing samples, not FPS alone. The relay does not make the GPU compute faster. High-refresh WebKit scheduling may differ in WKWebView versus Safari.

## Testing

`node --check suite-relay-runner.js && node --check suite-relay-worker.js && node --check suite-relay-ui.js` and `node tests/suite-relay.mjs`. Mocked tests cannot validate WGSL compilation, actual GPU frame pacing or on-screen presentation; those require an iPhone run.
