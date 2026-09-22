# Browser-local Chat · controlled inference investigation (2026-09-22)

## What has actually worked

A user-exported iPhone WebLLM 0.2.85 diagnostic confirmed Qwen3 0.6B q4f16_1 inference in a dedicated WebGPU worker. Its 64-token streamed request completed in 1,447 ms, first visible text appeared at 137 ms, and the model reported 48.72 decode tokens/s (63 completion tokens). The one-token response visibly contained `<think>` despite zero reported completion tokens. The successful diagnostic used a **single user message**, `temperature: 0`, `max_tokens: 64`, `stream: true`, `stream_options: {include_usage: true}`, no system prompt, no `extra_body` and catalog-default context. A short successful response is not evidence of long-term stability or answer quality.

The first Chat implementation used a different request: a system message, `temperature: 0.7`, `max_tokens: 128`, and `extra_body: {enable_thinking: false}`. The user reports that the iPhone tab reloaded on first inference with the intermediate 1.7B model after asking about poetry. This is a **real first-inference failure**, not a caught exception or proof that any single request field caused it. The 1.7B model has not yet completed a device-verified request; Qwen3 0.6B remains the measured control.

## Model configurations (pinned WebLLM 0.2.85 catalog)

| Model | Catalog-estimated runtime GPU memory | Status |
|---|---:|---|
| Qwen3-0.6B-q4f16_1-MLC | 1,403.34 MB | User-verified 64-token diagnostic, not yet verified in rebuilt Chat |
| Qwen3-1.7B-q4f16_1-MLC | 2,036.66 MB | User reports a tab reload on first Chat request |
| Qwen3-8B-q4f16_1-MLC | 5,695.78 MB | Catalog-listed only; may not fit Safari |

These are model catalog estimates, not browser memory readings. Native-app inference does not establish a browser-process budget or identical kernel compilation. The previous GGUF/wllama issue is independent; do not mix its results with MLC weights.

## Chat build 0.2.0: one-variable-at-a-time protocol

1. Load **0.6B / Catalog default**. Use **Run proven 64-token probe**. It sends the same JSON body and prompt as the successful `website/ai.html` diagnostic, via the same `ai-bench-worker.mjs` and pinned runtime. Export the result even if it reloads.
2. On a successful probe, send `What do you like about poetry?` with default Chat JSON. Its default has no system message or thinking override, `temperature: 0`, `max_tokens: 64`, and `stream: true`. Output may be incomplete thinking; this proves decoding, not a useful answer.
3. If that works, change **one** JSON field at a time: first `extra_body: {enable_thinking:false}` for a direct answer, then optionally raise `max_tokens` and introduce system/multi-turn history. Export each comparison. Do not assume thinking control is broken without evidence.
4. Load **1.7B / 1,024 context** after exporting the 0.6B control; run the same probe and only then a chat turn. The context setting is WebLLM's documented `chatOpts.context_window_size` override at load, not a promise of lower total process memory. For a matched model-to-model test, set context identically on both models.
5. Do not auto-attempt 8B after a reload. Retry no failing configuration repeatedly. If the tab resets, reopen the same Chat page and export its restored pending checkpoint before attempting another load.

`website/chat.html` retains Chat / Request JSON / Results tabs, editable OpenAI-compatible request fields, single model residency, one worker, interrupt and force-terminate controls, bounded raw chunk samples, local-only session checkpoints before awaited inference, and exportable per-turn metrics. Model weights download only after a user tap. `localStorage` persists the checkpoint and may contain prompts; exporting and clearing browser site data is the user's control over retention. The legacy 0.1.1 Chat session is deliberately not auto-restored into 0.2.0, to avoid silently replaying old generation settings.

## Competing explanations and what differentiates them

- **Request-shape regression:** 0.6B known-good probe works but 0.6B Chat fails when a single field is changed. Compare raw JSON exports; do not label that field causal until reproducible.
- **Context/KV-cache or peak-memory pressure:** same 1.7B request fails with catalog context but succeeds at 1,024 or 512. A browser tab reset alone is not an OOM diagnosis; model-load completion is not inference completion.
- **WebLLM GPU/runtime regression:** upstream issue [mlc-ai/web-llm#844](https://github.com/mlc-ai/web-llm/issues/844) reports a shape-cache disposal problem affecting Qwen3 1.7B prefill in WebLLM >=0.2.83 on a different GPU/backend. It is a diagnostic lead, not a demonstrated iPhone cause. Test a pinned runtime-version control only after the same-model/request/context experiments above.
- **UI/worker lifecycle:** the 0.2.0 mocked end-to-end test exercises event handlers, model loads, probe, poetry chat, checkpoints, and 1.7B context override. Browser GPU execution, physical memory and Safari tab-lifecycle failure remain unvalidated.

Upstream references: [WebLLM v0.2.85 model catalog](https://github.com/mlc-ai/web-llm/blob/v0.2.85/src/config.ts), [generation example](https://github.com/mlc-ai/web-llm/blob/v0.2.85/examples/qwen3/src/qwen3_example.ts), [API / context overrides](https://webllm.mlc.ai/docs/user/api_reference.html). Keep the two-folder repository structure and change the active `website/chat.html` in place.
