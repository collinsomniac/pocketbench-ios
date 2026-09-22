# Independent GGUF import repair — 2026-09-21

## Confirmed source defect

The first `ai-wllama.html` release pinned `@wllama/wllama@3.7.0` for both `/esm/index.js` and `/src/wasm/wllama.wasm`; its Safari compatibility helper would also seek matching 3.7.0 assets. The GitHub development tree said 3.7.0, but publicly indexed npm listings for the runtime and `@wllama/wllama-compat` show **3.6.1** as the published version when checked. This is a verified invalid **assumption about release availability**, not an independently captured Safari network error: we have not received the user's exception JSON or iOS network trace. Model GGUF URLs were checked against model repository listings; the release mismatch precedes model-specific inference.

## Repair v1.1.0

Pin the runtime and Safari compatibility package to the same published 3.6.1; retain upstream CDN artifact paths and `setCompat('default')`. Cache-bust both local JS module references. The model and inference algorithms are unchanged. Add **Check runtime (no model download)**: four independent HTTP HEAD probes for runtime JS, default Wasm, Safari compat Wasm and Safari compat worker, followed by a real `import()` and constructor export check. Preflight persists version, URLs, HTTP status/content type, completion stage and errors in the same crash-recovery JSON. HEAD requests are diagnostic only; HEAD/CORS failure does not establish whether the runtime could fetch the asset via GET. In particular, a passing `import()` does not validate Wasm execution, model download, GPU offload, or first inference.

## Remaining validation

The repository unit tests and mocked engine integration passed. The actual mobile CDN import, Safari compatibility execution, model downloads, and inference are **not yet validated** by this change; external internet access from the local test container is blocked and GitHub Pages could not be verified from the web tool. Do not record a fix as successful until the phone exports a passing preflight and at least one completed GGUF inference.

Test order: open `ai-wllama.html` in Safari, verify the page mentions **wllama 3.6.1**, run **Check runtime (no model download)** and export JSON. If import succeeds, select SmolLM2 → CPU-only → 1,024 context → Load and run one-token inference; then Qwen CPU-only only after small-model success. If preflight shows a HEAD 404 or fails at `runtime-import-before-await`, export without downloading weights. If model import fails after `runtime-import-completed`, capture the `model-load-before-await` checkpoint and full error to isolate Wasm, worker, model network, OPFS, or allocation issues. Never infer an iOS process-kill reason from JavaScript evidence alone.

References: https://www.npmjs.com/package/@wllama/wllama and https://www.npmjs.com/package/@wllama/wllama-compat ; https://github.com/ngxson/wllama/blob/master/compat/README.md
