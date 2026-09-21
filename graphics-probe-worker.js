import {createRenderer,analyze} from './graphics-probe-core.js';
let state=null;
const tell=message=>self.postMessage(message);
function complete(status='completed',error=null){
 const s=state;if(!s||s.finished)return;s.finished=true;
 const elapsed=s.measureStart===null?0:Math.max(0,performance.now()-s.measureStart);
 let check=null;try{check=s.renderer?.check?.()||null;}catch(e){check=String(e);}
 tell({type:'done',id:s.id,status,error:error||check,metrics:analyze(s.times,s.cpu,elapsed,{
  mode:'worker',pulsesReceived:s.pulsesReceived,firstSequence:s.firstSequence,lastSequence:s.lastSequence,
  sequenceGaps:s.sequenceGaps,relayLagMs:{n:s.lags.length,median:s.lags.length?([...s.lags].sort((a,b)=>a-b))[Math.floor(s.lags.length/2)]:null,
   min:s.lags.length?Math.min(...s.lags):null,max:s.lags.length?Math.max(...s.lags):null},
  canvas:{width:s.canvas.width,height:s.canvas.height},gpuTimingMs:null,
  note:'Submitted graphics commands, not confirmed presentation or GPU completion.'})});
}
function drawFrame(now){
 const s=state;if(!s||s.finished||!s.goAt)return;
 const started=performance.now();
 try{s.renderer.draw(now);}catch(err){complete('failed',String(err?.stack||err));return;}
 const after=performance.now();
 if(after-s.goAt<s.options.warmupMs)return;
 if(s.measureStart===null)s.measureStart=after;
 if(after-s.measureStart>s.options.durationMs){complete();return;}
 s.times.push(after);s.cpu.push(after-started);
}
function nativeFrame(now){
 const s=state;if(!s||s.finished)return;
 drawFrame(performance.now());
 if(!s.finished){try{self.requestAnimationFrame(nativeFrame);}catch(err){complete('failed',String(err));}}
}
self.onmessage=async ({data})=>{
 if(data?.type==='init'){
  if(state)return;
  const s={id:data.id,canvas:data.canvas,options:data.options,api:data.api,scheduler:data.scheduler,
   renderer:null,goAt:0,measureStart:null,finished:false,times:[],cpu:[],pulsesReceived:0,
   firstSequence:null,lastSequence:null,sequenceGaps:0,lags:[]};state=s;
  try{
   if(!s.canvas)throw Error('OffscreenCanvas was not transferred');
   if(s.scheduler==='worker-raf'&&typeof self.requestAnimationFrame!=='function')throw Error('Worker requestAnimationFrame unsupported');
   s.renderer=await createRenderer(s.api,s.canvas,s.options.effort);
   tell({type:'ready',id:s.id,api:s.renderer.api,capabilities:s.renderer.capabilities,workerRafAvailable:typeof self.requestAnimationFrame==='function'});
  }catch(err){complete('unavailable',String(err?.stack||err));}
  return;
 }
 const s=state;if(!s||s.finished||data?.id!==s.id)return;
 if(data.type==='go'){
  if(s.goAt)return;
  s.goAt=performance.now();tell({type:'started',id:s.id});
  if(s.scheduler==='worker-raf')self.requestAnimationFrame(nativeFrame);
  return;
 }
 if(data.type==='pulse'&&s.scheduler==='main-relay'&&s.goAt){
  s.pulsesReceived++;
  if(s.firstSequence===null)s.firstSequence=data.sequence;
  if(s.lastSequence!==null&&data.sequence>s.lastSequence+1)s.sequenceGaps+=data.sequence-s.lastSequence-1;
  s.lastSequence=data.sequence;
  if(Number.isFinite(data.sentEpochMs))s.lags.push(performance.timeOrigin+performance.now()-data.sentEpochMs);
  drawFrame(performance.now());
  tell({type:'ack',id:s.id,sequence:data.sequence});
  return;
 }
 if(data.type==='stop')complete(data.status||'completed');
};
