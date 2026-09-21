/* Presentation isolation: unchanged particle shaders, explicit GPU-only render target. */
import {SuiteRunner} from './suite-relay-runner.js';
export class PresentationRunner extends SuiteRunner {
  async init(size) {
    await super.init(size);
    this.presentContext=this.lab.context;
  }
  async execute(config) {
    const offscreen=config.name.startsWith('offscreen-');
    let texture=null;
    if (this.report) {
      this.report.experiment='particle-presentation-isolation-v1';
      this.report.methodology.presentationIsolation='offscreen-* uses a GPUTexture RENDER_ATTACHMENT with the unchanged particle render shader and pixel dimensions, bypassing GPUCanvasContext.getCurrentTexture; onscreen-* uses the visible WebGPU canvas. Offscreen render targets may differ in backing/scheduling from presentable textures. Neither mode verifies display scanout.';
    }
    try {
      if(offscreen){
        // Match the final size after the case's scale is applied, not the prior case's size.
        this.lab.setOptions({scale:config.scale});
        texture=this.lab.device.createTexture({label:'Presentation-isolation render target',
          size:[this.lab.canvas.width,this.lab.canvas.height,1],format:this.lab.format,
          usage:GPUTextureUsage.RENDER_ATTACHMENT});
        this.lab.context={getCurrentTexture:()=>texture};
      } else this.lab.context=this.presentContext;
      const result=await super.execute(config);
      result.presentationMode=config.render?(offscreen?'offscreen-texture':'visible-canvas'):'compute-only';
      result.presentationTextureAccesses=offscreen?'bypassed':'native-context';
      return result;
    } finally {
      this.lab.context=this.presentContext;
      if(texture){await this.drain();texture.destroy();}
    }
  }
}
