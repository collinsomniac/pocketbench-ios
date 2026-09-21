import assert from 'node:assert/strict';
import {SuiteRunner} from '../suite-relay-runner.js';
import {PresentationRunner} from '../suite-presentation-runner.js';
let textures=0,destroyed=0,onscreenAccesses=0,offscreenAccesses=0;
globalThis.GPUTextureUsage={RENDER_ATTACHMENT:16};
const presented={createView(){onscreenAccesses++;return {};}},native={getCurrentTexture(){return presented;}};
const runner=new PresentationRunner({},()=>{});
runner.lab={context:native,canvas:{width:880,height:1740},format:'bgra8unorm',
 device:{createTexture(opts){textures++;assert.deepEqual(opts.size,[880,1740,1]);assert.equal(opts.usage,16);return {createView(){offscreenAccesses++;return {};},destroy(){destroyed++;}};}},
 setOptions({scale}){assert(scale===1);}};
runner.presentContext=native;
runner.report={methodology:{}};
runner.drain=async()=>{};
const saved=SuiteRunner.prototype.execute;
SuiteRunner.prototype.execute=async function(config){
 const tex=this.lab.context.getCurrentTexture();tex.createView();
 return {config,status:'completed',metrics:{submittedFramesPerSecond:120}};
};
try{
 const off=await runner.execute({name:'offscreen-65k',render:true,scale:1});
 assert.equal(off.presentationMode,'offscreen-texture');
 assert.equal(runner.lab.context,native);assert.equal(textures,1);assert.equal(offscreenAccesses,1);assert.equal(destroyed,1);
 const on=await runner.execute({name:'onscreen-65k',render:true,scale:1});
 assert.equal(on.presentationMode,'visible-canvas');assert.equal(onscreenAccesses,1);assert.equal(textures,1);
 const compute=await runner.execute({name:'compute-8k',render:false,scale:1});
 assert.equal(compute.presentationMode,'compute-only');
 assert.equal(runner.report.experiment,'particle-presentation-isolation-v1');
 console.log('PASS presentation isolation: offscreen GPUTexture rendering, restored visible context, texture disposal and per-case report labels');
}finally{SuiteRunner.prototype.execute=saved;}
