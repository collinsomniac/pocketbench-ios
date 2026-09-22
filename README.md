# PocketBench

A lean, client-side browser performance laboratory. **Two directories:** [`website/`](website/) holds the site, its experiment routes and their runtime assets; [`skills/`](skills/) holds the agent skill, field guides, measured evidence and known issues.

**Live website:** https://collinsomniac.github.io/pocketbench-ios/ (a tiny root `index.html` redirects to `website/` because GitHub Pages previously served the branch root).

**Routes:** `website/chat.html` browser-local WebLLM chat with three Qwen sizes and editable request JSON (new; phone UI not yet tested); `website/gpu.html` interactive WebGPU particles; `website/throughput.html` uncapped GPU-queue-completed work; `website/ai.html` working WebLLM diagnostic; `website/gguf.html` experimental GGUF loader (inference not yet verified on iPhone).

The pre-cleanup research and retired pages remain on branch [`archive/pre-two-folder-cleanup-2026-09-22`](https://github.com/collinsomniac/pocketbench-ios/tree/archive/pre-two-folder-cleanup-2026-09-22). Latest measured results and limitations: [`skills/EVIDENCE.md`](skills/EVIDENCE.md). Chat and runtime comparison protocol: [`skills/CHAT_LAB.md`](skills/CHAT_LAB.md). No automatic model-weight downloads and no cloud inference service.
