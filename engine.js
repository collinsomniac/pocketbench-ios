/* Pocket GPU Lab — WebGPU particle-field kernel and renderer.
   No dependencies. This file runs in either a dedicated worker or a window. */

const WGSL = /* wgsl */ `
struct Particle { pos: vec4f, vel: vec4f };
struct Params {
  sim: vec4f,         // dt, sim time, particle count, field strength
  eye: vec4f,
  right: vec4f,
  up: vec4f,
  forward: vec4f,
  projection: vec4f,  // aspect, tan(half fov), world-space radius, brightness
  attractorA: vec4f,  // CPU-precomputed orbit positions: avoid trigonometry per particle
  attractorB: vec4f,
};
@group(0) @binding(0) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(1) var<uniform> params: Params;

@compute @workgroup_size(256)
fn advance(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= u32(params.sim.z)) { return; }
  var p = particles[i];
  let x = p.pos.xyz;
  let v = p.vel.xyz;
  let dt = params.sim.x;
  // Two smoothly orbiting attractors plus weak confinement and circulation.
  let a = params.attractorA.xyz;
  let b = params.attractorB.xyz;
  let d1 = a - x;
  let d2 = b - x;
  let inv1 = inverseSqrt(dot(d1, d1) + 0.75);
  let inv2 = inverseSqrt(dot(d2, d2) + 0.75);
  let accel = 5.0 * (d1 * inv1 * inv1 * inv1 + d2 * inv2 * inv2 * inv2)
      - 0.22 * x + 0.44 * vec3f(-x.z, 0.14 * x.x, x.x);
  let velocity = (v + accel * dt) * (1.0 - 0.075 * dt);
  let position = x + velocity * dt;
  p.pos = vec4f(position, p.pos.w);
  p.vel = vec4f(velocity, p.vel.w);
  particles[i] = p;
}

struct VertexOut {
  @builtin(position) clip: vec4f,
  @location(0) uv: vec2f,
  @location(1) tint: vec3f,
};

@vertex
fn vertex(@builtin(vertex_index) vertexId: u32,
          @builtin(instance_index) instanceId: u32) -> VertexOut {
  let corners = array<vec2f, 4>(
    vec2f(-1.0, -1.0), vec2f( 1.0, -1.0),
    vec2f(-1.0,  1.0), vec2f( 1.0,  1.0)
  );
  let particle = particles[instanceId];
  let rel = particle.pos.xyz - params.eye.xyz;
  let depth = dot(rel, params.forward.xyz);
  let size = params.projection.z * (0.8 + 0.45 * particle.pos.w);
  let corner = corners[vertexId];
  var o: VertexOut;
  if (depth <= 0.12) {
    o.clip = vec4f(2.0, 2.0, 2.0, 1.0);
  } else {
    let horizontal = dot(rel, params.right.xyz) + corner.x * size;
    let vertical = dot(rel, params.up.xyz) + corner.y * size;
    let f = params.projection.y;
    o.clip = vec4f(horizontal / (f * params.projection.x),
                   vertical / f,
                   depth * 1.001 - 0.10,
                   depth);
  }
  o.uv = corner;
  let speed = min(length(particle.vel.xyz) * 0.14, 1.0);
  let hue = particle.vel.w;
  o.tint = mix(vec3f(0.14, 0.72, 1.0), vec3f(1.0, 0.34, 0.68), vec3f(hue)) *
           (0.55 + 0.45 * speed);
  return o;
}

@fragment
fn fragment(in: VertexOut) -> @location(0) vec4f {
  let r2 = dot(in.uv, in.uv);
  if (r2 > 1.0) { discard; }
  let opacity = exp(-3.6 * r2) * params.projection.w;
  return vec4f(in.tint * opacity, opacity);
}
`;

// Separate modules: writable storage is legal in COMPUTE but the VERTEX stage
// must bind the same buffer read-only. Distinct layouts enforce that contract.
const readWriteDeclaration = '@group(0) @binding(0) var<storage, read_write> particles: array<Particle>;';
const computeCode = WGSL.slice(0, WGSL.indexOf('\nstruct VertexOut'));
const renderCode = WGSL.slice(0, WGSL.indexOf('\n@compute'))
  .replace(readWriteDeclaration, '@group(0) @binding(0) var<storage, read> particles: array<Particle>;')
  + WGSL.slice(WGSL.indexOf('\nstruct VertexOut'));

