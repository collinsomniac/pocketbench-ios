import assert from 'node:assert/strict';
import {APP_VERSION,WLLAMA_VERSION,RUNTIME_URL,WASM_URL,COMPAT_WASM_URL,COMPAT_WORKER_URL,headProbe,classOfImportError} from '../ai-wllama-core.mjs';
assert.equal(APP_VERSION,'1.3.0');assert.equal(WLLAMA_VERSION,'3.6.1');
for (const url of [RUNTIME_URL,WASM_URL,COMPAT_WASM_URL,COMPAT_WORKER_URL]) {assert(url.includes('@3.6.1/'));assert(!url.includes('@3.7.0/'));}
let observed;
const ok=await headProbe(RUNTIME_URL,async (url,options)=>{observed={url,options};return {ok:true,status:200,headers:{get:k=>k==='content-type'?'application/javascript':null}};});
assert.equal(observed.options.method,'HEAD');assert.equal(ok.reachable,true);assert.equal(ok.status,200);
const failed=await headProbe(RUNTIME_URL,async()=>{throw Error('Blocked by CORS');});
assert.equal(failed.reachable,null);assert.match(failed.headError,/Blocked by CORS/);
assert.equal(classOfImportError(Error('404 Not Found')),'module-fetch-or-version');
assert.equal(classOfImportError(Error('Failed to resolve module specifier')),'module-dependency-resolution');
assert.equal(classOfImportError(Error('MIME type is not executable')),'module-cors-or-mime');
const html=(await import('node:fs/promises')).readFile;const page=await html(new URL('../ai-wllama.html',import.meta.url),'utf8');
assert(page.includes('id="check"'));assert(page.includes('id="preflight"'));assert(page.includes('ai-wllama-repair.mjs?v=1.3.0'));assert(page.includes('catalog hotfix 1.3.0'));assert(page.includes('approximately 484 MB'));
console.log('PASS: published-version parity, optional HEAD probes, error classification, catalog-hotfix UI');
