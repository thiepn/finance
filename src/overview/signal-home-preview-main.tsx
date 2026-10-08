import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { FinanceV2Shell } from "../ui/v2/FinanceV2Shell.js";
import { SignalHomeView } from "./SignalHome.js";
import { fixtureScenario, fixtureTrend, fixtureUpcoming } from "./signal-home.fixture.js";
import type { OverviewPeriodKind } from "../domain/overview.js";
import { fromLegacyKey, resolveFinanceLocation } from "../app/finance-router.js";
import { FinancialState } from "../ui/v2/SignalCurrent.js";
import "../ui/v2/finance-app-shell.css";
function HomePreview(){
 const [scenario,setScenario]=useState<"normal"|"no-plan"|"no-accounts"|"empty"|"overrun"|"source-error">("normal");
 const [period,setPeriod]=useState<OverviewPeriodKind>("month");
 const [path,setPath]=useState("/");
 const route=resolveFinanceLocation(path);
 const navigate=(key:string)=>{const target=key.startsWith("/")?key:key==="activity-new"?"/activity/new":fromLegacyKey(key);setPath(target);};
 return <FinanceV2Shell title={route.title} routeId={route.id} section={route.section}
    email="synthetic@example.invalid" onNavigate={navigate} onSignOut={async()=>{setPath("/sign-in");}}>
    <div className="sc-home-preview-toolbar" role="group" aria-label="Synthetic test controls">
      <span>DESIGN QA ONLY</span><label>Scenario <select aria-label="Scenario" value={scenario} onChange={e=>setScenario(e.currentTarget.value as typeof scenario)}>
       {["normal","no-plan","no-accounts","empty","overrun","source-error"].map(s=><option key={s} value={s}>{s}</option>)}</select></label>
      <small>Illustrative values. Not a Finance session.</small>
    </div>
    {route.id==="home"?
      <SignalHomeView dashboard={fixtureScenario(scenario)}
        periodKind={period} onPeriodChange={setPeriod}
        onNavigate={navigate} onRefresh={()=>{}} upcoming={scenario==="source-error"?{status:"error",value:null}:{status:"ready",value:fixtureUpcoming}}
        trend={scenario==="source-error"?{status:"error",value:null}:{status:"ready",value:fixtureTrend}}/>:
      <FinancialState kind="empty" title={route.title} description="The design QA fixture checks real navigation but does not connect any backend." primaryAction={{label:"Home",onClick:()=>setPath("/")}}/>}
 </FinanceV2Shell>;
}
const mount=document.getElementById("p28-home-preview-root");
if(!mount)throw Error("P28 visual QA root missing");
createRoot(mount).render(<StrictMode><HomePreview/></StrictMode>);
