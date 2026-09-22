# PocketBench

A lean, client-side browser performance laboratory. **Two directories:** [`website/`](website/) holds the website, its four benchmark routes and their runtime assets; [`skills/`](skills/) holds the agent skill, field guides, measured evidence and known issues.

**Live website:** https://collinsomniac.github.io/pocketbench-ios/ (the tiny root `index.html` redirects into `website/` because GitHub Pages previously used the branch root).

**Routes:** `website/gpu.html` interactive WebGPU particles; `website/throughput.html` uncapped queue-completed GPU workload; `website/ai.html` working small-model WebLLM diagnostic; `website/gguf.html` experimental GGUF loader, not verified to finish loading on iPhone.

The large pre-cleanup research and all retired pages are recoverable on branch [`archive/pre-two-folder-cleanup-2026-09-22`](https://github.com/collinsomniac/pocketbench-ios/tree/archive/pre-two-folder-cleanup-2026-09-22). Historical results and limitations are summarized in [`skills/EVIDENCE.md`](skills/EVIDENCE.md). No automatic model-weight downloads.
