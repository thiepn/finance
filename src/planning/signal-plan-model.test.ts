import {actionableBudgetCount,budgetFraction,budgetOutcomeLabel,isEligibleGoalMovement,
 minorToPlanInput,orderedAllocations,planForecastPoints,planMoneyToMinor,validPlanAnchor,
 verifiedPlanMoney} from "./signal-plan-model.js";
import type {PlanningDashboard,PlanningAllocation} from "../domain/planning.js";
function assert(cond:unknown,msg:string):asserts cond{if(!cond)throw Error("P31: "+msg)}
assert(planMoneyToMinor("42,35")===4235,"German decimal exact");
assert(planMoneyToMinor("42.35")===4235,"dot decimal exact");
assert(planMoneyToMinor("42")===4200,"whole amount");
assert(planMoneyToMinor("0")===0,"zero allocation allowed");
assert(planMoneyToMinor("0",false)===null,"zero goal movement refused");
assert(planMoneyToMinor("1,234")===null,"cannot silently round three decimals");
assert(planMoneyToMinor("-15")===null,"negative planned income not allowed");
assert(planMoneyToMinor("NaN")===null,"invalid money refused");
assert(planMoneyToMinor("900719925474099")===null,"unsafe integer refused");
assert(minorToPlanInput(4235)==="42,35","minor to canonical decimal");
assert(minorToPlanInput(-125)==="-1,25","negative actual formatting");
assert(verifiedPlanMoney(NaN)===null,"NaN cannot masquerade as a real amount");
assert(verifiedPlanMoney(0)===0,"real zeros retained");
assert(budgetFraction(135,100)===100,"over budget clamps graphic not actual amount");
assert(budgetFraction(0,0)===null,"unconfigured bar unknown");
assert(budgetFraction(45,100)===45,"normal utilization");
assert(validPlanAnchor("2026-10-08"),"valid period dates");
assert(!validPlanAnchor("2026-02-30"),"no rollover dates");
assert(!validPlanAnchor("2026-10-08T00:00"),"anchor is date only");
const sample={categoryId:"c",categoryName:"C",allocationId:"i",categoryPath:[],plannedMinor:10000,
 rollover:false,carryInMinor:0,effectivePlannedMinor:10000,spentMinor:8000,remainingMinor:2000,
 utilizationRatio:.8,projectedSpendMinor:11000,futureRecurringMinor:0,status:"watch"} as PlanningAllocation;
const board={
 profile:{currencyCode:"EUR",locale:"de-DE",timeZone:"Europe/Berlin"},
 anchorDate:"2026-10-08",budget:{configured:true,status:"at_risk",effectivePlannedMinor:10000,plannedIncomeMinor:15000} as PlanningDashboard["budget"],
 allocations:[sample,{...sample,allocationId:"over",status:"over",categoryName:"Overspent"}],
 goals:[{goalId:"g",status:"active",fundedMinor:5000},{goalId:"paused",status:"paused",fundedMinor:5000}],
 forecast:[{bucketIndex:0,bucketStart:"2026-10-01T00:00:00Z",bucketEnd:"2026-10-08T00:00:00Z",
   actualCumulativeMinor:7000,plannedCumulativeMinor:8000,forecastCumulativeMinor:8500},
  {bucketIndex:1,bucketStart:"2026-10-08T00:00:00Z",bucketEnd:"2026-10-16T00:00:00Z",
   actualCumulativeMinor:null,plannedCumulativeMinor:12000,forecastCumulativeMinor:13700}]
} as unknown as PlanningDashboard;
assert(orderedAllocations(board.allocations)[0]?.allocationId==="over","overspends first");
assert(actionableBudgetCount(board)===1,"risk count correct");
assert(budgetOutcomeLabel("needs_allocations")==="Set allocations","status label");
assert(isEligibleGoalMovement("g",4999,"withdrawal",board),"valid funded withdrawal");
assert(!isEligibleGoalMovement("g",5001,"withdrawal",board),"overdraw guard");
assert(!isEligibleGoalMovement("paused",100,"contribution",board),"paused goals protected");
assert(!isEligibleGoalMovement("g",0,"contribution",board),"zero goal movement rejected");
const pts=planForecastPoints(board);
assert(pts.length===2,"backend buckets retained");
assert(pts[0]?.actualMinor===7000&&pts[1]?.actualMinor===null,"no fabricated future spend");
assert(pts[1]?.plannedMinor===12000,"plan drawn from backend, not an estimated posted value");
assert(planForecastPoints({...board,budget:{...board.budget,configured:false}}).every(p=>p.plannedMinor===null),"no budget no fake plan series");
console.log("P31 exact cent amounts, overbudget sorting, safe goal movement, date validity and honest future trend verified");
