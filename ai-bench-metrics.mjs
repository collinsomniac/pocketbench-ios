/** Pure metric accounting. No token count is inferred from text length or stream chunks. */
export const LIBRARY_VERSION='0.2.85';
export const LIBRARY_URL=`https://esm.run/@mlc-ai/web-llm@${LIBRARY_VERSION}`;
export const CANDIDATES=[
 {id:'SmolLM2-135M-Instruct-q0f16-MLC',paramsB:0.135},
 {id:'Qwen3-0.6B-q4f16_1-MLC',paramsB:0.6},
 {id:'Qwen3.5-0.8B-q4f16_1-MLC',paramsB:0.8},
 {id:'Llama-3.2-1B-Instruct-q4f16_1-MLC',paramsB:1},
 {id:'Qwen3-1.7B-q4f16_1-MLC',paramsB:1.7},
 {id:'Qwen3.5-2B-q4f16_1-MLC',paramsB:2},
 {id:'Qwen2.5-3B-Instruct-q4f16_1-MLC',paramsB:3}
];
export const PROMPTS={
 short:'Answer directly, without reasoning traces. Write a numbered list of 40 different simple English nouns, separated by commas. Do not stop after the first ten.',
 medium:'Read the following dataset. Summarize the trends in 60 to 90 words, then give three numbered actionable conclusions. Data: '+Array.from({length:45},(_,i)=>`Month ${i+1}: requests ${1000+(i*43)%830}, errors ${9+(i*7)%27}, active users ${350+(i*17)%270}.`).join(' '),
 long:'Read the following synthetic event records and summarize the trends in 75 to 100 words, mentioning at least four distinct observations. '+Array.from({length:140},(_,i)=>`Record ${i+1}: day ${i%28+1}, category ${['alpha','beta','gamma','delta'][i%4]}, latency ${31+(i*19)%211} ms, count ${60+(i*13)%190}.`).join(' ')
};
export const now=()=>performance.now();
export function percentiles(values){const a=values.filter(Number.isFinite).sort((x,y)=>x-y);if(!a.length)return null;const p=q=>{const v=(a.length-1)*q,i=Math.floor(v),f=v-i;return a[i]*(1-f)+a[Math.min(i+1,a.length-1)]*f;};return {n:a.length,median:p(.5),p10:p(.1),p90:p(.9),p95:p(.95),min:a[0],max:a[a.length-1]};}
export function normalizeUsage(raw){const u=raw||{},e=u.extra||{};return {promptTokens:Number.isFinite(u.prompt_tokens)?u.prompt_tokens:null,completionTokens:Number.isFinite(u.completion_tokens)?u.completion_tokens:null,modelPrefillTokensPerSecond:Number.isFinite(e.prefill_tokens_per_s)?e.prefill_tokens_per_s:null,modelDecodeTokensPerSecond:Number.isFinite(e.decode_tokens_per_s)?e.decode_tokens_per_s:null,modelTTFTSeconds:Number.isFinite(e.ttft_s)?e.ttft_s:null,raw:u};}
export function finishMeasurement({start,firstVisible,end,chunkCount,usage,text}){const u=normalizeUsage(usage),ms=end-start,ttft=firstVisible==null?null:firstVisible-start,decodeMs=firstVisible==null?null:end-firstVisible;
 return {wallMs:ms,timeToFirstVisibleTextMs:ttft,postFirstVisibleMs:decodeMs,streamChunksWithText:chunkCount,usage:u,
   approximateDecodeTokensPerSecond:u.completionTokens!=null&&u.completionTokens>1&&decodeMs>0?(u.completionTokens-1)*1000/decodeMs:null,
   endToEndTokensPerSecond:u.completionTokens!=null&&ms>0?u.completionTokens*1000/ms:null,
   outputCharacters:text.length,outputPreview:text.slice(0,240),emptyOutput:!text.trim()};}
export function summary(runs){const ok=runs.filter(r=>r.status==='completed');return {completed:ok.length,failed:runs.length-ok.length,medianTTFTMs:percentiles(ok.map(r=>r.metrics.timeToFirstVisibleTextMs)),medianDecodeTokensPerSecond:percentiles(ok.map(r=>r.metrics.usage.modelDecodeTokensPerSecond??r.metrics.approximateDecodeTokensPerSecond)),medianEndToEndTokensPerSecond:percentiles(ok.map(r=>r.metrics.endToEndTokensPerSecond))};}
export function modelCatalog(catalog){return CANDIDATES.map(c=>{const m=catalog.find(x=>x.model_id===c.id);return {...c,available:!!m,estimatedRuntimeMemoryMB:m?.vram_required_MB??null,requiredFeatures:m?.required_features??[],modelURL:m?.model??null};});}
export async function captureEnvironment(){const info={userAgent:navigator.userAgent,platform:navigator.platform??null,devicePixelRatio:devicePixelRatio,screen:{width:screen.width,height:screen.height},viewport:{width:innerWidth,height:innerHeight},hardwareConcurrency:navigator.hardwareConcurrency??null,deviceMemoryGB:navigator.deviceMemory??null,crossOriginIsolated:crossOriginIsolated,sharedArrayBuffer:typeof SharedArrayBuffer!=='undefined',webgpu:!!navigator.gpu,webnn:!!navigator.ml,wasm:typeof WebAssembly!=='undefined',timestamp:new Date().toISOString(),visibility:document.visibilityState};
 try{const s=await navigator.storage?.estimate?.();info.storageEstimate=s?{usageBytes:s.usage??null,quotaBytes:s.quota??null}:null;}catch(e){info.storageEstimateError=String(e);}
 if(navigator.gpu)try{const a=await navigator.gpu.requestAdapter();info.adapter=a?{info:{vendor:a.info?.vendor??null,architecture:a.info?.architecture??null,device:a.info?.device??null},features:Array.from(a.features),limits:{maxBufferSize:a.limits.maxBufferSize,maxStorageBufferBindingSize:a.limits.maxStorageBufferBindingSize,maxComputeWorkgroupStorageSize:a.limits.maxComputeWorkgroupStorageSize}}:null;}catch(e){info.adapterError=String(e);}return info;}
