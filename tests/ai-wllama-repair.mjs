import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
const dir=path.resolve(import.meta.dirname,'..');
const source=await fs.readFile(path.join(dir,'ai-wllama-repair.mjs'),'utf8');
assert(source.includes('storage-roundtrip-completed'));
assert(source.includes('model-url-definitively-missing'));
assert(source.includes("ai-wllama-core.mjs?v=1.3.0"));
assert(source.includes('e?.cause'));
assert(!source.includes("engine.setCompat('default')"));
const elements=new Map();
function elem(id){if(!elements.has(id))elements.set(id,{id,disabled:false,textContent:'',value:id==='model'?'smol':id==='offload'?'0':id==='context'?'1024':'',files:{length:0},insertAdjacentElement(_position,child){elements.set(child.id,child);},click(){return this.onclick?.();}});return elements.get(id);}
globalThis.document={getElementById:elem,createElement:tag=>({tagName:tag,textContent:'',className:'',id:'',click(){this.onclick?.();}}),querySelector:()=>({textContent:''})};
globalThis.location={href:'https://example.test/ai-wllama.html'};
const listeners={};globalThis.window={addEventListener:(name,fn)=>listeners[name]=fn};
const store=new Map();globalThis.localStorage={setItem:(k,v)=>store.set(k,v),getItem:k=>store.get(k)};
let remoteLoadCalls=0,throwCache=false,wasmExited=0,modelHeadStatus=200;
class FakeWllama{constructor(){this.modelManager={getModels:async()=>{if(throwCache)throw Object.assign(new Error('Storage permission denied'),{name:'NotAllowedError',cause:new Error('OPFS blocked')});return [];}};}setCompat(o){assert(o.worker.includes('@3.6.1/'));}async loadModelFromUrl(){remoteLoadCalls++;}async exit(){wasmExited++;}async createChatCompletion(req){return req.stream?(async function*(){yield {choices:[{delta:{content:'word'}}],usage:{completion_tokens:1,prompt_tokens:9}};})():{choices:[{message:{content:'word'}}],usage:{completion_tokens:1,prompt_tokens:9}};}}
globalThis.__WllamaMock=FakeWllama;
Object.defineProperty(globalThis,'navigator',{configurable:true,value:{gpu:{},userAgent:'TestWebKit',hardwareConcurrency:4,storage:{getDirectory:async()=>({getFileHandle:async()=>({createWritable:async()=>({write:async()=>{},close:async()=>{}}),getFile:async()=>new Blob([new Uint8Array([71,71,85,70])])}),removeEntry:async()=>{}})}}});
globalThis.fetch=async(url,opts)=>{assert.equal(opts.method,'HEAD');const status=url.endsWith('.gguf')?modelHeadStatus:200;return {ok:status===200,status,headers:{get:k=>k==='content-type'?'application/octet-stream':null}}};
const testSource=source.replace('await import(RUNTIME_URL)','await Promise.resolve({Wllama:globalThis.__WllamaMock})');
const temporary=path.join(dir,'ai-wllama-repair-test-temp.mjs');await fs.writeFile(temporary,testSource);
try{await import(temporary+'?test='+Date.now());
 assert.equal(typeof elem('storageCheck').onclick,'function');
 await elem('check').onclick();let report=JSON.parse(store.values().next().value);assert.equal(report.phase,'preflight-completed');assert.equal(report.checks.length,4);
 await elem('storageCheck').onclick();report=JSON.parse(store.values().next().value);assert.equal(report.checks.length,6);assert(report.checks.find(c=>c.name==='opfs-roundtrip').ok);
 modelHeadStatus=404;await elem('load').onclick();report=JSON.parse(store.values().next().value);assert.equal(report.phase,'failed');assert.equal(report.checks.at(-1).status,404);assert(report.events.some(e=>e.stage==='model-url-definitively-missing'));assert.equal(remoteLoadCalls,0);assert(elem('status').textContent.includes('HTTP 404'));
 modelHeadStatus=200;await elem('load').onclick();report=JSON.parse(store.values().next().value);assert.equal(report.phase,'ready');assert.equal(remoteLoadCalls,1);
 await elem('one').onclick();report=JSON.parse(store.values().next().value);assert.equal(report.phase,'completed');assert.equal(report.results[0].metrics.completionTokens,1);
 await elem('release').onclick();throwCache=true;
 await elem('load').onclick();report=JSON.parse(store.values().next().value);assert.equal(report.phase,'failed');assert.equal(report.errors.at(-1).name,'NotAllowedError');assert.equal(report.errors.at(-1).message,'Storage permission denied');assert.equal(report.errors.at(-1).cause,'OPFS blocked');assert.equal(remoteLoadCalls,1);assert(elem('status').textContent.includes('Storage permission denied'));
 console.log('PASS: asset preflight, 404 fail-fast before download, OPFS roundtrip, model load, inference, storage failure and readable checkpoint');
}finally{await fs.unlink(temporary);}
