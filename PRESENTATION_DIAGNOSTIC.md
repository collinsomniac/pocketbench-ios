# Particle presentation isolation (v1)

Open `suite-presentation.html` on the iPhone in foreground. It automatically runs 12 sequential cases, with the unchanged baseline and fused dual-attractor shaders for each of six workloads. Use **Share report** or **Save JSON** after completion. No result is uploaded automatically; one prior result is retained in localStorage.

## Why this exists

On September 21, 2026, the relay suite submitted ~120 physics-only frames/s at 262,144 particles × eight steps, but only ~59–60 frames/s at 65,536 particles × two steps when rendering to its large visible canvas. The lightweight WebGL/WebGPU graphics probe demonstrated ~120 draw submissions/s even with a worker relay. Therefore a worker or a WebGPU API-wide 60 FPS ceiling is inconsistent with the measured data.

## Cases

All cases use identical deterministic particle initialization, integration dt, force law, baseline/fused kernels and 650 ms warmup plus 2,200 ms measurement. They run in this order, baseline then fused per workload:

1. `compute-8k`: physics only; no graphics pass.
2. `offscreen-8k`: full particle draw shader to a GPUTexture render attachment, no presentable canvas texture.
3. `onscreen-8k`: full particle draw shader to a visible GPUCanvasContext.
4. `offscreen-65k`: GPU-only particle rasterization at full resolution.
5. `onscreen-65k-half`: visible canvas at half render scale.
6. `onscreen-65k-full`: visible canvas at full render scale.

The diagnostic uses a separate, unblurred UI and a canvas approximately 195 CSS px high to avoid conflating fullscreen overlay compositing and the particle effect itself. It records actual canvas dimensions per case. The offscreen target's width, height, format and particle shader match the corresponding visible test at the same scale; underlying surface allocations and browser scheduling still differ. Offscreen cases intentionally leave the visible image unchanged.

`mainThreadRAF` is counted independently from the worker frame requests for each case. `requestToReceiptMs` in the inherited relay metric **includes waiting for the next rAF**, so it is not a measure of postMessage transit alone. GPU timestamps are sampled pass durations, not full frame or physical display timestamps. Neither the frame count nor rAF alone proves a distinct image reached the screen.

## Interpretation

- If offscreen rendering stays near 120 while visible rendering falls toward 60, investigate GPUCanvasContext presentation, browser frame pacing, and page compositing. This does not prove a particular WebKit implementation is responsible.
- If both rendered targets fall while physics-only stays at 120, GPU draw/rasterization and queue scheduling warrant examination.
- If 8k visible reaches 120 but 65k visible does not, compare half and full resolution, overdraw, draw cost, and long GPU timestamp tails. The tests do not by themselves isolate which one caused the threshold.
- If main-thread rAF also falls during visible rendering, the page's effective callback cadence changed; if it stays at 120 while worker submissions fall, worker/GPU completion and relay round trips deserve attention.

Follow-up testing requires repeated, order-reversed sessions and longer sustained trials. Hardware execution and WebGPU correctness remain unverified by local mock tests.

Reference: WebKit's August 2026 WebGPUFramePacer change: https://results.webkit.org/commit?id=318799%40main&repository_id=webkit . The presence and exact behavior of that change on the user's Safari build are not established.
