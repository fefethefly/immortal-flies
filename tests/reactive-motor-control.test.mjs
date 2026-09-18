import test from 'node:test';
import assert from 'node:assert/strict';
import {reactiveMotor,applyReactiveMotor} from '../src/brain/reactive-motor-control.mjs';
import {observeLocal} from '../src/brain/task-local-relay.mjs';

const body={x:5000,y:5000,heading:0};
const context={to:1,round:1,body,observations:[]};
test('direct reactive counts have correct sign, idle, forward deadband and explicit non-neural label',()=>{
  for(const [x,y,left,right] of [[5000,6200,0,1],[5000,3800,1,0],[6200,5000,6,6]]){
    const input={...context,observations:[{channel:'food',x,y}]};
    const copy=structuredClone(input),cmd=reactiveMotor([],input);
    assert.equal(cmd.left,left);assert.equal(cmd.right,right);
    assert.equal(cmd.controller,'handwritten-not-neural');
    const moved=applyReactiveMotor(body,cmd);
    assert.equal(moved.heading,(Math.sign(right-left)*9+360)%360);
    assert.deepEqual(input,copy);
  }
  assert.deepEqual(applyReactiveMotor(body,reactiveMotor([],context)),body);
  assert.throws(()=>applyReactiveMotor(body,{policy:'unknown',left:0,right:1}));
});

function runRight(withMessages){
  // Same initial geometry as original seed-301/right neural failure.
  // seed is a scenario label only: this handwritten controller has no RNG.
  const seed=301,observer={x:5000,y:6800},target={x:5000,y:6200,consumed:false};
  const world={food:[target],threats:[]};
  let receiver={...body},pending=[],collectedAt=null;
  const trace=[];
  for(let round=1;round<=160;round++){
    const before={...receiver},local=observeLocal(world,before);
    const outgoing=round<160&&withMessages?observeLocal(world,observer).observations.map(o=>({
      id:`${round}:0:${o.channel}`,from:0,observedRound:round,deliveryRound:round+1,observer,...o})):[];
    const cmd=reactiveMotor(pending,{to:1,round,body:before,observations:local.observations});
    receiver=applyReactiveMotor(before,cmd);
    const distance=Math.hypot(receiver.x-target.x,receiver.y-target.y);
    if(!target.consumed&&distance<=400){target.consumed=true;collectedAt=round;}
    trace.push({round,before,after:receiver,received:pending,cmd,distance});pending=outgoing;
  }
  return {seed,collectedAt,trace};
}
test('original right-side geometry collects within 160 rounds with real delayed messages, not without them',()=>{
  const run=runRight(true);
  assert.deepEqual(runRight(true),run,'deterministic replay');
  assert.ok(run.collectedAt!==null&&run.collectedAt<=160,'must actually collect, not merely reduce distance');
  assert.equal(run.trace[0].received.length,0);
  assert.equal(run.trace[1].received[0].from,0);
  assert.ok(run.trace.every(t=>t.cmd.controller==='handwritten-not-neural'));
  const silent=runRight(false);
  assert.equal(silent.collectedAt,null);
  assert.ok(silent.trace.every(t=>t.after.x===5000&&t.after.y===5000));
  console.log(JSON.stringify({controller:'handwritten-not-neural',seedLabel:301,scenario:'right',rounds:160,
    collectedAt:run.collectedAt,collectionDistance:run.trace[run.collectedAt-1].distance,noMessageCollected:false}));
});
