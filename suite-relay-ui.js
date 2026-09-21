import {PRESETS,validatePlan,expandPlan} from './suite-plan.js';
import {SuiteRunner} from './suite-runner.js';
const $=id=>document.getElementById(id),SAVE_KEY='pocketbench-relay-suite-v1-last';
const query=new URLSearchParams(location.search);
let worker=null,runner=null,ready=false,running=false,current=null,plan=null,results=null,previous=null,autoStarted=false,pendingRelayRequestId=null;
const fmt=(x,n=2)=>Number.isFinite(x)?x.toFixed(n):'—';
const clone=obj=>JSON.parse(JSON.stringify(obj));
function setError(msg){$('error').style.display='block';$('error').textContent=String(msg);$('status').textContent='Error';}
function pageEnv(){return {pageUrl:location.origin+location.pathname,viewport:{innerWidth,innerHeight,devicePixelRatio},pageVisibilityAtBoot:document.visibilityState,host:'GitHub Pages or equivalent static host; browser identification is heuristic'};}
function size(){const r=$('scene').getBoundingClientRect();return {width:Math.max(1,r.width),height:Math.max(1,r.height),dpr:Math.max(1,Math.min(2,devicePixelRatio||1))};}
function send(type,fields={}){if(worker)worker.postMessage({type,...fields});else if(runner){if(type==='start')runner.start(fields.plan).catch(e=>setError(e.stack||e));else if(type==='stop')runner.stop();else if(type==='resize')runner.resize(fields.size);else if(type==='visibility')runner.visibility(fields.hidden);}}
function renderReport(report){if(!report)return;results=report;$('export').disabled=false;
 const rows=report.runs||[];$('runs').replaceChildren();
 if(!rows.length){const tr=document.createElement('tr');tr.innerHTML='<td colspan="3">No completed runs yet.</td>';$('runs').append(tr);}
 for(const r of rows){const tr=document.createElement('tr');for(const value of [`${r.config.name} · ${r.config.kernel}${r.status==='completed'?'':' ('+r.status+')'}`,fmt(r.metrics?.gpuComputeMs?.median,3),fmt(r.metrics?.submittedFramesPerSecond,1)]){const td=document.createElement('td');td.textContent=value;tr.append(td);}$('runs').append(tr);}
 $('comparison').replaceChildren();for(const c of report.comparisons||[]){const li=document.createElement('li');li.textContent=`${c.workload}: original ${fmt(c.baselineComputeMedianMs,3)} ms; fused ${fmt(c.fusedComputeMedianMs,3)} ms; change ${c.fusedRelativeChangePercent==null?'pending':fmt(c.fusedRelativeChangePercent,1)+'%'}.`;$('comparison').append(li);}
 const latest=[...rows].reverse().find(r=>r.metrics);if(latest){$('fps').textContent=fmt(latest.metrics.submittedFramesPerSecond,1);$('compute').textContent=fmt(latest.metrics.gpuComputeMs.median,3);$('throughput').textContent=fmt(latest.metrics.gpuEquivalentMillionParticleUpdatesPerSecond,1);}
 $('environment').textContent=JSON.stringify(report.environment,null,2);
}
function persist(report){try{localStorage.setItem(SAVE_KEY,JSON.stringify(report));$('previous').disabled=false;}catch(e){$('substatus').textContent=`Could not persist locally: ${e.message}. Export now.`;}}
function handle(message){
 switch(message.type){
 case 'frame-request':{
   const target=worker,requestId=message.requestId;
   if(!target)return;
   pendingRelayRequestId=requestId;
   if(!running||document.hidden){pendingRelayRequestId=null;target.postMessage({type:'pulse',requestId,cancelled:true});break;}
   requestAnimationFrame(()=>{if(target===worker&&pendingRelayRequestId===requestId){pendingRelayRequestId=null;target.postMessage({type:'pulse',requestId,cancelled:document.hidden||!running});}});
   break;
 }

 case 'ready':ready=true;$('environment').textContent=JSON.stringify(message.environment,null,2);$('status').textContent='GPU initialized · '+(message.environment.worker?'main-paced GPU worker':'main-thread fallback');$('start').disabled=false;if(!autoStarted&&query.get('autorun')!=='0'){autoStarted=true;startSuite();}break;
 case 'suite-start':running=true;results=null;current=null;$('stop').disabled=false;$('start').disabled=true;$('progress').max=message.total;$('progress').value=0;$('counter').textContent=`0 / ${message.total} runs`;$('status').textContent='Suite running';$('error').style.display='none';break;
 case 'run-start':current=message.config;$('status').textContent=`Run ${message.index}/${message.total} · ${current.name}`;$('substatus').textContent=`${current.kernel} · ${current.count.toLocaleString()} particles · ${current.steps} substeps · ${current.render?'render ON':'render OFF (physics active; picture frozen)'}`;break;
 case 'run-end':renderReport(message.report);persist(message.report);$('progress').value=message.index;$('counter').textContent=`${message.index} / ${message.total} runs`;if(message.result.status!=='completed')$('substatus').textContent=`Run status: ${message.result.status}`;break;
 case 'suite-end':running=false;pendingRelayRequestId=null;renderReport(message.report);persist(message.report);$('stop').disabled=true;$('start').disabled=false;$('status').textContent=`Suite ${message.report.status} · ${message.report.runs.length} runs`;$('substatus').textContent='Results stay on this device until you export them.';if(document.visibilityState==='visible')openExport();break;
 case 'error':setError(message.message);if(!running){$('start').disabled=!ready;$('stop').disabled=true;}break;
 case 'notice':$('substatus').textContent=message.message;break;
 }
}
async function mainFallback(reason){worker?.terminate();worker=null;pendingRelayRequestId=null;const old=$('scene');const canvas=document.createElement('canvas');canvas.id='scene';canvas.setAttribute('aria-label',old.getAttribute('aria-label')||'3D GPU simulation');old.replaceWith(canvas);runner=new SuiteRunner(canvas,handle,{...pageEnv(),executionFallbackReason:reason});try{await runner.init(size());}catch(e){setError(e.stack||e);}}
async function boot(){
 if(!navigator.gpu){setError('WebGPU unavailable. Use modern Safari over HTTPS.');return;}
 if(query.get('worker')!=='0'&&typeof Worker!=='undefined'&&'transferControlToOffscreen' in HTMLCanvasElement.prototype){
  try{let settled=false;worker=new Worker(new URL('./suite-relay-worker.js',import.meta.url),{type:'module'});
   const timer=setTimeout(()=>{if(!settled){settled=true;mainFallback('Worker initialization timed out');}},15000);
   worker.onmessage=({data})=>{if(data.type==='ready'){settled=true;clearTimeout(timer);}if(data.type==='error'&&!settled){settled=true;clearTimeout(timer);mainFallback('Worker initialization failed: '+data.message);return;}handle(data);};
   worker.onerror=e=>{e.preventDefault();if(!settled){settled=true;clearTimeout(timer);mainFallback('Worker error: '+e.message);}else setError(e.message);};
   const canvas=$('scene').transferControlToOffscreen();worker.postMessage({type:'init',canvas,size:size(),environment:pageEnv()},[canvas]);return;
  }catch(e){await mainFallback(e.message);return;}
 }
 await mainFallback('Dedicated worker disabled or OffscreenCanvas unsupported');
}
function readPlan(){try{return validatePlan(JSON.parse($('plan').value));}catch(error){$('validation').textContent='Invalid: '+error.message;throw error;}}
function selectPreset(value){if(value!=='custom'){$('plan').value=JSON.stringify(PRESETS[value],null,2);$('validation').textContent=`${expandPlan(PRESETS[value]).length} valid runs`;}}
function startSuite(){if(!ready||running)return;let candidate;try{candidate=readPlan();}catch(e){setError(e.message);return;}plan=candidate;send('start',{plan:candidate});}
function openExport(){if(!results)return;$('exportSummary').textContent=`${results.runs.length} runs · ${results.status} · includes raw samples, configuration and capabilities. Nothing is uploaded automatically.`;if(!$('exportDialog').open)$('exportDialog').showModal();}
function reportBlob(){return new Blob([JSON.stringify(results,null,2)],{type:'application/json'});}
function filename(ext='json'){return `pocketbench-relay-suite-${new Date().toISOString().replace(/[:.]/g,'-')}.${ext}`;}
function download(blob,name){const href=URL.createObjectURL(blob),a=document.createElement('a');a.href=a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(href),15000);}
function csvEscape(s){const v=String(s??'');return /[",\n]/.test(v)?'"'+v.replaceAll('"','""')+'"':v;}
function csvData(){const columns=['runId','status','name','kernel','count','steps','render','scale','width','height','gpuComputeMedianMs','gpuComputeP90Ms','gpuRenderMedianMs','frameFps','frameP95Ms','actualMUpdatesPerSecond','gpuEquivalentMUpdatesPerSecond','gpuSamples','relayPulses','relayWaitP95Ms','error'];return [columns.join(','),...results.runs.map(r=>[r.runId,r.status,r.config.name,r.config.kernel,r.config.count,r.config.steps,r.config.render,r.config.scale,r.canvas?.width,r.canvas?.height,r.metrics?.gpuComputeMs?.median,r.metrics?.gpuComputeMs?.p90,r.metrics?.gpuRenderMs?.median,r.metrics?.submittedFramesPerSecond,r.metrics?.frameIntervalMs?.p95,r.metrics?.actualMillionParticleUpdatesPerSecond,r.metrics?.gpuEquivalentMillionParticleUpdatesPerSecond,r.metrics?.gpuComputeMs?.n,r.metrics?.scheduler?.delivered,r.metrics?.scheduler?.requestToReceiptMs?.p95,r.error].map(csvEscape).join(','))].join('\n');}
$('start').addEventListener('click',startSuite);
$('stop').addEventListener('click',()=>{send('stop');if(worker&&pendingRelayRequestId!=null){worker.postMessage({type:'pulse',requestId:pendingRelayRequestId,cancelled:true});pendingRelayRequestId=null;}});
$('export').addEventListener('click',openExport);
$('previous').addEventListener('click',()=>{if(previous&&!running){renderReport(clone(previous));$('status').textContent='Previous saved report';openExport();}});
$('preset').addEventListener('change',()=>{selectPreset($('preset').value);$('custom').open=$('preset').value==='custom';});
$('apply').addEventListener('click',()=>{try{const p=readPlan();$('validation').textContent=`Valid: ${expandPlan(p).length} runs`; $('preset').value='custom';}catch{}});
$('close').addEventListener('click',()=>$('exportDialog').close());
$('download').addEventListener('click',()=>{if(results)download(reportBlob(),filename());});
$('csv').addEventListener('click',()=>{if(results)download(new Blob([csvData()],{type:'text/csv;charset=utf-8'}),filename('csv'));});
$('share').addEventListener('click',async()=>{if(!results)return;const file=new File([reportBlob()],filename(),{type:'application/json'});try{if(navigator.canShare?.({files:[file]})){await navigator.share({files:[file],title:'PocketBench GPU results'});return;}}catch(e){if(e.name==='AbortError')return;}$('exportSummary').textContent='Native file sharing is unavailable here; use Download complete JSON.';});
addEventListener('resize',()=>{if(ready&&!running)send('resize',{size:size()});},{passive:true});
document.addEventListener('visibilitychange',()=>{if(running&&document.hidden){send('visibility',{hidden:true});if(worker&&pendingRelayRequestId!=null){worker.postMessage({type:'pulse',requestId:pendingRelayRequestId,cancelled:true});pendingRelayRequestId=null;}}});
try{const old=localStorage.getItem(SAVE_KEY);if(old){previous=JSON.parse(old);$('previous').disabled=false;}}catch{}
const preset=PRESETS[query.get('preset')]?query.get('preset'):'quick';$('preset').value=preset;selectPreset(preset);
// Programmatic interface used by browser automation; never creates fictional GPU results.
window.__pocketSuite={get status(){return {ready,running,current,report:results};},start:()=>startSuite(),stop:()=>send('stop'),configure:p=>{$('preset').value='custom';$('plan').value=JSON.stringify(validatePlan(p),null,2);$('custom').open=true;},exportJSON:()=>results?JSON.stringify(results):null};
boot();
