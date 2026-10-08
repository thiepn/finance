import type {PlanningDashboard} from "../domain/planning.js";
import {canCommitPlanAllocation,parsePlanMoney,planMoneyInput,planPercent,planPeriodLabel,planTrend,
 safePlanValue,shiftPlanPeriod,sortedAllocations,verifiedAnchor} from "./signal-plan-model.js";
function assert(x:unknown,m:string):asserts x{if(!x)throw Error("P31: "+m)}
const base:PlanningDashboard={
 profile:{currencyCode:"EUR",locale:"de-DE",timeZone:"Europe/Berlin"},anchorDate:"2026-10-18",
 budget:{configured:true,budgetId:"b1",budgetName:"Monthly budget",periodKind:"monthly",periodId:"p1",startsOn:"2026-10-01",endsOn:"2026-10-31",
 plannedIncomeMinor:180000,actualIncomeMinor:175000,basePlannedMinor:140000,carryInMinor:3000,
 effectivePlannedMinor:143000,actualSpendMinor:83240,allocatedSpendMinor:80240,unallocatedSpendMinor:3000,
 remainingMinor:59760,elapsedRatio:.58,paceRatio:.582,projectedSpendMinor:145200,
 futureRecurringExpenseMinor:12000,futureRecurringIncomeMinor:0,goalPeriodTargetMinor:15000,
 goalPeriodContributedMinor:9000,goalFundingRemainingMinor:6000,safeToSpendMinor:47760,unallocatedPlanMinor:40000,
 projectedSurplusMinor:34800,status:"on_track"},
 allocations:[
 {allocationId:"food",categoryId:"food",categoryName:"Groceries",categoryPath:["Living","Groceries"],plannedMinor:30000,rollover:true,carryInMinor:1000,effectivePlannedMinor:31000,spentMinor:20400,remainingMinor:10600,utilizationRatio:.658,projectedSpendMinor:29000,futureRecurringMinor:0,status:"watch"},
 {allocationId:"rent",categoryId:"rent",categoryName:"Housing",categoryPath:["Housing"],plannedMinor:60000,rollover:false,carryInMinor:0,effectivePlannedMinor:60000,spentMinor:60500,remainingMinor:-500,utilizationRatio:1.008,projectedSpendMinor:60500,futureRecurringMinor:0,status:"over"},
 ],
 goals:[],forecast:[
 {bucketIndex:0,bucketStart:"2026-10-01T00:00:00Z",bucketEnd:"2026-10-15T00:00:00Z",actualCumulativeMinor:43200,forecastCumulativeMinor:67000,plannedCumulativeMinor:65000},
 {bucketIndex:1,bucketStart:"2026-10-16T00:00:00Z",bucketEnd:"2026-11-01T00:00:00Z",actualCumulativeMinor:null,forecastCumulativeMinor:145200,plannedCumulativeMinor:143000}
 ],
 commitments:[],availableCategories:[{categoryId:"food",parentId:null,name:"Groceries",depth:0,path:["Groceries"]},{categoryId:"rent",parentId:null,name:"Housing",depth:0,path:["Housing"]}],
 availableAccounts:[]
};
assert(parsePlanMoney("1.234")===null,"three decimals never rounded");
assert(parsePlanMoney("12,34")===1234&&parsePlanMoney("12.34")===1234,"decimal separator exact");
assert(parsePlanMoney("0")===0,"zero allocation is valid");
assert(parsePlanMoney("-1")===null&&parsePlanMoney("1e3")===null,"negative and exponents prohibited");
assert(parsePlanMoney(String(Number.MAX_SAFE_INTEGER))===null,"unsafe money prohibited");
assert(planMoneyInput(1234)==="12.34"&&planMoneyInput(null)==="","edit roundtrip");
assert(safePlanValue(null)===null&&safePlanValue(0)===0,"unknown amounts not zero");
assert(planPercent(100,0)===0&&planPercent(150,100)===100,"progress clamp");
assert(sortedAllocations(base.allocations)[0]?.status==="over","budget risks ordered first");
assert(verifiedAnchor("2026-02-30")===null&&verifiedAnchor("2026-10-08")==="2026-10-08","calendar rollover rejection");
assert(shiftPlanPeriod("2026-01-31","monthly",1)==="2026-02-28","month-end correctly clamped");
assert(shiftPlanPeriod("2026-10-08","weekly",1)==="2026-10-15","weekly step");
assert(shiftPlanPeriod("2026-10-08","quarterly",1)==="2027-01-08","quarterly step");
assert(shiftPlanPeriod("2026-10-08","yearly",-1)==="2025-10-08","yearly step");
assert(shiftPlanPeriod("2026-10-08","custom",1)===null,"custom period never guessed");
assert(planPeriodLabel(base).includes("2026"),"period dates visible");
assert(planTrend(base).length===2&&planTrend(base)[1]?.actualMinor===null,"future actual spending never invented");
assert(canCommitPlanAllocation(base,15000,"food"),"valid category + period");
assert(!canCommitPlanAllocation({...base,budget:{...base.budget,periodId:null}},15000,"food"),"missing period cannot write");
assert(!canCommitPlanAllocation(base,15000,"invalid"),"unknown category rejected");
assert(!canCommitPlanAllocation(base,1.5,"food"),"fractional minor values rejected");
assert(planTrend({...base,budget:{...base.budget,configured:false}}).length===0,"unconfigured plan has no trend");
console.log("P31 exact currency, category writes, unknown values, period navigation and forecast null tests passed");
