import {APP_VERSION,WLLAMA_VERSION,RUNTIME_URL,WASM_URL,COMPAT_WASM_URL,COMPAT_WORKER_URL,STORAGE_KEY,MODELS,validateChoice,resultMetrics,incomplete,headProbe} from './ai-wllama-core.mjs?v=1.1.0';
const $=id=>document.getElementById(id),now=()=>new Date().toISOString(),clock=()=>performance.now();
const BUILD='1.2.0';let Runtime=null,engine=null,loaded=null,busy=false,report=null;
const detail=e=>({name:String(e?.name||'Error'),message:String(e?.message??e),type:e?.type??null,cause:e?.cause?String(e.cause?.message??e.cause):null,stack:String(e?.stack||'').slice(0,5000)});
const readable=e=>{const d=detail(e);return `${d.name}: ${d.message}${d.cause?' | cause: '+d.cause:''}${d.stack?'\n'+d.stack:''}`;};
function save(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(report));}catch(e){$('previous').textContent='WARNING: cannot persist crash checkpoint: '+detail(e).message;}}
function render(){if(!report)return;$('events').textContent=report.events.slice(-18).map(x=>`${x.at.slice(11,19)} ${x.stage}${x.message?' — '+x.message:''}`).join('\n');}
function mark(stage,props={}){if(!report)return;report.stage=stage;report.events.push({at:now(),stage,...props});if(report.events.length>150)report.events.shift();save();render();}
function status(s){$('status').textContent=s;}
function controls(){const ready=!!loaded&&!busy;for(const id of ['load','check','model','offload','context','files','storageCheck'])$(id).disabled=busy;$('one').disabled=!ready;$('sixtyfour').disabled=!ready;$('release').disabled=busy||!engine;}
function fresh(config,phase='loading'){return {app:'PocketBench independent GGUF inference',version:BUILD,runtime:{name:'wllama',version:WLLAMA_VERSION,module:RUNTIME_URL,wasm:WASM_URL,compatWasm:COMPAT_WASM_URL,compatWorker:COMPAT_WORKER_URL},startedAt:now(),finishedAt:null,phase,stage:'created',config,environment:{userAgent:navigator.userAgent,webgpu:!!navigator.gpu,wasm:!!globalThis.WebAssembly,crossOriginIsolated:globalThis.crossOriginIsolated??null,hardwareConcurrency:navigator.hardwareConcurrency??null,storageDirectoryAPI:typeof navigator.storage?.getDirectory==='function',url:location.href},events:[],checks:[],results:[],errors:[],load:null,methodology:'v1.2.0 error message + cause + stack, model HEAD and OPFS write/read/remove probes, explicit Safari compat assets, independent load stages. HEAD does not establish GET, cache success does not establish Wasm or inference. No automatic model download or retries.'};}
function failure(stage,e){const info=detail(e);report.errors.push({at:now(),stage,...info});report.phase='failed';report.finishedAt=now();mark(stage+'-failed',{message:info.message,name:info.name});status(`${stage} failed — ${info.name}: ${info.message}${info.cause?' | cause: '+info.cause:''}. Export JSON for complete stack.`);}
async function getRuntime(){if(Runtime)return Runtime;mark('runtime-import-before-await',{url:RUNTIME_URL});const m=await import(RUNTIME_URL);if(typeof m.Wllama!=='function')throw Error('Imported module has no Wllama constructor');Runtime=m.Wllama;mark('runtime-import-completed');return Runtime;}
async function assetCheck(name,url){mark('head-before-await',{name,url});const result={name,...await headProbe(url)};report.checks.push(result);mark('head-completed',{name,status:result.status??null,reachable:result.reachable,message:result.headError??null});return result;}
async function storageCheck(){
 const r={name:'opfs-roundtrip',supported:typeof navigator.storage?.getDirectory==='function',startedAt:now()};report.checks.push(r);
 if(!r.supported){r.error='navigator.storage.getDirectory absent';mark('storage-unavailable',{message:r.error});return r;}
 const key='pocketbench-probe-'+Math.random().toString(36).slice(2);let root;
 try{mark('storage-open-before-await');root=await navigator.storage.getDirectory();mark('storage-write-before-await');const handle=await root.getFileHandle(key,{create:true});const writable=await handle.createWritable();await writable.write(new Uint8Array([71,71,85,70]));await writable.close();mark('storage-read-before-await');const bytes=new Uint8Array(await (await handle.getFile()).arrayBuffer());r.ok=bytes.length===4&&bytes[0]===71&&bytes[3]===70;r.bytes=Array.from(bytes);if(!r.ok)throw Error('OPFS readback mismatch');mark('storage-roundtrip-completed',{bytes:bytes.length});}
 catch(e){Object.assign(r,{ok:false,error:detail(e)});mark('storage-probe-failed',{message:detail(e).message});}
 finally{if(root)try{await root.removeEntry(key);r.cleaned=true;}catch(e){r.cleanupError=detail(e).message;}}
 return r;
}
function chosen(){return validateChoice({model:$('model').value,offload:$('offload').value,context:$('context').value,files:$('files').files});}
async function preflight(modelToo=false){if(busy)return;let config;try{config=chosen();}catch(e){status(readable(e));return;}busy=true;report=fresh({preflightOnly:true,selectedModel:config.model},'preflight');controls();mark('preflight-start');try{
  const assets=[['runtime-js',RUNTIME_URL],['default-wasm',WASM_URL],['compat-wasm',COMPAT_WASM_URL],['compat-worker',COMPAT_WORKER_URL]];
  for(const [name,url] of assets)await assetCheck(name,url);
  await getRuntime();
  if(modelToo){if(config.remoteModelURL)await assetCheck('selected-model-HEAD',config.remoteModelURL);await storageCheck();}
  report.phase='preflight-completed';report.finishedAt=now();mark('preflight-completed');
  $('preflight').textContent=report.checks.map(c=>`${c.name}: ${c.ok===true?'OPFS PASS':c.ok===false?'OPFS FAIL':c.status?'HTTP '+c.status:'HEAD unavailable'} ${c.contentType??''}${c.headError?' '+c.headError:''}${c.error?' '+(typeof c.error==='string'?c.error:c.error.message):''}`).join('\n')+'\nRuntime import passed. No model weights downloaded.';
  status(modelToo?'Model URL and storage diagnostic complete. Export JSON; HEAD/storage success does not prove model load.':'Runtime imported. Asset HEAD only; use Check model & storage next.');
 }catch(e){failure('preflight',e);}finally{busy=false;controls();}}
