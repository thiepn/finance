#!/usr/bin/env node
/** P25 design contract validation; does not certify visual quality or production behavior. */
import assert from "node:assert/strict";
import fs from "node:fs";
const d=JSON.parse(fs.readFileSync("design/p25/directions.json","utf8"));
const html=fs.readFileSync("design/p25/visual-lab/index.html","utf8");
const css=fs.readFileSync("design/p25/visual-lab/visual-lab.css","utf8");
assert.equal(d.phase,"P25");
assert.equal(d.selectedDirection,null,"Visual design must remain unlocked until explicit user selection");
assert.equal(d.directions.length,3);
assert.deepEqual(d.directions.map(x=>x.id),["a","b","c"]);
assert.equal(new Set(d.directions.map(x=>x.styleFamily)).size,3);
assert.equal(new Set(d.directions.map(x=>x.primaryMode)).size,2,"Design exploration must include a dark-first direction");
for(const direction of d.directions){
 for(const key of ["page","surface","accent","text"])
  assert(/^#[0-9a-fA-F]{6}$/.test(direction.tones[key]),direction.id+": invalid main token "+key);
 assert(direction.alternate.page!==direction.tones.page,direction.id+": missing alternate mode");
 assert(css.includes('data-direction="'+direction.id+'"'),direction.id+": missing CSS variant");
}
assert.equal(d.shared.fixture.monthlyBudgetMinor-d.shared.fixture.postedSpentMinor,d.shared.fixture.remainingBudgetMinor);
assert.equal(d.shared.fixture.categories.reduce((s,c)=>s+c.budgetMinor,0),d.shared.fixture.monthlyBudgetMinor);
assert.equal(d.shared.fixture.categories.reduce((s,c)=>s+c.spentMinor,0),d.shared.fixture.postedSpentMinor);
for(const cls of ["desktop-home","desktop-activity","desktop-receipt","desktop-states","mobile-home","mobile-scan","mobile-plan","mobile-states"]){
 assert(html.includes('class="screen '+cls+'"'),"Missing screen: "+cls);
 assert(css.includes("."+cls),"Missing CSS display contract: "+cls);
}
assert(html.includes("No financial data requested until your session is verified."));
assert(html.includes("Receipt match won't add a second expense."));
assert(html.includes("Images stay on this device until you upload."));
assert.equal(d.evaluationRubric.dimensions.reduce((s,r)=>s+r.weight,0),100);
assert.equal(new Set(d.shared.screens.desktop).size,3);
assert.equal(new Set(d.shared.screens.mobile).size,3);
console.log("P25 design contracts valid: 3 independent identities; 8 screen families; 2 theme modes; financial fixtures reconcile; evaluation rubric totals 100.");
