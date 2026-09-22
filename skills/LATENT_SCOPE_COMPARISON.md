# Latent Scope ↔ PocketBench: evidence and next experiments

Date: 2026-09-22. This note records what can and cannot be concluded from the prior **Build LLM Shader Visualizer** conversation, the saved Latent Scope site text, the PocketBench device JSON, and upstream WebLLM sources. **Do not treat Latent Scope as the unrelated `enjalot/latent-scope` GitHub project.**

## Source boundary

- Latent Scope deployed at `https://latent-scope-lab.collinsomniac.chatgpt.site/`. The prior conversation reports a browser-local WebLLM ~1B chatbot with streamed next-token log probabilities and three GLSL views. Saved site text calls the model **Llama 3.2 · 1B · 4-bit** and describes token probabilities → float texture → GLSL, with rendering between generated tokens. The prior conversation describes an approximately **8 KiB signal texture upload**, five distinct alternatives plus the sampled token and residual mass, idle draw suppression, mobile chat layout and graphics-context recovery. These are reported implementation details; we could not inspect its actual source or README in this review.
- Prior Latent Scope repair: `top_logprobs` was 8, while WebLLM permits at most 5 and requires `logprobs: true`; the app changed to 5 and restored pre-token failed prompts. This is an API validation error, **not** a demonstrated cause of PocketBench's tab reloads. Source: `https://github.com/mlc-ai/web-llm/blob/v0.2.85/src/config.ts`.
- **Unknown:** Latent Scope's exact model ID/quant variant, WebLLM version, main-thread vs worker API, frontend framework/build system, actual graphics context API, precise request JSON, browser/device of every successful test, and measured tokens/s. A 'WebGPU available' UI label is not proof that GLSL itself runs through WebGPU. Do not invent these fields or claim a matched-device comparison.
- PocketBench source: `website/chat-core.mjs`, `website/chat.mjs`, `website/ai-diagnose-core.mjs` (WebLLM 0.2.85, dedicated worker, Qwen). User-exported `pocketbench-ai-diagnostic 2.json` confirms Qwen3 0.6B loaded and completed 1-token and 64-token runs, the latter 1,447 ms, first visible text 137 ms and model-reported 48.7239 decode tok/s, even though earlier/later first-inference reloads occurred. This rules out categorical Qwen/WebGPU incompatibility.

## Main technical contrast

| Dimension | Latent Scope (documented) | PocketBench (source + device evidence) |
|---|---|---|
| Local inference | WebLLM, Llama 3.2 ~1B 4-bit; exact package unknown | WebLLM 0.2.85, Qwen3 0.6B / 1.7B / 8B q4f16_1; 0.6B separately generated successfully |
| Signal | Streamed chosen token + limited top-k log probabilities; float texture → 3 GLSL views | Streamed text and optional raw response samples; no shader in Chat page |
| UI cost | Tiny probability payload; unchanged GPU frames suppressed according to prior conversation | Chat DOM updates coalesced with rAF; first-inference resets can precede visible output, so UI rendering alone is not an established cause |
| Model memory | 1B 4-bit catalog candidates: Llama q4f16_1 879.04 MB or q4f32_1 1128.82 MB; **Latent variant unconfirmed** | Qwen 0.6B 1403.34 MB, 1.7B 2036.66 MB, 8B 5695.78 MB catalog estimates. These are not live Safari peak allocations. |
| Context | Unknown | Chat offers catalog default and 512/1024/2048/4096 context via documented fourth argument `CreateWebWorkerMLCEngine(worker,id,config,chatOpts)` |

Upstream WebLLM catalog: `https://github.com/mlc-ai/web-llm/blob/v0.2.85/src/config.ts`; worker API: `https://github.com/mlc-ai/web-llm/blob/v0.2.85/src/web_worker.ts`.

## Competing failure hypotheses — do not choose one without data

