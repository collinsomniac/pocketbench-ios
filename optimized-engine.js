/* v1.1 comparative experiment: same force law and integration, fewer state transfers. */
import { GPULab } from './engine.js';
const fusedWGSL = /* wgsl */ `
struct Particle { pos: vec4f, vel: vec4f };
struct Params {
 sim: vec4f, eye: vec4f, right: vec4f, up: vec4f, forward: vec4f,
 projection: vec4f, attractorA: vec4f, attractorB: vec4f,
};
@group(0) @binding(0) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(1) var<uniform> params: Params;
@compute @workgroup_size(256)
fn advance(@builtin(global_invocation_id) gid: vec3u) {
 let i = gid.x;
 if (i >= u32(params.sim.z)) { return; }
 var p = particles[i];
 var x = p.pos.xyz;
 var v = p.vel.xyz;
 let dt = params.sim.x;
 // Same softened dual-attractor force, confinement, circulation and
 // semi-implicit Euler damping as v1; only storage scheduling changes.
 let a = params.attractorA.xyz;
 let b = params.attractorB.xyz;
 for (var s = 0u; s < u32(params.sim.w); s = s + 1u) {
   let d1 = a - x;
   let d2 = b - x;
   let inv1 = inverseSqrt(dot(d1, d1) + 0.75);
   let inv2 = inverseSqrt(dot(d2, d2) + 0.75);
   let accel = 5.0 * (d1 * inv1 * inv1 * inv1 + d2 * inv2 * inv2 * inv2)
       - 0.22 * x + 0.44 * vec3f(-x.z, 0.14 * x.x, x.x);
   let velocity = (v + accel * dt) * (1.0 - 0.075 * dt);
   let position = x + velocity * dt;
   v = velocity;
   x = position;
 }
 p.pos = vec4f(x, p.pos.w);
 p.vel = vec4f(v, p.vel.w);
 particles[i] = p;
}
`;
const quantile = (xs, q) => {
 if (!xs.length) return null;
 const v = [...xs].sort((a,b)=>a-b), index = (v.length-1)*q;
 const lo = Math.floor(index), hi = Math.ceil(index);
 return v[lo] + (v[hi] - v[lo])*(index-lo);
};
const norm = a => { const l = Math.hypot(...a)||1; return a.map(x=>x/l); };
const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export class OptimizedLab extends GPULab {
 constructor(canvas, emit, raf) {
  super(canvas, emit, raf);
  this.mode = 'fused';
  this.fusedAvailable = false;
  this.previousFrameAt = null;
  this.reportExtra = null;
  const originalEmit = this.emit;
  this.emit = message => {
   if (message.type === 'benchmark-end') {
    message.report.version = '1.1.0';
    message.report.kernel = this.mode;
    message.report.config.kernel = this.mode;
    message.report.analysis = this.reportExtra;
    message.report.methodology = 'Paired baseline/fused kernels; same original force law, initial seed, dt and frozen-per-frame attractors. GPU timestamps are pass spans, not end-to-end frame times. Refresh-dependent fixed substeps retained for v1 comparability.';
    this.reportExtra = null;
   }
   originalEmit(message);
  };
 }
 async init() {
  await super.init();
  this.baselinePipeline = this.compute;
  try {
   const module = this.device.createShaderModule({label:'Fused integration v1.1', code:fusedWGSL});
   const errors = (await module.getCompilationInfo()).messages.filter(m=>m.type==='error');
   if (errors.length) throw new Error(errors.map(m=>`${m.lineNum}:${m.linePos} ${m.message}`).join(' | '));
   this.fusedPipeline = await this.device.createComputePipelineAsync({
    layout: this.device.createPipelineLayout({bindGroupLayouts:[this.computeLayout]}),
    compute:{module,entryPoint:'advance'},
   });
   this.fusedAvailable = true;
   this.emit({type:'notice',message:'Fused kernel ready. Baseline remains available for A/B measurements.'});
  } catch(err) {
   this.mode='baseline';
   this.emit({type:'notice',message:`Fused kernel unavailable; baseline continues: ${err.message}`});
  }
  this.emit({type:'kernel-ready',fusedAvailable:this.fusedAvailable,mode:this.mode});
 }
 setOptions(options) {
  if (options.kernel != null) {
   if (this.bench) { this.emit({type:'notice',message:'Finish benchmark before changing kernels.'}); return; }
   if (!['baseline','fused'].includes(options.kernel)) throw new Error('Unknown kernel');
   if (options.kernel==='fused' && !this.fusedAvailable) { this.emit({type:'notice',message:'Fused shader is unavailable on this adapter.'}); return; }
   this.mode=options.kernel;
   this.emit({type:'kernel-ready',fusedAvailable:this.fusedAvailable,mode:this.mode});
  }
  const {kernel,...rest}=options;
  if (Object.keys(rest).length) super.setOptions(rest);
 }
 updateUniform() {
  const f=this.uniformData;
  const cp=Math.cos(this.pitch);
  const eye=[Math.sin(this.yaw)*cp*this.distance,Math.sin(this.pitch)*this.distance,Math.cos(this.yaw)*cp*this.distance];
  const forward=norm(eye.map(v=>-v));
  const right=norm(cross(forward,[0,1,0]));
  const up=norm(cross(right,forward));
  f.set([1/120,this.time,this.count,this.steps],0);
  f.set([...eye,0],4); f.set([...right,0],8); f.set([...up,0],12); f.set([...forward,0],16);
  f.set([this.canvas.width/Math.max(1,this.canvas.height),Math.tan((64*Math.PI/180)/2),0.035,0.50],20);
  const t=this.time;
  f.set([2*Math.sin(t*0.29),0.9*Math.sin(t*0.17),2*Math.cos(t*0.29),0],24);
  f.set([2*Math.cos(t*0.23),0.9*Math.cos(t*0.19),-2*Math.sin(t*0.23),0],28);
  this.device.queue.writeBuffer(this.uniform,0,f);
 }
 startBenchmark(durationMs=8000) {
  this.previousFrameAt=null;
  super.startBenchmark(durationMs);
  if(this.bench) {this.bench.intervals=[];this.bench.config.kernel=this.mode;}
 }
 finishBenchmark(now) {
  const b=this.bench;
  if(b) this.reportExtra={
   gpuComputeP10Ms:quantile(b.gpuCompute,.1),gpuComputeP90Ms:quantile(b.gpuCompute,.9),
   gpuRenderP90Ms:quantile(b.gpuRender,.9),
   frameIntervalMedianMs:quantile(b.intervals,.5),frameIntervalP95Ms:quantile(b.intervals,.95),
   intervalSamples:b.intervals.length,
  };
  super.finishBenchmark(now);
 }
 onFrame(now) {
  if(!this.running)return;
  this.raf(this.onFrame);
  if(this.paused&&!this.bench)return;
  try {
   const bench=this.bench;
   if(bench&&now>=bench.endsAt){this.finishBenchmark(now);return;}
   if(bench&&now>=bench.warmupEnd&&this.previousFrameAt!=null){
    const delta=now-this.previousFrameAt;
    if(delta>0&&delta<1000)bench.intervals.push(delta);
   }
   this.previousFrameAt=now;
   this.frameNumber++;
   this.time+=this.steps/120;
   this.updateUniform();
   const sample=this.hasTimestamp&&!this.queryPending&&this.frameNumber%this.sampleEvery===0;
   const encoder=this.device.createCommandEncoder();
   const desc=sample?{timestampWrites:{querySet:this.querySet,beginningOfPassWriteIndex:0,endOfPassWriteIndex:1}}:{};
   const pass=encoder.beginComputePass(desc);
   const fused=this.mode==='fused'&&this.fusedAvailable;
   pass.setPipeline(fused?this.fusedPipeline:this.baselinePipeline);
   pass.setBindGroup(0,this.computeBindGroup);
   const repeats=fused?1:this.steps;
   for(let s=0;s<repeats;s++)pass.dispatchWorkgroups(Math.ceil(this.count/256));
   pass.end();
   if(this.render){
    const renderDesc={colorAttachments:[{view:this.context.getCurrentTexture().createView(),clearValue:{r:.012,g:.021,b:.048,a:1},loadOp:'clear',storeOp:'store'}]};
    if(sample)renderDesc.timestampWrites={querySet:this.querySet,beginningOfPassWriteIndex:2,endOfPassWriteIndex:3};
    const draw=encoder.beginRenderPass(renderDesc);
    draw.setPipeline(this.graphics);draw.setBindGroup(0,this.renderBindGroup);draw.draw(4,this.count);draw.end();
   }
   if(sample){
    const n=this.render?4:2;
    encoder.resolveQuerySet(this.querySet,0,n,this.resolve,0);
    encoder.copyBufferToBuffer(this.resolve,0,this.readback,0,n*8);
    this.queryPending=true;
   }
   this.device.queue.submit([encoder.finish()]);
   if(sample)this.takeGPUReading(this.render);
   if(bench&&now>=bench.warmupEnd)bench.frames++;
   this.fpsFrames++;
   if(now-this.fpsStart>500){
    this.lastFps=this.fpsFrames*1000/(now-this.fpsStart);
    this.emit({type:'fps',fps:this.lastFps,frameNumber:this.frameNumber});
    this.fpsFrames=0;this.fpsStart=now;
   }
  }catch(error){this.running=false;this.emit({type:'error',message:`Rendering stopped: ${error.stack||error.message}`});}
 }
}
