import {OptimizedLab} from './optimized-engine.js';
import {SUITE_VERSION, validatePlan, expandPlan, summarize, comparisons} from './suite-plan.js';
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const nextFrame=()=>new Promise(resolve=>typeof requestAnimationFrame==='function'?requestAnimationFrame(resolve):setTimeout(()=>resolve(performance.now()),16));
function envSnapshot(){
 const nav=globalThis.navigator||{}, screen=globalThis.screen;
 return {
  userAgent:nav.userAgent??null,platform:nav.platform??null,language:nav.language??null,
  hardwareConcurrency:nav.hardwareConcurrency??null,deviceMemoryGiB:nav.deviceMemory??null,
  connection:nav.connection?{effectiveType:nav.connection.effectiveType??null,saveData:nav.connection.saveData??null}:null,
  crossOriginIsolated:globalThis.crossOriginIsolated??null,secureContext:globalThis.isSecureContext??null,
  userAgentData:nav.userAgentData?{brands:nav.userAgentData.brands??null,mobile:nav.userAgentData.mobile??null}:null,
  screen:screen?{width:screen.width,height:screen.height,colorDepth:screen.colorDepth,orientation:screen.orientation?.type??null}:null,
  devicePixelRatio:globalThis.devicePixelRatio??null,
  worker:typeof document==='undefined',scheduler:typeof requestAnimationFrame==='function'?'requestAnimationFrame':'setTimeout(16)',
  visualViewport:globalThis.visualViewport?{width:visualViewport.width,height:visualViewport.height,scale:visualViewport.scale}:null,
  visibility:typeof document!=='undefined'?document.visibilityState:'worker-unobservable',
  features:{webgpu:!!nav.gpu,offscreenCanvas:typeof OffscreenCanvas!=='undefined',sharedArrayBuffer:typeof SharedArrayBuffer!=='undefined',webAssembly:typeof WebAssembly!=='undefined'},
  performanceTimeOrigin:performance.timeOrigin
 };
}
const ADAPTER_FIELDS=['vendor','architecture','device','description','subgroupMinSize','subgroupMaxSize'];
const LIMIT_FIELDS=['maxTextureDimension1D','maxTextureDimension2D','maxTextureDimension3D','maxTextureArrayLayers','maxBindGroups','maxBindGroupsPlusVertexBuffers','maxBindingsPerBindGroup','maxDynamicUniformBuffersPerPipelineLayout','maxDynamicStorageBuffersPerPipelineLayout','maxSampledTexturesPerShaderStage','maxSamplersPerShaderStage','maxStorageBuffersPerShaderStage','maxStorageTexturesPerShaderStage','maxUniformBuffersPerShaderStage','maxUniformBufferBindingSize','maxStorageBufferBindingSize','minUniformBufferOffsetAlignment','minStorageBufferOffsetAlignment','maxVertexBuffers','maxBufferSize','maxVertexAttributes','maxVertexBufferArrayStride','maxInterStageShaderVariables','maxColorAttachments','maxColorAttachmentBytesPerSample','maxComputeWorkgroupStorageSize','maxComputeInvocationsPerWorkgroup','maxComputeWorkgroupSizeX','maxComputeWorkgroupSizeY','maxComputeWorkgroupSizeZ','maxComputeWorkgroupsPerDimension'];
const readProperties=(obj,fields)=>Object.fromEntries(fields.filter(k=>obj?.[k]!=null).map(k=>[k,typeof obj[k]==='bigint'?String(obj[k]):obj[k]]));
export class SuiteRunner {
 constructor(canvas,send,environment={}){
  this.canvas=canvas;this.send=send;this.environment=environment;this.lab=null;
  this.running=false;this.stopRequested=false;this.gpuSamples=[];this.gpuNotices=[];
  this.runState='idle';this.report=null;this.ready=false;this.fatal=null;this.visibilityInterruptions=[];
 }
 event(e){
  if(e.type==='gpu'&&this.runState==='measure')this.gpuSamples.push({computeMs:e.computeMs,renderMs:e.renderMs,atMs:performance.now()});
  if(e.type==='error'){this.fatal=e.message;this.stopRequested=true;this.send({type:'error',message:e.message});}
  if(e.type==='notice')this.gpuNotices.push({at:new Date().toISOString(),message:e.message});
  if(e.type==='ready')this.deviceInfo=e.info;
  if(e.type==='kernel-ready')this.kernelInfo=e;
 }
 async init(size){
  this.lab=new OptimizedLab(this.canvas,e=>this.event(e),()=>{});
  await this.lab.init();
  if(!this.lab.running)throw Error('GPU engine stopped during initialization');
  this.lab.paused=true;
  this.resize(size);
  const adapter=this.lab.adapter;
  let storage=null;
  try{if(navigator.storage?.estimate)storage=await navigator.storage.estimate();}catch{}
  this.environment={...envSnapshot(),...this.environment,
   storageEstimate:storage?{usageBytes:storage.usage??null,quotaBytes:storage.quota??null}:null,
   gpu:{adapterInfo:readProperties(adapter.info||{},ADAPTER_FIELDS),isFallbackAdapter:adapter.isFallbackAdapter===true,
    features:[...adapter.features].sort(),limits:readProperties(adapter.limits,LIMIT_FIELDS),preferredCanvasFormat:this.lab.format,
    timestampQueryEnabled:this.lab.hasTimestamp,fusedAvailable:this.lab.fusedAvailable},
   canvas:{width:this.canvas.width,height:this.canvas.height,cssWidth:this.lab.cssWidth,cssHeight:this.lab.cssHeight,dpr:this.lab.dpr}};
  this.ready=true;
  this.send({type:'ready',environment:this.environment});
 }
 resize(size){if(this.lab&&size)this.lab.resize(size);}
 stop(){this.stopRequested=true;this.send({type:'notice',message:'Stop requested. Finishing the current GPU submission.'});}
 visibility(hidden){if(hidden&&this.running){this.visibilityInterruptions.push({at:new Date().toISOString(),runId:this.currentRun?.runId??null});this.stopRequested=true;this.send({type:'notice',message:'Page hidden: suite will stop and retain partial results. Keep the page foregrounded for valid timings.'});}}
 async drain(){
  if(!this.lab?.device)return;
  await this.lab.device.queue.onSubmittedWorkDone();
  for(let i=0;i<150&&this.lab.queryPending;i++)await delay(20);
  if(this.lab.queryPending)this.gpuNotices.push({at:new Date().toISOString(),message:'Timestamp readback still pending at run boundary'});
 }
 async start(rawPlan){
  if(!this.ready)throw Error('Suite engine is not ready');
  if(this.running)throw Error('Suite already running');
  const plan=validatePlan(rawPlan),runs=expandPlan(plan);
  if(runs.some(r=>r.kernel==='fused')&&!this.lab.fusedAvailable)throw Error('Fused kernel unavailable; cannot perform comparable A/B suite');
  this.running=true;this.stopRequested=false;this.fatal=null;this.gpuNotices=[];this.visibilityInterruptions=[];
  this.report={app:'Pocket GPU Lab',schemaVersion:SUITE_VERSION,createdAt:new Date().toISOString(),
   startedAt:new Date().toISOString(),endedAt:null,status:'running',plan,runOrder:runs.map(r=>r.runId),
   environment:JSON.parse(JSON.stringify(this.environment)),runs:[],comparisons:[],
   methodology:{simulation:'32-byte particles, original dual-attractor force, 1/120s fixed integration substep, attractors frozen per frame',
     equivalence:'Shared deterministic initialization. GPU numeric equivalence is not verified by this suite.',
     sampling:'One asynchronous timestamp query at most every fourth frame, when previous readback has completed. Sampled pass spans only.',
     fps:'Frames submitted per active elapsed wall-clock second, dependent on browser RAF and presentation scheduling.',
     updateThroughput:'Actual submitted frames × count × steps / active wall time. GPU-equivalent throughput separately derived from median compute pass.',
     isolation:'Warmup and measured phases; await queue completion and readback before switching workloads; reset seeded particles each run.',
     caveats:['Browser timestamp availability and fidelity are implementation dependent.','GPU clock, power, temperature and memory pressure are not directly measurable here.','Worker RAF and compute-only mode are still presentation-scheduled.','Compute and render timestamp spans do not measure full GPU queue-to-present latency.','Tests are sequential, not simultaneously interleaved.']},
   interruptions:[],notices:[],error:null};
  this.send({type:'suite-start',plan,total:runs.length});
  try{
   for(let i=0;i<runs.length;i++){
    if(this.stopRequested)break;
    this.currentRun=runs[i];this.send({type:'run-start',index:i+1,total:runs.length,config:runs[i]});
    let result;
    try{result=await this.execute(runs[i]);}catch(err){result={runId:runs[i].runId,config:runs[i],status:'failed',error:String(err?.stack||err),startedAt:new Date().toISOString(),endedAt:new Date().toISOString()};this.stopRequested=true;}
    this.report.runs.push(result);
    this.report.comparisons=comparisons(this.report.runs);
    this.report.interruptions=[...this.visibilityInterruptions];
    this.report.notices=[...this.gpuNotices];
    this.send({type:'run-end',index:i+1,total:runs.length,result,report:this.report});
    if(result.status!=='completed')break;
    if(i<runs.length-1)await delay(180);
   }
  }catch(error){this.report.error=String(error?.stack||error);this.stopRequested=true;}
  finally{
   this.runState='idle';this.currentRun=null;this.running=false;
   if(this.lab)this.lab.paused=true;
   this.report.endedAt=new Date().toISOString();
   this.report.status=this.fatal?'failed':this.stopRequested?'partial':'completed';
   this.report.interruptions=[...this.visibilityInterruptions];this.report.notices=[...this.gpuNotices];
   this.report.comparisons=comparisons(this.report.runs);
   this.send({type:'suite-end',report:this.report});
  }
  return this.report;
 }
 async execute(config){
  const lab=this.lab,startedAt=new Date().toISOString();
  this.runState='preparing';
  await this.drain();
  lab.paused=false;
  const priorCount=lab.count;
  lab.setOptions({kernel:config.kernel,count:config.count,steps:config.steps,render:config.render,scale:config.scale});
  if(priorCount===config.count)lab.resetParticles(config.count);
  lab.sampleEvery=Number.MAX_SAFE_INTEGER;
  const canvasAtStart={width:lab.canvas.width,height:lab.canvas.height,cssWidth:lab.cssWidth,cssHeight:lab.cssHeight,dpr:lab.dpr};
  let warmupFrames=0;
  const warmupStart=performance.now();this.runState='warmup';
  while(performance.now()-warmupStart<config.warmupMs&&!this.stopRequested){
   const t=await nextFrame();if(this.stopRequested)break;
   lab.onFrame(t);warmupFrames++;
   if(!lab.running)throw Error(this.fatal||'GPU engine stopped during warmup');
  }
  await this.drain();
  const warmupElapsedMs=performance.now()-warmupStart;
  if(this.stopRequested)return {runId:config.runId,config,status:'interrupted',startedAt,endedAt:new Date().toISOString(),warmupFrames};
  this.gpuSamples=[];lab.sampleEvery=4;this.runState='measure';
  const intervals=[],cpuSubmit=[],phaseStart=performance.now();
  let submitted=0,previousFrame=null,phaseEnd=phaseStart;
  while(performance.now()-phaseStart<config.durationMs&&!this.stopRequested){
   const t=await nextFrame();if(this.stopRequested)break;
   if(previousFrame!=null&&t>previousFrame&&t-previousFrame<1000)intervals.push(t-previousFrame);
   previousFrame=t;
   const start=performance.now();lab.onFrame(t);cpuSubmit.push(performance.now()-start);
   if(!lab.running)throw Error(this.fatal||'GPU engine stopped during measurement');
   submitted++;phaseEnd=performance.now();
  }
  const activeSeconds=Math.max(0,(phaseEnd-phaseStart)/1000);
  await this.drain();
  this.runState='idle';lab.paused=true;
  const compute=summarize(this.gpuSamples.map(s=>s.computeMs));
  const render=summarize(this.gpuSamples.map(s=>s.renderMs));
  const updates=submitted*config.count*config.steps;
  const metrics={gpuComputeMs:compute,gpuRenderMs:render,frameIntervalMs:summarize(intervals),
    jsSubmitMs:summarize(cpuSubmit),submittedFrames:submitted,activeSeconds,
    submittedFramesPerSecond:activeSeconds?submitted/activeSeconds:null,
    actualMillionParticleUpdatesPerSecond:activeSeconds?updates/activeSeconds/1e6:null,
    gpuEquivalentMillionParticleUpdatesPerSecond:compute.median?config.count*config.steps/(compute.median*1000):null,
    totalParticleUpdates:updates,warmupFrames,warmupElapsedMs,
    gpuTimingAvailable:lab.hasTimestamp&&compute.n>0,missingGpuSamples:compute.n===0,
    simSecondsAtMeasureEnd:lab.time};
  return {runId:config.runId,config,status:this.stopRequested?'interrupted':'completed',startedAt,
    endedAt:new Date().toISOString(),canvas:canvasAtStart,metrics,
    raw:{gpuSamples:this.gpuSamples.map(({atMs,...v})=>v),frameIntervalsMs:intervals,jsSubmitMs:cpuSubmit},
    warnings:[...(lab.hasTimestamp?[]:['GPU timestamp-query unavailable or readback failed'])]};
 }
}
