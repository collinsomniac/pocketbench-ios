# PocketBench observed offscreen throughput audit (v2)

Open `suite-observed.html` in foreground Safari. It automatically runs five short GPU-queue-completed cases; export the single JSON report with **Share report** or **Save JSON**. The previous `suite-throughput.html`, original simulator and presentation tests remain untouched.

## Why v1's result needed validation

v1 measured GPU-queue completion for sequences of repeated render passes writing the **same** offscreen texture; only the final output received one 16×16 readback **after timing**. Intermediate frames were neither preserved nor read, and nonzero alpha/background bytes do not prove that pixels representing moving particles appeared. Queue completion says the GPU processed submitted work; it is **not** display presentation or proof of individually inspectable intermediate raster images.

## Observation mode

After **each** original particle render pass, the observational engine encodes two `copyTextureToBuffer` operations from fixed, separate 16×4 pixel patches into **unique non-overlapping slots** in a MAP_READ / COPY_DST buffer. Each copy uses the WebGPU-required 256-byte row pitch; each iteration stores 2,048 bytes, including padding. The next iteration's render clear cannot make earlier copied results disappear. Buffer mapping and hashing occur *after* the timed, drained batch loop. All iterations must have an observation record or the run fails. Readback reports records with non-background pixels, unique sampled pixel hashes, adjacent-frame changes, and hashes for spot-checking. `compute` and `observe:false` cases are explicitly marked unobserved. Sparse patches and different hashes cannot establish correctness of the entire image; constant hashes may reflect empty patches or slowly moving particles, not an absence of rendering.

The new instrumentation is deliberately not free: observed-mode completion includes two texture copies per iteration. Never compare the v1 headline rate directly with observed mode without reporting both the different benchmark semantics and added costs. The original force law, physics shader, integration step, seeded initialization, and billboard render pipeline are inherited unchanged. `observed-engine.js` duplicates the narrow render submission method solely to interpose copy commands *after draw.end()*; reconcile if upstream engine submission changes.

Warmup is 1.6 seconds per case; timed measurements are 2.5 seconds by default. A bounded 4–64 frame batch is drained with `queue.onSubmittedWorkDone` before counting. The custom form configures count, steps, kernel, render resolution, batch, duration and observation, including an unobserved comparison. Maximum capture capacity is bounded and any overflow fails the case rather than silently dropping records. No `requestAnimationFrame` schedule is involved.

## Interpretation and remaining work

These are offscreen GPU workload iterations/s, **not visible FPS**. A 120 Hz display cannot show 900 distinct screen refreshes/s. GPU queue completion, copied rendered samples, GPU-only shader timestamps and browser compositor timing are separate metrics. A longer, randomized, repeated run is required for sustained thermal or statistical claims. Future versions should validate independent physics state against a numerical reference and sample larger/full-frame imagery when numerical pixel correctness matters.
