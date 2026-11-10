const BANDS=[0.05,0.1,0.25,1];
const grade=x=>{const i=BANDS.findIndex(b=>x<=b);return i<0?4:i;};
// Empirical stability gate, not a mathematical per-hand exploitability certificate.
export function confidenceGate(estimate,reference,chosen,{semanticsApproved=false,floorBB=0.01,maxUncertaintyBB=0.025}={}){
  const no=reason=>({kind:'ungraded',reason});
  if(!semanticsApproved)return no('continuation-policy-not-approved');
  if(!reference)return no('no-independent-tighter-solve');
  if([estimate.qualityPct,reference.qualityPct].some(q=>!Number.isFinite(q)||q< -0.00001))return no('invalid-quality-measurement');
  if(estimate.units!=='BB'||reference.units!=='BB'||estimate.evPolicy!=='br-vs-fixed-average-v1'||reference.evPolicy!==estimate.evPolicy)return no('units-or-continuation-mismatch');
  if(estimate.context!==reference.context||estimate.actions.length!==reference.actions.length)return no('decision-context-mismatch');
  if(estimate.qualityPct>0.01||reference.qualityPct>0.0025)return no('insufficient-global-quality');
  for(const s of [estimate,reference]){
    if(s.reachWeight<=0||s.compatibleWeight<=0||s.actions.some(a=>!Number.isFinite(a.ev)||!Number.isFinite(a.frequency)||a.frequency<0))return no('undefined-or-no-reach');
    if(Math.abs(s.actions.reduce((sum,a)=>sum+a.frequency,0)-1)>0.0001)return no('invalid-frequencies');
    const best=Math.max(...s.actions.map(a=>a.ev));
    if(s.actions.some(a=>a.frequency>0.1&&best-a.ev>0.05))return no('solver-inconsistency');
  }
  if(estimate.actions.some((a,i)=>a.id!==reference.actions[i].id||a.targetTotalBB!==reference.actions[i].targetTotalBB))return no('action-set-mismatch');
  const a=estimate.actions.find(a=>a.id===chosen),r=reference.actions.find(a=>a.id===chosen);
  if(!a||!r)return no('unsupported-action');
  const loss=Math.max(0,Math.max(...estimate.actions.map(a=>a.ev))-a.ev),tightLoss=Math.max(0,Math.max(...reference.actions.map(a=>a.ev))-r.ev);
  const uncertainty=floorBB+2*Math.abs(loss-tightLoss),low=Math.max(0,Math.min(loss,tightLoss)-uncertainty),high=Math.max(loss,tightLoss)+uncertainty;
  if(uncertainty>maxUncertaintyBB)return no('unstable-action-loss');
  if(grade(low)!==grade(high))return no('grade-boundary-ambiguous');
  return {kind:'experimental-grade',grade:grade(high),lossBB:loss,lossIntervalBB:[low,high],uncertaintyBB:uncertainty,
    policy:'two-solve empirical stability, conditional on declared BR continuation; not approved for production penalties'};
}
