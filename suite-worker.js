import {SuiteRunner} from './suite-runner.js';
let runner;
self.onmessage=async ({data})=>{
 try{
  if(data.type==='init'){
   runner=new SuiteRunner(data.canvas,message=>self.postMessage(message),data.environment);
   await runner.init(data.size);
  }else if(data.type==='start'){
   if(!runner)throw Error('Worker not initialized');
   await runner.start(data.plan);
  }else if(data.type==='stop')runner?.stop();
  else if(data.type==='resize')runner?.resize(data.size);
  else if(data.type==='visibility')runner?.visibility(data.hidden);
 }catch(error){self.postMessage({type:'error',message:String(error?.stack||error)});}
};
