/** Small, dependency-free diagnostic logic: no browser globals at import time. */
export const CHECKPOINT_KEY='pocketbench-ai-diagnostic-v1';
export const PROBES=[{id:'one',tokens:1,stream:false},{id:'four',tokens:4,stream:false},{id:'sixteen',tokens:16,stream:true},{id:'sixtyfour',tokens:64,stream:true}];
export function interrupted(previous){return !!previous&&['loading','inference','runtime-import'].includes(previous.phase)&&!previous.finishedAt;}
export function checkpoint(storage,value){storage.setItem(CHECKPOINT_KEY,JSON.stringify(value));return value;}
export function restored(storage){try{const value=storage.getItem(CHECKPOINT_KEY);return value?JSON.parse(value):null;}catch{return null;}}
export function usageOf(u){return {promptTokens:Number.isFinite(u?.prompt_tokens)?u.prompt_tokens:null,completionTokens:Number.isFinite(u?.completion_tokens)?u.completion_tokens:null,reportedDecodeTokensPerSecond:Number.isFinite(u?.extra?.decode_tokens_per_s)?u.extra.decode_tokens_per_s:null};}
export async function oneInference(engine,probe,{clock=()=>performance.now(),mark=()=>{}}={}){
 const prompt='Write a short list of common nouns separated by spaces.';
 const start=clock(),messages=[{role:'user',content:prompt}];
 mark('request-start',{tokens:probe.tokens,stream:probe.stream});
 const req={messages,temperature:0,max_tokens:probe.tokens,stream:probe.stream};
 let output='',chunks=0,firstTextMs=null,usage=null;
 if(probe.stream){req.stream_options={include_usage:true};const stream=await engine.chat.completions.create(req);
  mark('stream-created');for await(const chunk of stream){chunks++;const text=chunk.choices?.[0]?.delta?.content??'';
   if(text){if(firstTextMs===null){firstTextMs=clock()-start;mark('first-text',{elapsedMs:firstTextMs});}output+=text;}
   if(chunk.usage)usage=chunk.usage;
  }
 }else{const response=await engine.chat.completions.create(req);mark('response-received');output=response.choices?.[0]?.message?.content??'';usage=response.usage??null;if(output)firstTextMs=clock()-start;}
 const wallMs=clock()-start;
 return {id:probe.id,tokensRequested:probe.tokens,stream:probe.stream,status:'completed',wallMs,firstTextMs,chunks,usage:usageOf(usage),outputCharacters:output.length,outputPreview:output.slice(0,160)};
}
