import {StrictMode,useState} from "react";
import {createRoot} from "react-dom/client";
import {FinanceV2Shell} from "../ui/v2/FinanceV2Shell.js";
import {FinancialState} from "../ui/v2/SignalCurrent.js";
import {SignalPlanView} from "./SignalPlan.js";
import {planScenario} from "./signal-plan.fixture.js";
import type {PlanningWorkspace} from "./use-planning.js";
import "../ui/v2/finance-app-shell.css";
import "./signal-plan-preview.css";
function PlanPreview(){
 const [scenario,setScenario]=useState<"normal"|"empty"|"overspent"|"no-plan">("normal");
 const [route,setRoute]=useState("/plan");
 const dashboard=planScenario(scenario);
 const workspace:PlanningWorkspace={state:"ready",dashboard,error:null,actionError:null,busyKey:null,
  refresh:async()=>{},setupBudget:async()=>{},updatePlannedIncome:async()=>{},
  saveAllocation:async()=>{},deleteAllocation:async()=>{},saveGoal:async()=>{},
  addGoalMovement:async()=>{},setGoalStatus:async()=>{}};
 const navigate=(target:string)=>setRoute(target);
 return <FinanceV2Shell email="synthetic@example.invalid" title="Plan" routeId="plan" section="plan"
  onNavigate={navigate} onSignOut={async()=>setRoute("/sign-in")}>
  <div className="sc-plan-preview-banner"><strong>P31 SYNTHETIC DATA — NOT YOUR FINANCES</strong>
   <label>Scenario <select aria-label="Scenario" value={scenario} onChange={e=>setScenario(e.currentTarget.value as typeof scenario)}>
    <option value="normal">normal</option><option value="empty">no allocations</option>
    <option value="overspent">over budget</option><option value="no-plan">no budget</option>
   </select></label></div>
  {route.startsWith("/plan")? <SignalPlanView dashboard={dashboard} workspace={workspace}
    onNavigate={navigate} onPeriod={()=>{}}/>:
    <FinancialState kind="empty" title="Preview-only route" description="This QA fixture never impersonates a real account."
      primaryAction={{label:"Back to Plan",onClick:()=>setRoute("/plan")}}/>}
 </FinanceV2Shell>;
}
const mount=document.getElementById("p31-preview");
if(!mount)throw Error("P31 preview mount absent");
createRoot(mount).render(<StrictMode><PlanPreview/></StrictMode>);
