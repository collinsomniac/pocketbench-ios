#!/usr/bin/env node
/** Checks the *actual* Hugging Face repo tree, not the model card. No weights downloaded. */
import assert from 'node:assert/strict';
import {MODELS} from '../ai-wllama-core.mjs';
function parse(url){
 const u=new URL(url);assert.equal(u.hostname,'huggingface.co');
 const m=u.pathname.match(/^\/([^/]+)\/([^/]+)\/resolve\/([^/]+)\/(.+\.gguf)$/i);
 assert(m,`Malformed GGUF URL: ${url}`);
 return {repo:`${m[1]}/${m[2]}`,revision:m[3],file:decodeURIComponent(m[4])};
}
const paths=Object.entries(MODELS).filter(([,m])=>m.url).map(([id,m])=>({id,model:m,...parse(m.url)}));
for(const p of paths)assert(p.file.endsWith('.gguf'));
if(process.env.POCKETBENCH_VERIFY_HF!=='1'){
 console.log('PASS: model catalog paths parse; set POCKETBENCH_VERIFY_HF=1 to check live artifact trees (metadata only)');
}else{
 for(const p of paths){
  const endpoint=`https://huggingface.co/api/models/${p.repo}/tree/${p.revision}?recursive=true`;
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),15000);
  let response;try{response=await fetch(endpoint,{signal:controller.signal,headers:{Accept:'application/json'}});}finally{clearTimeout(timer);}
  assert(response.ok,`${p.id}: repository tree HTTP ${response.status}`);
  const entries=await response.json();assert(Array.isArray(entries),`${p.id}: expected array from tree endpoint`);
  const exact=entries.find(e=>e.path===p.file&&e.type==='file');
  assert(exact,`${p.id}: missing ${p.file} from ${p.repo} tree`);
  const bytes=exact.lfs?.size??exact.size??null;
  assert(Number.isFinite(bytes)&&bytes>1024,`${p.id}: model file has no positive size`);
  const mb=bytes/1e6;assert(Math.abs(mb-p.model.approxDownloadMB)/mb<0.20,`${p.id}: estimate ${p.model.approxDownloadMB} MB differs from actual ${mb.toFixed(1)} MB`);
  console.log(`PASS: ${p.id}: ${p.repo}/${p.file}, ${(bytes/1e6).toFixed(1)} MB`);
 }
}
