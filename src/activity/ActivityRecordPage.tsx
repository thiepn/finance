import {useEffect,useMemo,useRef,useState,type FormEvent} from "react";
import type {ActivityDetail} from "../domain/activity.js";
import {ActivityController} from "./activity-controller.js";
import {createFinanceBrowserRuntime} from "../integrations/supabase-client.js";
import {FinanceButton,FinancialState,MoneyValue,DataProvenance} from "../ui/v2/SignalCurrent.js";
import {Icon} from "../ui/icons/Icon.js";
import {normalizeActivityError,signedActivityDisplay,moneyCategory} from "./activity-workspace-model.js";
import "./activity-workspace.css";
const formatDate=(raw:string)=>{const d=new Date(raw);return Number.isFinite(d.getTime())?
  new Intl.DateTimeFormat("de-DE",{dateStyle:"long",timeStyle:"short"}).format(d):"Unknown date"};
export interface ActivityRecordPageProps {kind:"transaction"|"receipt";recordId:string;onNavigate:(path:string)=>void;}
export function ActivityRecordPage({kind,recordId,onNavigate}:ActivityRecordPageProps){
 const runtime=createFinanceBrowserRuntime();
 const controller=useMemo(()=>runtime?new ActivityController(runtime.activity):null,[runtime]);
 const [detail,setDetail]=useState<ActivityDetail|null>(null);
 const [busy,setBusy]=useState(false);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState<string|null>(null);
 const [voidOpen,setVoidOpen]=useState(false);
 const [reason,setReason]=useState("");
 const [confirmed,setConfirmed]=useState(false);
 const [writeError,setWriteError]=useState<string|null>(null);
 const [success,setSuccess]=useState(false);
 const seq=useRef(0);
 async function fetchDetail(){
   if(!controller){setLoading(false);setError("Finance is not configured.");return}
   const id=++seq.current;setLoading(true);setError(null);
   try{
     const next=await controller.getDetail(kind,recordId);
     if(id===seq.current){setDetail(next);setSuccess(false)}
   }catch(e){if(id===seq.current){setDetail(null);setError(normalizeActivityError(e,"detail"));}}
   finally{if(id===seq.current)setLoading(false)}
 }
 useEffect(()=>{void fetchDetail();return()=>{seq.current++}},[controller,kind,recordId]);
 async function voidRecord(event:FormEvent){
   event.preventDefault();
   if(busy||!runtime||!detail||detail.entityKind!=="transaction"||detail.activity.status!=="posted"
     ||!confirmed||reason.trim().length<10)return;
   setBusy(true);setWriteError(null);
   try{
     await runtime.ledger.voidTransaction({transactionId:detail.activity.transactionId??detail.activity.id,reason:reason.trim()});
     setVoidOpen(false);setConfirmed(false);setReason("");setSuccess(true);
     // Reread actual persisted status, never optimistically adjust monetary values.
     const next=await controller!.getDetail("transaction",recordId);
     setDetail(next);
   }catch(e){
     setWriteError(normalizeActivityError(e,"write")+
       " If you attempted to void this record, refresh its status before trying again.");
   }finally{setBusy(false)}
 }
 const back=kind==="receipt"?"/receipts":"/activity";
 if(loading)return <div className="sc-record"><FinancialState kind="loading" title="Loading record" description="Fetching details for this private financial record."/></div>;
 if(error||!detail)return <div className="sc-record"><FinancialState kind="error" title="Record unavailable"
   description={error??"No verified record was returned."} primaryAction={{label:"Try again",onClick:()=>void fetchDetail()}}
   secondaryAction={{label:"Back to Activity",onClick:()=>onNavigate(back)}}/></div>;
 if(detail.entityKind==="receipt"){
  const receipt=detail.receipt;
  const merchant=typeof receipt.merchant_name==="string"?receipt.merchant_name:"Receipt";
  const status=String(receipt.capture_status??receipt.processing_status??"Pending review");
  return <div className="sc-record"><header className="sc-record-header"><div>
   <button type="button" className="sc-record-back" onClick={()=>onNavigate("/activity")}>← Activity</button>
   <span className="sc-eyebrow">RECEIPT EVIDENCE</span><h1>{merchant}</h1><p>{status}</p></div>
   <FinanceButton variant="secondary" onClick={()=>onNavigate("/receipts")}>Open receipt inbox</FinanceButton></header>
   <section className="sc-record-surface"><h2>Evidence record</h2><p>Receipt evidence does not create a second posted expense.</p>
    <DataProvenance source="receipt"/><dl><dt>Capture status</dt><dd>{status}</dd>
     <dt>Matching transactions</dt><dd>{detail.transactionMatches.length}</dd></dl></section></div>;
 }
 const transaction=detail.activity;
 const money=signedActivityDisplay(transaction);
 const canVoid=transaction.status==="posted";
 return <div className="sc-record">
   <header className="sc-record-header"><div><button type="button" onClick={()=>onNavigate("/activity")} className="sc-record-back">← Activity</button>
     <span className="sc-eyebrow">LEDGER / {transaction.status.toUpperCase()}</span>
     <h1>{transaction.merchantName??transaction.title}</h1>
     <p>{formatDate(transaction.occurredAt)} · {transaction.transactionType??"Transaction"} · {transaction.source}</p></div>
     {canVoid?<FinanceButton variant="danger" onClick={()=>setVoidOpen(true)}>Void transaction</FinanceButton>:null}</header>
   {success?<p role="status" className="sc-record-success">The void request was accepted. Current status is loaded from the ledger.</p>:null}
   <section className="sc-record-total" aria-label="Transaction amount"><span className="sc-eyebrow">POSTED TRANSACTION</span>
     {money===null?<strong>Amount not verified</strong>:<MoneyValue amountMinor={money} currency={transaction.currencyCode} tone={moneyCategory(transaction)} size="large"/>}
     <DataProvenance source="posted"/></section>
   <div className="sc-record-grid"><section className="sc-record-surface"><h2>Transaction</h2>
     <dl><dt>Reference</dt><dd className="sc-record-id">{transaction.transactionId??transaction.id}</dd>
      <dt>Type</dt><dd>{transaction.transactionType??"Unknown"}</dd>
      <dt>Status</dt><dd>{transaction.status}</dd>
      <dt>Source</dt><dd>{transaction.source}</dd>
      <dt>Currency</dt><dd>{transaction.currencyCode}</dd>
      <dt>Merchant</dt><dd>{transaction.merchantName??"Not assigned"}</dd>
      <dt>Description</dt><dd>{transaction.description??"—"}</dd>
      <dt>Note</dt><dd>{transaction.note??"—"}</dd></dl></section>
     <section className="sc-record-surface"><h2>Accounts</h2>
       {transaction.accounts.length?transaction.accounts.map(x=><div className="sc-record-line" key={x.id}>
         <span>{x.name}<small>{x.kind} · {x.currencyCode}</small></span>
         <MoneyValue amountMinor={x.signedAmountMinor} currency={x.currencyCode}/></div>):
         <p className="sc-record-muted">No account breakdown was returned.</p>}
       <h2 className="sc-record-subheading">Category allocations</h2>
       {transaction.categories.length?transaction.categories.map(x=><div className="sc-record-line" key={x.id}>
         <span>{x.name}<small>{x.necessity??"Unclassified"}</small></span>
         <MoneyValue amountMinor={x.reportingAmountMinor} currency={transaction.currencyCode}/></div>):
         <p className="sc-record-muted">No category allocation was returned.</p>}
     </section>
     <section className="sc-record-surface sc-record-related"><h2>Related records</h2>
       <dl><dt>Receipt matches</dt><dd>{detail.receiptMatches.length}</dd>
         <dt>Associated products</dt><dd>{transaction.productNames.length?transaction.productNames.join(", "):"—"}</dd>
         <dt>Tags</dt><dd>{detail.tags.length?detail.tags.map(t=>t.name).join(", "):"—"}</dd></dl>
       {transaction.receiptIds.length?<button className="sc-record-text-link" type="button"
        onClick={()=>onNavigate("/receipts/"+encodeURIComponent(transaction.receiptIds[0]!))}>View linked receipt <Icon name="chevronRight" size={15}/></button>:null}
       <p className="sc-record-muted">Ledger history is retained. This screen never edits posted entries in place.</p>
     </section></div>
   {voidOpen?<section className="sc-record-void" aria-label="Void transaction form"><h2>Void this posted transaction?</h2>
     <p>Voiding changes the ledger's status, preserving an audit trail. This is not a reversible in-place edit.</p>
     <form onSubmit={e=>void voidRecord(e)}><label>Reason (at least 10 characters)
       <textarea value={reason} minLength={10} maxLength={500} required disabled={busy}
        onChange={e=>setReason(e.target.value)} placeholder="Explain why this transaction must be voided."/></label>
       <label className="sc-record-void-check"><input type="checkbox" checked={confirmed} disabled={busy} onChange={e=>setConfirmed(e.target.checked)}/>
         I have verified this is the correct posted transaction.</label>
       {writeError?<p role="alert">{writeError}</p>:null}
       <div><FinanceButton type="submit" variant="danger" disabled={busy||reason.trim().length<10||!confirmed}>{busy?"Voiding…":"Confirm void"}</FinanceButton>
       <FinanceButton variant="secondary" disabled={busy} onClick={()=>{setVoidOpen(false);setWriteError(null)}}>Cancel</FinanceButton></div>
     </form></section>:null}
 </div>;
}
