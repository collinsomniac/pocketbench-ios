import { VERSION, RUNTIME_VERSION, RUNTIME_URL, MODELS, defaultRequest, normalizeRequest, appendUser, addAssistant, usageMetrics, asJSON } from './chat-core.mjs?v=0.2.1';
const $ = id => document.getElementById(id);
const now = () => performance.now();
const iso = () => new Date().toISOString();
const STORE = 'pocketbench-chat-v3';
let library=null, engine=null, worker=null, loaded=null, busy=false, generation=0, active=null;
let request=defaultRequest(), turns=[], runs=[], events=[], last=null, loadMs=null;
let selectedTab='chat', renderQueued=false;
const note = s => { $('status').textContent=s; };
function save() {
  try { localStorage.setItem(STORE, JSON.stringify({version:VERSION, selectedModel:$('model').value,
    context:$('context').value, request, turns:turns.slice(-24), runs:runs.slice(-15),
    events:events.slice(-60), last:last?{...last, rawChunks:undefined}:null, loaded:null})); }
  catch (e) { $('outputNotice').textContent='Checkpoint storage failed; export the session JSON.'; }
}
function log(stage, detail={}) {
  events.push({at:iso(),stage,...detail});if(events.length>100)events.shift();
  $('log').textContent=events.slice(-28).map(e=>`${e.at.slice(11,19)} ${e.stage}${e.message?' — '+e.message:''}`).join('\n');
  save();
}
function controls() {
  const ready=!!engine && !!loaded && !busy && loaded.model===$('model').value && loaded.context===$('context').value;
  $('load').disabled=!library||busy; $('model').disabled=busy; $('context').disabled=busy;
  $('unload').disabled=!engine||busy; $('probe').disabled=!ready; $('send').disabled=!ready;
  $('runJson').disabled=!ready; $('stop').disabled=!active; $('apply').disabled=busy;
  $('sync').disabled=busy; $('copy').disabled=!last?.output;
}
function showChat() {
  const root=$('chat');root.replaceChildren();
  if(!turns.some(t=>t.role==='user')) {const p=document.createElement('p');p.className='hint';p.textContent='Load a model; run the known-good probe first, then send a short message.';root.append(p);}
  for(const m of turns.filter(t=>t.role==='user'||t.role==='assistant')){
    const item=document.createElement('article');item.className='msg '+m.role;
    const meta=document.createElement('div');meta.className='meta';meta.textContent=m.role==='user'?'You':'Assistant'+(m.incomplete?' · incomplete':'');
    const body=document.createElement('div');body.className='body';body.textContent=m.content;
    item.append(meta,body);if(m.stats){const s=document.createElement('div');s.className='stats';s.textContent=m.stats;item.append(s);}root.append(item);
  }root.scrollTop=root.scrollHeight;
}
function scheduleChat(){if(renderQueued)return;renderQueued=true;requestAnimationFrame(()=>{renderQueued=false;showChat();});}
function editor(){$('request').value=asJSON(request);$('requestError').textContent='';}
function parseEditor() {
  try { const parsed=normalizeRequest(JSON.parse($('request').value),loaded?.model??$('model').value);
    request=parsed;turns=parsed.messages.map(m=>({role:m.role,content:m.content}));showChat();save();return parsed; }
  catch(e){$('requestError').textContent=e.message;throw e;}
}
function tab(name){selectedTab=name;for(const v of ['chat','json','results']){$('view-'+v).hidden=v!==name;$('tab-'+v).setAttribute('aria-selected',String(v===name));}
  if(name==='results')$('result').textContent=asJSON(last??{runs,events});}