$('check').onclick=()=>preflight(false);
const probeButton=document.createElement('button');probeButton.id='storageCheck';probeButton.className='secondary';probeButton.textContent='Check model URL & browser storage (no weights download)';$('check').insertAdjacentElement('afterend',probeButton);probeButton.onclick=()=>preflight(true);
async function release(log=true){if(!engine)return;const old=engine;engine=null;loaded=null;if(log)mark('engine-exit-before-await');try{await old.exit();if(log)mark('engine-exit-completed');}catch(e){if(log)mark('engine-exit-error',{message:detail(e).message});}controls();}
$('load').onclick=async()=>{if(busy)return;let c;try{c=chosen();}catch(e){status(readable(e));return;}busy=true;controls();await release(false);report=fresh(c);mark('load-start',{model:c.model,offload:c.offload,context:c.context});try{
  const C=await getRuntime();mark('runtime-constructor-before-await');engine=new C({default:WASM_URL});mark('runtime-constructor-completed');
  engine.setCompat({wasm:COMPAT_WASM_URL,worker:COMPAT_WORKER_URL});mark('explicit-safari-compat-set',{wasm:COMPAT_WASM_URL,worker:COMPAT_WORKER_URL});
  mark('cache-inventory-before-await');const entries=await engine.modelManager.getModels({includeInvalid:true});mark('cache-inventory-completed',{entries:entries.length,models:entries.map(x=>({url:x.url,size:x.size})).slice(0,8)});
  const opt={n_gpu_layers:c.offload,n_ctx:c.context,n_threads:1,progressCallback:({loaded,total})=>{if(total>0&&loaded>=0)status(`Model download: ${Math.round(100*loaded/total)}% (library-reported)`);}};
  mark('model-load-before-await',{url:c.remoteModelURL??'local-file',strategy:c.model==='local'?'local-files':'wllama-cache-and-fetch'});const start=clock();
  if(c.model==='local')await engine.loadModel(Array.from($('files').files),opt);else await engine.loadModelFromUrl(c.remoteModelURL,opt);
  loaded=c;report.load={wallMs:clock()-start};report.phase='ready';mark('model-ready',{wallMs:Math.round(report.load.wallMs)});status('Model loaded. Run 1-token inference, then 64 tokens. Export results.');
 }catch(e){failure(report.stage,e);await release(false);}finally{busy=false;controls();}};
