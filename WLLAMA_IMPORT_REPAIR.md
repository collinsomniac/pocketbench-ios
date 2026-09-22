# PocketBench GGUF loader: verified import, fixed stale model catalog (September 21–22, 2026)

## Phone evidence — actual failure

User-exported `pocketbench-wllama-2026-09-22T06-42-51-624Z.json`, version 1.2.0: wllama 3.6.1 constructor completed; explicit Safari compatibility configuration completed; `modelManager.getModels({includeInvalid:true})` returned an empty inventory. The CPU-only SmolLM2 135M Q4_K_M, context 1024, then failed during model fetch with **HTTP 404**, within approximately 353 ms of model-load invocation. Actual error: `Failed to fetch https://huggingface.co/tensorblock/SmolLM2-135M-Instruct-GGUF/resolve/main/SmolLM2-135M-Instruct-Q4_K_M.gguf: HTTP 404`. No GGUF weights, Wasm model execution, or inference occurred in this report. The report alone does not establish browser memory or GPU compatibility.

**Root cause:** The TensorBlock repository model card still describes Q4_K_M, but its current **actual Files tree only contains Q2_K and Q3_K_M**. Our catalog trusted a descriptive model-card table without checking a published artifact path. This supersedes our earlier claim that the selected Q4 filename was independently listed in that repository; it is **not listed in its current tree**. The earlier wllama 3.7.0 CDN-version mismatch was a separate defect, resolved by switching to published 3.6.1; the current report verifies import but fails on an unrelated GGUF URL.

## Catalog hotfix 1.3.0

- SmolLM2 Q4_K_M now points to the exact 105 MB file in `QuantFactory/SmolLM2-135M-Instruct-GGUF`: `SmolLM2-135M-Instruct.Q4_K_M.gguf` (note **period** before the quantization name). Verified in the repository's current Files tree and its individual file page.
- Qwen3 0.6B Q4_K_M now points to the exact 484 MB file in `gvij/qwen3-0.6b-gguf`: `qwen3-0.6b-q4_k_m.gguf` (lowercase filename). This changes quantization publisher; it is not an identical binary to the former, unverified Qwen path or the WebLLM artifact. Corrected the previously understated 397 MB estimate to 484 MB. Qwen has **not** been loaded in a browser in this round.
- The HTML and JS module versions were advanced to 1.3.0; the loader imports the 1.3.0 catalog. Runtime remains wllama 3.6.1. A remote model's explicit HTTP 404 or 410 HEAD is now reported and **stops before downloading weights or initializing the inference worker**. A HEAD denied by CORS or an otherwise inconclusive status is recorded but does not automatically veto GET.
- `tests/ai-wllama.mjs` pins the exact reviewed URLs. `tests/ai-wllama-repair.mjs` injects a 404 and checks that no model download occurs. `tools/check-model-catalog.mjs` can compare filenames and sizes against the **actual Hugging Face repository tree** without downloading model bytes: `POCKETBENCH_VERIFY_HF=1 node tools/check-model-catalog.mjs`. This live check is opt-in, appropriate for a release check rather than continuous polling.

## Next real-device test

Open `ai-wllama.html` and verify **catalog hotfix 1.3.0** and **Build 1.3.0**. Export the restored prior report first. Select SmolLM2, CPU-only Wasm, 1024 context. Run **Check model URL & browser storage (no weights download)**; the model HEAD should no longer be a 404, but HEAD/CORS differences and network errors remain possible. If it succeeds, explicitly load SmolLM2 once and attempt one token, then 64 tokens; export each report. Only after this control works should we try the 484 MB Qwen GGUF (CPU-only first). Do not auto-retry a crashed browser tab.

## Verification limits

Hugging Face's current file-tree pages establish that the new artifact paths exist, **not** that the device's GET/CORS, OPFS capacity, Wasm worker startup, loading, or inference works. Container network DNS cannot reach Hugging Face, so HTTP HEAD could not be independently confirmed here. Local test mocks do not establish real browser operation. The user phone is the required end-to-end execution check. A tab reload is not an iOS OOM diagnosis.

Sources: [SmolLM2 file](https://huggingface.co/QuantFactory/SmolLM2-135M-Instruct-GGUF/blob/main/SmolLM2-135M-Instruct.Q4_K_M.gguf), [Qwen GGUF file](https://huggingface.co/gvij/qwen3-0.6b-gguf/blob/main/qwen3-0.6b-q4_k_m.gguf), [retired TensorBlock file tree](https://huggingface.co/tensorblock/SmolLM2-135M-Instruct-GGUF/tree/main), [wllama model manager](https://github.com/ngxson/wllama/blob/3.6.1/src/model-manager.ts).