for(const name of ['chat','json','results'])$('tab-'+name).onclick=()=>tab(name);
function drop(){try{engine?.interruptGenerate?.();}catch{}try{worker?.terminate();}catch{}engine=null;worker=null;loaded=null;}
$('stop').onclick=()=>{
 if(!active)return;const current=active;
 if(current.kind==='inference'&&!current.interrupted){current.interrupted=true;try{engine?.interruptGenerate?.();}catch{}$('stop').textContent='Force terminate';note('Interrupt requested; tap Force terminate only if generation remains stuck.');log('interrupt-requested');return;}
 generation++;active=null;busy=false;drop();$('stop').textContent='Cancel / Stop';note('Worker terminated. Cached weights remain; reload before inference.');log('worker-terminated',{kind:current.kind});controls();
};
function modelDetails(){const item=MODELS.find(x=>x.id===$('model').value);if(!item)return;
 $('modelInfo').textContent=`${item.label}; WebLLM catalog runtime memory estimate ${Math.round(item.estimateMB)} MB. This is not available browser memory. Context ${$('context').value} tokens.`;
 if(loaded&&(loaded.model!==item.id||loaded.context!==$('context').value))note('Model or context changed. Press Load before generating.');
 request.model=item.id;editor();controls();}
$('model').onchange=()=>{if(MODELS.find(m=>m.id===$('model').value)?.tier!=='measured'&&$('context').value==='catalog')$('context').value='1024';modelDetails();};
$('context').onchange=modelDetails;
$('load').onclick=async()=>{
 if(!library||busy)return;const id=$('model').value,ctx=$('context').value,m=MODELS.find(x=>x.id===id);if(!m)return;
 if(m.tier==='stretch'&&!confirm('The 8B catalog estimates ~5.7 GB runtime GPU memory plus other browser allocations; Safari may close. Load experimentally?'))return;
 const token=++generation;busy=true;active={kind:'load',token};drop();controls();
 const started=now();log('load-before-await',{model:id,context:ctx,estimatedMB:m.estimateMB});note('Loading '+id+'; model ready is different from download complete.');
 let candidateWorker=null,candidateEngine=null;
 try{
  candidateWorker=new Worker('./ai-bench-worker.mjs',{type:'module'});worker=candidateWorker;
  candidateWorker.addEventListener('error',e=>{if(token===generation)log('worker-error',{message:e.message||'worker error'});});
  const opts={initProgressCallback:p=>{if(token!==generation)return;const s=String(p?.text??'');$('progress').textContent=s.slice(0,250);if(/finish|error|shader/i.test(s))log('load-progress',{message:s.slice(0,120)});}};
  // The optional fourth argument is ChatOptions, documented for WebLLM's worker engine.
  candidateEngine=await library.CreateWebWorkerMLCEngine(candidateWorker,id,opts,ctx==='catalog'?undefined:{context_window_size:Number(ctx)});
  if(token!==generation){try{await candidateEngine.unload?.();}catch{}candidateWorker.terminate();return;}
  engine=candidateEngine;worker=candidateWorker;loaded={model:id,context:ctx};loadMs=now()-started;
  note('Model ready. Run the exact 64-token probe before testing chat.');log('model-ready',{model:id,context:ctx,loadMs:Math.round(loadMs)});
 }catch(e){if(token===generation){note('Model load failed: '+(e?.message??e));log('load-failed',{message:String(e?.stack??e).slice(0,600)});drop();}}
 finally{if(token===generation){busy=false;active=null;controls();}}
};
$('unload').onclick=async()=>{if(busy)return;generation++;const old=engine;busy=true;drop();controls();try{await Promise.race([old?.unload?.(),new Promise(resolve=>setTimeout(resolve,1200))]);}catch{}busy=false;log('unloaded');note('Unloaded. Browser cache retained.');controls();};
function bareProbe(){return {messages:[{role:'user',content:'Write a short list of common nouns separated by spaces.'}],temperature:0,max_tokens:64,stream:true,stream_options:{include_usage:true}};}
function snapshot(wire,kind){last={status:'pending',kind,model:loaded.model,context:loaded.context,request:wire,startedAt:iso(),output:'',usage:null};log('inference-before-await',{kind,model:loaded.model,context:loaded.context,maxTokens:wire.max_tokens,stream:wire.stream,messageCount:wire.messages.length});}
async function execute(wire,{kind,updateConversation=false}={}) {
 if(!engine||!loaded||busy){note('Load a model first.');return;}
 const token=++generation;busy=true;active={kind:'inference',token,interrupted:false};controls();snapshot(wire,kind);
 const start=now();let first=null,chunks=0,usage=null,finish=null,reasoning='',output='',samples=[];
 let reply=null;
 if(updateConversation){turns=wire.messages.map(x=>({role:x.role,content:x.content}));reply={role:'assistant',content:''};turns.push(reply);scheduleChat();}
 note(`Running ${kind} in WebGPU worker…`);
 try{
  if(wire.stream!==false){const stream=await engine.chat.completions.create(wire);if(token===generation)log('stream-created');
   for await(const chunk of stream){if(token!==generation)return;chunks++;
    if(samples.length<5||chunks%32===0||chunk.usage)samples.push(chunk);
    const delta=chunk.choices?.[0]?.delta??{};
    if(typeof delta.content==='string'&&delta.content){if(first===null){first=now();log('first-visible-text',{ms:Math.round(first-start)});}output+=delta.content;
      if(reply){reply.content=output;scheduleChat();}}
    if(typeof delta.reasoning_content==='string')reasoning+=delta.reasoning_content;
    if(chunk.usage)usage=chunk.usage;if(chunk.choices?.[0]?.finish_reason)finish=chunk.choices[0].finish_reason;
   }
  }else{const response=await engine.chat.completions.create(wire);if(token!==generation)return;
   samples=[response];output=String(response.choices?.[0]?.message?.content??'');reasoning=response.choices?.[0]?.message?.reasoning_content??'';
   usage=response.usage??null;finish=response.choices?.[0]?.finish_reason??null;first=output?now():null;
  }
  if(token!==generation)return;
  const metrics=usageMetrics(usage,start,first,now());
  last={...last,status:active.interrupted?'interrupted':'completed',finishedAt:iso(),output,usage,finishReason:finish,metrics,chunks,reasoning,rawSamples:samples};
  runs.push(last);if(runs.length>20)runs.shift();
  if(reply){reply.content=output;reply.stats=`${Math.round(metrics.wallMs)} ms · ${metrics.modelDecodeTokensPerSecond?.toFixed(1)??'—'} model tokens/s`;
   // Never retain an unfinished <think> as a completed conversational answer.
   const answer=output.replace(/^\s*<think>[\s\S]*?<\/think>\s*/,'').trim();
   if(answer&&!/^\s*<think>/.test(answer))request=addAssistant(wire,answer);else request=wire;
   editor();showChat();}
  $('metrics').textContent=`${Math.round(metrics.wallMs)} ms · ${metrics.modelDecodeTokensPerSecond?.toFixed(1)??'—'} tokens/s`;
  note(`${kind} ${last.status}: ${metrics.modelDecodeTokensPerSecond?.toFixed(2)??'unreported'} model tokens/s. ${!output.trim()?'No visible answer.':''}`);
  log('inference-completed',{kind,ms:Math.round(metrics.wallMs),completionTokens:metrics.completionTokens});
 }catch(e){if(token!==generation)return;last={...last,status:'failed',finishedAt:iso(),partialOutput:output,error:String(e?.stack??e)};
   log('inference-failed',{message:String(e?.message??e).slice(0,300)});note('Inference error: '+(e?.message??e));}
 finally{if(token===generation){busy=false;active=null;$('stop').textContent='Cancel / Stop';$('result').textContent=asJSON(last);controls();save();}}
}
$('probe').onclick=()=>execute(bareProbe(),{kind:'known-good-probe'});
function fromJson(){try{return parseEditor();}catch(e){tab('json');note('Correct the request JSON.');return null;}}
$('send').onclick=()=>{const wire=fromJson();if(!wire)return;const text=$('compose').value.trim();if(!text){note('Write a message first.');return;}
  const next=appendUser(wire,text);$('compose').value='';request=next;editor();execute(next,{kind:'chat',updateConversation:true});};
