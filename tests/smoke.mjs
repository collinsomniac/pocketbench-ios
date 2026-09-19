/* Structural smoke test: GPU API mocks, NOT a real shader compile or GPU benchmark. */
import assert from 'node:assert/strict';
import { GPULab } from '../engine.js';

globalThis.GPUShaderStage = { COMPUTE: 4, VERTEX: 1, FRAGMENT: 2 };
globalThis.GPUBufferUsage = { UNIFORM: 64, COPY_DST: 8, STORAGE: 128, QUERY_RESOLVE: 512, COPY_SRC: 4, MAP_READ: 1 };
globalThis.GPUTextureUsage = { RENDER_ATTACHMENT: 16 };
const calls = [];
const mockBuffer = () => ({ destroy() { calls.push('destroy'); } });
const device = {
  lost: new Promise(() => {}), addEventListener() {},
  createShaderModule({ code }) { calls.push(['shader', code]); return { getCompilationInfo: async () => ({ messages: [] }) }; },
  createBindGroupLayout({ entries }) { calls.push(['layout', entries]); return { entries }; },
  createPipelineLayout({ bindGroupLayouts }) { return { bindGroupLayouts }; },
  createComputePipelineAsync: async d => ({ kind: 'compute', descriptor: d }),
  createRenderPipelineAsync: async d => ({ kind: 'render', descriptor: d }),
  createBuffer: mockBuffer,
  createBindGroup({ layout, entries }) { return { layout, entries }; },
  queue: { writeBuffer() {}, submit(commands) { calls.push(['submit', commands.length]); } },
  createCommandEncoder() {
    return {
      beginComputePass() { return { setPipeline(){},setBindGroup(){},dispatchWorkgroups(n){ calls.push(['dispatch',n]); },end(){} }; },
      beginRenderPass() { return { setPipeline(){},setBindGroup(){},draw(vertices,instances){ calls.push(['draw',vertices,instances]); },end(){} }; },
      finish() { return {}; },
    };
  },
};
const adapter = {
  features: new Set(), info: { vendor: 'test', architecture: 'mock' }, isFallbackAdapter: true,
  limits: { maxBufferSize: 1 << 30, maxStorageBufferBindingSize: 1 << 30, maxTextureDimension2D: 8192, maxComputeInvocationsPerWorkgroup: 1024 },
  requestDevice: async () => device,
};
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { gpu: { requestAdapter: async () => adapter, getPreferredCanvasFormat: () => 'bgra8unorm' } } });
const canvas = { width: 300, height: 150, getContext: () => ({ configure(){}, getCurrentTexture: () => ({ createView: () => ({}) }) }) };
const messages = []; const rafs = [];
const lab = new GPULab(canvas, message => messages.push(message), callback => rafs.push(callback));
await lab.init();
assert.equal(messages.find(x => x.type === 'ready').info.timestamp, false);
assert.equal(messages.find(x => x.type === 'ready').info.fallback, true);
assert.equal(calls.filter(x => Array.isArray(x) && x[0] === 'shader').length, 2);
const shaders = calls.filter(x => Array.isArray(x) && x[0] === 'shader').map(x => x[1]);
assert(shaders[0].includes('var<storage, read_write>'));
assert(shaders[1].includes('var<storage, read>'));
assert(!shaders[1].includes('@compute'));
lab.resize({ width: 390, height: 844, dpr: 2 });
assert.equal(canvas.width, 780); assert.equal(canvas.height, 1688);
lab.onFrame(performance.now());
assert.deepEqual(calls.filter(x => Array.isArray(x) && x[0] === 'dispatch').map(x => x[1]), [256, 256]);
assert.deepEqual(calls.find(x => Array.isArray(x) && x[0] === 'draw'), ['draw', 4, 65536]);
lab.setOptions({ count: 262144, steps: 4, render: false });
assert.equal(lab.count, 262144);
lab.onFrame(performance.now());
assert.deepEqual(calls.filter(x => Array.isArray(x) && x[0] === 'dispatch').slice(-4).map(x => x[1]), [1024, 1024, 1024, 1024]);
assert.equal(calls.filter(x => Array.isArray(x) && x[0] === 'draw').length, 1);
lab.startBenchmark(2000);
lab.onFrame(lab.bench.endsAt + 1);
const result = messages.find(x => x.type === 'benchmark-end').report;
assert.equal(result.config.count, 262144);
assert.equal(result.config.render, false);
assert.equal(result.gpuTimingAvailable, false);
assert.equal(result.gpuComputeMedianMs, null);
assert.doesNotThrow(() => structuredClone(result));
assert.doesNotThrow(() => JSON.stringify(result));
console.log('PASS: two stage-correct shader modules, adapter fallback, resize, 2x256 compute + 1 4-vertex instanced draw, 4x1024 compute-only, benchmark report serializable.');
console.log('NOTE: This is a mocked-API structural smoke test, not a real WebGPU or iPhone execution test.');
