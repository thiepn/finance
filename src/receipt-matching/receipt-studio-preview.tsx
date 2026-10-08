import {StrictMode,useState} from "react";
import {createRoot} from "react-dom/client";
import {FinanceV2Shell} from "../ui/v2/FinanceV2Shell.js";
import type {ReceiptMatchDashboard,ReceiptMatchStatus} from "../domain/receipt-matching.js";
import {ReceiptInboxView} from "./ReceiptStudioInbox.js";
import {FinancialState} from "../ui/v2/SignalCurrent.js";
import type {ReceiptQueueFilter} from "./receipt-studio-model.js";
import "../ui/v2/finance-app-shell.css";
import "./receipt-studio-preview.css";
const records:[string,ReceiptMatchStatus,number|null][]=[
 ["REWE","suggested_match",4235],["DB Regio","unmatched",1280],
 ["dm","partially_matched",1845],["ALDI Süd","matched",4679],
 ["Apotheke","unmatched",null],["Bäckerei","multi_payment_matched",840],
 ["Online Store","suggested_match",7980],["Restaurant","unmatched",2720]
];
const summary={unmatchedCount:3,suggestedCount:2,partialCount:1,matchedCount:2};
const dashboard:ReceiptMatchDashboard={summary,receipts:records.map(([name,matchStatus,totalMinor],i)=>({
 receiptId:"synthetic-"+i,merchantId:null,merchantName:name,purchasedAt:"2026-10-"+String(22-i).padStart(2,"0")+"T11:00:00Z",
 currencyCode:"EUR",totalMinor,matchStatus,coveredMinor:matchStatus==="matched"?totalMinor??0:0,
 remainingMinor:totalMinor,suggestedCount:matchStatus==="suggested_match"?2:0,confirmedCount:matchStatus==="matched"?1:0,
 topConfidence:matchStatus==="suggested_match"?.89:null,topTransactionId:null,topTransactionAt:null,
 topTransactionDescription:null,topTransactionAmountMinor:null,updatedAt:"2026-10-22T12:00:00Z"
 }))};
function Preview(){
 const [filter,setFilter]=useState<ReceiptQueueFilter>("attention");
 const [route,setRoute]=useState("/receipts");
 const [scenario,setScenario]=useState("normal");
 const navigate=(path:string)=>setRoute(path);
 return <FinanceV2Shell email="synthetic@example.invalid" title={route==="/receipts"?"Receipts":"Receipt"}
  section="receipts" routeId={route==="/receipts"?"receipts":"receipt-detail"}
  onNavigate={navigate} onSignOut={async()=>setRoute("/sign-in")}>
   <div className="sc-rstudio-test"><strong>SYNTHETIC QA — NO FINANCIAL ACCOUNT</strong>
    <label>Scenario <select aria-label="Scenario" value={scenario} onChange={e=>setScenario(e.target.value)}>
      <option value="normal">normal</option><option value="empty">empty</option></select></label></div>
   {route==="/receipts"?<ReceiptInboxView dashboard={scenario==="empty"?{summary:{unmatchedCount:0,suggestedCount:0,partialCount:0,matchedCount:0},receipts:[]}:dashboard}
    filter={filter} setFilter={setFilter} onOpen={id=>navigate("/receipts/"+encodeURIComponent(id))}
    onCapture={()=>navigate("/receipts/capture")} onRefresh={()=>{}}/>:
    <FinancialState kind="empty" title="Private workflow in live account" description="The real receipt detail uses authenticated Supabase and short-lived signed evidence URLs; this QA fixture never impersonates a user."
      primaryAction={{label:"Back to inbox",onClick:()=>navigate("/receipts")}}/>}
  </FinanceV2Shell>;
}
const mount=document.getElementById("p30-preview");
if(!mount)throw Error("P30 visual QA mount absent");
createRoot(mount).render(<StrictMode><Preview/></StrictMode>);
