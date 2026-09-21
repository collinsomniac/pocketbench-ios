import assert from 'node:assert/strict';
import {runBatched} from '../suite-throughput-worker.js';
let clock=0,queued=0,finished=0,waits=0,progress=[];
const out=await runBatched({submit(){queued++;clock+=0.1;},async drain(){await Promise.resolve();finished=queued;clock+=1;waits++;},
 now:()=>clock,stop:()=>false,batch:16,durationMs:210,onBatch:x=>progress.push(x)});
assert.equal(out.completedFrames,finished);
assert.equal(out.completedFrames,queued);
assert.equal(out.batches.length,waits);
assert.equal(out.batches.every(b=>b.completedFrames===16),true);
assert.ok(out.completedFramesPerSecond>0);
assert.ok(out.elapsedMs>=210);
assert.ok(progress.every((p,i)=>p.completed===(i+1)*16));
await assert.rejects(()=>runBatched({submit(){},drain:async()=>{},now:()=>0,stop:()=>false,batch:1024,durationMs:1000}),/batch/);
console.log('PASS uncapped bounded queue-completion accounting, batch drain, progress, input bounds');