const COUNT_OPTIONS = [8192, 16384, 32768, 65536, 131072, 262144, 524288, 1048576];
const BUFFERS_PER_PARTICLE = 32;
function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
function normal(v) {
  const len = Math.hypot(...v) || 1;
  return v.map(c => c / len);
}
function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

export class GPULab {
  constructor(canvas, emit, raf = callback => requestAnimationFrame(callback)) {
    this.canvas = canvas;
    this.emit = emit;
    this.raf = raf;
    this.count = 65536;
    this.steps = 2;
    this.render = true;
    this.scale = 1;
    this.yaw = 0.46;
    this.pitch = 0.24;
    this.distance = 16;
    this.paused = false;
    this.running = false;
    this.frameNumber = 0;
    this.time = 0;
    this.sampleEvery = 30;
    this.lastGPU = null;
    this.bench = null;
    this.fpsFrames = 0;
    this.fpsStart = performance.now();
    this.lastFps = null;
    this.generation = 0;
    this.onFrame = this.onFrame.bind(this);
  }

  async init() {
    if (!globalThis.navigator?.gpu) throw new Error('WebGPU unavailable in this context. Open this app in modern Safari or Chrome over HTTPS.');
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) throw new Error('No WebGPU adapter was provided to this page.');
    this.adapter = adapter;
    this.hasTimestamp = adapter.features.has('timestamp-query');
    try {
      this.device = await adapter.requestDevice({ requiredFeatures: this.hasTimestamp ? ['timestamp-query'] : [] });
    } catch (error) {
      if (!this.hasTimestamp) throw error;
      this.hasTimestamp = false;
      this.device = await adapter.requestDevice();
    }
    const device = this.device;
    device.lost.then(info => {
      this.running = false;
      this.emit({ type: 'error', message: `GPU device lost: ${info.message || info.reason}. Reload to recover.` });
    });
    device.addEventListener('uncapturederror', e => this.emit({ type: 'error', message: `GPU validation: ${e.error.message}` }));
    this.context = this.canvas.getContext('webgpu');
    if (!this.context) throw new Error('This canvas cannot create a WebGPU context.');
    this.format = navigator.gpu.getPreferredCanvasFormat();
    this.configureCanvas();
    const computeModule = device.createShaderModule({ label: 'Particle compute', code: computeCode });
    const renderModule = device.createShaderModule({ label: 'Particle billboard rendering', code: renderCode });
    for (const [name, module] of [['compute', computeModule], ['render', renderModule]]) {
      const issues = (await module.getCompilationInfo()).messages.filter(msg => msg.type === 'error');
      if (issues.length) throw new Error(`${name} WGSL compilation failed: ${issues.map(m => `${m.lineNum}:${m.linePos} ${m.message}`).join(' | ')}`);
    }
    this.computeLayout = device.createBindGroupLayout({ entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
    ] });
    this.renderLayout = device.createBindGroupLayout({ entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
      { binding: 1, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
    ] });
    this.compute = await device.createComputePipelineAsync({
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.computeLayout] }),
      compute: { module: computeModule, entryPoint: 'advance' },
    });
    this.graphics = await device.createRenderPipelineAsync({
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.renderLayout] }),
      vertex: { module: renderModule, entryPoint: 'vertex' },
      fragment: { module: renderModule, entryPoint: 'fragment', targets: [{ format: this.format,
        blend: { color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
                 alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' } } }] },
      primitive: { topology: 'triangle-strip', cullMode: 'none' },
    });
    this.uniform = device.createBuffer({ label: 'Shared simulation and camera constants', size: 128, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.uniformData = new Float32Array(32);
    if (this.hasTimestamp) {
      try {
        this.querySet = device.createQuerySet({ type: 'timestamp', count: 4 });
        this.resolve = device.createBuffer({ size: 32, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC });
        this.readback = device.createBuffer({ size: 32, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
        this.queryPending = false;
      } catch (error) {
        this.hasTimestamp = false;
        this.emit({ type: 'notice', message: `GPU timestamp setup unavailable: ${error.message}` });
      }
    }
    this.resetParticles(this.count);
    this.resize({ width: this.canvas.width || 900, height: this.canvas.height || 600, dpr: 1 });
    const info = adapter.info || {};
    this.emit({ type: 'ready', info: {
      adapter: [info.vendor, info.architecture].filter(Boolean).join(' / ') || 'WebGPU adapter',
      fallback: adapter.isFallbackAdapter === true,
      timestamp: this.hasTimestamp,
      worker: typeof document === 'undefined',
      maxBufferSize: adapter.limits.maxBufferSize,
      maxComputeInvocationsPerWorkgroup: adapter.limits.maxComputeInvocationsPerWorkgroup,
      format: this.format,
    } });
    this.running = true;
    this.raf(this.onFrame);
  }

  configureCanvas() {
    this.context.configure({ device: this.device, format: this.format, alphaMode: 'opaque', usage: GPUTextureUsage.RENDER_ATTACHMENT });
  }

  resetParticles(count = this.count) {
    count = Number(count);
    if (!COUNT_OPTIONS.includes(count)) throw new Error('Unsupported particle count.');
    const bytes = count * BUFFERS_PER_PARTICLE;
    const max = Math.min(this.adapter.limits.maxBufferSize, this.adapter.limits.maxStorageBufferBindingSize);
    if (bytes > max) throw new Error('Particle buffer exceeds this GPU’s limits.');
    this.count = count;
    // Deterministic xorshift initialization: the benchmark starts from repeatable state.
    let seed = 0x9e3779b9;
    const random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
    const data = new Float32Array(count * 8);
    for (let i = 0; i < count; i++) {
      const a = random() * Math.PI * 2;
      const r = 1.5 + random() * 3.3;
      const h = (random() - 0.5) * 3.5;
      const offset = i * 8;
      data[offset] = Math.cos(a) * r;
      data[offset + 1] = h;
      data[offset + 2] = Math.sin(a) * r;
      data[offset + 3] = random();
      data[offset + 4] = -Math.sin(a) * (0.4 + random() * 0.45);
      data[offset + 5] = (random() - 0.5) * 0.35;
      data[offset + 6] = Math.cos(a) * (0.4 + random() * 0.45);
      data[offset + 7] = random();
    }
    const previous = this.particles;
    this.particles = this.device.createBuffer({ label: `${count} particles`, size: bytes,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    this.device.queue.writeBuffer(this.particles, 0, data);
    const entries = [
      { binding: 0, resource: { buffer: this.particles } },
      { binding: 1, resource: { buffer: this.uniform } },
    ];
    this.computeBindGroup = this.device.createBindGroup({ layout: this.computeLayout, entries });
    this.renderBindGroup = this.device.createBindGroup({ layout: this.renderLayout, entries });
    if (previous) previous.destroy();
    this.time = 0;
    this.lastGPU = null;
    this.emit({ type: 'config', count, bytes, steps: this.steps, render: this.render, scale: this.scale });
  }

  resize({ width, height, dpr = 1 }) {
    const limit = this.adapter?.limits.maxTextureDimension2D || 4096;
    this.cssWidth = Math.max(1, width);
    this.cssHeight = Math.max(1, height);
    this.dpr = Math.max(0.25, Math.min(3, dpr));
    const targetW = Math.max(1, Math.min(limit, Math.round(this.cssWidth * this.dpr * this.scale)));
    const targetH = Math.max(1, Math.min(limit, Math.round(this.cssHeight * this.dpr * this.scale)));
    if (this.canvas.width !== targetW || this.canvas.height !== targetH) {
      this.canvas.width = targetW;
      this.canvas.height = targetH;
    }
    this.emit({ type: 'size', width: targetW, height: targetH });
  }

  setOptions(options) {
    if (options.count != null && Number(options.count) !== this.count) {
      if (this.bench) { this.emit({ type: 'notice', message: 'Finish the benchmark before changing particle count.' }); return; }
      this.resetParticles(Number(options.count));
    }
    if (options.steps != null) this.steps = Math.max(1, Math.min(16, Math.floor(Number(options.steps))));
    if (options.render != null) this.render = !!options.render;
    if (options.scale != null) {
      this.scale = Math.max(0.5, Math.min(2, Number(options.scale)));
      this.resize({ width: this.cssWidth, height: this.cssHeight, dpr: this.dpr });
    }
    if (options.paused != null) this.paused = !!options.paused;
    if (options.orbit) {
      this.yaw += options.orbit.dx * 0.005;
      this.pitch = Math.min(1.35, Math.max(-1.35, this.pitch + options.orbit.dy * 0.005));
    }
    if (options.zoom) this.distance = Math.max(6, Math.min(40, this.distance * Math.exp(options.zoom * 0.001)));
    if (options.reset) this.resetParticles(this.count);
    this.emit({ type: 'config', count: this.count, steps: this.steps, render: this.render, scale: this.scale, paused: this.paused });
  }

  updateUniform() {
    const f = this.uniformData;
    const cp = Math.cos(this.pitch);
    const eye = [Math.sin(this.yaw) * cp * this.distance,
                 Math.sin(this.pitch) * this.distance,
                 Math.cos(this.yaw) * cp * this.distance];
    const forward = normal(eye.map(v => -v));
    const right = normal(cross(forward, [0, 1, 0]));
    const up = normal(cross(right, forward));
    f.set([1 / 120, this.time, this.count, 1], 0);
    f.set([...eye, 0], 4);
    f.set([...right, 0], 8);
    f.set([...up, 0], 12);
    f.set([...forward, 0], 16);
    f.set([this.canvas.width / Math.max(1, this.canvas.height), Math.tan((64 * Math.PI / 180) / 2), 0.035, 0.50], 20);
    const t = this.time;
    f.set([2 * Math.sin(t * 0.29), 0.9 * Math.sin(t * 0.17), 2 * Math.cos(t * 0.29), 0], 24);
    f.set([2 * Math.cos(t * 0.23), 0.9 * Math.cos(t * 0.19), -2 * Math.sin(t * 0.23), 0], 28);
    this.device.queue.writeBuffer(this.uniform, 0, f);
  }

  takeGPUReading(rendered) {
    const buffer = this.readback;
    buffer.mapAsync(GPUMapMode.READ).then(() => {
      const values = new BigUint64Array(buffer.getMappedRange().slice(0));
      buffer.unmap();
      const computeMs = Number(values[1] - values[0]) / 1e6;
      const renderMs = rendered ? Number(values[3] - values[2]) / 1e6 : null;
      // A query may return zero or be unusable after a device reset.
      if (values[1] > values[0] && Number.isFinite(computeMs) && computeMs > 0 && computeMs < 1e4) {
        const rate = this.count * this.steps / (computeMs * 1000);
        this.lastGPU = { computeMs, renderMs, millionUpdatesPerSecond: rate };
        if (this.bench && performance.now() >= this.bench.warmupEnd) {
          this.bench.gpuCompute.push(computeMs);
          if (renderMs != null && renderMs >= 0) this.bench.gpuRender.push(renderMs);
          this.bench.updates.push(rate);
        }
        this.emit({ type: 'gpu', ...this.lastGPU });
      }
    }).catch(error => {
      this.hasTimestamp = false;
      this.emit({ type: 'notice', message: `GPU timestamp readback failed: ${error.message}. Continuing without GPU timing.` });
    }).finally(() => { this.queryPending = false; });
  }

  startBenchmark(durationMs = 8000) {
    if (this.bench) return;
    this.paused = false;
    // Reset deterministic seed and simulated time before every timed run.
    this.resetParticles(this.count);
    this.bench = {
      startedAt: performance.now(),
      warmupEnd: performance.now() + 1000,
      endsAt: performance.now() + 1000 + Math.max(2000, Math.min(30000, durationMs)),
      gpuCompute: [], gpuRender: [], updates: [], frames: 0,
      config: { count: this.count, steps: this.steps, render: this.render,
        resolution: `${this.canvas.width}x${this.canvas.height}`, scale: this.scale },
    };
    this.sampleEvery = 4;
    this.emit({ type: 'benchmark-start', durationMs: 1000 + durationMs });
  }

  finishBenchmark(now) {
    const b = this.bench;
    if (!b) return;
    const elapsed = (now - b.warmupEnd) / 1000;
    const compute = median(b.gpuCompute);
    const render = median(b.gpuRender);
    const report = {
      app: 'Pocket GPU Lab', version: '1.0.0', task: '3D dual-attractor particle integration',
      date: new Date().toISOString(),
      config: b.config, durationSeconds: elapsed,
      activeFrames: b.frames, presentationFps: elapsed > 0 ? b.frames / elapsed : null,
      gpuTimingAvailable: this.hasTimestamp && b.gpuCompute.length > 0,
      gpuSamples: b.gpuCompute.length,
      gpuComputeMedianMs: compute, gpuRenderMedianMs: render,
      millionParticleUpdatesPerSecond: compute ? b.config.count * b.config.steps / (compute * 1000) : null,
      model: 'Fixed-step 1/120 s, 32 bytes/particle, one in-place compute kernel; visual billboards rendered optionally.',
      caveat: 'GPU timings are pass-duration estimates; FPS includes host scheduling and presentation. No Neural Engine inference is used.',
      adapter: { vendor: this.adapter.info?.vendor || "", architecture: this.adapter.info?.architecture || "", device: this.adapter.info?.device || "" },
      worker: typeof document === 'undefined',
    };
    this.bench = null;
    this.sampleEvery = 30;
    this.emit({ type: 'benchmark-end', report });
  }

  onFrame(now) {
    if (!this.running) return;
    this.raf(this.onFrame);
    if (this.paused && !this.bench) return;
    try {
      const bench = this.bench;
      if (bench && now >= bench.endsAt) { this.finishBenchmark(now); return; }
      this.frameNumber++;
      this.time += this.steps / 120;
      this.updateUniform();
      const timestampThisFrame = this.hasTimestamp && !this.queryPending && this.frameNumber % this.sampleEvery === 0;
      const encoder = this.device.createCommandEncoder();
      const computeDesc = timestampThisFrame ? { timestampWrites: {
        querySet: this.querySet, beginningOfPassWriteIndex: 0, endOfPassWriteIndex: 1,
      } } : {};
      const pass = encoder.beginComputePass(computeDesc);
      pass.setPipeline(this.compute);
      pass.setBindGroup(0, this.computeBindGroup);
      for (let s = 0; s < this.steps; s++) pass.dispatchWorkgroups(Math.ceil(this.count / 256));
      pass.end();
      if (this.render) {
        const renderDesc = { colorAttachments: [{
          view: this.context.getCurrentTexture().createView(),
          clearValue: { r: 0.012, g: 0.021, b: 0.048, a: 1 },
          loadOp: 'clear', storeOp: 'store',
        }] };
        if (timestampThisFrame) renderDesc.timestampWrites = {
          querySet: this.querySet, beginningOfPassWriteIndex: 2, endOfPassWriteIndex: 3,
        };
        const draw = encoder.beginRenderPass(renderDesc);
        draw.setPipeline(this.graphics);
        draw.setBindGroup(0, this.renderBindGroup);
        draw.draw(4, this.count);
        draw.end();
      }
      if (timestampThisFrame) {
        const queryCount = this.render ? 4 : 2;
        encoder.resolveQuerySet(this.querySet, 0, queryCount, this.resolve, 0);
        encoder.copyBufferToBuffer(this.resolve, 0, this.readback, 0, queryCount * 8);
        this.queryPending = true;
      }
      this.device.queue.submit([encoder.finish()]);
      if (timestampThisFrame) this.takeGPUReading(this.render);
      if (bench && now >= bench.warmupEnd) bench.frames++;
      this.fpsFrames++;
      if (now - this.fpsStart > 500) {
        this.lastFps = this.fpsFrames * 1000 / (now - this.fpsStart);
        this.emit({ type: 'fps', fps: this.lastFps, frameNumber: this.frameNumber });
        this.fpsFrames = 0;
        this.fpsStart = now;
      }
    } catch (error) {
      this.running = false;
      this.emit({ type: 'error', message: `Rendering stopped: ${error.stack || error.message}` });
    }
  }
}
