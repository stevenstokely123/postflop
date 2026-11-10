export class PersistentTurnProvider {
  constructor({workerUrl=new URL('./persistent-worker.mjs',import.meta.url),timeoutMs=180000}={}){this.workerUrl=workerUrl;this.timeoutMs=timeoutMs;this.sequence=0;this.pending=new Map();this.metrics={responseBytes:0,maxResponseBytes:0};}
  boot(){
    if(this.worker)return;
    const worker=new Worker(this.workerUrl,{type:'module'});this.worker=worker;
    worker.onmessage=({data})=>{
      if(worker!==this.worker)return;
      const bytes=new TextEncoder().encode(JSON.stringify(data)).length;this.metrics.responseBytes+=bytes;this.metrics.maxResponseBytes=Math.max(this.metrics.maxResponseBytes,bytes);
      const p=this.pending.get(data.id);if(!p)return;
      if(data.type==='progress'){p.progress?.(data);return;}
      clearTimeout(p.timer);this.pending.delete(data.id);
      if(data.ok)p.resolve(data.value);else {p.reject(Object.assign(new Error(data.error),{code:data.code}));if(data.fatal)this.cancel('worker-failed');}
    };
    worker.onerror=()=>{if(worker===this.worker)this.cancel('worker-failed');};
  }
  request(op,payload={},progress){
    this.boot();const id=++this.sequence;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>this.cancel('timeout'),this.timeoutMs);
      this.pending.set(id,{resolve,reject,timer,progress});this.worker.postMessage({id,op,payload:{handId:this.handId,...payload}});
    });
  }
  solve(situation,options={},progress){if(this.pending.size)this.cancel('superseded');this.handId=situation.handId;return this.request('solve',{situation,options},progress);}
  reference(options={},progress){return this.request('reference',options,progress);}
  decision(combo,options={}){return this.request('decision',{combo,...options});}
  act(actionId,expectedNode){return this.request('act',{actionId,expectedNode});}
  deal(card,expectedNode){return this.request('deal',{card,expectedNode});}
  inspect(){return this.request('inspect');}
  reset(){return this.request('reset');}
  evaluate(board,holes){return this.request('evaluate',{board,holes});}
  settle(holes){return this.request('settle',{holes});}
  release(){return this.request('release');}
  cancel(reason='cancelled'){
    this.worker?.terminate();this.worker=null;
    for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Object.assign(new Error(reason),{code:reason}));}this.pending.clear();
  }
  dispose(){this.cancel('disposed');}
}
