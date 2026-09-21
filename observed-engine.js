/* Audit-only instrumentation. Physics and render pipelines inherited unchanged;
   the only render-path addition copies two texture regions after each draw pass. */
import {OptimizedLab} from './optimized-engine.js';
export class ObservedLab extends OptimizedLab {
  constructor(...args){super(...args);this.frameCapture=null;}
  onFrame(now){
    if(!this.render || !this.frameCapture)return super.onFrame(now);
    if(!this.running)return;
    this.raf(this.onFrame);
    if(this.paused&&!this.bench)return;
    try{
      const bench=this.bench;
      if(bench&&now>=bench.endsAt){this.finishBenchmark(now);return;}
      if(bench&&now>=bench.warmupEnd&&this.previousFrameAt!=null){
        const delta=now-this.previousFrameAt;if(delta>0&&delta<1000)bench.intervals.push(delta);
      }
      this.previousFrameAt=now;
      this.frameNumber++;
      this.time+=this.steps/120;
      this.updateUniform();
      const sample=this.hasTimestamp&&!this.queryPending&&this.frameNumber%this.sampleEvery===0;
      const encoder=this.device.createCommandEncoder();
      const computeDesc=sample?{timestampWrites:{querySet:this.querySet,beginningOfPassWriteIndex:0,endOfPassWriteIndex:1}}:{};
      const pass=encoder.beginComputePass(computeDesc);
      const fused=this.mode==='fused'&&this.fusedAvailable;
      pass.setPipeline(fused?this.fusedPipeline:this.baselinePipeline);
      pass.setBindGroup(0,this.computeBindGroup);
      for(let s=0;s<(fused?1:this.steps);s++)pass.dispatchWorkgroups(Math.ceil(this.count/256));
      pass.end();
      const texture=this.context.getCurrentTexture();
      const renderDesc={colorAttachments:[{view:texture.createView(),clearValue:{r:.012,g:.021,b:.048,a:1},loadOp:'clear',storeOp:'store'}]};
      if(sample)renderDesc.timestampWrites={querySet:this.querySet,beginningOfPassWriteIndex:2,endOfPassWriteIndex:3};
      const draw=encoder.beginRenderPass(renderDesc);
      draw.setPipeline(this.graphics);draw.setBindGroup(0,this.renderBindGroup);draw.draw(4,this.count);draw.end();
      this.frameCapture.capture(encoder,texture);
      if(sample){encoder.resolveQuerySet(this.querySet,0,4,this.resolve,0);encoder.copyBufferToBuffer(this.resolve,0,this.readback,0,32);this.queryPending=true;}
      this.device.queue.submit([encoder.finish()]);
      if(sample)this.takeGPUReading(true);
      if(bench&&now>=bench.warmupEnd)bench.frames++;
      this.fpsFrames++;
      if(now-this.fpsStart>500){this.lastFps=this.fpsFrames*1000/(now-this.fpsStart);this.emit({type:'fps',fps:this.lastFps,frameNumber:this.frameNumber});this.fpsFrames=0;this.fpsStart=now;}
    }catch(error){this.running=false;this.emit({type:'error',message:`Rendering/capture stopped: ${error.stack||error.message}`});}
  }
}
