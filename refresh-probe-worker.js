/* Independent worker callback and main-thread relay probes; not display measurements. */
let active = false;
let mode = null;
let ctx = null;
let start = 0;
let duration = 8000;
let times = [];
let relayed = 0;
let lastSequence = -1;
let missingSequences = 0;
let relayLag = [];

function paint(t) {
  if (!ctx) return;
  const w = ctx.canvas.width, h = ctx.canvas.height;
  ctx.fillStyle = '#081727';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = mode === 'relay' ? '#f5a7de' : '#8bf5d6';
  ctx.fillRect(((t - start) * 0.13) % (w + 24) - 24, 12, 24, h - 24);
}
function finish(error) {
  if (!active) return;
  active = false;
  self.postMessage({
    type:'done', mode, times, error:error || null,
    elapsedMs:performance.now()-start,
    workerRafAvailable:typeof self.requestAnimationFrame==='function',
    relayedMessages:relayed,
    missingSequences,
    relayLagMs:relayLag
  });
}
self.onmessage = ({data}) => {
  if (data?.type === 'start') {
    if (active) return;
    active = true;
    mode = data.mode;
    times = []; relayed = 0; lastSequence = -1; missingSequences = 0; relayLag = [];
    start = performance.now();
    duration = Math.max(1000, Math.min(30000, Number(data.durationMs) || 8000));
    try { ctx = data.canvas?.getContext('2d') || null; }
    catch (error) { finish(String(error)); return; }
    if (mode === 'relay') { self.postMessage({type:'ready',mode}); return; }
    if (typeof self.requestAnimationFrame !== 'function') {
      finish('Worker requestAnimationFrame unavailable'); return;
    }
    const frame = t => {
      if (!active) return;
      times.push(performance.now());
      paint(t);
      if (performance.now()-start >= duration) { finish(); return; }
      try { self.requestAnimationFrame(frame); }
      catch (error) { finish(String(error)); }
    };
    try { self.requestAnimationFrame(frame); }
    catch (error) { finish(String(error)); }
    return;
  }
  if (!active || mode !== 'relay') return;
  if (data?.type === 'pulse') {
    const now = performance.now();
    times.push(now);
    relayed++;
    if (lastSequence >= 0 && data.sequence > lastSequence + 1)
      missingSequences += data.sequence - lastSequence - 1;
    lastSequence = data.sequence;
    // Relative time origins are used rather than comparing raw performance.now()
    // across globals. Browser time precision can quantize these readings.
    if (Number.isFinite(data.absoluteTimestampMs))
      relayLag.push(performance.timeOrigin + now - data.absoluteTimestampMs);
    paint(now);
  } else if (data?.type === 'stop') {
    finish();
  }
};