import {StrictMode,useState} from "react";import {createRoot} from "react-dom/client";
import {FinanceV2Shell} from "../ui/v2/FinanceV2Shell.js";import {SignalImportView} from "./SignalImport.js";
import {dashboard,fixture,type Scenario} from "./signal-import.fixture.js";import type {ImportWorkspace} from "./use-imports.js";
import "../ui/styles/base.css";import "../ui/v2/finance-app-shell.css";import "./signal-import-preview.css";
function Preview(){
 const [scenario,setScenario]=useState<Scenario>("normal"),[showPreview,setShowPreview]=useState(true),[writes,setWrites]=useState(0),[route,setRoute]=useState("/import");
 const [note,setNote]=useState("");const preview=showPreview?fixture(scenario):null;
 const write=async()=>{setWrites(x=>x+1);setNote("Synthetic mutation only — no real Finance ledger");};
 const workspace:ImportWorkspace={state:"ready",dashboard,preview,commitResult:null,error:null,actionError:null,busyKey:null,
 refresh:async()=>{setNote("Synthetic read-only refresh");},openImport:async()=>{setShowPreview(true)},
 importFile:write,updateRecord:write,commit:write,cancel:write,saveCsvProfile:write,clearPreview:()=>setShowPreview(false)};
 return <FinanceV2Shell email="synthetic@example.invalid" title="Import" routeId="imports" section="activity" onNavigate={setRoute} onSignOut={async()=>{}}>
 <div className="sc-p36-banner"><strong>P36 SYNTHETIC STATEMENT — NO PRIVATE BANK DATA</strong>
 <label>Scenario<select aria-label="Scenario" value={scenario} onChange={e=>setScenario(e.currentTarget.value as Scenario)}>
 {(["normal","empty","duplicate","transfer","missing","long"] as const).map(v=><option value={v} key={v}>{v}</option>)}</select></label>
 <label>Surface<select aria-label="Surface" value={showPreview?"review":"intake"} onChange={e=>setShowPreview(e.currentTarget.value==="review")}>
 <option value="review">Server preview</option><option value="intake">File intake</option></select></label>
 <span data-testid="navigation">{route}</span><span data-testid="write-count">Writes: {writes}</span><span role="status">{note}</span></div>
 <SignalImportView key={scenario+"-"+showPreview} workspace={workspace} onNavigate={setRoute}/>
 </FinanceV2Shell>;
}
const mount=document.getElementById("p36-preview");if(!mount)throw Error("Synthetic import fixture mount missing");
createRoot(mount).render(<StrictMode><Preview/></StrictMode>);
