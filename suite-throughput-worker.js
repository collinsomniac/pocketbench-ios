/* PocketBench uncapped GPU-queue-completed throughput; no requestAnimationFrame. */
import {OptimizedLab} from './optimized-engine.js';

export async function runBatched({submit,drain,now,stop,batch=16,durationMs=2500,onBatch=()=>{}}){
  if(!Number.isInteger(batch)||batch<1||batch>128)throw Error('Invalid bounded batch size');
  if(!(durationMs>=100&&durationMs<=60000))throw Error('Invalid duration');
  const started=now();let completed=0,requested=0,submitMs=0,waitMs=0;const batches=[];
  while(now()-started<durationMs&&!stop()){
    const batchStart=now();
    for(let i=0;i<batch;i++){
      if(stop())break;
      submit();requested++;
    }
    const afterSubmit=now();submitMs+=afterSubmit-batchStart;
    if(!requested||requested===completed)break;
    await drain();
    const ended=now();const count=requested-completed;completed=requested;
    waitMs+=ended-afterSubmit;
    batches.push({completedFrames:count,elapsedMs:ended-batchStart,submitMs:afterSubmit-batchStart,queueWaitMs:ended-afterSubmit});
    onBatch({completed,elapsedMs:ended-started,batches:batches.length});
  }
  const elapsedMs=now()-started;
  return {completedFrames:completed,elapsedMs,completedFramesPerSecond:elapsedMs>0?completed*1000/elapsedMs:null,
    cpuSubmissionMs:submitMs,queueWaitMs:waitMs,batches};
}

