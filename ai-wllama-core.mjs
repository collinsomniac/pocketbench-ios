/** Pure browser-inference protocol, no browser globals at import time. */
export const APP_VERSION='1.0.0';
export const WLLAMA_VERSION='3.7.0';
export const RUNTIME_URL=`https://cdn.jsdelivr.net/npm/@wllama/wllama@${WLLAMA_VERSION}/esm/index.js`;
export const WASM_URL=`https://cdn.jsdelivr.net/npm/@wllama/wllama@${WLLAMA_VERSION}/src/wasm/wllama.wasm`;
export const STORAGE_KEY='pocketbench-wllama-last-v1';
export const MODELS=Object.freeze({
  smol:{label:'SmolLM2 135M · Q4_K_M · approx. 105 MB',url:'https://huggingface.co/tensorblock/SmolLM2-135M-Instruct-GGUF/resolve/main/SmolLM2-135M-Instruct-Q4_K_M.gguf',approxDownloadMB:105},
  qwen:{label:'Qwen3 0.6B · Q4_K_M · approx. 397 MB',url:'https://huggingface.co/Qwen/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q4_K_M.gguf',approxDownloadMB:397},
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
