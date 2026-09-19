/* Mock-only structural regression: DOES NOT demonstrate GPU speed or WGSL validity. */
import assert from 'node:assert/strict';
import {OptimizedLab} from '../optimized-engine.js';
globalThis.GPUShaderStage={COMPUTE:4,VERTEX:1,FRAGMENT:2};
globalThis.GPUBufferUsage={UNIFORM:64,COPY_DST:8,STORAGE:128,QUERY_RESOLVE:512,COPY_SRC:4,MAP_READ:1};
globalThis.GPUTextureUsage={RENDER_ATTACHMENT:16};
const logs=[];
const device={
 lost:new Promise(()=>{}),addEventListener(){},
 createShaderModule({code}){logs.push(['shader',code]);return{getCompilationInfo:async()=>({messages:[]})};},
 createBindGroupLayout({entries}){return{entries};},createPipelineLayout({bindGroupLayouts}){return{bindGroupLayouts};},
 createComputePipelineAsync:async desc=>({desc}),createRenderPipelineAsync:async desc=>({desc}),
 createBuffer:()=>({destroy(){}}),createBindGroup:()=>({}),
 queue:{writeBuffer(){},submit(){logs.push(['submit']);}},
 createCommandEncoder(){return{
 beginComputePass(){return{setPipeline(p){logs.push(['pipeline',p]);},setBindGroup(){},dispatchWorkgroups(n){logs.push(['dispatch',n]);},end(){}};},
 beginRenderPass(){return{setPipeline(){},setBindGroup(){},draw(n,instances){logs.push(['draw',n,instances]);},end(){}};},finish(){return{}},
 };},
};
const adapter={features:new Set(),info:{vendor:'test'},limits:{maxBufferSize:2**30,maxStorageBufferBindingSize:2**30,maxTextureDimension2D:8192,maxComputeInvocationsPerWorkgroup:1024},requestDevice:async()=>device};
Object.defineProperty(globalThis,'navigator',{configurable:true,value:{gpu:{requestAdapter:async()=>adapter,getPreferredCanvasFormat:()=> 'bgra8unorm'}}});
const canvas={width:300,height:200,getContext:()=>({configure(){},getCurrentTexture:()=>({createView:()=>({})})})};
const events=[],rafs=[];const lab=new OptimizedLab(canvas,e=>events.push(e),fn=>rafs.push(fn));
await lab.init();
assert(lab.fusedAvailable);
assert.equal(logs.filter(x=>x[0]==='shader').length,3);
const fusedCode=logs.find(x=>x[0]==='shader'&&x[1].includes('for (var s = 0u;'))[1];
assert(fusedCode.includes('let a = params.attractorA.xyz;'));
assert(fusedCode.includes('let b = params.attractorB.xyz;'));
assert(fusedCode.includes('p.pos = vec4f(x, p.pos.w);'));
assert(fusedCode.includes('p.vel = vec4f(v, p.vel.w);'));
lab.onFrame(performance.now());
assert.equal(logs.filter(x=>x[0]==='dispatch').length,1);
assert.equal(lab.uniformData[3],2);
lab.setOptions({kernel:'baseline'});
lab.onFrame(performance.now());
assert.equal(logs.filter(x=>x[0]==='dispatch').length,3);
lab.setOptions({steps:8,kernel:'fused',render:false});
lab.onFrame(performance.now());
assert.equal(logs.filter(x=>x[0]==='dispatch').length,4);
assert.equal(lab.uniformData[3],8);
lab.startBenchmark(2000);
lab.onFrame(lab.bench.endsAt+1);
const report=events.find(x=>x.type==='benchmark-end').report;
assert.equal(report.version,'1.1.0');assert.equal(report.kernel,'fused');
assert.equal(report.config.steps,8);assert(report.analysis);
assert.doesNotThrow(()=>JSON.stringify(report));
console.log('PASS: fused single-dispatch, baseline repeated-dispatch, unchanged steps uniform, kernel switching, and v1.1 JSON metadata.');
console.log('NOTE: mock-only; actual WGSL validation and GPU performance require a WebGPU browser/device.');