async function infer(tokens,stream){if(busy||!engine||!loaded)return;busy=true;controls();report.phase='inference';report.finishedAt=null;mark('request-before-await',{tokens,stream});status(`Running ${tokens}-token ${stream?'stream':'nonstream'} request…`);const start=clock();let firstText=null,output='',chunks=0,usage=null;
 const req={messages:[{role:'user',content:'Write a short list of common English nouns separated by spaces. Answer directly.'}],max_tokens:tokens,temperature:0,stream};
 try{if(stream){const iterator=await engine.createChatCompletion(req);mark('stream-created');for await(const chunk of iterator){chunks++;const text=chunk.choices?.[0]?.delta?.content??'';if(text){if(firstText===null){firstText=clock();mark('first-text',{elapsedMs:Math.round(firstText-start)});}output+=text;}if(chunk.usage)usage=chunk.usage;}}
 else{const result=await engine.createChatCompletion(req);mark('response-received');output=result.choices?.[0]?.message?.content??'';usage=result.usage??null;if(output)firstText=clock();}
 const metrics=resultMetrics({start,firstText,end:clock(),usage,output,chunks,mode:stream?'stream':'nonstream'});report.results.push({status:'completed',tokensRequested:tokens,metrics});report.phase='completed';report.finishedAt=now();mark('inference-completed',{tokens,wallMs:Math.round(metrics.wallMs)});$('output').textContent=output||'(Empty output)';status(`Completed ${tokens}-token probe in ${Math.round(metrics.wallMs)} ms. Export JSON.`);
 }catch(e){failure('inference',e);}finally{busy=false;controls();}}
$('one').onclick=()=>infer(1,false);$('sixtyfour').onclick=()=>infer(64,true);
$('release').onclick=async()=>{if(busy)return;busy=true;controls();if(report){report.phase='unloading';mark('unload-requested');}await release();if(report){report.phase='released';report.finishedAt=now();mark('released');}status('Model released.');busy=false;controls();};
const json=()=>JSON.stringify(report??{app:'PocketBench independent GGUF inference',status:'no report'},null,2),filename=()=>`pocketbench-wllama-${now().replace(/[:.]/g,'-')}.json`;
$('save').onclick=()=>{const u=URL.createObjectURL(new Blob([json()],{type:'application/json'})),a=document.createElement('a');a.href=u;a.download=filename();a.click();setTimeout(()=>URL.revokeObjectURL(u),10000);};
$('share').onclick=async()=>{const f=new File([json()],filename(),{type:'application/json'});try{if(navigator.canShare?.({files:[f]}))await navigator.share({files:[f],title:'PocketBench inference diagnostic'});else $('save').click();}catch(e){if(e.name!=='AbortError')status(`Share unavailable: ${detail(e).message}; use Save JSON.`);}};
window.addEventListener('error',e=>{if(report){report.errors.push({stage:'window-error',...detail(e.error??e.message)});mark('window-error',{message:e.message});}});
window.addEventListener('unhandledrejection',e=>{if(report){const d=detail(e.reason);report.errors.push({stage:'unhandled-rejection',...d});mark('unhandled-rejection',{message:d.message});}});
try{const s=localStorage.getItem(STORAGE_KEY);if(s){report=JSON.parse(s);render();$('previous').textContent=incomplete(report)?`Previous interrupted run: ${report.phase} / ${report.stage}. Export before rerunning.`:`Saved report: ${report.phase}; export before overwriting.`;}}catch(e){$('previous').textContent='Prior report could not be read: '+detail(e).message;}
$('capabilities').textContent=`Build ${BUILD} · WebGPU: ${navigator.gpu?'yes':'no'} · Wasm: ${globalThis.WebAssembly?'yes':'no'} · cross-origin isolated: ${globalThis.crossOriginIsolated??'unknown'} · OPFS API: ${typeof navigator.storage?.getDirectory==='function'?'yes':'no'} · hardwareConcurrency hint: ${navigator.hardwareConcurrency??'unknown'}.`;
const lead=document.querySelector('body > p');if(lead)lead.textContent=`Experimental wllama ${WLLAMA_VERSION} · repair ${BUILD}. The runtime and selected model load only after your tap. Test model URL and writable browser storage separately before downloading weights.`;
controls();