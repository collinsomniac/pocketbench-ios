# PocketBench: verified device findings and provenance

All figures below are user-exported short iPhone Safari-context experiments in September 2026, not a universal Apple GPU specification. Original JSON exports live in the conversation; the compact observed report is preserved as [`observed-summary.json`](observed-summary.json). The earlier source and all experimental pages are on archive branch `archive/pre-two-folder-cleanup-2026-09-22`.

## GPU compute and rendering
- 65,536 dual-attractor particles × 2 integration steps, 768 × 390 offscreen output with sparse per-iteration sample capture: ~1,199 GPU-queue-completed iterations/s over ~2.5 s after ~1.6 s warmup.
- Same particle workload, 880 × 1738 offscreen output: ~1,000 observed iterations/s (batch 16) and ~1,035/s (batch 64). Two sampled patches were taken between clears; not every complete image was captured and no frames were presented.
- 262,144 particles × 8 steps, compute only: ~2,212 queue-completed iterations/s. No image per iteration.
- Lightweight WebGL2 and WebGPU submissions: main-thread rAF ~120/s, native worker rAF ~57–58/s, main-thread-paced worker relay ~120/s. These counts are submissions, not physical display measurements.
- Fusion for 262,144 × 8 compute-only was roughly 5.4× shorter GPU compute pass in one relay suite (2.106 vs 0.390 ms), with different behavior under visible rendering. Do not extrapolate a compute-pass timestamp into end-to-end presented FPS.

## Local inference
- WebLLM 0.2.85, SmolLM2 135M on iPhone in a dedicated WebGPU worker: successful 1, 4, 16 and 64 token probes. Model-reported decode ~51.55 tok/s at 16 and ~46.81 tok/s at 64 in that report. These are short requests; the one-token response contained text despite a zero completion-token usage value.
- WebLLM Qwen3 0.6B: initial load reached ready then page reset during first inference; not diagnosed as OOM or a device hardware limit.
- wllama 3.6.1 GGUF 135M: initial catalog URL returned 404; corrected QuantFactory Q4_K_M artifact reached 105,454,144 cached bytes. A subsequent worker `signal.abort` had a non-string message; wllama 3.6.1's handler threw `message.replace is not a function`, leaving load pending. The root worker-abort cause remains unknown. The 1.5 page then had a circular import-map re-export that prevented button handlers from installing. The consolidated GGUF page removes that exact import cycle and retains the abort capture but is not phone-validated.

## Confidence and next work
Benchmark figures measure specifically defined workloads. Repeated sustained runs, thermal/performance-state monitoring, full-image uniqueness, equal-model/quantization cross-runtime comparisons, WebGPU-vs-WebGL under equal graphics loads, and browser CPU-vs-GPU LLM throughput are not yet measured. Prioritize real working controls and preflight/asset checks over speculative model-size ceilings.