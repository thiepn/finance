
import {StrictMode,useState} from "react";
import {createRoot} from "react-dom/client";
import {FinanceV2Shell} from "../ui/v2/FinanceV2Shell.js";
import {SignalInsightsView} from "./SignalInsights.js";
import {insightsScenario,syntheticAnalytics} from "./signal-insights.fixture.js";
import {parseInsightsFilters} from "./signal-insights-model.js";
import "../ui/v2/finance-app-shell.css";
import "../ui/styles/base.css";
import "./signal-insights-preview.css";

function Preview(){
 const [scenario,setScenario]=useState<"normal"|"empty"|"refund"|"long">("normal");
 const [route,setRoute]=useState("/explore");
 const explorer=insightsScenario(scenario);
 const navigate=(target:string)=>{setRoute(target);};
 return <FinanceV2Shell email="synthetic@example.invalid" title="Explore" routeId="explore" section="explore"
  onNavigate={navigate} onSignOut={async()=>setRoute("/sign-in")}>
 <div className="sc-insight-preview-banner"><strong>P32 SYNTHETIC LEDGER DATA — NOT YOUR FINANCES</strong>
  <label>Scenario <select aria-label="Scenario" value={scenario} onChange={e=>setScenario(e.currentTarget.value as typeof scenario)}>
   <option value="normal">normal</option><option value="empty">empty</option><option value="refund">refund</option><option value="long">long labels</option>
  </select></label><span data-testid="preview-route">Preview navigation: {route}</span></div>
 <SignalInsightsView key={scenario} explorer={explorer} analytics={scenario==="empty"?null:syntheticAnalytics}
  analyticsPending={scenario==="empty"} filters={parseInsightsFilters(new URL(route,"https://finance.invalid").search)}
  onNavigate={navigate}/>
 </FinanceV2Shell>;
}
const root=document.getElementById("p32-preview");
if(!root)throw Error("P32 preview mount missing");
createRoot(root).render(<StrictMode><Preview/></StrictMode>);