1. **Package-specific peak memory / model initialization-to-prefill allocation**: catalog GPU estimate and Safari process overhead are not equivalent to physical RAM or native app budget. Llama 1B q4f16_1's estimate is *less* than Qwen 0.6B's despite more parameters. A browser reset without JS error cannot establish OOM or jetsam.
2. **Runtime/compiled-kernel regression**: `https://github.com/mlc-ai/web-llm/issues/844` reports a 0.2.83+ shape-cache lifetime bug on *Windows AMD*, involving Qwen3 0.6B/1.7B and longer prefills, with 0.2.82 succeeding there. This is a lead, **not an iPhone diagnosis**. Version comparisons must record exact model_lib/WASM assets because WebLLM 0.2.82 and 0.2.85 catalogs may select different compiled libraries; Qwen3 may require a custom older-version appConfig.
3. **Browser environment or GPU scheduling**: test the same page in the same iOS browsing context; Latent Scope's origin, cache and embedded browser may differ from GitHub Pages. WebKit issue `https://bugs.webkit.org/show_bug.cgi?id=311598` documents an *independent* iOS WebGPU queue-stall report for llama.cpp; do not project it onto WebLLM without evidence.
4. **Input shape / persisted state**: inspect exact JSON `messages`, actual tokenized prompt length, context override, temperature, thinking, max_tokens, and whether a previously failed prompt was restored or duplicated. Compare exact same request, not just the same natural-language question.
5. **UI/render overhead**: Latent Scope can run shader views with a small signal upload; PocketBench Chat only renders text. If PocketBench crashes before first returned chunk, text rendering cannot be the sole explanation. Benchmark optional logprobs/visualizer overhead separately after baseline chat is stable.

## Controlled experiment: highest information / least redundant download

Use **one model and one engine at a time** and export checkpoint before switching. Preserve stable build IDs and actual source hashes. Never automatically retry a tab-killing model.

A. In existing `website/ai.html`, select `Llama-3.2-1B-Instruct-q4f16_1-MLC` (**added to the existing diagnostic picker in this review**), WebLLM 0.2.85 worker. Run the fixed 1-token nonstream probe and fixed 64-token streaming probe; export a report with exact model ID, path and timing. **This diagnostic accepts fixed prompts only; it cannot accept the poetry prompt.** It is an independent Llama reference, *not* a reproduction of Latent Scope's unknown exact build. No phone validation yet.

B. With a fresh page in the same iOS browsing context, run `Qwen3-0.6B-q4f16_1-MLC` using the **same fixed probes**. Compare outcome and catalog memory estimate. Only after this succeeds attempt 1.7B with the context-controlled `website/chat.html`, where Request JSON can preserve exact prompts. **Do not call a Llama-vs-Qwen poetry comparison matched until both models can accept the identical custom request in the same apparatus.** Do not prioritize 8B while first inference is unstable.

C. If Llama succeeds but Qwen fails, compare the same Llama model under WebLLM 0.2.82 vs 0.2.85 in separate **version-pinned** trials; record compiled model library URLs and verify compatibility. Then, only where the exact model artifact can be held constant, test Qwen across runtime versions. An older version's model absence or different WASM invalidates a clean single-variable claim.

D. After a stable path, compare `logprobs:false` versus `logprobs:true,top_logprobs:5`, and shader enabled/disabled under identical prompts and outputs. Measure first-text, model-reported prefill/decode tok/s, CPU callback cost, signal-upload bytes, GPU render timing, and browser longevity. Request validation must run before any weight download.

E. For a new inference backend, compare the **same model/quantization where available** through WebLLM and LlamaWeb/wllama; published LlamaWeb memory savings are cross-device research, not a phone-specific measured improvement. Reference: `https://arxiv.org/abs/2605.20706`.

## Architecture to keep

Keep exactly `website/` and `skills/` directories and the existing root redirect/README. Do not import Latent Scope's full app or introduce another debug HTML slug. Treat inference engine, small token-signal adapter, and renderer as separate modules; preserve an uninstrumented baseline. Prefer GPU-resident compute, low-copy signal transfer, rAF-coalesced UI, bounded raw sample capture and recoverable checkpoints. Optimize for **completed meaningful tokens and useful observability**, not a display Hz cap. No code change should be presented as a proven Safari fix without a user-exported successful run.
