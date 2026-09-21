/* Each render pass copies two fixed 16x4 patches into unique GPU buffer slots.
   MAP_READ occurs after benchmark timing; 256-byte WebGPU row pitch. */
export const WIDTH=16, HEIGHT=4, ROW_BYTES=256, PATCH_BYTES=ROW_BYTES*HEIGHT, RECORD_BYTES=PATCH_BYTES*2;
export function captureLocations(width,height){
  if(width<16||height<4)throw Error('Capture target too small');
  return [[Math.floor((width-WIDTH)*.46),Math.floor((height-HEIGHT)*.45)],
          [Math.floor((width-WIDTH)*.63),Math.floor((height-HEIGHT)*.57)]];
}
export function examineCapture(bytes,frames,format='bgra8unorm',locations=null){
  if(frames<0||frames*RECORD_BYTES>bytes.byteLength)throw Error('Capture count/buffer mismatch');
  const bg=format.startsWith('bgra')?[12,5,3]:[3,5,12];
  let changing=0,nonBackgroundFrames=0,nonBackgroundPixels=0;
  const hashes=new Set(),samples=[];let last=null;
  for(let frame=0;frame<frames;frame++){
    let hash=2166136261,foreground=0;
    for(let patch=0;patch<2;patch++)for(let y=0;y<HEIGHT;y++)for(let x=0;x<WIDTH;x++){
      const i=frame*RECORD_BYTES+patch*PATCH_BYTES+y*ROW_BYTES+x*4;
      if(Math.abs(bytes[i]-bg[0])+Math.abs(bytes[i+1]-bg[1])+Math.abs(bytes[i+2]-bg[2])>14)foreground++;
      for(let c=0;c<3;c++)hash=Math.imul(hash^bytes[i+c],16777619)>>>0;
    }
    if(foreground)nonBackgroundFrames++;
    nonBackgroundPixels+=foreground;
    if(last!==null&&last!==hash)changing++;
    last=hash;hashes.add(hash);
    if(samples.length<6||frame===frames-1)samples.push({frame,hash:hash.toString(16).padStart(8,'0'),foreground});
  }
  return {capturedFrames:frames,bytesPerFrame:RECORD_BYTES,totalCopiedBytes:frames*RECORD_BYTES,
    sampleLocations:locations,uniqueSampleHashes:hashes.size,changedAdjacentSamples:changing,
    framesWithNonBackground:nonBackgroundFrames,nonBackgroundPixels,
    confidence:frames===0?'none':nonBackgroundFrames===0?'render copies verified; particle pixels not observed':
      changing===0?'particle-colored pixels present; temporal change not observed':'sampled rendered pixels changed over time',
    sampleHashes:samples};
}
export function makeFrameCapture(device,texture,width,height,durationMs,format){
  if(!['bgra8unorm','rgba8unorm'].includes(format))throw Error('Unsupported capture color format');
  const maxFrames=Math.min(32768,Math.ceil(durationMs*1.5)+512);
  const size=maxFrames*RECORD_BYTES;
  if(size>device.limits.maxBufferSize)throw Error('Capture buffer exceeds GPU limit');
  const buffer=device.createBuffer({label:'Per-render observed texture patches',size,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
  const positions=captureLocations(width,height);let frames=0;
  return {maxFrames,get frames(){return frames;},
    capture(encoder,source){
      if(source!==texture)throw Error('Render texture mismatch');
      if(frames>=maxFrames)throw Error('Observed capture capacity reached: reduce duration or batch');
      const base=frames*RECORD_BYTES;
      positions.forEach(([x,y],p)=>encoder.copyTextureToBuffer({texture:source,origin:{x,y,z:0}},
        {buffer,offset:base+p*PATCH_BYTES,bytesPerRow:ROW_BYTES,rowsPerImage:HEIGHT},[WIDTH,HEIGHT,1]));
      frames++;
    },
    async collect(){await buffer.mapAsync(GPUMapMode.READ);try{return examineCapture(new Uint8Array(buffer.getMappedRange()),frames,format,positions);}finally{buffer.unmap();}},
    destroy(){buffer.destroy();}
  };
}
