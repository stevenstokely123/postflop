import test from 'node:test';import assert from 'node:assert/strict';import {confidenceGate} from './confidence.mjs';
const state=(values=[0,-0.5],frequency=[1,0])=>({context:'hand:node:combo',units:'BB',evPolicy:'br-vs-fixed-average-v1',qualityPct:0.001,reachWeight:1,compatibleWeight:1,actions:values.map((ev,i)=>({id:String(i),ev,frequency:frequency[i],targetTotalBB:i*10}))});
const approved={semanticsApproved:true};
test('strategy estimates never become grades by default',()=>{
  assert.equal(confidenceGate(state(),state(),'0').kind,'ungraded');
  assert.equal(confidenceGate(state(),null,'0',approved).reason,'no-independent-tighter-solve');
});
test('stable losses pass while a grade boundary remains ungraded',()=>{
  assert.equal(confidenceGate(state(),state(),'0',approved).kind,'experimental-grade');
  assert.equal(confidenceGate(state(),state(),'1',approved).grade,3);
  assert.equal(confidenceGate(state([0,-0.05]),state([0,-0.05]),'1',approved).reason,'grade-boundary-ambiguous');
});
test('the SSR EV-frequency contradiction rule is preserved on both snapshots',()=>{
  assert.equal(confidenceGate(state([0,-0.2],[0.8,0.2]),state(),'0',approved).reason,'solver-inconsistency');
});
test('unstable, unsupported, unreachable and incompatible decisions fail closed',()=>{
  assert.equal(confidenceGate(state([0,-0.5]),state([0,-0.4]),'1',approved).reason,'unstable-action-loss');
  assert.equal(confidenceGate(state(),state(),'not-offered',approved).reason,'unsupported-action');
  assert.equal(confidenceGate({...state(),reachWeight:0},state(),'0',approved).reason,'undefined-or-no-reach');
  assert.equal(confidenceGate({...state(),units:'hundredths'},state(),'0',approved).reason,'units-or-continuation-mismatch');
  assert.equal(confidenceGate({...state(),evPolicy:'average'},state(),'0',approved).reason,'units-or-continuation-mismatch');
  assert.equal(confidenceGate({...state(),qualityPct:0.1},state(),'0',approved).reason,'insufficient-global-quality');
  assert.equal(confidenceGate({...state(),qualityPct:-1},state(),'0',approved).reason,'invalid-quality-measurement');
});
