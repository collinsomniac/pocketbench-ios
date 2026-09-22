/* PocketBench chat: pure, dependency-free request/measurement core. */
export const VERSION='0.1.1';
export const RUNTIME_VERSION='0.2.85';
export const RUNTIME_URL=`https://esm.run/@mlc-ai/web-llm@${RUNTIME_VERSION}`;
export const MODELS=Object.freeze([
 {id:'Qwen3-0.6B-q4f16_1-MLC',label:'Qwen3 0.6B · verified on this iPhone',parametersB:0.6,estimateMB:1403.34,tier:'measured'},
 {id:'Qwen3-1.7B-q4f16_1-MLC',label:'Qwen3 1.7B · intermediate',parametersB:1.7,estimateMB:2036.66,tier:'catalog'},
 {id:'Qwen3-8B-q4f16_1-MLC',label:'Qwen3 8B · experimental stretch',parametersB:8,estimateMB:5695.78,tier:'stretch'}
]);
export function defaultRequest(model=MODELS[0].id){return {model,messages:[{role:'system',content:'Be helpful, concise, and accurate.'}],temperature:0.7,top_p:0.9,max_tokens:128,stream:true,stream_options:{include_usage:true},extra_body:{enable_thinking:false}};}
export function normalizeRequest(input,loadedId){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Request must be a JSON object.');
 if(input.model!==loadedId)throw Error('Request model must match the currently loaded model. Select/load the model first.');
 if(!Array.isArray(input.messages)||!input.messages.length)throw Error('messages must be a nonempty array.');
 for(const [i,m] of input.messages.entries()){
  if(!m||typeof m!=='object'||!['system','user','assistant'].includes(m.role)||typeof m.content!=='string')throw Error(`messages[${i}] must have role system/user/assistant and a string content.`);
 }
 if(input.max_tokens!==undefined&&(!Number.isInteger(input.max_tokens)||input.max_tokens<1||input.max_tokens>8192))throw Error('max_tokens must be an integer from 1 to 8192.');
 if(input.temperature!==undefined&&(!Number.isFinite(input.temperature)||input.temperature<0||input.temperature>2))throw Error('temperature must be between 0 and 2.');
 if(input.top_p!==undefined&&(!Number.isFinite(input.top_p)||input.top_p<=0||input.top_p>1))throw Error('top_p must be greater than 0 and at most 1.');
 if(input.stream!==undefined&&typeof input.stream!=='boolean')throw Error('stream must be a boolean.');
 return structuredClone(input);
}
export function appendUser(input,content){const r=structuredClone(input);if(content.trim())r.messages.push({role:'user',content:content.trim()});return r;}
export function addAssistant(input,content){const r=structuredClone(input);r.messages.push({role:'assistant',content});return r;}
export function usageMetrics(usage,start,first,end){const extra=usage?.extra||{};return {wallMs:end-start,firstTextMs:first===null?null:first-start,promptTokens:Number.isFinite(usage?.prompt_tokens)?usage.prompt_tokens:null,completionTokens:Number.isFinite(usage?.completion_tokens)?usage.completion_tokens:null,modelPrefillTokensPerSecond:Number.isFinite(extra.prefill_tokens_per_s)?extra.prefill_tokens_per_s:null,modelDecodeTokensPerSecond:Number.isFinite(extra.decode_tokens_per_s)?extra.decode_tokens_per_s:null,rawUsage:usage??null};}
export function asJSON(value){return JSON.stringify(value,null,2);}
