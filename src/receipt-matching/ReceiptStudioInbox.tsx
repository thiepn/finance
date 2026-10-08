import {useEffect,useState} from "react";
import {createFinanceBrowserRuntime} from "../integrations/supabase-client.js";
import {FinancialState,FinanceButton,MoneyValue,DataProvenance} from "../ui/v2/SignalCurrent.js";
import type {ReceiptMatchDashboard} from "../domain/receipt-matching.js";
import {receiptFilterOptions,inReceiptQueue,receiptStatusLabel,receiptErrorCopy,type ReceiptQueueFilter} from "./receipt-studio-model.js";
import "./receipt-studio.css";

const formatDate=(value:string|null):string=>{
 if(!value)return"Date not extracted";
 const date=new Date(value);
 return Number.isFinite(date.getTime())?new Intl.DateTimeFormat("de-DE",{dateStyle:"medium"}).format(date):"Date not extracted";
};
export interface ReceiptInboxViewProps {
 dashboard:ReceiptMatchDashboard;
 filter:ReceiptQueueFilter;
 setFilter:(next:ReceiptQueueFilter)=>void;
 onOpen:(receiptId:string)=>void;
 onCapture:()=>void;
 refreshing?:boolean;
 onRefresh:()=>void;
}
export function ReceiptInboxView({dashboard,filter,setFilter,onOpen,onCapture,refreshing=false,onRefresh}:ReceiptInboxViewProps){
 const filtered=dashboard.receipts.filter(r=>inReceiptQueue(r.matchStatus,filter));
 return <div className="sc-receipt-studio" data-testid="finance-receipt-inbox">
   <header className="sc-receipt-studio__heading"><div><span className="sc-eyebrow">PRIVATE RECEIPT ARCHIVE</span><h1>Receipts</h1>
     <p>Review evidence, identify transactions, and reconcile without creating a second expense.</p></div>
     <FinanceButton onClick={onCapture}>Scan or upload</FinanceButton></header>
   <section className="sc-receipt-studio__summary" aria-label="Receipt status counts">
     <div><strong>{dashboard.summary.unmatchedCount}</strong><span>Unmatched</span></div>
     <div><strong>{dashboard.summary.suggestedCount}</strong><span>Suggested</span></div>
     <div><strong>{dashboard.summary.partialCount}</strong><span>Partial</span></div>
     <div><strong>{dashboard.summary.matchedCount}</strong><span>Matched</span></div></section>
   <div className="sc-receipt-studio__toolbar"><div className="sc-receipt-studio__filters" role="group" aria-label="Receipt inbox filters">
     {receiptFilterOptions.map(opt=><button key={opt.id} type="button" aria-pressed={filter===opt.id}
       onClick={()=>setFilter(opt.id)}>{opt.name}</button>)}</div>
     <button type="button" disabled={refreshing} className="sc-receipt-studio__link" onClick={onRefresh}>Refresh inbox</button></div>
   <section className="sc-receipt-studio__queue" aria-label="Receipt review queue">
     <div className="sc-receipt-studio__queue-title"><h2>Receipt review queue</h2><span>{filtered.length} displayed</span></div>
     {!filtered.length?<div className="sc-receipt-studio__empty"><FinancialState kind="empty" title="No receipts in this filter"
         description="Capture a new receipt or change the filter to find another record."
         primaryAction={{label:"Capture receipt",onClick:onCapture}}/></div>:
       <div className="sc-receipt-studio__rows">{filtered.map(r=><a key={r.receiptId}
         href={"/receipts/"+encodeURIComponent(r.receiptId)}
         onClick={e=>{if(e.button===0&&!e.metaKey&&!e.ctrlKey&&!e.shiftKey&&!e.altKey){e.preventDefault();onOpen(r.receiptId)}}}
         className="sc-receipt-studio__row">
         <span className="sc-receipt-studio__row-icon" aria-hidden="true">R</span>
         <span className="sc-receipt-studio__row-text"><strong>{r.merchantName||"Unknown merchant"}</strong>
           <small>{formatDate(r.purchasedAt)} · {receiptStatusLabel(r.matchStatus)}
             {r.suggestedCount? " · "+r.suggestedCount+" candidates":""}</small></span>
         <span className="sc-receipt-studio__row-value">{r.totalMinor===null?"Total not extracted":
           <MoneyValue amountMinor={r.totalMinor} currency={r.currencyCode}/>}
           <small>{r.remainingMinor!==null&&r.remainingMinor>0?
             "Remaining unmatched: "+new Intl.NumberFormat("de-DE",{style:"currency",currency:r.currencyCode}).format(r.remainingMinor/100):
             r.matchStatus==="matched"?"Reconciled":"Review evidence"}</small></span>
         <span aria-hidden="true" className="sc-receipt-studio__row-arrow">›</span></a>)}</div>}
   </section>
   <p className="sc-receipt-studio__foot"><DataProvenance source="receipt"/> Receipts are evidence; only existing ledger transactions represent posted spending.</p>
 </div>;
}
export function ReceiptMatchingPage({onNavigate}:{onNavigate:(key:string)=>void}){
 const runtime=createFinanceBrowserRuntime();
 const [dashboard,setDashboard]=useState<ReceiptMatchDashboard|null>(null);
 const [filter,setFilter]=useState<ReceiptQueueFilter>("attention");
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState<string|null>(null);
 const [refreshing,setRefreshing]=useState(false);
 const [cycle,setCycle]=useState(0);
 useEffect(()=>{
  if(!runtime){setError("Finance backend is not configured.");setLoading(false);return}
  let active=true;setLoading(true);setError(null);
  // Querying existing receipts does not trigger auto-confirm or ledger writes.
  void runtime.receiptMatching.getDashboard(80).then(d=>{if(active)setDashboard(d)})
   .catch(()=>{if(active)setError(receiptErrorCopy.queue)})
   .finally(()=>{if(active)setLoading(false)});
  return()=>{active=false};
 },[runtime,cycle]);
 function refresh(){setRefreshing(true);setCycle(n=>n+1);setRefreshing(false)}
 if(loading)return <FinancialState kind="loading" title="Loading receipt inbox" description="Retrieving your private receipt review queue."/>;
 if(error||!dashboard)return <FinancialState kind="offline" title="Receipt inbox unavailable"
   description={error??receiptErrorCopy.queue} primaryAction={{label:"Retry",onClick:refresh}}/>;
 return <ReceiptInboxView dashboard={dashboard} filter={filter} setFilter={setFilter}
   onOpen={id=>onNavigate("/receipts/"+encodeURIComponent(id))} onCapture={()=>onNavigate("/receipts/capture")}
   onRefresh={refresh} refreshing={refreshing}/>;
}
