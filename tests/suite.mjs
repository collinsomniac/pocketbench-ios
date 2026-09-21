import assert from 'node:assert/strict';
import {PRESETS,validatePlan,expandPlan,summarize,comparisons} from '../suite-plan.js';
import {SuiteRunner} from '../suite-runner.js';
assert.equal(expandPlan(validatePlan(PRESETS.balanced)).length,12);
assert.deepEqual(expandPlan(validatePlan(PRESETS.balanced)).slice(0,4).map(x=>x.kernel),['baseline','fused','fused','baseline']);
assert.equal(expandPlan(validatePlan(PRESETS.quick)).length,4);
assert.equal(expandPlan(validatePlan(PRESETS.extended)).length,16);
for(const bad of [{...PRESETS.quick,durationMs:0},{...PRESETS.quick,workloads:[{name:'evil',count:123,steps:2,render:false,scale:1}]},{...PRESETS.quick,repeats:24}])assert.throws(()=>validatePlan(bad));
const x=summarize([8,3,4,5,6]);assert.equal(x.median,5);assert.equal(x.n,5);assert.equal(summarize([]).median,null);
const c=comparisons([{status:'completed',config:{name:'a',kernel:'baseline'},metrics:{gpuComputeMs:{median:2}}},{status:'completed',config:{name:'a',kernel:'fused'},metrics:{gpuComputeMs:{median:1}}}]);
assert.equal(c[0].fusedRelativeChangePercent,-50);
globalThis.GPUShaderStage={COMPUTE:4,VERTEX:1,FRAGMENT:2};
globalThis.GPUBufferUsage={UNIFORM:64,COPY_DST:8,STORAGE:128,QUERY_RESOLVE:512,COPY_SRC:4,MAP_READ:1};
globalThis.GPUTextureUsage={RENDER_ATTACHMENT:16};
let submissions=0,dispatches=0;
const device={lost:new Promise(()=>{}),addEventListener(){},createShaderModule:()=>({getCompilationInfo:async()=>({messages:[]})}),
createBindGroupLayout:()=>({}),createPipelineLayout:()=>({}),createComputePipelineAsync:async()=>({}),createRenderPipelineAsync:async()=>({}),
createBuffer:()=>({destroy(){}}),createBindGroup:()=>({}),queue:{writeBuffer(){},submit(){submissions++},onSubmittedWorkDone:async()=>{}},
createCommandEncoder:()=>({beginComputePass:()=>({setPipeline(){},setBindGroup(){},dispatchWorkgroups(){dispatches++},end(){}}),
beginRenderPass:()=>({setPipeline(){},setBindGroup(){},draw(){},end(){}}),finish:()=>({})})};
const adapter={features:new Set(),info:{vendor:'mock',architecture:'mock'},limits:{maxBufferSize:2**30,maxStorageBufferBindingSize:2**30,maxTextureDimension2D:8192,maxComputeInvocationsPerWorkgroup:1024},requestDevice:async()=>device};
Object.defineProperty(globalThis,'navigator',{configurable:true,value:{gpu:{requestAdapter:async()=>adapter,getPreferredCanvasFormat:()=> 'bgra8unorm'},userAgent:'test'}});
const canvas={width:100,height:100,getContext:()=>({configure(){},getCurrentTexture:()=>({createView:()=>({})})})};
const messages=[];const runner=new SuiteRunner(canvas,x=>messages.push(x));await runner.init({width:100,height:100,dpr:1});
assert(runner.ready);assert(runner.environment.gpu.fusedAvailable);
const plan=validatePlan({warmupMs:250,durationMs:1000,repeats:1,workloads:[{name:'tiny',count:8192,steps:2,render:false,scale:1}]});
const report=await runner.start(plan);
assert.equal(report.runs.length,2);assert.equal(report.status,'completed');
assert.equal(report.runs[0].metrics.gpuTimingAvailable,false);
assert(report.runs[0].metrics.submittedFrames>0);
assert(report.runs[0].metrics.actualMillionParticleUpdatesPerSecond>0);
assert.equal(report.runs[0].config.kernel,'baseline');assert.equal(report.runs[1].config.kernel,'fused');
assert(dispatches>submissions);
assert.doesNotThrow(()=>JSON.stringify(report));
assert(messages.some(x=>x.type==='suite-end'));
console.log('PASS: presets, plan validation, ABBA ordering, statistics, kernel comparisons, mocked full suite and JSON export.');
console.log('NOTE: mock verifies control flow only; WebGPU shader compilation and hardware performance require a real browser/GPU.');
