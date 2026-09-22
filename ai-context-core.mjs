/** Crash-safe, pure controls for the second PocketBench inference experiment. */
export const STORAGE_KEY='pocketbench-ai-context-v2';
export const PROBES=Object.freeze([{id:'one',tokens:1,stream:false},{id:'four',tokens:4,stream:false},{id:'sixteen',tokens:16,stream:true},{id:'sixtyfour',tokens:64,stream:true}]);
export const CONTEXTS=Object.freeze([0,512,1024,2048]);
export function chatOptions(context){if(!CONTEXTS.includes(context))throw Error('Unsupported context option');return context?{context_window_size:context}:undefined;}
export function wasInterrupted(report){return !!report&&!report.finishedAt&&['loading','inference','runtime-import'].includes(report.phase);}
export function validateChoice({model,path,context},available){if(!available.some(m=>m.model_id===model))throw Error('Model is not present or lacks required features');if(!['worker','main'].includes(path))throw Error('Invalid execution path');chatOptions(context);return {model,path,context};}
export function summarize(result){const c=result?.usage?.completionTokens??null;return {tokensReported:c,reportedDecodeTokensPerSecond:result?.usage?.reportedDecodeTokensPerSecond??null,wallMs:result?.wallMs??null,firstTextMs:result?.firstTextMs??null,tokenUsageDiscrepancy:!!result?.outputCharacters&&c===0};}
export function snapshot(storage,report){const serialized=JSON.stringify(report);storage.setItem(STORAGE_KEY,serialized);return report;}
export function recover(storage){try{const value=storage.getItem(STORAGE_KEY);return value?JSON.parse(value):null;}catch{return null;}}
