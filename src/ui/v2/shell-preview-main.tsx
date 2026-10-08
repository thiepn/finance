import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { FinanceV2Shell } from "./FinanceV2Shell.js";
import { FinancePageHeader, MoneyMetric, FinanceTable, MoneyValue, BudgetAllocationRow, FinancialState } from "./SignalCurrent.js";
import { resolveFinanceLocation, type RouteLocation } from "../../app/finance-router.js";
import "./finance-app-shell.css";
import "./shell-preview.css";

/** P27 DEV-ONLY: unprivileged fixture checks the real navigation and scoped CSS.
 * Never binds to Supabase or uses actual finance records.
 */
function ShellPreview(){
 const [route,setRoute]=useState<RouteLocation>(resolveFinanceLocation("/"));
 const [message,setMessage]=useState("");
 const navigate=(path:string)=>{
  const next=resolveFinanceLocation(path);
  if(next.id!=="not-found")setRoute(next);
 };
 const transactions=[{id:"1",merchant:"REWE",amount:-4235,category:"Groceries"},{id:"2",merchant:"DB Regio",amount:-1280,category:"Transport"}];
 return <FinanceV2Shell section={route.section} title={route.title} routeId={route.id}
    onNavigate={navigate} onSignOut={async()=>setMessage("Synthetic sign-out only; no session exists.")}
    email="synthetic@example.invalid">
   {route.id==="home"?<><FinancePageHeader eyebrow="OCTOBER 2026" title="Home" action={<button type="button" className="sc-button sc-button--primary" onClick={()=>navigate("/activity/new")}>New transaction</button>}/>
    <div className="sc-preview-metrics"><MoneyMetric label="Available to spend" source="planned" amountMinor={124050} emphasis/>
      <MoneyMetric label="Cash position" source="posted" amountMinor={287030}/>
      <MoneyMetric label="Upcoming" source="forecast" amountMinor={74500} tone="warning"/>
      <MoneyMetric label="Spent" source="posted" amountMinor={86240}/></div><div className="sc-preview-spent"><span>Spent this month</span><MoneyValue amountMinor={86240}/><small>of €1,500 planned</small></div>
    <div className="sc-preview-content"><section className="sc-preview-panel"><h2>Needs attention</h2><p>2 uncategorized transactions</p><p>1 receipt ready for review</p></section>
    <section className="sc-preview-panel"><h2>Recent activity</h2>
      <FinanceTable caption="Synthetic transactions" rows={transactions} rowKey={r=>r.id}
        columns={[{id:"merchant",label:"Merchant",render:r=>r.merchant},{id:"category",label:"Category",render:r=>r.category},
          {id:"amount",label:"Amount",align:"end",render:r=><MoneyValue amountMinor={r.amount} tone="negative"/>}]}/></section></div></>:
    route.section==="plan"?<><FinancePageHeader title="Plan" eyebrow="OCTOBER 2026"/>
      <div className="sc-preview-plan"><BudgetAllocationRow label="Groceries" spentMinor={18475} plannedMinor={30000}/>
      <BudgetAllocationRow label="Housing" spentMinor={41000} plannedMinor={60000}/></div></>:
    route.section==="activity"?<><FinancePageHeader title="Activity" eyebrow="TRANSACTION LEDGER"/>
      <FinanceTable caption="Synthetic transactions" rows={transactions} rowKey={r=>r.id}
      columns={[{id:"merchant",label:"Merchant",render:r=>r.merchant},{id:"amount",label:"Amount",align:"end",render:r=><MoneyValue amountMinor={r.amount} tone="negative"/>}]}/></>:
    <><FinancePageHeader title={route.title}/><FinancialState kind="empty" title="Synthetic visual fixture" description="This is only a navigation preview. No private account has been loaded."/></>}
   {message?<p role="status">{message}</p>:null}
  </FinanceV2Shell>;
}
const mount=document.getElementById("p27-shell-preview-root");
if(!mount)throw Error("P27 shell preview mount missing");
createRoot(mount).render(<StrictMode><ShellPreview/></StrictMode>);
