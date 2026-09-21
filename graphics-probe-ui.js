import {PROBE_VERSION,MODES,optionsFromQuery,createRenderer,analyze} from './graphics-probe-core.js';
const $=id=>document.getElementById(id);
const query=new URLSearchParams(location.search);
let running=false,requestedStop=false,activeStop=null,report=null,activeRenderer=null,session=0;
const opts=optionsFromQuery(query);
const safeError=e=>String(e?.stack||e?.message||e);
const n=v=>Number.isFinite(v)?v.toFixed(1):'—';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const environ=()=>({userAgent:navigator.userAgent,platform:navigator.platform,href:location.href,
  date:new Date().toISOString(),devicePixelRatio:devicePixelRatio,screen:{width:screen.width,height:screen.height},
  visibilityAtStart:document.visibilityState,crossOriginIsolated:globalThis.crossOriginIsolated??null,
  webgpuExposedOnMainThread:!!navigator.gpu,offscreenCanvasAvailable:typeof OffscreenCanvas!=='undefined',
  transferToOffscreenAvailable:'transferControlToOffscreen' in HTMLCanvasElement.prototype,
  hardwareConcurrency:navigator.hardwareConcurrency??null,
  note:'Browser and WebGPU adapter identifiers may be privacy-reduced or incomplete.'});
function stageCanvas(){
 if(activeRenderer){try{activeRenderer.dispose();}catch{}activeRenderer=null;}
 const c=document.createElement('canvas');c.setAttribute('aria-label','Live GPU fragment-shader animation');
 $('stage').replaceChildren(c);
 const rect=c.getBoundingClientRect(),dpr=Math.min(2,Math.max(1,devicePixelRatio||1));
 c.width=Math.max(1,Math.round(rect.width*dpr*opts.scale));
 c.height=Math.max(1,Math.round(rect.height*dpr*opts.scale));
 return c;
}
function row(result){
 const tr=document.createElement('tr');
 const vals=[result.label,result.status==='completed'?n(result.metrics.submittedHz):result.status,
  result.metrics?.frameIntervalMs?.p95==null?'—':n(result.metrics.frameIntervalMs.p95),
  result.error?'⚠':''];
 for(const val of vals){const td=document.createElement('td');td.textContent=val;tr.append(td);}
 $('rows').append(tr);
}
function persist(){if(!report)return;try{localStorage.setItem('pocketbench-graphics-probe-last',JSON.stringify(report));}catch{}
 $('save').disabled=false;$('share').disabled=false;}
