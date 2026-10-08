import type {PlanningDashboard} from "../domain/planning.js";
export const syntheticPlan:PlanningDashboard={
 profile:{currencyCode:"EUR",locale:"de-DE",timeZone:"Europe/Berlin"},anchorDate:"2026-10-18",
 budget:{configured:true,budgetId:"p30-synthetic",budgetName:"October plan",periodKind:"monthly",periodId:"p31-synthetic-period",
 startsOn:"2026-10-01",endsOn:"2026-10-31",plannedIncomeMinor:180000,actualIncomeMinor:174000,
 basePlannedMinor:160000,carryInMinor:3000,effectivePlannedMinor:163000,actualSpendMinor:86240,
 allocatedSpendMinor:83240,unallocatedSpendMinor:3000,remainingMinor:76760,
 elapsedRatio:.58,paceRatio:.529,projectedSpendMinor:148500,futureRecurringExpenseMinor:23800,
 futureRecurringIncomeMinor:0,goalPeriodTargetMinor:15000,goalPeriodContributedMinor:9000,
 goalFundingRemainingMinor:6000,safeToSpendMinor:52960,unallocatedPlanMinor:17000,projectedSurplusMinor:31500,status:"on_track"},
 allocations:[
 {allocationId:"rent",categoryId:"rent",categoryName:"Housing",categoryPath:["Essentials","Housing"],plannedMinor:60000,rollover:false,carryInMinor:0,
  effectivePlannedMinor:60000,spentMinor:60000,remainingMinor:0,utilizationRatio:1,projectedSpendMinor:60000,futureRecurringMinor:0,status:"on_track"},
 {allocationId:"food",categoryId:"food",categoryName:"Groceries",categoryPath:["Food","Groceries"],plannedMinor:25000,rollover:true,carryInMinor:3000,
  effectivePlannedMinor:28000,spentMinor:19475,remainingMinor:8525,utilizationRatio:.695,projectedSpendMinor:30800,futureRecurringMinor:0,status:"at_risk"},
 {allocationId:"transport",categoryId:"transport",categoryName:"Transport",categoryPath:["Daily","Transport"],plannedMinor:10000,rollover:false,carryInMinor:0,
  effectivePlannedMinor:10000,spentMinor:12400,remainingMinor:-2400,utilizationRatio:1.24,projectedSpendMinor:13800,futureRecurringMinor:0,status:"over"},
 {allocationId:"dining",categoryId:"dining",categoryName:"Dining out",categoryPath:["Leisure","Dining out"],plannedMinor:16000,rollover:false,carryInMinor:0,
  effectivePlannedMinor:16000,spentMinor:8380,remainingMinor:7620,utilizationRatio:.52,projectedSpendMinor:13700,futureRecurringMinor:0,status:"on_track"},
 {allocationId:"shopping",categoryId:"shopping",categoryName:"Shopping",categoryPath:["Personal","Shopping"],plannedMinor:18000,rollover:false,carryInMinor:0,
  effectivePlannedMinor:18000,spentMinor:4800,remainingMinor:13200,utilizationRatio:.26,projectedSpendMinor:14000,futureRecurringMinor:0,status:"on_track"}],
 goals:[],forecast:[
  {bucketIndex:0,bucketStart:"2026-10-01T00:00:00Z",bucketEnd:"2026-10-08T00:00:00Z",actualCumulativeMinor:32500,forecastCumulativeMinor:31000,plannedCumulativeMinor:36500},
  {bucketIndex:1,bucketStart:"2026-10-08T00:00:00Z",bucketEnd:"2026-10-15T00:00:00Z",actualCumulativeMinor:62000,forecastCumulativeMinor:67500,plannedCumulativeMinor:73000},
  {bucketIndex:2,bucketStart:"2026-10-15T00:00:00Z",bucketEnd:"2026-10-22T00:00:00Z",actualCumulativeMinor:86240,forecastCumulativeMinor:100000,plannedCumulativeMinor:109000},
  {bucketIndex:3,bucketStart:"2026-10-22T00:00:00Z",bucketEnd:"2026-10-31T00:00:00Z",actualCumulativeMinor:null,forecastCumulativeMinor:148500,plannedCumulativeMinor:163000}],
 commitments:[{patternId:"mobile",transactionType:"expense",categoryId:null,currencyCode:"EUR",amountMinor:2500,expectedAt:"2026-10-21T00:00:00Z"},
  {patternId:"rent",transactionType:"expense",categoryId:"rent",currencyCode:"EUR",amountMinor:60000,expectedAt:"2026-11-01T00:00:00Z"}],
 availableCategories:[
 {categoryId:"rent",parentId:null,name:"Housing",depth:0,path:["Essentials","Housing"]},
 {categoryId:"food",parentId:null,name:"Groceries",depth:0,path:["Food","Groceries"]},
 {categoryId:"transport",parentId:null,name:"Transport",depth:0,path:["Daily","Transport"]},
 {categoryId:"dining",parentId:null,name:"Dining",depth:0,path:["Leisure","Dining"]},
 {categoryId:"shopping",parentId:null,name:"Shopping",depth:0,path:["Personal","Shopping"]},
 {categoryId:"health",parentId:null,name:"Healthcare",depth:0,path:["Health","Healthcare"]}],
 availableAccounts:[]};
export function planScenario(state:"normal"|"empty"|"overspent"|"no-plan"):PlanningDashboard{
 const d=structuredClone(syntheticPlan);
 if(state==="overspent"){d.budget.status="over";d.budget.actualSpendMinor=180000;d.budget.remainingMinor=-17000;d.budget.safeToSpendMinor=-40800;
  d.allocations[0]!.spentMinor=64000;d.allocations[0]!.remainingMinor=-4000;d.allocations[0]!.status="over";}
 if(state==="empty"){d.allocations=[];d.budget.status="needs_allocations";d.budget.basePlannedMinor=0;d.budget.effectivePlannedMinor=0;d.budget.safeToSpendMinor=null;d.budget.remainingMinor=null;d.forecast=[];}
 if(state==="no-plan"){d.budget.configured=false;d.budget.status="unconfigured";d.budget.periodId=null;d.allocations=[];d.forecast=[];}
 return d;
}