$('compose').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();if(!$('send').disabled)$('send').click();}};
$('runJson').onclick=()=>{const wire=fromJson();if(!wire)return;
 if(!wire.messages.some(m=>m.role==='user'&&m.content.trim())){note('JSON needs a user message.');return;}
 execute(wire,{kind:'raw-json',updateConversation:true});};
$('apply').onclick=()=>{if(fromJson())note('Request JSON applied. Run JSON sends these exact messages.');};
$('sync').onclick=()=>{request={...defaultRequest(loaded?.model??$('model').value),messages:turns.filter(t=>!t.incomplete).map(t=>({role:t.role,content:t.content}))};editor();save();note('Request rebuilt from chat. Custom options were reset.');};
$('new').onclick=()=>{if(busy)return;request=defaultRequest(loaded?.model??$('model').value);turns=[];last=null;editor();showChat();$('result').textContent='No inference yet.';note('New conversation; loaded model kept.');log('new-conversation');controls();};
function exportReport(){const full={app:'PocketBench Chat',version:VERSION,exportedAt:iso(),runtime:RUNTIME_VERSION,selectedModel:$('model').value,context:$('context').value,loaded,loadMs,request,requestEditor:$('request').value,turns,runs,events,last,device:{userAgent:navigator.userAgent,webgpu:!!navigator.gpu}};
 const url=URL.createObjectURL(new Blob([asJSON(full)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`pocketbench-chat-${iso().replace(/[:.]/g,'-')}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),15000);}
$('export').onclick=exportReport;
$('copyRequest').onclick=()=>navigator.clipboard?.writeText($('request').value).catch(()=>note('Clipboard not available. Select JSON manually.'));
$('copy').onclick=()=>navigator.clipboard?.writeText(last?.output??'').catch(()=>note('Clipboard not available. Select text manually.'));
try{const s=JSON.parse(localStorage.getItem(STORE)||'null');if(s&&(s.version===VERSION||s.version==='0.2.0')){
  if(MODELS.some(m=>m.id===s.selectedModel))$('model').value=s.selectedModel;
  if(['catalog','512','1024','2048','4096'].includes(s.context))$('context').value=s.context;
  request=normalizeRequest(s.request??defaultRequest($('model').value),$('model').value);
  turns=Array.isArray(s.turns)?s.turns.slice(-24):[];runs=Array.isArray(s.runs)?s.runs.slice(-15):[];
  events=Array.isArray(s.events)?s.events.slice(-60):[];last=s.last??null;
  if(last?.status==='pending'){$('progress').textContent=`Previous page ended during ${last.kind} for ${last.model}; export before retrying.`;}
 }}catch(e){$('progress').textContent='Could not restore session. Defaults loaded.';}
editor();showChat();modelDetails();controls();
(async()=>{try{if(!navigator.gpu)throw Error('WebGPU is unavailable.');const adapter=await navigator.gpu.requestAdapter();if(!adapter)throw Error('No GPU adapter.');
 library=await import(RUNTIME_URL);const catalog=library.prebuiltAppConfig?.model_list??[];
 for(const item of MODELS){const o=[...$('model').options].find(x=>x.value===item.id);const r=catalog.find(x=>x.model_id===item.id);
  if(!r||(r.required_features??[]).some(f=>!adapter.features.has(f))){o.disabled=true;o.textContent+=' · unavailable on this adapter';}}
 note(`WebLLM ${RUNTIME_VERSION} ready. Llama 1B and Qwen 0.6B passed the separate diagnostic; choose one control.`);log('runtime-ready',{adapter:adapter.info?.vendor??'unknown'});controls();
 }catch(e){note('Runtime import failed: '+(e?.message??e));log('runtime-failed',{message:String(e)});}})();