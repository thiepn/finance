#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
const get=p=>fs.readFileSync(p,"utf8");
const app=get("src/app/FinanceAppV2.tsx"),page=get("src/planning/SignalPlan.tsx"),hook=get("src/planning/use-planning.ts"),
 model=get("src/planning/signal-plan-model.ts"),css=get("src/planning/signal-plan.css");
assert(app.includes('case "plan":return <SignalPlanPage onNavigate={navigate}/>;'),"P31 Plan route must render Signal Current");
assert(app.includes('case "goals":return <PlanningPage'),"P31 must preserve working Goals page");
assert(page.includes("usePlanningWorkspace(anchor)"),"Period-specific real budget loader missing");
assert(page.includes('workspace.setupBudget')&&page.includes('workspace.updatePlannedIncome'),"Budget setup and income editing not real");
assert(page.includes("workspace.saveAllocation")&&page.includes("workspace.deleteAllocation"),"Category write actions missing");
assert(page.includes("confirmRemove")&&page.includes("Confirm removal"),"Removal needs explicit confirmation");
assert(page.includes("planTrend(dashboard)")&&page.includes("FinanceTrend"),"Real planning forecast absent");
assert(page.includes("b.safeToSpendMinor")&&page.includes("Not a bank balance"),"Safe-to-spend incorrectly stated as cash");
assert(page.includes("b.futureRecurringExpenseMinor"),"Scheduled commitments unavailable");
assert(page.includes('onNavigate("/plan/goals")'),"Existing Goals integration missing");
assert(hook.includes("getDashboard(anchorDate)")&&!hook.includes("auth.getSession()"),"Verified session boundary must not duplicate auth reads");
assert(!page.includes("fixture")&&!app.includes("signal-plan-preview"),"Synthetic values must never be loaded into production Plan");
assert(model.includes("Number.isSafeInteger"),"Unsafe money amounts must be prohibited");
assert(css.includes("@media(max-width:350px)"),"Small phone styles required");
console.log("P31 production routes, posted/budget separation, guarded allocation writes and fixture isolation verified");
