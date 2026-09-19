# Pocket GPU Lab v1.1 — controlled optimization experiment

The v1.0 app remains at `index.html`. Open `v2.html` for a paired original-versus-fused comparison. Both engines run on the same existing WebGPU particle buffer, with the same deterministic initial seed and 32-byte particle layout, 1/120 s semi-implicit Euler substeps, softened moving dual-attractor forces, confinement, circulation, damping, and optional instanced billboard renderer.

## What changed, and why this is a hypothesis rather than a claimed speedup

- **Original:** one GPU dispatch per integration step, loading and storing each particle's 32-byte state on every step.
- **Fused:** one GPU dispatch per displayed frame. Each invocation loads its particle, performs all the same integration steps in private registers, and writes it once. Attractors remain fixed throughout all substeps of a displayed frame, matching v1.0. The unused fourth component of the simulation uniform now carries the integer step count (as exactly representable f32).
- For `N` particles and `S` steps the shader's nominal global storage traffic (excluding caching, uniforms and rendering) is approximately `64*N*S` bytes for the original and `64*N` bytes for the fused variant. **This is not a measured DRAM bandwidth figure**: actual memory transactions and caching depend on the implementation.
- Fusing can reduce dispatch overhead and repeated global memory operations, but **can also reduce occupancy** if the compiler creates excessive register pressure; its benefit must be measured, especially at 1 versus 16 steps.
- Both modes use the same original vertex/fragment shaders and 256-invocation workgroups. Neither mode accesses Apple's Neural Engine.

## What v1.0 results actually established

Two 65,536-particle / two-step / 880x1496 / render-on reports gave 59.91 and 60.00 FPS, median GPU compute durations 0.3676665 and 0.318229 ms, median GPU render durations 0.7158335 and 0.6552915 ms, and estimated integration rates of 356.5 and 411.9 million particle-steps/s. These are two measurements of the *same implementation*, not a fused-versus-original result. Screen refresh caps presented FPS; it does not cap the GPU timestamp-derived integration rate.

## Recommended paired measurements

1. Use one iPhone, the same Pages URL, foreground state, viewport, power mode and preferably a stable starting temperature. Leave particle count, steps, scale, and rendering unchanged during one paired sequence.
2. **Compute isolation:** set drawing OFF; use `262144` particles, `8` steps/frame, then run original → fused → original → fused. Export *every* JSON report. Repeat at `65536` particles / `2` steps and `524288` particles / `16` steps if stable.
3. **End-to-end frame budget:** repeat original → fused → original → fused with drawing ON and resolution scale 100%. Compare GPU render timing, frame-interval P95, and actual presentation FPS as separate measurements.
4. **Single-step control:** compare original and fused at `1` step/frame. A dramatic apparent improvement at one step would merit investigation: both do the same nominal memory access and number of dispatches in this case.
5. Optional resolution sweep at the same kernel and particle count: 50%, 100%, 150%. If render duration scales strongly with pixel count, investigate fill and additive overdraw rather than physics math.
6. Record whether the fused shader compiled successfully. A fallback to original is not a fused result. Watch for errors, visual deviations, numerical instability, device loss, or reduced sustained performance.
7. Report paired median GPU compute durations, spread (P10/P90), actual FPS, P95 frame intervals and sample counts. Do not read a speedup into small differences comparable to ordinary run-to-run variation.

## Known limitations and next engineering questions

- **Shader compilation and performance have not been verified on the target iPhone**. Node smoke tests use a mock GPU; browser navigation in this execution environment returned `ERR_BLOCKED_BY_ADMINISTRATOR`.
- Floating-point transformations and compiler optimizations can produce small differences across pipelines. A future validation mode should read back a small deterministic subset of particles after a fixed number of substeps and compare positions/velocities within an explicit absolute and relative tolerance; visually similar output alone is not a numerical validation.
- The simulation advances `steps / 120` seconds **per animation frame**, not according to elapsed wall-clock time. A 120 Hz viewport advances simulated time twice as fast as a 60 Hz viewport with otherwise identical settings. This v1 behavior is retained in v1.1 for apples-to-apples kernel comparison; a later release should implement an accumulator, limited catch-up, and independent simulation/render scheduling as a separate behavioral change.
- Attractor coordinates are sampled once per displayed frame and held constant for that frame's substeps in both kernels. Sampling moving attractors each substep would be a different physical simulation and requires a separate validated experiment.
- Timestamp queries measure approximate pass spans rather than complete end-to-end app latency and can be unavailable or quantized. The benchmark tracks frame intervals as an additional signal but does not independently measure queue-wait or GPU energy.
- Workgroup size is still fixed at 256. Test 64/128/256/512 only after establishing the baseline; 1024 supported invocations is a *limit*, not evidence of an optimal workgroup size.
- Moving to 16-bit storage is optional and potentially useful, but requires error-bound testing over time. Likewise, changing `inverseSqrt`, numerical integration, brightness, particle size, or rendering resolution changes different aspects of the workload: benchmark and validate each independently.
- In-place per-particle updates are safe here because each invocation reads/writes only its own particle and both attractors are uniform inputs. Introducing particle-to-particle interactions would invalidate the independence assumption and require synchronization or different data structures.

Run `node tests/smoke.mjs && node tests/v2.mjs` for structure-only checks. For actual WGSL compilation, numerical equivalence, GPU timing, thermals and visual quality, use a supported browser on the target device.
