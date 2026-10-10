import {StrictMode,useState} from "react";import {createRoot} from "react-dom/client";
import {FinanceV2Shell} from "../ui/v2/FinanceV2Shell.js";import {SignalRecurringView} from "./SignalRecurring.js";
import {recurringScenario,type RecurringFixtureScenario} from "./signal-recurring.fixture.js";
import type {RecurringWorkspace} from "./use-recurring.js";
import "../ui/styles/base.css";import "../ui/v2/finance-app-shell.css";import "./signal-recurring-preview.css";
function Preview(){
 const [scenario,setScenario]=useState<RecurringFixtureScenario>("normal");const [route,setRoute]=useState("/plan/recurring");
 const [actions,setActions]=useState(0);const [message,setMessage]=useState("");
 const {dashboard,detection}=recurringScenario(scenario);
 const workspace:RecurringWorkspace={state:"ready",dashboard,detection,error:null,actionError:null,busyKey:null,
 refresh:async()=>{setMessage("Read-only reload (synthetic)");},confirmCandidate:async()=>{setActions(n=>n+1);setMessage("Candidate linked (synthetic)");},
 setPatternStatus:async()=>{setActions(n=>n+1);setMessage("Status updated (synthetic)");},
 syncPatterns:async()=>{setActions(n=>n+1);setMessage("Pattern reconciliation ran (synthetic)");}};
 return <FinanceV2Shell email="synthetic@example.invalid" title="Recurring" routeId="recurring" section="plan" onNavigate={setRoute} onSignOut={async()=>{}}>
 <div className="sc-p34-preview-banner"><strong>P34 SYNTHETIC DATA — NOT A REAL FINANCE SESSION</strong>
 <label>Scenario<select aria-label="Scenario" value={scenario} onChange={e=>setScenario(e.currentTarget.value as RecurringFixtureScenario)}>
 {(["normal","empty","late","long"] as const).map(v=><option key={v} value={v}>{v}</option>)}</select></label>
 <span data-testid="navigation">{route}</span><span data-testid="write-count">Writes: {actions}</span><span role="status">{message}</span></div>
 <SignalRecurringView key={scenario} dashboard={dashboard} detection={detection} workspace={workspace} onNavigate={setRoute}/>
 </FinanceV2Shell>;
}
const mount=document.getElementById("p34-preview");if(!mount)throw Error("P34 preview missing");
createRoot(mount).render(<StrictMode><Preview/></StrictMode>);
