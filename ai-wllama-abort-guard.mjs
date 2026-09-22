/** PocketBench diagnostic adapter for wllama 3.6.1. The runtime/weights remain upstream. */
import { Wllama as UpstreamWllama } from 'https://cdn.jsdelivr.net/npm/@wllama/wllama@3.6.1/esm/index.js';

const limit = (value, max = 6000) => String(value).slice(0, max);
function describe(value) {
  if (value == null) return value;
  if (typeof value === 'string') return limit(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  const seen = new WeakSet();
  try {
    const text = JSON.stringify(value, (key, item) => {
      if (typeof item === 'bigint') return String(item);
      if (item instanceof Error) return { name: item.name, message: item.message, stack: item.stack, cause: item.cause };
      if (item && typeof item === 'object') {
        if (seen.has(item)) return '[circular]';
        seen.add(item);
      }
      return item;
    });
    return limit(text ?? Object.prototype.toString.call(value));
  } catch {
    return limit(Object.prototype.toString.call(value));
  }
}

/**
 * Upstream onRecvMsg signal.abort assumes args[1] is a string and calls .replace().
 * Object-valued abort causes an unhandled rejection and leaves the pending model
 * load unresolved. Intercept only this signal on the proxy before moduleInit
 * binds proxy.onRecvMsg as its worker's onmessage handler.
 */
export function protectWllamaProxy(engine) {
  let current = engine.proxy;
  Object.defineProperty(engine, 'proxy', {
    configurable: true,
    enumerable: true,
    get() { return current; },
    set(proxy) {
      current = proxy;
      if (!proxy || typeof proxy.onRecvMsg !== 'function' || proxy.__pocketBenchAbortGuard) return;
      const original = proxy.onRecvMsg;
      proxy.__pocketBenchAbortGuard = true;
      proxy.onRecvMsg = function guardedMessage(event) {
        if (event?.data?.verb !== 'signal.abort') return original.call(this, event);
        const args = Array.isArray(event.data.args) ? event.data.args : [];
        const details = {
          kind: 'wllama-worker-abort',
          signalType: describe(args[0]),
          originalMessage: describe(args[1]),
          originalMessageType: typeof args[1],
          originalStack: describe(args[2]),
          originalError: describe(args[3]),
        };
        const primary = args[1] instanceof Error
          ? args[1].message
          : typeof args[1]?.message === 'string'
            ? args[1].message
            : typeof args[1] === 'string'
              ? args[1]
              : describe(args[1]) ?? '(missing message)';
        const failure = new Error(`wllama worker ${limit(args[0] ?? 'abort', 80)}: ${limit(primary, 1800)}`);
        failure.name = 'WllamaWorkerAbort';
        failure.cause = JSON.stringify(details);
        // Avoid upstream's unsafe .replace() and async stack decoder:
        // reject both queues directly so the app can export the original signal.
        try { this.logger?.error?.('PocketBench captured raw wllama abort', details); } catch {}
        for (const key of ['resultQueue', 'taskQueue']) {
          if (!Array.isArray(this[key])) continue;
          for (const task of this[key].splice(0)) {
            try { task.reject(failure); } catch {}
          }
        }
        try { this.worker?.terminate(); } catch {}
        this.worker = undefined;
      };
    },
  });
  if (current) engine.proxy = current;
  return engine;
}

export class Wllama extends UpstreamWllama {
  constructor(...args) { super(...args); protectWllamaProxy(this); }
}
