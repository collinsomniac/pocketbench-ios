# PocketBench automated testing apparatus · v2.0

Launch `suite.html` on HTTPS (GitHub Pages) to **automatically** run the `balanced` plan. The suite preserves `index.html`, `v2.html`, `engine.js`, `optimized-engine.js` and the original WGSL force law. There are no runtime dependencies.

## iPhone workflow

1. Open `https://collinsomniac.github.io/pocketbench-ios/suite.html` in Safari or the intended embedded browser. Keep the app foregrounded and avoid recording your screen, switching apps, or changing power mode during the run.
2. The balanced suite runs 12 tests without further taps. Each block runs baseline → fused → fused → baseline; three blocks compare 65k/2/rendered, 262k/8/compute-only, and 262k/8/rendered. Each test has an 850 ms warmup plus 3 seconds of measured work. GPU query readbacks and submitted work are drained between tests.
3. At completion, use the export dialog's **Share / Save to Files** on iOS, or **Download complete JSON**. A CSV summary is also available. No report is sent to a server. The most recent partial/complete report is retained in browser localStorage after each run; use Previous results to recover it on reopening the page. Storage may be evicted by the browser, so export important data.
4. To run shorter or heavier workloads, choose Quick or Extended and tap **Run suite again**. Edit the plan JSON for precise workloads and timing; click Validate plan to check it. `?preset=quick`, `?preset=extended`, `?autorun=0` and `?worker=0` are useful URL overrides. Changing the plan does not change an in-progress suite.

## Report and metrics

One JSON per suite includes version, execution order, original plan, browser/viewport/adapter features and limits, fallback/worker status, canvas dimensions per run, exact work completed, every sampled GPU compute/render duration, frame intervals and JavaScript frame submission durations, descriptive percentiles, status/errors, page-hide interruptions, individual start/end timestamps, comparison medians and provenance notes.

- **Compute/render GPU times**: sampled pass durations, not end-to-end latency, queue wait or frame time; missing values are null rather than fabricated.
- **FPS**: actual submitted frames divided by measurement wall time; may be capped by RAF/display refresh. Compute-only still uses RAF to retain a comparable submission cadence.
- **GPU-equivalent M updates/s**: `particleCount × steps / GPU compute median seconds` (GPU-pass throughput proxy). **Actual M updates/s**: `submittedFrames × particles × steps / active wall time` (actual scheduled work).
- GPU samples are collected asynchronously at most every 4th frame, and only when previous readback has finished; the suite drains outstanding GPU submissions and timestamps before changing workloads. A null GPU timing or zero sample count must not be interpreted as zero execution time.
- `jsSubmitMs` measures CPU-side JavaScript call duration for `onFrame`, **not** GPU completion. The environment does not disclose GPU clock, thermals, actual power draw, or Apple Neural Engine utilization.
- Alternating ABBA reduces some order bias but does not eliminate thermal drift. We do **not** claim significance or numerical equivalence of original and fused GPU states from timing results.
- The shared seeded particle initialization is reset before every run. The existing original model advances by steps per displayed frame, so measured simulated time can differ if frame counts differ. Attractors are constant within one frame in both kernels. Numerical equivalence requires separate GPU state readback comparison.
- No synthetic throughput is passed off as hardware throughput. Chromium SwiftShader software emulation can exercise logic but **cannot** validate iPhone GPU performance.

## Automation on desktop

Serve the repository directory over HTTP (`python3 -m http.server 8000`), then open `http://localhost:8000/suite.html?preset=quick`. `localhost` is normally a secure context; plain HTTP on arbitrary remote IPs generally is not.

`tools/run-browser.mjs` is an optional Playwright runner (requires `npm install --no-save playwright` and Playwright Chromium):

```
node tools/run-browser.mjs --url http://127.0.0.1:8000/suite.html --preset quick --output ./artifacts/suite.json
```

This script waits for the page to finish and writes the **actual browser-generated JSON**; it does not generate substitute performance values. Without hardware acceleration, use it as a compatibility/smoke test only. No special SwiftShader flags are enabled by default: such flags can change WebGPU behavior and may lower security guarantees. If a browser cannot acquire WebGPU, the runner fails clearly rather than manufacturing output.

Run local, dependency-free structural tests:

```
node tests/smoke.mjs
node tests/v2.mjs
node tests/suite.mjs
```

For automated execution on actual iPhone hardware, open the static suite page on that device. Remote Playwright emulation or a desktop browser cannot reproduce its Apple GPU behavior. Keep reference runs from standalone Safari and ChatGPT's embedded context separate in your dataset.

## Research and references

- WebGPU timing, buffer resolution and mapping: https://webgpufundamentals.org/webgpu/lessons/webgpu-timing.html
- GPU queue submission and throttling: https://developer.mozilla.org/en-US/docs/Web/API/GPUQueue/onSubmittedWorkDone
- WebGPU specification on mapping and promise ordering: https://www.w3.org/TR/webgpu/
- Chromium SwiftShader is a **software implementation**, not a substitute for a device's hardware GPU: https://chromium.googlesource.com/chromium/src/+/HEAD/docs/gpu/swiftshader.md
