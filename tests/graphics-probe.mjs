import assert from 'node:assert/strict';
import {MODES,optionsFromQuery,analyze,stats,createRenderer} from '../graphics-probe-core.js';
assert.equal(MODES.length,6);
assert.deepEqual([...new Set(MODES.map(m=>m.api))],['webgl2','webgpu']);
assert.equal(MODES.filter(m=>m.scheduler==='main-relay').length,2);
assert.deepEqual(optionsFromQuery(new URLSearchParams('effort=48&duration=0&scale=42')),{durationMs:1500,warmupMs:500,scale:1,effort:48});
assert.equal(stats([5,1,3]).median,3);
const m=analyze([100,108,116,124],[1,2,3,4],32);
assert.equal(m.drawSubmissions,4);assert.equal(m.submittedHz,125);assert.equal(m.frameIntervalMs.median,8);
assert.equal(m.gpuTimingMs,undefined);
let draws=0,submits=0;
const fakeGL={VERTEX_SHADER:1,FRAGMENT_SHADER:2,COMPILE_STATUS:3,LINK_STATUS:4,TRIANGLES:5,
  MAX_TEXTURE_SIZE:6,RENDERER:7,VENDOR:8,VERSION:9,SHADING_LANGUAGE_VERSION:10,NO_ERROR:0,
  createShader:()=>({}),shaderSource:(s,code)=>{assert.match(code,/void main\(/)},compileShader:()=>{},getShaderParameter:()=>true,
  createProgram:()=>({}),attachShader:()=>{},linkProgram:()=>{},deleteShader:()=>{},getProgramParameter:()=>true,
  createVertexArray:()=>({}),bindVertexArray:()=>{},useProgram:()=>{},getUniformLocation:()=>({}),
  viewport:()=>{},disable:()=>{},DEPTH_TEST:12,BLEND:13,uniform1f:()=>{},drawArrays:()=>{draws++},flush:()=>{},
  getExtension:()=>null,getParameter:()=>128,getContextAttributes:()=>({alpha:false}),getError:()=>0,
  deleteVertexArray:()=>{},deleteProgram:()=>{}
};
const gl=await createRenderer('webgl2',{width:640,height:180,getContext:name=>name==='webgl2'?fakeGL:null},24);
gl.draw(100);gl.draw(200);assert.equal(draws,2);assert.equal(gl.capabilities.webgl2,true);assert.equal(gl.check(),null);gl.dispose();
const originalNavigator=globalThis.navigator,originalBufferUsage=globalThis.GPUBufferUsage;
try{
 const fakeDevice={lost:new Promise(()=>{}),createShaderModule:({code})=>{assert.match(code,/@fragment/);return {getCompilationInfo:async()=>({messages:[]})}},
  createRenderPipelineAsync:async()=>({getBindGroupLayout:()=>({})}),createBuffer:()=>({destroy:()=>{}}),
  createBindGroup:()=>({}),queue:{writeBuffer:()=>{},submit:()=>{submits++}},createCommandEncoder:()=>({beginRenderPass:()=>({setPipeline:()=>{},setBindGroup:()=>{},draw:()=>{},end:()=>{}}),finish:()=>({})}),destroy:()=>{}};
 const gpu={requestAdapter:async()=>({requestDevice:async()=>fakeDevice,features:new Set(['timestamp-query']),limits:{maxTextureDimension2D:16384},info:{vendor:'apple'}}),getPreferredCanvasFormat:()=> 'bgra8unorm'};
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{gpu}});
 globalThis.GPUBufferUsage={UNIFORM:64,COPY_DST:8};
 const gp=await createRenderer('webgpu',{getContext:name=>name==='webgpu'?{configure:()=>{},getCurrentTexture:()=>({createView:()=>({})})}:null},8);
 gp.draw(100);gp.draw(200);assert.equal(submits,2);assert.equal(gp.capabilities.timestampQueryAvailable,true);
 assert.equal(gp.capabilities.timestampQueryEnabled,false);gp.dispose();
}finally{Object.defineProperty(globalThis,'navigator',{configurable:true,value:originalNavigator});globalThis.GPUBufferUsage=originalBufferUsage;}
console.log('PASS: modes, options, statistics, mocked WebGL2 and WebGPU renderer submissions');
