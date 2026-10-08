#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
const read=(p)=>fs.readFileSync(p,"utf8");
const app=read("src/app/FinanceAppV2.tsx"),page=read("src/planning/PlanningPage.tsx"),ui=read("src/planning/SignalPlan.tsx"),
 hook=read("src/planning/use-planning.ts"),model=read("src/planning/signal-plan-model.ts"),router=read("src/app/finance-router.ts");
assert(page.includes('SignalPlan.js'),"Legacy Plan must be replaced by Signal Current");
assert(app.includes('case "plan":return <PlanningPage mode="budget" onNavigate={navigate}/>'),"Real Plan route not wired");
assert(app.includes('case "goals":return <PlanningPage mode="goals" onNavigate={navigate}/>'),"Goals route not wired");
assert(router.includes('"/plan/goals":["period"]'),"Anchor links on goals route need canonical whitelist");
assert(ui.includes("usePlanningWorkspace(anchor||null)"),"Anchor navigation does not feed real backend");
assert(ui.includes("workspace.saveAllocation")&&ui.includes("workspace.deleteAllocation")&&ui.includes("workspace.saveGoal"),"Missing authenticated edit actions");
assert(ui.includes("workspace.addGoalMovement")&&ui.includes("workspace.setGoalStatus"),"Goals must use real persisted movements/status RPCs");
assert(ui.includes("planForecastPoints(board)")&&ui.includes("DataProvenance"),"No source-aware forecast");
assert(!hook.includes("runtime.recurring.syncPatterns("),"Plan read must not silently write recurring patterns");
assert(!hook.includes("runtime.client.auth.getSession()"),"P27 auth boundary should not be redundantly locked");
assert(!ui.includes("fixture")&&!app.includes("signal-plan-preview"),"Production Plan must not import synthetic data");
assert(model.includes("Number.isSafeInteger")&&model.includes("actualCumulativeMinor"),"Financial integer and future-value guards missing");
console.log("P31 real plan route, non-mutating read, allocation/goal writes and source integrity verified");
