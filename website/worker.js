import { GPULab } from './engine.js';
let lab;
self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'init') {
      lab = new GPULab(data.canvas, message => self.postMessage(message));
      await lab.init();
      if (data.size) lab.resize(data.size);
    } else if (lab && data.type === 'resize') lab.resize(data.size);
    else if (lab && data.type === 'options') lab.setOptions(data.options);
    else if (lab && data.type === 'benchmark') lab.startBenchmark(data.durationMs);
  } catch (error) {
    self.postMessage({ type: 'error', message: error.stack || String(error) });
  }
};
