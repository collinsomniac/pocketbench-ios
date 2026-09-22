/** Pure browser-inference protocol, no browser globals at import time. */
export const APP_VERSION='1.3.0';
export const WLLAMA_VERSION='3.6.1';
export const RUNTIME_URL=`https://cdn.jsdelivr.net/npm/@wllama/wllama@${WLLAMA_VERSION}/esm/index.js`;
export const WASM_URL=`https://cdn.jsdelivr.net/npm/@wllama/wllama@${WLLAMA_VERSION}/src/wasm/wllama.wasm`;
export const COMPAT_VERSION=WLLAMA_VERSION;
export const COMPAT_WASM_URL=`https://cdn.jsdelivr.net/npm/@wllama/wllama-compat@${COMPAT_VERSION}/wasm/wllama.wasm`;
export const COMPAT_WORKER_URL=`https://cdn.jsdelivr.net/npm/@wllama/wllama-compat@${COMPAT_VERSION}/wasm/wllama.js`;
export const STORAGE_KEY='pocketbench-wllama-last-v1';
/** Exact filenames checked against live Hugging Face repository file trees on 2026-09-22. */
export const MODELS=Object.freeze({
  smol:{label:'SmolLM2 135M · Q4_K_M · approx. 105 MB',url:'https://huggingface.co/QuantFactory/SmolLM2-135M-Instruct-GGUF/resolve/main/SmolLM2-135M-Instruct.Q4_K_M.gguf',approxDownloadMB:105},
  qwen:{label:'Qwen3 0.6B · Q4_K_M · approx. 484 MB',url:'https://huggingface.co/gvij/qwen3-0.6b-gguf/resolve/main/qwen3-0.6b-q4_k_m.gguf',approxDownloadMB:484},
  local:{label:'Your GGUF file(s) from Files · no remote model download',url:null,approxDownloadMB:null}
});
export function validateChoice({model,offload,context,files=[]}){
  if(!Object.hasOwn(MODELS,model))throw Error('Unknown model');
  if(![0,4,999].includes(Number(offload)))throw Error('Choose 0, 4 or 999 GPU layers');
  if(![512,1024,2048].includes(Number(context)))throw Error('Unsupported context option');
  if(model==='local'&&!files.length)throw Error('Choose at least one .gguf file');
  if(model==='local'&&Array.from(files).some(f=>!f.name?.toLowerCase().endsWith('.gguf')))throw Error('Only .gguf files are accepted');
  return {model,offload:Number(offload),context:Number(context),remoteModelURL:MODELS[model].url,remoteDownloadEstimateMB:MODELS[model].approxDownloadMB,localFiles:model==='local'?Array.from(files).map(f=>({name:f.name,size:f.size})):[]};
}
export function usageFields(usage){return {promptTokens:Number.isFinite(usage?.prompt_tokens)?usage.prompt_tokens:null,completionTokens:Number.isFinite(usage?.completion_tokens)?usage.completion_tokens:null,raw:usage??null};}
export function resultMetrics({start,firstText,end,usage,output,chunks,mode}){
  const u=usageFields(usage),wallMs=end-start,firstTextMs=firstText===null?null:firstText-start;
  return {mode,wallMs,firstTextMs,completionTokens:u.completionTokens,promptTokens:u.promptTokens,
    endToEndReportedTokensPerSecond:u.completionTokens!==null&&wallMs>0?u.completionTokens*1000/wallMs:null,
    approximatePostFirstTextTokensPerSecond:u.completionTokens!==null&&u.completionTokens>1&&firstText!==null&&end>firstText?(u.completionTokens-1)*1000/(end-firstText):null,
    outputCharacters:output.length,outputPreview:output.slice(0,320),streamChunks:chunks,
    usageDiscrepancy:output.length>0&&u.completionTokens===0,usageRaw:u.raw};
}
export function incomplete(previous){return !!previous&&['importing','loading','inference','unloading'].includes(previous.phase)&&!previous.finishedAt;}
export function saveCheckpoint(storage,report){storage.setItem(STORAGE_KEY,JSON.stringify(report));}
/** HEAD checks never fetch model weights. Failed HEAD due to CORS is not proof GET fails. */
export async function headProbe(url, fetcher=fetch) {
 const start=Date.now();
 try {
  const res=await fetcher(url,{method:'HEAD',mode:'cors',cache:'no-store',redirect:'follow'});
  return {url,reachable:res.ok,status:res.status,contentType:res.headers?.get?.('content-type')??null,contentLength:res.headers?.get?.('content-length')??null,elapsedMs:Date.now()-start};
 } catch(e) { return {url,reachable:null,headError:String(e?.message??e),elapsedMs:Date.now()-start,note:'HEAD/CORS/network failure; GET availability not established'}; }
}
export function classOfImportError(error) {
 const text=String(error?.message??error);
 if(/404|not found|failed to fetch dynamically imported module|importing a module script failed/i.test(text))return 'module-fetch-or-version';
 if(/resolve module specifier|bare specifier|not a valid URL/i.test(text))return 'module-dependency-resolution';
 if(/CORS|cross.origin|MIME|content.type/i.test(text))return 'module-cors-or-mime';
 return 'module-import-other';
}
