/* WebGL2/WebGPU graphics-and-scheduler probe. Not a particle physics equivalence test. */
export const PROBE_VERSION = '1.0.0';
export const MODES = [
  {id:'webgl-main',api:'webgl2',scheduler:'main-raf',label:'WebGL 2 · main-thread rAF'},
  {id:'webgpu-main',api:'webgpu',scheduler:'main-raf',label:'WebGPU · main-thread rAF'},
  {id:'webgl-worker-raf',api:'webgl2',scheduler:'worker-raf',label:'WebGL 2 · worker rAF'},
  {id:'webgpu-worker-raf',api:'webgpu',scheduler:'worker-raf',label:'WebGPU · worker rAF'},
  {id:'webgl-relay',api:'webgl2',scheduler:'main-relay',label:'WebGL 2 · main rAF → worker'},
  {id:'webgpu-relay',api:'webgpu',scheduler:'main-relay',label:'WebGPU · main rAF → worker'}
];
export function optionsFromQuery(query) {
 const value=(name,def,min,max)=>{const v=query.get(name);if(v===null)return def;const n=Number(v);return Number.isFinite(n)?Math.max(min,Math.min(max,n)):def;};
 const effort=[8,24,48].reduce((a,b)=>Math.abs(b-value('effort',24,8,48))<Math.abs(a-value('effort',24,8,48))?b:a,8);
 return {durationMs:Math.round(value('duration',4000,1500,10000)),warmupMs:Math.round(value('warmup',500,250,2000)),scale:value('scale',1,0.5,1),effort};
}
export function stats(values){
 const v=values.filter(Number.isFinite).sort((a,b)=>a-b);
 if(!v.length)return {n:0,median:null,p95:null,p99:null,min:null,max:null,mean:null};
 const percentile=q=>{const k=(v.length-1)*q,l=Math.floor(k),h=Math.ceil(k);return v[l]+(v[h]-v[l])*(k-l);};
 return {n:v.length,median:percentile(.5),p95:percentile(.95),p99:percentile(.99),min:v[0],max:v.at(-1),mean:v.reduce((a,b)=>a+b,0)/v.length};
}
export function analyze(times,cpu,elapsedMs,extra={}){
 const intervals=[];for(let i=1;i<times.length;i++){const d=times[i]-times[i-1];if(d>0&&d<1000)intervals.push(d);}
 return {drawSubmissions:times.length,measureElapsedMs:elapsedMs,submittedHz:elapsedMs>0?times.length*1000/elapsedMs:null,
  frameIntervalMs:stats(intervals),cpuDrawSubmitMs:stats(cpu),gapsOver12ms:intervals.filter(v=>v>12).length,
  gapsOver20ms:intervals.filter(v=>v>20).length,raw:{timestampsMs:times,frameIntervalsMs:intervals,cpuDrawSubmitMs:cpu},...extra};
}
const VERT_GL=`#version 300 es
precision highp float;
out vec2 v_uv;
void main(){
 vec2 p=vec2(float((gl_VertexID << 1)&2),float(gl_VertexID&2));
 v_uv=p*0.5;
 gl_Position=vec4(p*2.0-1.0,0.0,1.0);
}`;
function fragmentGL(effort){return `#version 300 es
precision highp float;
in vec2 v_uv;
uniform float u_phase;
out vec4 fragColor;
void main(){
 float wave=0.0;
 for(int i=0;i<${effort};++i){
  float k=float(i)+1.0;
  wave+=sin((v_uv.x*6.0+v_uv.y*3.0)*k*0.09+u_phase*0.6+k*0.31)
   *cos((v_uv.y*5.0-v_uv.x*2.0)*k*0.07-u_phase*0.3)*0.015;
 }
 float bar=exp(-65.0*abs(fract(v_uv.x-u_phase*0.15)-0.5));
 vec3 col=0.42+0.25*sin(vec3(0.0,2.0,4.0)+u_phase*0.75+v_uv.x*9.0+wave*4.0);
 fragColor=vec4(col+bar*vec3(0.45,0.35,0.25),1.0);
}`;}
function shaderGL(gl,type,source){const shader=gl.createShader(type);if(!shader)throw Error('createShader failed');gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){const error=gl.getShaderInfoLog(shader);gl.deleteShader(shader);throw Error(`GLSL compilation: ${error}`);}return shader;}
function createGL(canvas,effort){
 const gl=canvas.getContext('webgl2',{alpha:false,antialias:false,depth:false,stencil:false,preserveDrawingBuffer:false,powerPreference:'high-performance'});
 if(!gl)throw Error('WebGL 2 context unavailable on this canvas');
 const vert=shaderGL(gl,gl.VERTEX_SHADER,VERT_GL),frag=shaderGL(gl,gl.FRAGMENT_SHADER,fragmentGL(effort));
 const program=gl.createProgram();gl.attachShader(program,vert);gl.attachShader(program,frag);gl.linkProgram(program);gl.deleteShader(vert);gl.deleteShader(frag);
 if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(`WebGL program link: ${gl.getProgramInfoLog(program)}`);
 const vao=gl.createVertexArray();gl.bindVertexArray(vao);gl.useProgram(program);
 const phase=gl.getUniformLocation(program,'u_phase');if(phase==null)throw Error('WebGL phase uniform optimized out');
 gl.viewport(0,0,canvas.width,canvas.height);gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);
 const timer=gl.getExtension('EXT_disjoint_timer_query_webgl2');
 const caps={renderer:gl.getParameter(gl.RENDERER),vendor:gl.getParameter(gl.VENDOR),version:gl.getParameter(gl.VERSION),
  shadingLanguageVersion:gl.getParameter(gl.SHADING_LANGUAGE_VERSION),maxTextureSize:gl.getParameter(gl.MAX_TEXTURE_SIZE),
  timerQuerySupported:!!timer,actualContextAttributes:gl.getContextAttributes(),webgl2:true};
 return {api:'webgl2',capabilities:caps,draw(now){gl.uniform1f(phase,now*0.001);gl.drawArrays(gl.TRIANGLES,0,3);gl.flush();},
  check(){const error=gl.getError();return error===gl.NO_ERROR?null:`WebGL error 0x${error.toString(16)}`;},
  dispose(){gl.deleteVertexArray(vao);gl.deleteProgram(program);gl.getExtension('WEBGL_lose_context')?.loseContext();}};
}
function shaderWGSL(effort){return `
struct Params { values: vec4f };
@group(0) @binding(0) var<uniform> params: Params;
struct VertexOut { @builtin(position) position: vec4f, @location(0) uv: vec2f };
@vertex fn vertex(@builtin(vertex_index) id: u32) -> VertexOut {
 var p=array<vec2f,3>(vec2f(-1.0,-1.0),vec2f(3.0,-1.0),vec2f(-1.0,3.0));
 var out:VertexOut;out.position=vec4f(p[id],0.0,1.0);out.uv=(p[id]+vec2f(1.0))*0.5;return out;
}
@fragment fn fragment(@location(0) uv:vec2f)->@location(0) vec4f {
 let phase=params.values.x;
 var wave=0.0;
 for(var i=0u;i<${effort}u;i=i+1u){
  let k=f32(i)+1.0;
  wave=wave+sin((uv.x*6.0+uv.y*3.0)*k*0.09+phase*0.6+k*0.31)
   *cos((uv.y*5.0-uv.x*2.0)*k*0.07-phase*0.3)*0.015;
 }
 let bar=exp(-65.0*abs(fract(uv.x-phase*0.15)-0.5));
 let col=vec3f(0.42)+vec3f(0.25)*sin(vec3f(0.0,2.0,4.0)+vec3f(phase*0.75+uv.x*9.0+wave*4.0));
 return vec4f(col+bar*vec3f(0.45,0.35,0.25),1.0);
}`;}
async function createGPU(canvas,effort){
 if(!globalThis.navigator?.gpu)throw Error('navigator.gpu unavailable in this execution context');
 const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});if(!adapter)throw Error('WebGPU adapter request returned null');
 const device=await adapter.requestDevice();
 let lost=null;device.lost.then(info=>{lost=`WebGPU device lost: ${info.reason} ${info.message}`;}).catch(()=>{});
 const context=canvas.getContext('webgpu');if(!context){device.destroy();throw Error('WebGPU canvas context unavailable');}
 const format=navigator.gpu.getPreferredCanvasFormat();
 context.configure({device,format,alphaMode:'opaque'});
 const module=device.createShaderModule({code:shaderWGSL(effort),label:'Cross API fragment probe'});
 if(module.getCompilationInfo){const info=await module.getCompilationInfo();const errors=info.messages.filter(m=>m.type==='error');if(errors.length)throw Error('WGSL compilation: '+errors.map(m=>m.message).join(' | '));}
 const pipeline=await device.createRenderPipelineAsync({layout:'auto',vertex:{module,entryPoint:'vertex'},fragment:{module,entryPoint:'fragment',targets:[{format}]},primitive:{topology:'triangle-list'}});
 const uniform=device.createBuffer({size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
 const bind=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:uniform}}]});
 const params=new Float32Array(4);
 const info=adapter.info||{};
 const caps={adapter:{vendor:info.vendor||null,architecture:info.architecture||null,device:info.device||null,description:info.description||null},
  fallbackAdapter:adapter.isFallbackAdapter===true,format,timestampQueryAvailable:adapter.features.has('timestamp-query'),
  timestampQueryEnabled:false,features:[...adapter.features].sort(),maxTextureDimension2D:adapter.limits.maxTextureDimension2D};
 return {api:'webgpu',capabilities:caps,draw(now){if(lost)throw Error(lost);params[0]=now*0.001;device.queue.writeBuffer(uniform,0,params);
  const encoder=device.createCommandEncoder();const pass=encoder.beginRenderPass({colorAttachments:[{view:context.getCurrentTexture().createView(),clearValue:{r:0.02,g:0.05,b:0.08,a:1},loadOp:'clear',storeOp:'store'}]});
  pass.setPipeline(pipeline);pass.setBindGroup(0,bind);pass.draw(3);pass.end();device.queue.submit([encoder.finish()]);},
  check(){return lost;},dispose(){try{uniform.destroy();device.destroy();}catch{}}};
}
export async function createRenderer(api,canvas,effort){if(api==='webgl2')return createGL(canvas,effort);if(api==='webgpu')return createGPU(canvas,effort);throw Error('Unknown API');}
