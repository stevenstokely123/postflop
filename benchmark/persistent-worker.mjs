import init,* as wasm from './artifacts/solver_wasm.js';
import {confidenceGate} from './confidence.mjs';
let ready,exports,primary=null,tighter=null,handId=null,toml=null,current=0,contributions=[0,0],initCount=0,stats=null;
let primaryAudit=null,referenceAudit=null;
let configId=null;
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
const timed=fn=>{const t=performance.now(),value=fn();return {value,ms:performance.now()-t};};
const memory=()=>exports?.memory.buffer.byteLength??0;
async function boot(){if(!ready)ready=init({module_or_path:new URL('./artifacts/solver_wasm_bg.wasm',import.meta.url)}).then(x=>{exports=x;initCount++;return x;}).catch(e=>{ready=null;throw e;});return ready;}
function release(){const a=primary,b=tighter;primary=null;tighter=null;primaryAudit=null;referenceAudit=null;handId=null;toml=null;configId=null;current=0;contributions=[0,0];a?.free();b?.free();return {released:true,wasmLinearBytes:memory(),initCount};}
function audit(h){const values=[0,1].map(p=>{
  const w=h.combo_ev_weights(0,p),ev=h.combo_evs(0,p),br=h.combo_br_evs(0,p);let mass=0,v=0,b=0;
  for(let i=0;i<w.length;i++)if(w[i]>0&&Number.isFinite(ev[i])&&Number.isFinite(br[i])){mass+=w[i];v+=ev[i]*w[i];b+=br[i]*w[i];}
  if(!(mass>0))fail('EMPTY_RANGE','No compatible joint range mass');return {ev:v/mass,br:b/mass};
});const m=JSON.parse(h.meta()),pct=100*values.reduce((s,p)=>s+p.br-p.ev,0)/m.starting_pot;
  if(Math.abs(pct-m.exploitability_pct_of_pot)>0.0001)fail('METRIC_MISMATCH','Reported convergence disagrees with weighted root NashConv');
  return {independentNashConvPct:pct,rootValues:values,expectedRakeBB:-values.reduce((s,p)=>s+p.ev,0)};
}
function config(s,o){
  if(!s||typeof s.handId!=='string'||!s.handId||s.board?.length!==4||new Set(s.board).size!==4||s.board.some(c=>!/^([2-9TJQKA][cdhs])$/.test(c)))fail('INVALID_INPUT','Complete legal turn board and handId required');
  for(const key of ['startingPot','effectiveStack'])if(!Number.isFinite(s[key])||s[key]<=0)fail('INVALID_INPUT',`Invalid ${key}`);
  if(typeof s.oopRange!=='string'||typeof s.ipRange!=='string')fail('INVALID_INPUT','Both weighted ranges required');
  if(s.positions?.length!==2||new Set(s.positions).size!==2||(s.activePlayers!==undefined&&s.activePlayers!==2))fail('UNSUPPORTED_PLAYERS','Exactly two mapped live players required');
  if(s.players&&s.players.length!==2)fail('UNSUPPORTED_PLAYERS','Multiway unsupported');
  if(s.sidePots?.length)fail('UNSUPPORTED_SIDE_POTS','Side pots unsupported');
  if(s.stacks&&(s.stacks.length!==2||s.stacks.some(x=>!Number.isFinite(x)||Math.abs(x-s.effectiveStack)>0.000001)))fail('UNSUPPORTED_STACKS','Prototype requires equal effective stacks; do not discard covering chips');
  if(s.contributions?.some(x=>x!==0))fail('MID_STREET_ROOT','Solve starts at turn street boundary; replay subsequent actions through the retained tree');
  const bet=o.betPercent??75;if(![50,75].includes(bet))fail('UNSUPPORTED_TREE','Prototype supports one 50% or 75% size');
  // Gross pot, 5% capped at 3BB at each final matched terminal; never subtract at the root.
  return `board = ${JSON.stringify(s.board.join(' '))}\noop_range = ${JSON.stringify(s.oopRange)}\nip_range = ${JSON.stringify(s.ipRange)}\nstarting_pot = ${s.startingPot}\neffective_stack = ${s.effectiveStack}\nraise_cap = 1\nallin_threshold = 67\n[rake]\npercent = 5\ncap = 3\n`+
    ['oop','ip'].flatMap(p=>['turn','river'].map(st=>`[sizings.${p}.${st}]\nbet = { percents = [${bet}], allin = false }\nraise = { percents = [], allin = true }\n`)).join('');
}
function node(h=primary){if(!h)fail('NO_SOLUTION','No retained solution');return JSON.parse(h.node(current));}
function snapshot(){const n=node();return {handId,configId,node:current,kind:n.kind,actor:n.player??null,street:n.street,board:n.board,potBB:n.pot,stacksBB:n.stacks,
  contributionBB:[...contributions],validCards:n.valid_cards?.map(x=>x.card),terminal:n.terminal,actions:n.actions?.map((a,i)=>action(a,i,n)),
  strategyQuality:{...quality(primary),...primaryAudit},referenceQuality:tighter?{...quality(tighter),...referenceAudit}:null,wasmLinearBytes:memory(),initCount};}
