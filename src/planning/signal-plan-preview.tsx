import {useState,StrictMode} from "react";
import {createRoot} from "react-dom/client";
import type {PlanningDashboard,PlanningAllocation,PlanningGoal} from "../domain/planning.js";
import type {PlanningWorkspace} from "./use-planning.js";
import {FinanceV2Shell} from "../ui/v2/FinanceV2Shell.js";
import {SignalPlanView} from "./SignalPlan.js";
import "../ui/v2/finance-app-shell.css";
import "./signal-plan-preview.css";
const allocation=(id:string,name:string,plan:number,used:number,status:PlanningAllocation["status"],carry=0):PlanningAllocation=>({
 allocationId:id,categoryId:id,categoryName:name,categoryPath:[name],plannedMinor:plan,rollover:carry!==0,carryInMinor:carry,
 effectivePlannedMinor:plan+carry,spentMinor:used,remainingMinor:plan+carry-used,utilizationRatio:(plan+carry)>0?used/(plan+carry):null,
 projectedSpendMinor:Math.round(used*1.6),futureRecurringMinor:id==="housing"?47000:0,status
});
const goals:PlanningGoal[]=[
 {goalId:"emergency",name:"Emergency reserve",kind:"savings",targetMinor:200000,currencyCode:"EUR",targetDate:"2027-06-01",linkedAccountId:null,linkedAccountName:null,
 plannedContributionMinor:15000,requiredMonthlyMinor:16000,periodTargetMinor:15000,periodContributedMinor:10000,periodRemainingMinor:5000,
 fundedMinor:112500,remainingMinor:87500,progressRatio:.5625,status:"active",health:"on_track",note:null},
 {goalId:"laptop",name:"New laptop",kind:"sinking_fund",targetMinor:120000,currencyCode:"EUR",targetDate:"2027-01-01",linkedAccountId:null,linkedAccountName:null,
 plannedContributionMinor:10000,requiredMonthlyMinor:20000,periodTargetMinor:10000,periodContributedMinor:10000,periodRemainingMinor:0,
 fundedMinor:62000,remainingMinor:58000,progressRatio:.5167,status:"active",health:"needs_more",note:null}
];
const allocations=[
 allocation("housing","Housing",52000,47000,"on_track"),
 allocation("groceries","Groceries",21000,22350,"over"),
 allocation("transport","Transport",11000,9100,"at_risk"),
 allocation("dining","Dining",9000,3900,"on_track"),
 allocation("subscriptions","Subscriptions",4800,4400,"watch"),
 allocation("shopping","Shopping",9500,3150,"on_track",2500),
 allocation("health","Healthcare",6500,1500,"on_track")
];
const dashboard:PlanningDashboard={
 profile:{currencyCode:"EUR",locale:"de-DE",timeZone:"Europe/Berlin"},anchorDate:"2026-10-08",
 budget:{configured:true,budgetId:"plan1",budgetName:"Monthly plan",periodKind:"monthly",periodId:"period1",
  startsOn:"2026-10-01",endsOn:"2026-10-31",plannedIncomeMinor:165000,actualIncomeMinor:165000,
  basePlannedMinor:113800,carryInMinor:2500,effectivePlannedMinor:116300,actualSpendMinor:91300,
  allocatedSpendMinor:91300,unallocatedSpendMinor:0,remainingMinor:25000,
  elapsedRatio:.258,paceRatio:.785,projectedSpendMinor:142300,futureRecurringExpenseMinor:17400,
  futureRecurringIncomeMinor:0,goalPeriodTargetMinor:25000,goalPeriodContributedMinor:20000,
  goalFundingRemainingMinor:5000,safeToSpendMinor:15000,unallocatedPlanMinor:48700,
  projectedSurplusMinor:22700,status:"at_risk"},
 allocations,goals,
 forecast:Array.from({length:12},(_,i)=>({bucketIndex:i,bucketStart:new Date(Date.UTC(2026,9,1+i*2)).toISOString(),
  bucketEnd:new Date(Date.UTC(2026,9,3+i*2)).toISOString(),
  actualCumulativeMinor:i<4?(i+1)*20500:null,plannedCumulativeMinor:(i+1)*9700,forecastCumulativeMinor:(i+1)*11800})),
 commitments:[
  {patternId:"phone",transactionType:"expense",categoryId:null,currencyCode:"EUR",amountMinor:2499,expectedAt:"2026-10-15T11:00:00Z"},
  {patternId:"gym",transactionType:"expense",categoryId:null,currencyCode:"EUR",amountMinor:2999,expectedAt:"2026-10-18T11:00:00Z"},
  {patternId:"electric",transactionType:"expense",categoryId:null,currencyCode:"EUR",amountMinor:4500,expectedAt:"2026-10-22T11:00:00Z"},
  {patternId:"transport",transactionType:"expense",categoryId:null,currencyCode:"EUR",amountMinor:2900,expectedAt:"2026-10-28T11:00:00Z"}
 ],
 availableCategories:[...allocations.map(a=>({categoryId:a.categoryId,parentId:null,name:a.categoryName,depth:0,path:[a.categoryName]})),
  {categoryId:"books",parentId:null,name:"Books",depth:0,path:["Books"]}],
 availableAccounts:[]
};
function Preview(){
 const [mode,setMode]=useState<"budget"|"goals">("budget"),[scenario,setScenario]=useState("normal"),[anchor,setAnchor]=useState("");
 const data:PlanningDashboard=scenario==="no-budget"?{...dashboard,budget:{...dashboard.budget,configured:false,
   budgetId:null,periodId:null,startsOn:null,endsOn:null,safeToSpendMinor:null,
   status:"unconfigured",plannedIncomeMinor:null},allocations:[],forecast:[],commitments:[]}:
 scenario==="over"?{...dashboard,budget:{...dashboard.budget,status:"over",remainingMinor:-15000,safeToSpendMinor:-15000,actualSpendMinor:135000}}:dashboard;
 const noop=async()=>{};
 const workspace:PlanningWorkspace={state:"ready",dashboard:data,error:null,actionError:null,busyKey:null,refresh:noop,
  setupBudget:noop,updatePlannedIncome:noop,saveAllocation:noop,deleteAllocation:noop,
  saveGoal:noop,addGoalMovement:noop,setGoalStatus:noop};
 const navigate=(path:string)=>{if(path.startsWith("/plan/goals"))setMode("goals");else if(path.startsWith("/plan"))setMode("budget");};
 return <FinanceV2Shell title="Plan" routeId={mode==="goals"?"goals":"plan"} section="plan"
   email="synthetic@example.invalid" onNavigate={navigate} onSignOut={noop}>
  <div className="sc-plan-preview-toolbar"><strong>TEST DATA — NO REAL ACCOUNT</strong>
    <label>Scenario <select aria-label="Scenario" value={scenario} onChange={e=>setScenario(e.target.value)}>
      <option value="normal">normal</option><option value="no-budget">no budget</option><option value="over">overspent</option></select></label>
    <label>View <select aria-label="View" value={mode} onChange={e=>setMode(e.target.value as typeof mode)}>
      <option value="budget">budget</option><option value="goals">goals</option></select></label></div>
  <SignalPlanView dashboard={data} workspace={workspace} mode={mode} onNavigate={navigate} anchor={anchor} onAnchor={setAnchor}/>
 </FinanceV2Shell>;
}
const mount=document.querySelector("#p31-preview");if(!mount)throw Error("P31 QA root absent");
createRoot(mount).render(<StrictMode><Preview/></StrictMode>);
