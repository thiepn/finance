import {StrictMode,useState} from "react";import {createRoot} from "react-dom/client";
import {FinanceV2Shell} from "../ui/v2/FinanceV2Shell.js";import {SignalWealthView} from "./SignalWealth.js";
import type {WealthWorkspace} from "./use-wealth.js";import type {WealthRangeMonths} from "../domain/wealth.js";
import {fixture,history,type Scenario} from "./signal-wealth.fixture.js";
import "../ui/styles/base.css";import "../ui/v2/finance-app-shell.css";import "./signal-wealth-preview.css";
function Preview(){
 const [screen,setScreen]=useState<"accounts"|"net-worth"|"detail">("accounts"),[scenario,setScenario]=useState<Scenario>("normal"),
 [route,setRoute]=useState("/wealth/accounts"),[writes,setWrites]=useState(0),[range,setRange]=useState<WealthRangeMonths>(12);
 const d=fixture(scenario),id="00000000-0000-4000-8000-000000000011";
 const navigate=(p:string)=>{setRoute(p);if(p.startsWith("/wealth/accounts/"))setScreen("detail");else if(p==="/wealth/accounts")setScreen("accounts");else if(p==="/wealth/net-worth")setScreen("net-worth");};
 const mutate=async()=>{setWrites(v=>v+1)};
 const workspace:WealthWorkspace={state:"ready",dashboard:d,error:null,actionError:null,busyKey:null,accountHistory:history,historyLoadingId:null,
 refresh:async()=>{},createAccount:mutate,archiveAccount:mutate,restoreAccount:mutate,recordObservation:mutate,setInclusion:mutate,
 loadAccountHistory:async()=>{},clearAccountHistory:()=>{}};
 return <FinanceV2Shell routeId={screen==="detail"?"account-detail":screen} title={screen} section="wealth" email="synthetic@example.invalid" onNavigate={navigate} onSignOut={async()=>{}}>
 <div className="sc-p35-banner"><strong>P35 SYNTHETIC FINANCIAL DATA — NOT AN ACCOUNT</strong>
 <label>Screen<select aria-label="Preview screen" value={screen} onChange={e=>setScreen(e.currentTarget.value as typeof screen)}><option value="accounts">Accounts</option><option value="net-worth">Net worth</option><option value="detail">Account detail</option></select></label>
 <label>Scenario<select aria-label="Scenario" value={scenario} onChange={e=>setScenario(e.currentTarget.value as Scenario)}>{(["normal","empty","foreign","long"] as const).map(v=><option key={v} value={v}>{v}</option>)}</select></label>
 <span data-testid="navigation">{route}</span><span data-testid="write-count">Writes: {writes}</span></div>
 <SignalWealthView key={screen+"-"+scenario} dashboard={d} workspace={workspace} mode={screen} selectedAccountId={screen==="detail"?id:null} range={range} onRange={setRange} onNavigate={navigate}/>
 </FinanceV2Shell>;
}
const mount=document.getElementById("p35-preview");if(!mount)throw Error("P35 fixture missing");
createRoot(mount).render(<StrictMode><Preview/></StrictMode>);
