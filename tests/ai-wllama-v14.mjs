import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
const dir=path.resolve(import.meta.dirname,'..');
const source=await fs.readFile(path.join(dir,'ai-wllama-v14.mjs'),'utf8');
const html=await fs.readFile(path.join(dir,'ai-wllama.html'),'utf8');
assert(html.includes('ai-wllama-v14.mjs?v=1.4.0'));
for(const id of ['cancel','saveTop','operation'])assert(html.includes(`id="${id}"`));
const elements=new Map();
function elem(id){if(!elements.has(id))elements.set(id,{id,disabled:false,textContent:'',value:id==='model'?'smol':id==='offload'?'0':id==='context'?'1024':'',files:{length:0},insertAdjacentElement(_position,child){elements.set(child.id,child);},click(){return this.onclick?.();}});return elements.get(id);}
globalThis.document={getElementById:elem,createElement:tag=>({tagName:tag,textContent:'',className:'',id:'',click(){return this.onclick?.();}}),querySelector:()=>({textContent:''})};
globalThis.location={href:'https://example.test/ai-wllama.html'};
globalThis.window={addEventListener:()=>{}};
const store=new Map();globalThis.localStorage={setItem:(k,v)=>store.set(k,v),getItem:k=>store.get(k)};
let remoteLoadCalls=0,haltNext=false,pendingResolve=null,exits=0,workerWarnings=0,modelHeadStatus=200;
class FakeWllama{
 constructor(_paths,config){this.logger=config.logger;this.modelManager={getModels:async()=>[]};}
 setCompat(o){assert(o.worker.includes('@3.6.1/'));}
 async loadModelFromUrl(_url,opts){remoteLoadCalls++;if(haltNext){haltNext=false;opts.progressCallback({loaded:105,total:105});this.logger.warn('Worker startup still pending');workerWarnings++;await new Promise(resolve=>pendingResolve=resolve);}}
 async exit(){exits++;}
 async createChatCompletion(req){return req.stream?(async function*(){yield {choices:[{delta:{content:'word'}}],usage:{completion_tokens:1,prompt_tokens:9}};})():{choices:[{message:{content:'word'}}],usage:{completion_tokens:1,prompt_tokens:9}};}
}
globalThis.__WllamaMock=FakeWllama;
Object.defineProperty(globalThis,'navigator',{configurable:true,value:{gpu:{},userAgent:'TestWebKit',hardwareConcurrency:4,storage:{getDirectory:async()=>({getFileHandle:async()=>({createWritable:async()=>({write:async()=>{},close:async()=>{}}),getFile:async()=>new Blob([new Uint8Array([71,71,85,70])])}),removeEntry:async()=>{}})}}});
globalThis.fetch=async(url,opts)=>{assert.equal(opts.method,'HEAD');const s=url.endsWith('.gguf')?modelHeadStatus:200;return {ok:s===200,status:s,headers:{get:()=>null}};};
const testSource=source.replace('await import(RUNTIME_URL)','await Promise.resolve({Wllama:globalThis.__WllamaMock})');
const temporary=path.join(dir,'ai-wllama-v14-test-temp.mjs');await fs.writeFile(temporary,testSource);
const read=()=>JSON.parse([...store.values()][0]);
try{
 await import(temporary+'?t='+Date.now());
 await elem('check').onclick();assert.equal(read().phase,'preflight-completed');
 await elem('storageCheck').onclick();assert(read().checks.find(x=>x.name==='opfs-roundtrip').ok);
 modelHeadStatus=404;await elem('load').onclick();assert.equal(read().phase,'failed');assert.equal(remoteLoadCalls,0);
 modelHeadStatus=200;haltNext=true;const old=elem('load').onclick();
 for(let i=0;i<50&&pendingResolve===null;i++)await new Promise(resolve=>setImmediate(resolve));
 assert(pendingResolve,'fake worker initialized and is pending');assert.equal(elem('cancel').disabled,false);assert.equal(elem('save').disabled,false);assert.equal(elem('saveTop').disabled,false);
 assert.equal(read().stage,'worker-warn');assert(read().events.some(x=>x.stage==='download-reported-100-percent'));
 elem('cancel').onclick();assert.equal(read().phase,'cancelled');assert.equal(elem('load').disabled,false);assert.equal(elem('cancel').disabled,true);
 pendingResolve();await old;assert.equal(read().phase,'cancelled');assert.notEqual(read().stage,'model-ready');
 await elem('load').onclick();assert.equal(read().phase,'ready');assert.equal(remoteLoadCalls,2);assert.equal(elem('one').disabled,false);
 await elem('one').onclick();assert.equal(read().phase,'completed');assert.equal(read().results[0].metrics.completionTokens,1);
 assert(exits>=1);assert.equal(workerWarnings,1);
 console.log('PASS: 1.4 preflight, 404, pending worker, 100% vs ready, worker warning, manual cancel, stale completion protection, fresh reload and inference');
}finally{if(pendingResolve)pendingResolve();await fs.unlink(temporary);}
