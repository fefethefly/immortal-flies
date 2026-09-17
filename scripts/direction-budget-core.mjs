import assert from "node:assert/strict";
import { integer, hash } from "../src/brain/codec.mjs";
import { createState, step } from "../src/brain/runtime.mjs";
import { observeLocal } from "../src/brain/task-local-relay.mjs";
import { encodeDirection } from "../src/brain/task-direction.mjs";

export const BUDGET_POLICY = Object.freeze({ id: "equal-food-budget/1", arms: ["directional", "swapped", "neutral"] });
export function budgetCohort(graph, sides) {
  const food = new Set(graph.metadata.groups.food);
  const motor = new Set([...graph.metadata.groups.left, ...graph.metadata.groups.right]);
  const all = [...sides.food.left, ...sides.food.right];
  assert.equal(new Set(all).size, all.length);
  all.forEach(i => { integer(i, 0, graph.n - 1, "index"); assert.ok(food.has(i) && !motor.has(i)); });
  const k = 2 * Math.floor(Math.min(sides.food.left.length, sides.food.right.length) / 2);
  assert.ok(k >= 2, "each side needs at least two sources");
  return { left: [...sides.food.left].sort((a,b)=>a-b), right: [...sides.food.right].sort((a,b)=>a-b), k };
}
export function selectBudgetSources(cohort, arm, right, tick) {
  assert.ok(BUDGET_POLICY.arms.includes(arm));
  integer(right, -1000, 1000, "right"); integer(tick, 0, 10000, "tick");
  const take = (list, n) => Array.from({length:n}, (_,i)=>list[(tick+i)%list.length]);
  if (arm === "neutral" || right === 0) return [...take(cohort.left,cohort.k/2), ...take(cohort.right,cohort.k/2)];
  const useRight = (right > 0) !== (arm === "swapped");
  return take(useRight ? cohort.right : cohort.left,cohort.k);
}
// Mirrors runtime RNG only for auditing attempted external injections; no state edits.
export function injectionBudget(rng, count, intensity) {
  integer(rng,1,0xffffffff,"rng"); integer(count,1,1000,"count"); integer(intensity,0,1000,"intensity");
  let successes=0;
  for(let i=0;i<count;i++){ rng^=rng<<13; rng^=rng>>>17; rng^=rng<<5; rng>>>=0; if(rng%1000<intensity)successes++; }
  return { rng, attempts:count, successes, attemptedCurrent:successes*1100 };
}
export async function runBudgetArm(graph, sides, { seed=43, rounds=36, dx=600, dy=0, arm="directional", mode="closed" }={}) {
  integer(rounds,1,128,"rounds"); integer(seed,1,0xffffffff,"seed");
  integer(dx,-999,999,"dx"); integer(dy,-999,999,"dy");
  assert.ok(dx*dx+dy*dy>400**2 && dx*dx+dy*dy<1000**2);
  assert.ok(["open","closed"].includes(mode));
  const cohort=budgetCohort(graph,sides);
  let s=createState(graph,{seed,soulId:"budget-study",branchId:"experimental"});
  const world={ food:[{x:5000+dx,y:5000+dy,consumed:false}], threats:[] };
  const initial=encodeDirection(observeLocal(world,s.body).observations,s.body).channels.food;
  const trace=[], events=[];
  for(let tick=0;tick<rounds;tick++) {
    const sensed=encodeDirection(observeLocal(world,s.body).observations,s.body).channels.food;
    const input=mode==="open"?initial:sensed;
    const selected=selectBudgetSources(cohort,arm,input.right,tick);
    const budget=injectionBudget(s.rng,cohort.k,input.intensity);
    const routed={...graph,metadata:{...graph.metadata,groups:{...graph.metadata.groups,food:selected,threat:[],light:[]}}};
    s.signal={food:input.intensity,threat:0,light:0}; s=step(s,routed,1);
    assert.equal(s.rng,budget.rng,"RNG draw count changed");
    const d2=(s.body.x-world.food[0].x)**2+(s.body.y-world.food[0].y)**2;
    if(!world.food[0].consumed && d2<=400**2){world.food[0].consumed=true;events.push(tick+1);}
    trace.push({ tick:tick+1, input, selected, budget, body:[s.body.x,s.body.y,s.body.heading],
      distance2:d2, voltageHash:await hash(s.voltage), spikesHash:await hash(s.spikes) });
  }
  return { policy:BUDGET_POLICY.id, mode, arm, seed, rounds, target:{dx,dy}, k:cohort.k,
    collected:events.length, events, trace, finalStateHash:await hash(s) };
}