function display(){if(!report)return;
 const completed=report.runs.filter(r=>r.status==='completed').length;
 $('counter').textContent=`${report.runs.length} / ${MODES.length} cases · ${completed} completed`;
 $('details').textContent=JSON.stringify({environment:report.environment,options:report.options,
  cases:report.runs.map(({id,status,error,metrics,capabilities})=>({id,status,error,
  submittedHz:metrics?.submittedHz,p95IntervalMs:metrics?.frameIntervalMs?.p95,
  cpuDrawMs:metrics?.cpuDrawSubmitMs?.median,relay:metrics?.relay||null,capabilities}))},null,2);
}
function exportName(){return `pocketbench-graphics-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;}
function file(){return new File([JSON.stringify(report,null,2)],exportName(),{type:'application/json'});}
function download(){if(!report)return;const link=document.createElement('a'),url=URL.createObjectURL(file());
 link.href=url;link.download=exportName();document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),20000);}
function runMain(mode,canvas){return new Promise(async resolve=>{
  let renderer=null,closed=false,raf=0;
  const close=(status='completed',error=null,elapsed=0,times=[],cpu=[],caps=null)=>{
   if(closed)return;closed=true;cancelAnimationFrame(raf);activeStop=null;
   const metrics=analyze(times,cpu,elapsed,{canvas:{width:canvas.width,height:canvas.height},gpuTimingMs:null,
    note:'GPU command submissions, not compositor presentation or completed frames.'});
   resolve({id:mode.id,label:mode.label,scheduler:mode.scheduler,api:mode.api,status,error,
    startedAt:startDate,endedAt:new Date().toISOString(),capabilities:caps||renderer?.capabilities||null,metrics});
  };
  const startDate=new Date().toISOString();let caps=null;
  activeStop=()=>close('interrupted','User stopped or page became hidden');
  try{
   renderer=await createRenderer(mode.api,canvas,opts.effort);
   activeRenderer=renderer;caps=renderer.capabilities;
   if(closed)return;
   const begin=performance.now(),times=[],cpu=[];let measureStart=null;
   const tick=()=>{
    if(closed)return;
    const now=performance.now();
    if(measureStart!==null&&now-measureStart>=opts.durationMs){return close('completed',renderer.check(),now-measureStart,times,cpu,caps);}
    const before=performance.now();
    try{renderer.draw(now);}catch(e){return close('failed',safeError(e),measureStart===null?0:now-measureStart,times,cpu,caps);}
    const after=performance.now();
    if(after-begin>=opts.warmupMs){if(measureStart===null)measureStart=after;times.push(after);cpu.push(after-before);}
    raf=requestAnimationFrame(tick);
   };
   raf=requestAnimationFrame(tick);
  }catch(e){close('unavailable',safeError(e),0,[],[],caps);}
 });}
function runWorker(mode,canvas){return new Promise(resolve=>{
 let worker=null,settled=false,ready=false,started=false,inflight=false,sourcePulses=0,skippedBusy=0,acks=0,
  pulseId=0,relayRaf=0,relayStartedAt=0,caps=null;
 const startedAt=new Date().toISOString();
 const finish=(status,error,metrics)=>{
  if(settled)return;settled=true;clearTimeout(watchdog);cancelAnimationFrame(relayRaf);activeStop=null;
  worker?.terminate();
  resolve({id:mode.id,label:mode.label,scheduler:mode.scheduler,api:mode.api,status,error,
   startedAt,endedAt:new Date().toISOString(),capabilities:caps,
   metrics:{...(metrics||analyze([],[],0)),canvas:{width:canvas.width,height:canvas.height},gpuTimingMs:null,
    relay:mode.scheduler==='main-relay'?{sourcePulses,acks,skippedBusy,workerPulses:metrics?.pulsesReceived??null,
     sequenceGaps:metrics?.sequenceGaps??null,relayLagMs:metrics?.relayLagMs??null}:null}});
 };
 const watchdog=setTimeout(()=>finish('failed','Worker case timed out'),opts.warmupMs+opts.durationMs+12000);
 activeStop=()=>{if(worker&&started)worker.postMessage({type:'stop',id:mode.id,status:'interrupted'});
   finish('interrupted','User stopped or page became hidden');};
 try{
  if(!canvas.transferControlToOffscreen)throw Error('transferControlToOffscreen unsupported');
  const offscreen=canvas.transferControlToOffscreen();
  worker=new Worker(new URL('./graphics-probe-worker.js',import.meta.url),{type:'module'});
  worker.onerror=e=>{e.preventDefault();finish('failed',String(e.message||'Worker script error'));};
  worker.onmessage=({data})=>{
   if(settled||data.id!==mode.id)return;
   if(data.type==='ready'){
    ready=true;caps=data.capabilities;
    worker.postMessage({type:'go',id:mode.id});
   }else if(data.type==='started'){
    started=true;
    if(mode.scheduler==='main-relay'){
     relayStartedAt=performance.now();
     const pulse=()=>{
      if(settled)return;
      const now=performance.now();
      if(now-relayStartedAt>=opts.warmupMs+opts.durationMs+35){worker.postMessage({type:'stop',id:mode.id});return;}
      sourcePulses++;
      if(!inflight){inflight=true;worker.postMessage({type:'pulse',id:mode.id,sequence:pulseId++,sentEpochMs:performance.timeOrigin+now});}
      else skippedBusy++;
      relayRaf=requestAnimationFrame(pulse);
     };
     relayRaf=requestAnimationFrame(pulse);
    }
   }else if(data.type==='ack'){
    inflight=false;acks++;
   }else if(data.type==='done'){
    finish(data.status||'completed',data.error||null,data.metrics||null);
   }
  };
  worker.postMessage({type:'init',id:mode.id,api:mode.api,scheduler:mode.scheduler,options:opts,canvas:offscreen},[offscreen]);
 }catch(e){finish('unavailable',safeError(e));}
 });}
async function run(){
 if(running)return;
 const current=++session;running=true;requestedStop=false;report={app:'PocketBench graphics/scheduler probe',schemaVersion:PROBE_VERSION,
  startedAt:new Date().toISOString(),endedAt:null,status:'running',environment:environ(),options:opts,
  workload:{type:'fullscreen-fragment-animation',description:'Same formula and loop count, but GLSL/WGSL compiler implementations differ; not particle compute',
   triangleVertices:3,fragmentIterations:opts.effort,alpha:false,antialias:false},
  methodology:{warmup:'Renderer and shader initialization excluded; first warmup frames excluded',
   gpuTiming:'Not captured; timer-query support reported as capability. CPU draw-call time is not GPU execution time.',
   display:'Counts GPU commands submitted by JavaScript; cannot verify compositor presentation or photons.',
   relay:'At most one outstanding worker pulse; skipped busy pulses measured, not unboundedly queued.',
   concurrency:'Cases run sequentially to avoid testing two renderers simultaneously.'},runs:[],errors:[]};
 $('rows').replaceChildren();$('run').disabled=true;$('save').disabled=true;$('share').disabled=true;
 $('status').textContent='Initializing graphics test…';$('counter').textContent='0 / 6 cases';$('details').textContent='Running';
 for(const [i,mode] of MODES.entries()){
  if(requestedStop||session!==current)break;
  $('status').textContent=`${i+1}/${MODES.length}: ${mode.label}`;
  const canvas=stageCanvas();
  let result;
  try{result=mode.scheduler==='main-raf'?await runMain(mode,canvas):await runWorker(mode,canvas);}catch(e){result={id:mode.id,label:mode.label,status:'failed',error:safeError(e),metrics:null};}
  report.runs.push(result);if(result.error)report.errors.push({case:mode.id,message:result.error});
  row(result);display();persist();
  if(requestedStop)break;
  await sleep(120);
 }
 report.endedAt=new Date().toISOString();report.status=requestedStop?'interrupted':'complete';running=false;activeStop=null;
 $('run').disabled=false;$('status').textContent=`Suite ${report.status} · ${report.runs.length} cases`;display();persist();
}
$('run').onclick=run;
$('stop').onclick=()=>{requestedStop=true;activeStop?.();};
$('save').onclick=download;
$('share').onclick=async()=>{
 if(!report)return;
 try{const f=file();if(navigator.canShare?.({files:[f]})){await navigator.share({files:[f],title:'PocketBench graphics results'});return;}}
 catch(e){if(e.name==='AbortError')return;}
 $('status').textContent='Native file sharing unavailable; use Save JSON.';
};
document.addEventListener('visibilitychange',()=>{if(document.hidden&&running){requestedStop=true;activeStop?.();}});
$('settings').textContent=`${opts.durationMs/1000}s measurement + ${opts.warmupMs/1000}s warmup per case · ${opts.effort} shader iterations · scale ${opts.scale}`;
try{const saved=localStorage.getItem('pocketbench-graphics-probe-last');if(saved){report=JSON.parse(saved);display();$('save').disabled=false;$('share').disabled=false;}}catch{}
window.__pocketGraphics={get status(){return {running,report};},run,stop:()=>{$('stop').click();}};
if(query.get('autorun')!=='0')run();
