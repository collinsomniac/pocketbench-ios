// Run: node skills/chat-smoke.mjs (Node 20+). No model downloads or browser GPU required.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {MODELS,defaultRequest,normalizeRequest,appendUser,addAssistant,usageMetrics} from '../website/chat-core.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const site=path.join(root,'..','website');
const html=fs.readFileSync(path.join(site,'chat.html'),'utf8');
const app=fs.readFileSync(path.join(site,'chat.mjs'),'utf8');
const ids=['model','load','unload','stop','new','export','status','progress','warning','chat','compose','send','copy','metrics','request','requestError','apply','sync','copyRequest','result','log','outputNotice','modelInfo','tab-chat','tab-json','tab-results','view-chat','view-json','view-results'];
for(const id of ids)assert.match(html,new RegExp(`id="${id}"`),`Missing DOM control: ${id}`);
for(const id of ids)assert(app.includes(`$('${id}')`)||['warning','view-chat','view-json','view-results','tab-chat','tab-json','tab-results'].includes(id),`Missing controller for ${id}`);
assert.match(html,/src="\.\/chat\.mjs\?v=0\.1\.1"/);
assert.match(app,/chat-core\.mjs\?v=0\.1\.1/);
assert.match(app,/new Worker\('\.\/ai-bench-worker\.mjs'/);
for(const file of ['chat-core.mjs','chat.mjs','ai-bench-worker.mjs']){const result=spawnSync(process.execPath,['--check',path.join(site,file)],{encoding:'utf8'});assert.equal(result.status,0,`${file}: ${result.stderr}`);}
assert.deepEqual(MODELS.map(x=>x.parametersB),[0.6,1.7,8]);
const base=defaultRequest();assert.equal(base.extra_body.enable_thinking,false);
const one=appendUser(base,'hi');assert.equal(one.messages.at(-1).content,'hi');
const two=addAssistant(one,'hello');assert.equal(two.messages.at(-1).role,'assistant');
assert.deepEqual(normalizeRequest(two,MODELS[0].id),two);
assert.throws(()=>normalizeRequest({...two,model:MODELS[1].id},MODELS[0].id),/match/);
assert.throws(()=>normalizeRequest({...two,max_tokens:0},MODELS[0].id),/max_tokens/);
assert.throws(()=>normalizeRequest({...two,messages:[{role:'user',content:{bad:true}}]},MODELS[0].id),/string content/);
const m=usageMetrics({prompt_tokens:30,completion_tokens:63,extra:{decode_tokens_per_s:48.7}},100,137,1447);assert.equal(m.completionTokens,63);assert.equal(m.modelDecodeTokensPerSecond,48.7);assert.equal(m.firstTextMs,37);
console.log(`PASS chat source syntax, ${ids.length} DOM IDs, three model tiers, editable-request validation and token accounting (no GPU test)`);