function quality(h){const m=JSON.parse(h.meta());return {iterations:m.iterations,nashConvPct:m.exploitability_pct_of_pot};}
function action(a,i,n){const p=n.player,toCall=Math.max(...contributions)-contributions[p];
  const total=a.amount_to??(a.label==='allin'?contributions[p]+n.stacks[p]:a.label==='call'?contributions[p]+Math.min(toCall,n.stacks[p]):contributions[p]);
  return {id:`n${current}:a${i}`,kind:a.label,label:a.text,targetTotalBB:total};}
function decision(h,combo){
  const n=node(h);if(n.kind!=='decision')fail('NOT_DECISION','Current state is not a decision');
  if(!/^(?:[2-9TJQKA][cdhs]){2}$/.test(combo)||combo.slice(0,2)===combo.slice(2))fail('INVALID_COMBO','Invalid two-card combo');
  const combos=JSON.parse(h.combos(current,n.player)),reversed=combo.slice(2)+combo.slice(0,2),slot=combos.findIndex(c=>c.cards===combo||c.cards===reversed);
  if(slot<0)fail('UNSUPPORTED_COMBO','Combo is blocked or outside this range');
  const weights=h.combo_ev_weights(current,n.player),strategies=h.strategy(current);
  if(!(combos[slot].weight>0&&weights[slot]>0))fail('NO_REACH','No defined strategy/EV for this hand');
  const actions=n.actions.map((a,i)=>{
    const child=JSON.parse(h.combos(a.child,n.player)),j=child.findIndex(c=>c.cards===combos[slot].cards);
    const br=h.combo_br_evs(a.child,n.player),avg=h.combo_evs(a.child,n.player);
    return {...action(a,i,n),frequency:strategies[i*combos.length+slot],ev:j<0?null:Number.isFinite(br[j])?br[j]:null,averageEV:j<0?null:Number.isFinite(avg[j])?avg[j]:null};
  });
  return {combo:combos[slot].cards,context:JSON.stringify([handId,configId,current,combos[slot].cards]),units:'BB',evPolicy:'br-vs-fixed-average-v1',qualityPct:quality(h).nashConvPct,reachWeight:combos[slot].weight,compatibleWeight:weights[slot],actions};
}
self.onmessage=async({data:{id,op,payload:p}})=>{
  try{
    await boot();
    if(op==='evaluate'){self.postMessage({id,ok:true,value:{rank:wasm.showdown_rank(p.board.join(' '),p.holes.join(' '))}});return;}
    if(op==='release'){if(primary&&p.handId!==handId)fail('STALE_HAND','Cannot release a different active hand');self.postMessage({id,ok:true,value:release()});return;}
    if(op==='solve'){
      release();toml=config(p.situation,p.options);handId=p.situation.handId;
      configId=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(toml))),b=>b.toString(16).padStart(2,'0')).join('');
      stats=JSON.parse(wasm.tree_stats(toml));
      const budget=p.options.budgetBytes??128*1024**2;
      if(!Number.isFinite(budget)||budget<=0)fail('INVALID_INPUT','Invalid memory budget');
      if(stats.total_bytes*3>budget)fail('OVERSIZED','Preflight x3 exceeds prototype budget (not RSS estimate)');
      const target=p.options.targetPct??0.01,max=p.options.maxIterations??5000;
      if(!Number.isFinite(target)||target<=0||target>0.5||!Number.isInteger(max)||max<1||max>20000)fail('INVALID_INPUT','Invalid accuracy/iteration limits');
      const solved=timed(()=>wasm.solve_spot(toml,max,target,25,(iter,chips,pct)=>self.postMessage({id,type:'progress',handId,phase:'strategy',iter,chips,pct})));
      primary=solved.value;
      primaryAudit=audit(primary);
      self.postMessage({id,ok:true,value:{...snapshot(),solveMs:solved.ms,stats,targetMet:quality(primary).nashConvPct<=target}});return;
    }
    if(!primary||p.handId!==handId)fail('STALE_HAND','Hand or solution no longer active');
    if(op==='reference'){
      tighter?.free();tighter=null;
      const target=p.targetPct??0.0025;
      if(!Number.isFinite(target)||target<=0||!Number.isInteger(p.maxIterations??10000)||(p.maxIterations??10000)<1||(p.maxIterations??10000)>20000)fail('INVALID_REFERENCE','Invalid reference accuracy/iteration limits');
      if(target>=quality(primary).nashConvPct)fail('INVALID_REFERENCE','Reference target must be tighter than current quality');
      const solved=timed(()=>wasm.solve_spot(toml,p.maxIterations??10000,target,25,(iter,chips,pct)=>self.postMessage({id,type:'progress',handId,phase:'reference',iter,chips,pct})));
      tighter=solved.value;referenceAudit=audit(tighter);self.postMessage({id,ok:true,value:{...snapshot(),referenceMs:solved.ms,targetMet:quality(tighter).nashConvPct<=target}});return;
    }
    if(op==='inspect'){self.postMessage({id,ok:true,value:snapshot()});return;}
    if(op==='reset'){current=0;contributions=[0,0];self.postMessage({id,ok:true,value:snapshot()});return;}
    if(op==='settle'){
      const n=node();if(n.kind!=='terminal')fail('NOT_TERMINAL','Hand has not finished');
      let winners;
      if(n.terminal.kind==='fold')winners=[1-n.terminal.folder];
      else{
        if(n.board.length!==5||p.holes?.length!==2||p.holes.some(h=>h.length!==2))fail('INVALID_SHOWDOWN','Both actual hole-card pairs required');
        const cards=[...n.board,...p.holes.flat()];if(new Set(cards).size!==9)fail('ILLEGAL_CARD','Showdown cards overlap');
        const ranks=p.holes.map(h=>wasm.showdown_rank(n.board.join(' '),h.join(' ')));
        winners=ranks[0]===ranks[1]?[0,1]:[ranks[0]>ranks[1]?0:1];
      }
      const rake=Math.min(3,n.terminal.pot*0.05),award=(n.terminal.pot-rake)/winners.length,stacks=[...n.stacks];
      for(const p of winners)stacks[p]+=award;
      self.postMessage({id,ok:true,value:{winners,matchedPotBB:n.terminal.pot,rakeBB:rake,finalEffectiveStacksBB:stacks,rule:'exact fractional-BB arithmetic; provider rake/payout rounding remains unconfirmed'}});return;
    }
    if(op==='decision'){
      const a=decision(primary,p.combo),b=tighter?decision(tighter,p.combo):null;
      self.postMessage({id,ok:true,value:{kind:'decision',...snapshot(),combo:a.combo,units:'BB',evPolicy:a.evPolicy,
        actions:a.actions.map(({ev,averageEV,...action})=>action),
        analysis:a.actions.map(x=>({id:x.id,bestResponseEV:x.ev,averageContinuationEV:x.averageEV})),
        grading:a.actions.map(x=>({id:x.id,...confidenceGate(a,b,x.id,{semanticsApproved:p.experimentalBRGrading===true})}))}});return;
    }
    if(p.expectedNode!==current)fail('STALE_NODE','Expected node does not match');
    const n=node();
    if(op==='act'){
      if(n.kind!=='decision')fail('NOT_DECISION','No action available');
      const index=n.actions.findIndex((a,i)=>action(a,i,n).id===p.actionId);
      if(index<0)fail('OFF_TREE','Action not represented; no strategy or EV fabricated');
      const child=n.actions[index].child,next=JSON.parse(primary.node(child));contributions[n.player]+=n.stacks[n.player]-next.stacks[n.player];current=child;
    }else if(op==='deal'){
      if(n.kind!=='chance')fail('NOT_CHANCE','A river card is not due');
      const edge=n.valid_cards.find(e=>e.card===p.card);if(!edge)fail('ILLEGAL_CARD','Card already on board or invalid');
      current=edge.child;contributions=[0,0];
    }else fail('UNKNOWN_OPERATION','Unknown request');
    self.postMessage({id,ok:true,value:snapshot()});
  }catch(e){const fatal=e instanceof WebAssembly.RuntimeError;
    if(!fatal&&op==='solve')release();
    if(!fatal&&op==='reference'){const bad=tighter;tighter=null;referenceAudit=null;bad?.free();}
    self.postMessage({id,ok:false,code:e.code??'SOLVER_ERROR',error:String(e),fatal});}
};
