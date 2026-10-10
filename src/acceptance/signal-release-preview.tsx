import {StrictMode,useState} from "react";import{createRoot}from"react-dom/client";
import {FinanceV2Shell}from"../ui/v2/FinanceV2Shell.js";
import {SignalReleaseView}from"./SignalReleaseReview.js";
import{acceptanceFixture,type AcceptanceScenario}from"./finance-acceptance.fixture.js";
import type{AcceptanceWorkspace}from"./use-finance-acceptance.js";
import "../ui/styles/base.css";import "../ui/v2/finance-app-shell.css";import "./signal-release-preview.css";
function Preview(){
 const [scenario,setScenario]=useState<AcceptanceScenario>("healthy");
 const [sampled,setSampled]=useState(false);
 const [navigated,setNavigated]=useState("/settings/release");
 const [mutationCount]=useState(0);
 const [checks,setChecks]=useState(0);
 const snapshot=sampled?acceptanceFixture(scenario):acceptanceFixture("unsampled");
 const workspace:AcceptanceWorkspace={state:sampled?"ready":"idle",snapshot,error:null,lastCheckedAt:sampled?"2026-10-10T15:00:00Z":null,
 run:async()=>{setSampled(true);setChecks(n=>n+1)},
 clear:()=>{setSampled(false);setChecks(0)}};
 return <FinanceV2Shell email="synthetic@example.invalid" title="Release review" routeId="release-review" section="settings"
 onNavigate={setNavigated} onSignOut={async()=>{}}>
 <div className="sc-p37-fixture"><strong>TEST ONLY · SYNTHETIC FINANCIAL SOURCES / NOT A RELEASE APPROVAL</strong>
 <label>Scenario<select aria-label="Scenario" value={scenario} onChange={e=>{setScenario(e.currentTarget.value as AcceptanceScenario);setSampled(false)}}>
 {(["healthy","mismatch","partial","long","unsampled"] as const).map(s=><option value={s} key={s}>{s}</option>)}</select></label>
 <span data-testid="navigation">{navigated}</span><span data-testid="write-count">Writes: {mutationCount}</span>
 <span data-testid="read-count">Reads: {checks}</span></div>
 <SignalReleaseView key={scenario} workspace={workspace} onNavigate={setNavigated}/>
 </FinanceV2Shell>;
}
const root=document.getElementById("p37-preview");if(!root)throw Error("P37 fixture missing");createRoot(root).render(<StrictMode><Preview/></StrictMode>);
