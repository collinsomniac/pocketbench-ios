/* Browser-local chat request validation and performance accounting. */
export const VERSION='0.2.0';
export const RUNTIME_VERSION='0.2.85';
export const RUNTIME_URL=`https://esm.run/@mlc-ai/web-llm@${RUNTIME_VERSION}`;
export const MODELS=Object.freeze([
  {id:'Qwen3-0.6B-q4f16_1-MLC',label:'Qwen3 0.6B · measured control',parametersB:0.6,estimateMB:1403.34,tier:'measured'},
  {id:'Qwen3-1.7B-q4f16_1-MLC',label:'Qwen3 1.7B · experimental',parametersB:1.7,estimateMB:2036.66,tier:'catalog'},
  {id:'Qwen3-8B-q4f16_1-MLC',label:'Qwen3 8B · high-memory stretch',parametersB:8,estimateMB:5695.78,tier:'stretch'}
]);
// Match the previously successful WebLLM diagnostic's request shape until a controlled comparison succeeds.
export function defaultRequest(model=MODELS[0].id){return {model,messages:[],temperature:0,max_tokens:64,stream:true,stream_options:{include_usage:true}};}
export function normalizeRequest(value,loadedId){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Request must be a JSON object.');
 if(value.model!==loadedId)throw Error('JSON model must match the loaded model. Load your selected model first.');
 if(!Array.isArray(value.messages))throw Error('messages must be an array.');
 for(const [i,m] of value.messages.entries())if(!m||typeof m!=='object'||!['system','user','assistant'].includes(m.role)||typeof m.content!=='string')throw Error(`messages[${i}] must contain role system/user/assistant and string content.`);
 if(value.max_tokens!==undefined&&(!Number.isInteger(value.max_tokens)||value.max_tokens<1||value.max_tokens>8192))throw Error('max_tokens must be an integer between 1 and 8192.');
 if(value.temperature!==undefined&&(!Number.isFinite(value.temperature)||value.temperature<0||value.temperature>2))throw Error('temperature must be between 0 and 2.');
 if(value.top_p!==undefined&&(!Number.isFinite(value.top_p)||value.top_p<=0||value.top_p>1))throw Error('top_p must be greater than 0 and no greater than 1.');
 if(value.stream!==undefined&&typeof value.stream!=='boolean')throw Error('stream must be boolean.');
 return structuredClone(value);
}
export function appendUser(r,content){const next=structuredClone(r);if(content.trim())next.messages.push({role:'user',content:content.trim()});return next;}
export function addAssistant(r,content){const next=structuredClone(r);next.messages.push({role:'assistant',content});return next;}
export function usageMetrics(usage,start,first,end){const extra=usage?.extra??{};return {wallMs:end-start,firstTextMs:first===null?null:first-start,promptTokens:Number.isFinite(usage?.prompt_tokens)?usage.prompt_tokens:null,completionTokens:Number.isFinite(usage?.completion_tokens)?usage.completion_tokens:null,modelPrefillTokensPerSecond:Number.isFinite(extra.prefill_tokens_per_s)?extra.prefill_tokens_per_s:null,modelDecodeTokensPerSecond:Number.isFinite(extra.decode_tokens_per_s)?extra.decode_tokens_per_s:null,rawUsage:usage??null};}
export const asJSON=value=>JSON.stringify(value,null,2);
