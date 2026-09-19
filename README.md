# Pocket GPU Lab · 3D particle benchmark

A mobile-first WebGPU simulation and benchmark designed to compare the same GPU workload in iPhone Safari, an embedded ChatGPT web surface, and desktop browsers.

## Run

Publish `index.html`, `engine.js`, and `worker.js` together at your GitHub Pages root. GitHub Pages uses HTTPS. For local desktop development, from this directory run `python3 -m http.server 8000` and open http://localhost:8000. Do not open `index.html` via file://: module imports and workers require an HTTP(S) origin.

Open the app, watch its 3D particle cloud, drag to orbit, and pinch to zoom. In Controls you can change the particle count, simulation steps per frame, render-resolution scale, or disable rendering to isolate GPU compute. Click **Run 8s benchmark**. After 1 second warmup and 8 seconds measurement, export a JSON report.

## Fixed simulation definition

- Dual moving gravitational attractors with softened inverse-distance acceleration, central confinement, circulation, and linear damping.
- Each particle has position + velocity, each as four 32-bit floats (32 bytes per particle).
- One workgroup processes 256 particles; a single GPU storage buffer holds state and is read by the vertex shader without CPU readback.
- Simulation uses a fixed 1/120-second step per dispatch, independent of frame rate. Increasing steps per frame increases simulated time progression per frame.
- Drawing is one instanced draw call with 4 billboard vertices per particle; additive glow is resolved in one opaque-canvas render pass.
- Query instrumentation is sampled asynchronously: median GPU compute pass duration, median GPU render pass duration, particle-updates/second, and observed display FPS.
- GPU timing excludes some host CPU submission/presentation time. FPS does not isolate GPU performance. Query measurement may be unavailable in some embeds. Compute-only mode and render-on mode measure different workloads.

## Comparative testing

1. Use the same release and exact settings across Safari, ChatGPT, and desktop.
2. Test 65,536 particles, 2 steps/frame, 100% resolution, drawing on, and export the report.
3. Repeat with drawing off to isolate simulation, then use 262,144 particles at 8 steps/frame to increase GPU load.
4. Repeat runs while recording the device model, OS/build, battery/power state, initial device temperature, and whether the host is foregrounded. Keep the screen awake. Let the device cool between sustained runs.
5. Use median GPU timing where available to compare compute kernels, observed FPS to compare host presentation, and memory/termination behavior separately.

## Tests and verification

Run `node tests/smoke.mjs` for a mocked WebGPU structural smoke test (initialization, stage-appropriate shader declarations, dispatch sizes, rendering calls, resizing, and JSON reports). This test cannot compile WGSL or demonstrate actual GPU performance. Real iPhone execution, GPU timestamp availability inside ChatGPT, and comparative performance must be measured on the target device.

## Architecture

`index.html` owns the touch UI and metadata. A dedicated module Worker receives a transferred OffscreenCanvas; `worker.js` initializes `engine.js` there. If workers or OffscreenCanvas cannot initialize, the app replaces the transferred canvas and runs `engine.js` on the main thread. GPU resources and shader programs are initialized once, not per frame. A compact 128-byte uniform buffer carries simulation and camera parameters. No external library, CDN, network API, native extension, or Neural Engine API is used.

The benchmark is specifically a 3D particle integration + billboard visualization workload, **not a universal ranking of GPUs**. GPU timing varies with browser implementation, power state, other workloads, and ambient heat. Pass timestamps measure the estimated span of their passes rather than guaranteed isolated hardware cycles.

## Limits

WebGPU requires a secure context (HTTPS or localhost). A host iframe can independently deny WebGPU, worker creation, resource loading, downloads, or clipboard. This package makes no assumptions about ChatGPT's specific iframe permissions; test on the actual surface. Browser APIs do not directly expose Apple's Neural Engine through WebGPU. GPU buffer limits are not evidence of available physical memory. Each timed benchmark resets a deterministic seed and starts the simulation from the same initial state. The app does not automatically persist results: export the JSON before closing.

## Security and privacy

The simulation runs locally and makes no network calls beyond initially retrieving the three static application files. Exported benchmark results may contain adapter identifiers and device capability information; review them before sharing.
