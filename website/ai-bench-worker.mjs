// This worker intentionally only handles the WebLLM engine's documented RPC protocol.
import {WebWorkerMLCEngineHandler} from 'https://esm.run/@mlc-ai/web-llm@0.2.85';
const handler=new WebWorkerMLCEngineHandler();
self.onmessage=(message)=>handler.onmessage(message);
