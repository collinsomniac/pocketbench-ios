/* Independent worker callback probe; this does NOT measure display presentation. */
let active = false;
self.onmessage = ({data}) => {
  if (data?.type !== 'start' || active) return;
  active = true;
  const mode = data.mode;
  const ctx = data.canvas?.getContext('2d') || null;
  const times = [];
  const start = performance.now();
  const duration = Math.max(1000, Math.min(30000, Number(data.durationMs) || 8000));
  const done = error => {
    if (!active) return;
    active = false;
    self.postMessage({type:'done',mode,times,error:error || null,elapsedMs:performance.now()-start,
      workerRafAvailable:typeof self.requestAnimationFrame==='function'});
  };
  if (typeof self.requestAnimationFrame !== 'function') return done('Worker requestAnimationFrame unavailable');
  const frame = t => {
    if (!active) return;
    times.push(t);
    if (ctx) {
      const w=ctx.canvas.width,h=ctx.canvas.height;
      ctx.fillStyle='#081727';ctx.fillRect(0,0,w,h);
      ctx.fillStyle='#8bf5d6';ctx.fillRect(((t-start)*0.13)%(w+24)-24,12,24,h-24);
    }
    if(performance.now()-start>=duration)return done();
    try{self.requestAnimationFrame(frame);}catch(e){done(String(e));}
  };
  try{self.requestAnimationFrame(frame);}catch(e){done(String(e));}
};