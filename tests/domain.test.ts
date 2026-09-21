import { test } from "node:test";
import assert from "node:assert/strict";
import { nextPrescription, adherence, toKg, scaleNutrients, agePolicy } from "../src/domain.ts";
import type { Prescription, Exposure } from "../src/domain.ts";
const p: Prescription = { contextKey:"test-machine-a", load:20, sets:3, minReps:8, maxReps:10, targetRir:2, assisted:false };
const exposure = (id: string, reps=10, rir: number|null=2): Exposure => ({id,contextKey:p.contextKey,sets:Array.from({length:3},()=>({load:20,reps,rir,completed:true}))});
test("two mastered exposures propose next available load without mutation",()=>{
  const sessions=[exposure("a"),exposure("b")]; const original=JSON.stringify(sessions);
  const r=nextPrescription(p,sessions,[20,22.5,25]);
  assert.equal(r.action,"increase"); assert.equal(r.load,22.5); assert.deepEqual(r.evidence,["a","b"]);
  assert.equal(JSON.stringify(sessions),original);
});
test("one exposure does not unlock automatic increase",()=>assert.equal(nextPrescription(p,[exposure("a")],[20,22.5]).action,"hold"));
test("low RIR reduces available load",()=>assert.equal(nextPrescription(p,[exposure("a",8,0)],[17.5,20]).load,17.5));
test("missing RIR holds",()=>assert.equal(nextPrescription(p,[exposure("a",10,null)],[20,22.5]).action,"hold"));
test("partial latest session is not skipped",()=>{
  const partial=exposure("b"); partial.sets.pop();
  assert.equal(nextPrescription(p,[exposure("a"),partial],[20,22.5]).action,"hold");
});
test("assisted load progression lowers assistance",()=>assert.equal(nextPrescription({...p,assisted:true},[exposure("a"),exposure("b")],[17.5,20,22.5]).load,17.5));
test("pain pauses progression",()=>assert.equal(nextPrescription(p,[exposure("a"),exposure("b")],[20,22.5],true).action,"review"));
test("unknown increment does not invent equipment",()=>assert.equal(nextPrescription(p,[exposure("a"),exposure("b")],[20]).action,"hold"));
test("invalid and duplicated data rejected",()=>{
  assert.throws(()=>nextPrescription(p,[exposure("a"),exposure("a")],[20]));
  assert.throws(()=>nextPrescription(p,[exposure("a",10,NaN)],[20]));
});
test("different context cannot establish progression",()=>{
  const other={...exposure("b"),contextKey:"different-machine"};
  assert.equal(nextPrescription(p,[exposure("a"),other],[20,22.5]).action,"hold");
});
test("rest preserves streak and future workouts excluded",()=>{
  const r=adherence([{date:"2026-01-01",kind:"training",planned:1,completed:1},{date:"2026-01-02",kind:"rest",planned:0,completed:0},{date:"2026-01-03",kind:"training",planned:1,completed:0}],"2026-01-03");
  assert.equal(r.current,2); assert.equal(r.percentage,100);
});
test("missed session breaks streak",()=>assert.equal(adherence([{date:"2026-01-01",kind:"training",planned:1,completed:0}],"2026-01-02").current,0));
test("no planned sessions has no fake percentage",()=>assert.equal(adherence([],"2026-01-02").percentage,null));
test("duplicate calendar and gaps rejected",()=>{
  const d={date:"2026-01-01",kind:"rest" as const,planned:0,completed:0};
  assert.throws(()=>adherence([d,d],"2026-01-02"));
  assert.throws(()=>adherence([d],"2026-01-03"));
});
test("canonical weight conversion",()=>assert.equal(toKg(100,"lb"),45.359237));
test("nutrition scales quantities and preserves unknown values",()=>assert.deepEqual(scaleNutrients({protein:20,fiber:null},150,100),{protein:30,fiber:null}));
test("zero reference portion rejected",()=>assert.throws(()=>scaleNutrients({protein:20},150,0)));
test("unknown age and minors protected",()=>{
  assert.equal(agePolicy(null).protectedMode,true);
  assert.equal(agePolicy(14).aiAppearanceAssessment,false);
  assert.equal(agePolicy(20).appearanceRewards,false);
});
