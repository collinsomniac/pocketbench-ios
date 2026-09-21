/* Uncapped particle work with every intermediate rendered frame observable on the GPU. */
import {ObservedLab} from './observed-engine.js';
import {makeFrameCapture} from './frame-observer.js';

export async function runBatched({submit,drain,now,stop,batch=16,durationMs=2500,onBatch=()=>{}}){
  if(!Number.isInteger(batch)||batch<1||batch>128)throw Error('Invalid bounded batch size');
  if(!(durationMs>=100&&durationMs<=15000))throw Error('Invalid duration');
  const start=now();let completed=0,requested=0,cpuSubmissionMs=0,queueWaitMs=0;const batches=[];
  while(now()-start<durationMs&&!stop()){
    const t=now();for(let i=0;i<batch&&!stop();i++){submit();requested++;}
    const sent=now();cpuSubmissionMs+=sent-t;
    if(requested===completed)break;
    await drain();const end=now();queueWaitMs+=end-sent;
    const count=requested-completed;completed=requested;
    batches.push({completedFrames:count,elapsedMs:end-t,submitMs:sent-t,queueWaitMs:end-sent});
    onBatch({completed,elapsedMs:end-start,batches:batches.length});
  }
  const elapsedMs=now()-start;
  return {completedFrames:completed,elapsedMs,completedFramesPerSecond:completed*1000/elapsedMs,
    cpuSubmissionMs,queueWaitMs,batches};
}
const CASES=[
  {name:'small-observed',count:65536,steps:2,kernel:'fused',mode:'offscreen',size:'small',batch:16,durationMs:2500,observe:true},
  {name:'large-unobserved-control',count:65536,steps:2,kernel:'fused',mode:'offscreen',size:'large',batch:16,durationMs:2500,observe:false},
  {name:'large-observed',count:65536,steps:2,kernel:'fused',mode:'offscreen',size:'large',batch:16,durationMs:2500,observe:true},
  {name:'large-observed-batch64',count:65536,steps:2,kernel:'fused',mode:'offscreen',size:'large',batch:64,durationMs:2500,observe:true},
  {name:'compute-heavy-control',count:262144,steps:8,kernel:'fused',mode:'compute',size:'large',batch:16,durationMs:2500,observe:false}
];
const SIZES={small:[768,390],large:[880,1738]};
let lab,ready=false,running=false,stopRequested=false,report,deviceError=null;
const send=x=>self.postMessage(x);
function validate(input){const c={...input};
  if(![8192,65536,262144,524288].includes(c.count))throw Error('Invalid count');
  if(![1,2,4,8,16].includes(c.steps))throw Error('Invalid steps');
  if(!['baseline','fused'].includes(c.kernel))throw Error('Invalid kernel');
  if(!['compute','offscreen'].includes(c.mode))throw Error('Invalid mode');
  if(!SIZES[c.size])throw Error('Invalid size');
  if(![4,16,64].includes(c.batch))throw Error('Invalid batch');
  if(!Number.isFinite(c.durationMs)||c.durationMs<500||c.durationMs>15000)throw Error('Invalid duration');
  if(typeof c.observe!=='boolean')throw Error('Missing observation setting');
  if(c.mode==='compute'&&c.observe)throw Error('Image observation requires rendering');
  return c;
}
async function init(canvas,main){
  lab=new ObservedLab(canvas,m=>{if(m.type==='error'){deviceError=m.message;stopRequested=true;send(m);}else if(m.type==='notice')send(m);},()=>{});
  await lab.init();lab.paused=true;lab.sampleEvery=Number.MAX_SAFE_INTEGER;
  if(!lab.fusedAvailable)throw Error('Fused kernel unavailable: audited default suite cannot proceed');
  await lab.device.queue.onSubmittedWorkDone();ready=true;
  send({type:'ready',environment:{main,worker:{userAgent:navigator.userAgent,hardwareConcurrency:navigator.hardwareConcurrency},gpu:{adapterInfo:{vendor:lab.adapter.info?.vendor??null,architecture:lab.adapter.info?.architecture??null,device:lab.adapter.info?.device??null},format:lab.format,timestampSamplingEnabled:false,fusedAvailable:lab.fusedAvailable,limits:{maxBufferSize:lab.device.limits.maxBufferSize}},workerOffscreenCanvas:true}});
}
async function execute(raw,index,total){
  const c=validate(raw),[width,height]=SIZES[c.size];
  await lab.device.queue.onSubmittedWorkDone();
  lab.paused=false;lab.setOptions({count:c.count,steps:c.steps,render:c.mode==='offscreen',kernel:c.kernel,scale:1});
  lab.resize({width,height,dpr:1});lab.resetParticles(c.count);lab.sampleEvery=Number.MAX_SAFE_INTEGER;
  const old=lab.context;let texture=null,capture=null;
  try{
    if(c.mode==='offscreen'){
      texture=lab.device.createTexture({label:'Observed offscreen particle target',size:[width,height,1],format:lab.format,
        usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC});
      lab.context={getCurrentTexture:()=>texture};
    }
    const draw=()=>{lab.onFrame(performance.now());if(!lab.running)throw Error(deviceError||'WebGPU stopped');};
    const drain=()=>lab.device.queue.onSubmittedWorkDone();
    const warmup=await runBatched({submit:draw,drain,now:()=>performance.now(),stop:()=>stopRequested,batch:Math.min(16,c.batch),durationMs:1600});
    if(stopRequested)throw Error(deviceError||'Stopped');
    if(c.observe){capture=makeFrameCapture(lab.device,texture,width,height,c.durationMs,lab.format);lab.frameCapture=capture;}
    const metrics=await runBatched({submit:draw,drain,now:()=>performance.now(),stop:()=>stopRequested,batch:c.batch,durationMs:c.durationMs,
      onBatch:p=>send({type:'progress',index,total,name:c.name,...p})});
    lab.frameCapture=null;
    const observation=capture?await capture.collect():null;
    if(capture&&observation.capturedFrames!==metrics.completedFrames)throw Error('Incomplete per-frame observation');
    return {name:c.name,status:stopRequested?'interrupted':'completed',config:c,canvas:{width,height,pixels:width*height},observation,
      metrics:{...metrics,totalParticleUpdates:metrics.completedFrames*c.count*c.steps,
        completedMillionParticleUpdatesPerSecond:metrics.completedFrames*c.count*c.steps/(metrics.elapsedMs*1000),
        warmupCompletedFrames:warmup.completedFrames,warmupMs:warmup.elapsedMs},
      warnings:observation?.framesWithNonBackground===0?['The copied regions contained only background; image content could not be validated.']:[]};
  }finally{
    lab.frameCapture=null;lab.paused=true;lab.context=old;
    await lab.device.queue.onSubmittedWorkDone();if(capture)capture.destroy();if(texture)texture.destroy();
  }
}
async function start(config=null,environment={}){
  if(!ready||running)throw Error('Not ready or already running');running=true;stopRequested=false;deviceError=null;
  const cases=(config?[validate(config)]:CASES.map(validate));
  report={app:'PocketBench observed throughput audit',version:'2.0.0',status:'running',startedAt:new Date().toISOString(),endedAt:null,
    environment,plan:cases,results:[],methodology:{
      scheduler:'Uncapped, GPU queue-completed bounded batches. No animation callbacks or display presentation.',
      capture:'When observe=true, two fixed 16x4 render-target patches are copied to unique GPU buffer offsets after EVERY render pass, before the next clear; buffer mapped after timing.',
      warmup:'1600ms of submitted, GPU-completed work before timing each case; GPU state persists after warmup, initialized deterministically at case start.',
      metric:'Completed command-submission iterations per elapsed wall second, inclusive of CPU encoding, queue drain; observed mode includes two texture copies per frame.',
      limitations:'Sparse patches cannot verify full-image correctness, actual display FPS, thermal sustainability, or exact per-pass GPU time. Compute-only does not verify per-frame particle positions.',
      physics:'Original 1/120s substep per iteration, not real-time-correct physics at uncapped rates.'},error:null};
  send({type:'suite-start',total:cases.length,report});
  try{for(let i=0;i<cases.length&&!stopRequested;i++){
    send({type:'run-start',index:i+1,total:cases.length,config:cases[i]});
    const result=await execute(cases[i],i+1,cases.length);report.results.push(result);send({type:'run-end',index:i+1,total:cases.length,result,report});
  }}catch(e){report.error=String(e?.stack||e);send({type:'error',message:report.error});}
  finally{report.status=report.error?'failed':stopRequested?'partial':'completed';report.endedAt=new Date().toISOString();running=false;lab.paused=true;send({type:'suite-end',report});}
}
if(typeof self!=='undefined')self.onmessage=async({data})=>{try{
  if(data.type==='init')await init(data.canvas,data.environment);
  else if(data.type==='start')await start(data.config??null,data.environment);
  else if(data.type==='stop')stopRequested=true;
}catch(e){send({type:'error',message:String(e.stack||e)});}};
