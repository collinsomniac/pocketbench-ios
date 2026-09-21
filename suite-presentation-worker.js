import {PresentationRunner} from './suite-presentation-runner.js';
let runner;
self.onmessage=async ({data})=>{
 try{
  if(data.type==='init') {runner=new PresentationRunner(data.canvas,m=>self.postMessage(m),data.environment);await runner.init(data.size);}
  else if(data.type==='pulse')runner?.pulse(data);
  else if(data.type==='start'){if(!runner)throw Error('Worker not ready');await runner.start(data.plan);}
  else if(data.type==='stop')runner?.stop();
  else if(data.type==='visibility')runner?.visibility(data.hidden);
 }catch(error){self.postMessage({type:'error',message:String(error?.stack||error)});}
};
