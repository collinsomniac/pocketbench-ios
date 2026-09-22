import {CHECKPOINT_KEY,PROBES,checkpoint,restored,interrupted,oneInference} from './ai-diagnose-core.mjs';
import {LIBRARY_URL,LIBRARY_VERSION} from './ai-bench-metrics.mjs';
const $=x=>document.getElementById(x),clock=()=>performance.now();
const candidates=['SmolLM2-135M-Instruct-q0f16-MLC','SmolLM2-360M-Instruct-q4f16_1-MLC','Qwen3-0.6B-q4f16_1-MLC'];
let runtime=null,engine=null,worker=null,loaded=null,busy=false,report=null;
function error(e){return String(e?.stack||e);}
function persist(){try{checkpoint(localStorage,report);}catch(e){$('previous').textContent='Storage write failed: '+error(e)+'; crash recovery may not work.';}}
function mark(stage,extra={}){if(!report)return;report.stage=stage;report.events.push({at:new Date().toISOString(),stage,...extra});if(report.events.length>120)report.events.shift();persist();render();}
function render(){if(!report)return;$('events').textContent=report.events.slice(-18).map(x=>`${x.at.slice(11,19)}  ${x.stage}${x.error?' — '+x.error:''}`).join('\n');$('events').scrollTop=$('events').scrollHeight;}
function status(x){$('status').textContent=x;}
function controls(){const ok=!!runtime&&!busy;$('load').disabled=!ok;$('model').disabled=!ok;$('path').disabled=busy;$('run').disabled=busy||!engine;$('ladder').disabled=busy||!engine;$('terminate').disabled=busy||(!engine&&!worker);}
function fresh(){return {app:'PocketBench AI Crash Lab',version:'1.0.0',runtime:LIBRARY_VERSION,pageUrl:location.href,startedAt:new Date().toISOString(),finishedAt:null,phase:'ready',stage:'ready',config:null,environment:null,events:[],results:[],errors:[]};}
const prior=restored(localStorage);if(prior){$('previous').textContent=interrupted(prior)?`Previous attempt ended without a recorded finish. Last phase: ${prior.phase}; last checkpoint: ${prior.stage}. Export this report before another test. This is evidence of an interruption, NOT proof of out-of-memory.`:`Saved previous report found: ${prior.phase}; ${prior.results?.length??0} completed probes. Export or reset it before a new test.`;report=prior;render();}
else $('previous').textContent='No prior diagnostic checkpoint. The first test will save stages here.';
window.addEventListener('error',e=>{if(report){report.errors.push({stage:'window-error',error:e.message});mark('window-error',{error:e.message});}});
window.addEventListener('unhandledrejection',e=>{if(report){report.errors.push({stage:'unhandled-rejection',error:error(e.reason)});mark('unhandled-rejection',{error:error(e.reason)});}});
window.addEventListener('pagehide',()=>{if(report){report.events.push({at:new Date().toISOString(),stage:'pagehide',precedingStage:report.stage,note:'May be ordinary navigation or tab lifecycle; not proof of a crash.'});persist();}});
function download(){if(!report)return;const name='pocketbench-ai-diagnostic-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
$('save').onclick=download;
$('share').onclick=async()=>{if(!report)return;const file=new File([JSON.stringify(report,null,2)],'pocketbench-ai-diagnostic.json',{type:'application/json'});try{if(navigator.canShare?.({files:[file]}))await navigator.share({files:[file],title:'PocketBench AI crash report'});else download();}catch(e){if(e.name!=='AbortError')status('Share failed: '+error(e)+'; use Save diagnostic JSON.');}};
$('clear').onclick=()=>{if(busy)return;localStorage.removeItem(CHECKPOINT_KEY);report=null;$('previous').textContent='Saved report cleared (model weights cache unaffected).';$('events').textContent='';status('Ready for a new test.');};
async function release(){if(engine){const old=engine;engine=null;try{await old.unload?.();}catch(e){mark('unload-error',{error:error(e)});}}if(worker){worker.terminate();worker=null;}loaded=null;controls();}
$('terminate').onclick=async()=>{if(busy)return;busy=true;controls();mark('manual-release');try{await release();status('Engine unloaded / worker terminated.');}finally{busy=false;controls();}};
function startReport(config){report=fresh();report.config=config;report.environment={userAgent:navigator.userAgent,visibility:document.visibilityState,crossOriginIsolated:globalThis.crossOriginIsolated??null,gpu:!!navigator.gpu,hardwareConcurrency:navigator.hardwareConcurrency??null};report.phase='loading';mark('load-start',{model:config.model,path:config.path,estimatedMB:config.estimatedMB});}
async function load(){if(busy||!runtime)return;const model=$('model').value,path=$('path').value,m=runtime.prebuiltAppConfig.model_list.find(x=>x.model_id===model);if(!m)return;
 busy=true;controls();try{await release();startReport({model,path,estimatedMB:m.vram_required_MB??null,requiredFeatures:m.required_features??[],runtime:LIBRARY_VERSION});status('Loading model. A cached load may be fast; this does not measure GPU allocation.');const initProgressCallback=p=>{if(p.text&&(/finish|load|cache|download|compile/i.test(p.text)))mark('load-progress',{text:p.text.slice(0,180)});};
 if(path==='worker'){
  mark('worker-create');worker=new Worker('./ai-bench-worker.mjs',{type:'module'});
  worker.addEventListener('error',e=>{if(report){report.errors.push({stage:'worker-error',error:e.message});mark('worker-error',{error:e.message});}});
  worker.addEventListener('messageerror',()=>mark('worker-messageerror'));
  mark('engine-init-await');engine=await runtime.CreateWebWorkerMLCEngine(worker,model,{initProgressCallback});
 }else{mark('engine-init-await');engine=await runtime.CreateMLCEngine(model,{initProgressCallback});}
 loaded={model,path};report.phase='ready';mark('model-ready');status('Model ready. Run ONE minimal inference probe first.');
 }catch(e){const msg=error(e);if(report){report.errors.push({stage:'load',error:msg});report.phase='failed';report.finishedAt=new Date().toISOString();mark('load-failed',{error:msg});}status('Loading failed: '+msg);await release();}
 finally{busy=false;controls();}}
$('load').onclick=load;
async function probes(list){if(busy||!engine||!loaded)return;busy=true;controls();if(!report)startReport(loaded);report.phase='inference';report.finishedAt=null;mark('inference-start',{probeCount:list.length});
try{for(const p of list){status(`Inference: ${p.tokens} tokens, ${p.stream?'stream':'nonstream'}…`);mark('probe-before-await',{probe:p.id,tokens:p.tokens,stream:p.stream});
 const result=await oneInference(engine,p,{clock,mark:(stage,extra)=>mark(stage,{probe:p.id,...extra})});report.results.push(result);mark('probe-completed',{probe:p.id,wallMs:result.wallMs,outputCharacters:result.outputCharacters});
 }report.phase='completed';report.finishedAt=new Date().toISOString();mark('all-probes-completed');status('Probe(s) completed. Export JSON. You can now test a larger model or another path.');
}catch(e){const msg=error(e);report.errors.push({stage:'inference',error:msg});report.phase='failed';report.finishedAt=new Date().toISOString();mark('inference-failed',{error:msg});status('Inference error caught: '+msg+'; export JSON.');}
finally{busy=false;controls();}}
$('run').onclick=()=>probes([PROBES.find(p=>p.id===$('probe').value)]);
$('ladder').onclick=()=>probes(PROBES);
(async()=>{try{status('Importing WebLLM '+LIBRARY_VERSION+'; weights are NOT downloading…');if(!navigator.gpu)throw Error('navigator.gpu is absent.');
 const adapter=await navigator.gpu.requestAdapter();if(!adapter)throw Error('No WebGPU adapter');const features=Array.from(adapter.features);
 $('device').textContent=`GPU ${adapter.info?.vendor??'undisclosed'}; features: ${features.join(', ')||'none reported'}; maxBufferSize: ${adapter.limits?.maxBufferSize??'unknown'} bytes.`;
 if(!report){report=fresh();report.phase='runtime-import';report.environment={userAgent:navigator.userAgent,adapter:{vendor:adapter.info?.vendor??null,features,maxBufferSize:adapter.limits?.maxBufferSize??null}};mark('runtime-import');}else status('Importing runtime; previous saved report remains unchanged until a new model load.');
 runtime=await import(LIBRARY_URL);const models=runtime.prebuiltAppConfig.model_list.filter(x=>candidates.includes(x.model_id)&&(!x.required_features||x.required_features.every(f=>features.includes(f))));
 if(!models.length)throw Error('No candidate model with required GPU features in this runtime.');$('model').replaceChildren(...models.sort((a,b)=>(a.vram_required_MB??Infinity)-(b.vram_required_MB??Infinity)).map(m=>{const o=document.createElement('option');o.value=m.model_id;o.textContent=`${m.model_id} · catalog estimate ${m.vram_required_MB??'?'} MB`;return o;}));
 if(report.phase==='runtime-import'){report.phase='ready';mark('runtime-ready');}
 status('Runtime ready. Select the smallest model and load it.');controls();
}catch(e){const msg=error(e);if(report){report.errors.push({stage:'bootstrap',error:msg});report.phase='failed';report.finishedAt=new Date().toISOString();mark('bootstrap-failed',{error:msg});}status('Initialization failed: '+msg);controls();}})();