const COUNTS=[8192,65536,262144,524288], SIZES={small:[768,390],large:[880,1738]};
const DEFAULT_CASES=[
 {name:'small-scene-fused',count:65536,steps:2,kernel:'fused',mode:'offscreen',size:'small',batch:16,durationMs:2500},
 {name:'large-scene-fused',count:65536,steps:2,kernel:'fused',mode:'offscreen',size:'large',batch:16,durationMs:2500},
 {name:'large-scene-fused-batch64',count:65536,steps:2,kernel:'fused',mode:'offscreen',size:'large',batch:64,durationMs:2500},
 {name:'compute-heavy-fused',count:262144,steps:8,kernel:'fused',mode:'compute',size:'large',batch:16,durationMs:2500},
];
const send=m=>self.postMessage(m);
let lab=null,ready=false,running=false,stopRequested=false,report=null,deviceError=null;
function validate(v){
 const c={...v};
 if(!COUNTS.includes(c.count))throw Error('Unsupported count');
 if(![1,2,4,8,16].includes(c.steps))throw Error('Unsupported integration steps');
 if(!['baseline','fused'].includes(c.kernel))throw Error('Unsupported kernel');
 if(!['compute','offscreen'].includes(c.mode))throw Error('Unsupported mode');
 if(!SIZES[c.size])throw Error('Unsupported size');
 if(![4,16,64].includes(c.batch))throw Error('Unsupported batch size');
 if(!Number.isFinite(c.durationMs)||c.durationMs<500||c.durationMs>15000)throw Error('Invalid duration');
 return c;
}
async function init(canvas,mainEnv){
 if(ready)throw Error('Already initialized');
 lab=new OptimizedLab(canvas,m=>{
  if(m.type==='error'){deviceError=m.message;stopRequested=true;send({type:'error',message:m.message});}
  if(m.type==='notice')send({type:'notice',message:m.message});
 },()=>{});
 await lab.init();lab.paused=true;lab.sampleEvery=Number.MAX_SAFE_INTEGER;
 if(!lab.fusedAvailable)throw Error('Fused kernel unavailable; test cannot run the default plan');
 await lab.device.queue.onSubmittedWorkDone();
 ready=true;
 const adapter=lab.adapter;
 send({type:'ready',environment:{
  main:mainEnv,worker:{userAgent:navigator.userAgent,hardwareConcurrency:navigator.hardwareConcurrency,performanceTimeOrigin:performance.timeOrigin},
  gpu:{adapterInfo:{vendor:adapter.info?.vendor??null,architecture:adapter.info?.architecture??null,
      device:adapter.info?.device??null},fallback:adapter.isFallbackAdapter===true,
      timestampQuerySupported:adapter.features.has('timestamp-query'),timestampSamplingEnabled:false,
      maxTextureDimension2D:adapter.limits.maxTextureDimension2D,format:lab.format},
  workerOffscreenCanvas:true
 }});
}
async function execute(raw,index,total){
 const c=validate(raw);const [width,height]=SIZES[c.size];
 await lab.device.queue.onSubmittedWorkDone();
 lab.paused=false;lab.setOptions({count:c.count,steps:c.steps,render:c.mode==='offscreen',kernel:c.kernel,scale:1});
 lab.resize({width,height,dpr:1});
 lab.resetParticles(c.count);
 lab.sampleEvery=Number.MAX_SAFE_INTEGER;
 let texture=null;
 const realContext=lab.context;
 try{
  if(c.mode==='offscreen'){
   texture=lab.device.createTexture({label:'uncapped offscreen particle render',size:[width,height,1],
     format:lab.format,usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC});
   lab.context={getCurrentTexture:()=>texture};
  }
  const draw=()=>{lab.onFrame(performance.now());if(!lab.running)throw Error(deviceError||'WebGPU engine stopped');};
  const drain=()=>lab.device.queue.onSubmittedWorkDone();
  const warmup=await runBatched({submit:draw,drain,now:()=>performance.now(),stop:()=>stopRequested,batch:Math.min(16,c.batch),durationMs:250});
  if(stopRequested)throw Error(deviceError||'Stopped');
  const metrics=await runBatched({submit:draw,drain,now:()=>performance.now(),stop:()=>stopRequested,
   batch:c.batch,durationMs:c.durationMs,
   onBatch:p=>send({type:'progress',index,total,name:c.name,...p})});
  let sample=null;
  if(texture){
   // An observed GPUTexture readback prevents measuring a never-consumed render target.
   // The 16x16 sample is read AFTER the timed section and is not a visual-correctness proof.
   const buffer=lab.device.createBuffer({size:256*16,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
   try{
    const encoder=lab.device.createCommandEncoder();
    encoder.copyTextureToBuffer({texture,origin:{x:Math.max(0,Math.floor((width-16)/2)),y:Math.max(0,Math.floor((height-16)/2))}},
      {buffer,bytesPerRow:256,rowsPerImage:16},[16,16,1]);
    lab.device.queue.submit([encoder.finish()]);
    await buffer.mapAsync(GPUMapMode.READ);
    const bytes=new Uint8Array(buffer.getMappedRange());let hash=2166136261,nonzero=0;
    for(let y=0;y<16;y++)for(let x=0;x<16*4;x++){const b=bytes[y*256+x];hash=Math.imul(hash^b,16777619)>>>0;if(b)nonzero++;}
    sample={width:16,height:16,hash:hash.toString(16).padStart(8,'0'),nonzeroBytes:nonzero};
    buffer.unmap();
   }finally{buffer.destroy();}
  }
  const result={name:c.name,status:stopRequested?'interrupted':'completed',config:c,canvas:{width,height,pixels:width*height},readbackSample:sample,
    metrics:{...metrics,totalParticleUpdates:metrics.completedFrames*c.count*c.steps,
     completedMillionParticleUpdatesPerSecond:metrics.elapsedMs>0?metrics.completedFrames*c.count*c.steps/(metrics.elapsedMs*1000):null,
     warmupCompletedFrames:warmup.completedFrames,warmupMs:warmup.elapsedMs}};
  return result;
 } finally{
  lab.paused=true;lab.context=realContext;
  await lab.device.queue.onSubmittedWorkDone();
  if(texture)texture.destroy();
 }
}
async function start(custom=null,environment={}){
 if(!ready||running)throw Error('Not ready or already running');
 running=true;stopRequested=false;deviceError=null;
 const cases=custom?[validate(custom)]:DEFAULT_CASES.map(validate);
 report={app:'PocketBench uncapped queue-completed throughput',version:'1.0.0',status:'running',
  startedAt:new Date().toISOString(),endedAt:null,environment,results:[],plan:cases,
  methodology:{scheduler:'No RAF, no animation pulse; bounded GPU command batches and queue.onSubmittedWorkDone after every batch.',
   completion:'Counts prior GPUQueue work processed, not compositor presentation or GPU-only shader throughput.',
   visual:'All render passes target an offscreen GPUTexture; visible canvas is intentionally static. A 16x16 texture sample is copied/read AFTER timing (not proof of visual correctness).',
   simulation:'Unmodified dual-attractor particle engine and original/fused kernels; 1/120-second integration per step per iteration, not wall-clock-correct physics at uncapped rates.',
   gpuTiming:'Per-pass timestamp sampling disabled to avoid mapAsync overhead; prior presentation suite provides pass timestamps.',
   measurement:'Warmup then timed bounded batches; elapsed includes JavaScript encoding, submission, browser scheduling and GPU queue completion.',
   limits:'No temperature, power, scanout or visible FPS measurement. Short cases do not establish thermal sustainability.'},error:null};
 send({type:'suite-start',total:cases.length,report});
 try{
  for(let i=0;i<cases.length&&!stopRequested;i++){
   send({type:'run-start',index:i+1,total:cases.length,config:cases[i]});
   const result=await execute(cases[i],i+1,cases.length);
   report.results.push(result);send({type:'run-end',index:i+1,total:cases.length,result,report});
  }
 }catch(e){report.error=String(e?.stack||e);send({type:'error',message:report.error});}
 finally{report.status=report.error?'failed':stopRequested?'partial':'completed';report.endedAt=new Date().toISOString();running=false;lab.paused=true;send({type:'suite-end',report});}
}
if(typeof self!=='undefined')self.onmessage=async({data})=>{
 try{
  if(data.type==='init')await init(data.canvas,data.environment);
  if(data.type==='start')await start(data.config??null,data.environment);
  if(data.type==='stop')stopRequested=true;
 }catch(e){send({type:'error',message:String(e?.stack||e)});}
};
