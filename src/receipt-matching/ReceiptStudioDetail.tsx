import {useEffect,useMemo,useRef,useState,type FormEvent} from "react";
import type {ReceiptCapture,ReceiptPage} from "../domain/receipt-capture.js";
import type {ReceiptMatchWorkspace,ReceiptTransactionMatch} from "../domain/receipt-matching.js";
import {createFinanceBrowserRuntime} from "../integrations/supabase-client.js";
import {SupabaseFinanceReceiptCaptureService,type SupabaseReceiptClient} from "../services/supabase-receipt-capture.js";
import {FinanceButton,MoneyValue,DataProvenance,FinancialState} from "../ui/v2/SignalCurrent.js";
import {percentCovered,receiptErrorCopy,receiptStatusLabel,validateMatchAmount} from "./receipt-studio-model.js";
import "./receipt-studio.css";
type EvidencePage={id:string;filename:string;kind:"image"|"pdf"|"other";signedUrl:string};
const readableDate=(date:string|null)=>{
 if(!date)return"Date not extracted";
 const parsed=new Date(date);
 return Number.isFinite(parsed.valueOf())?new Intl.DateTimeFormat("de-DE",{dateStyle:"long"}).format(parsed):"Date not extracted";
};
function Candidate({match,receiptCurrency,remaining,busy,onAction}:{
 match:ReceiptTransactionMatch;receiptCurrency:string;remaining:number|null;busy:boolean;
 onAction:(action:"confirm"|"reject"|"unlink",matchId:string,amount?:number)=>Promise<void>;
}){
 const [amount,setAmount]=useState(()=>new Intl.NumberFormat("de-DE",{minimumFractionDigits:2,maximumFractionDigits:2}).format(match.matchedAmountMinor/100));
 const matched=match.status==="confirmed",rejected=match.status==="rejected";
 const valid=validateMatchAmount(amount,remaining,match);
 const tx=match.transaction;
 return <article className="sc-rstudio-candidate">
   <div className="sc-rstudio-candidate__head"><span className="sc-eyebrow">{receiptStatusLabel(match.status)}</span>
     {match.confidence!==null?<span>Candidate confidence: {Math.round(match.confidence*100)}%</span>:null}</div>
   <div className="sc-rstudio-candidate__title"><div><strong>{tx.merchantName??tx.description??"Transaction"}</strong>
     <small>{readableDate(tx.occurredAt)} · {tx.accounts.map(a=>a.name).join(", ")||"Account not available"}</small></div>
     <MoneyValue amountMinor={tx.displayAmountMinor} currency={tx.reportingCurrency}/></div>
   <div className="sc-rstudio-candidate__evidence">
     <span>Amount match {match.amountScore===null?"—":Math.round(match.amountScore*100)+"%"}</span>
     <span>Date match {match.dateScore===null?"—":Math.round(match.dateScore*100)+"%"}</span>
     <span>Merchant match {match.merchantScore===null?"—":Math.round(match.merchantScore*100)+"%"}</span>
   </div>
   {matched?<div className="sc-rstudio-candidate__actions"><span className="sc-rstudio-confirmed">Confirmed · <MoneyValue amountMinor={match.matchedAmountMinor} currency={receiptCurrency}/></span>
      <FinanceButton variant="secondary" disabled={busy} onClick={()=>void onAction("unlink",match.matchId)}>Unlink</FinanceButton></div>:
    rejected?<p className="sc-rstudio-muted">{match.decisionNote??"Candidate rejected"}</p>:
    <form className="sc-rstudio-candidate__actions" onSubmit={e=>{e.preventDefault();if(valid!==null)void onAction("confirm",match.matchId,valid)}}>
      <label>Amount to match · {receiptCurrency}<input required inputMode="decimal" autoComplete="off" value={amount}
       onChange={e=>setAmount(e.target.value)} disabled={busy} aria-invalid={amount.length>0&&valid===null}/></label>
      <FinanceButton disabled={busy} variant="secondary" onClick={()=>void onAction("reject",match.matchId)}>Reject</FinanceButton>
      <FinanceButton type="submit" disabled={busy||valid===null}>Confirm match</FinanceButton>
      {amount&&valid===null?<small className="sc-rstudio-invalid">Use a positive valid amount within the remaining receipt and transaction balance.</small>:null}
    </form>}
 </article>;
}
export function ReceiptStudioDetail({receiptId,onNavigate}:{
 receiptId:string;onNavigate:(target:string)=>void;
}){
 const runtime=createFinanceBrowserRuntime();
 const captureService=useMemo(()=>runtime?new SupabaseFinanceReceiptCaptureService({
  rpc:runtime.rpcClient.rpc.bind(runtime.rpcClient),
  storage:runtime.client.storage as unknown as SupabaseReceiptClient["storage"]
 }):null,[runtime]);
 const [workspace,setWorkspace]=useState<ReceiptMatchWorkspace|null>(null);
 const [capture,setCapture]=useState<ReceiptCapture|null>(null);
 const [evidence,setEvidence]=useState<EvidencePage[]>([]);
 const [loading,setLoading]=useState(true);
 const [sourceLoading,setSourceLoading]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState<string|null>(null);
 const [sourceError,setSourceError]=useState<string|null>(null);
 const [actionError,setActionError]=useState<string|null>(null);
 const [success,setSuccess]=useState("");
 const latest=useRef(0);
 useEffect(()=>{
  if(!runtime||!captureService){setError("Finance backend is not configured.");setLoading(false);return;}
  let active=true;const id=++latest.current;
  setWorkspace(null);setCapture(null);setEvidence([]);setSourceError(null);setError(null);setLoading(true);
  // Workspace and original evidence are independent; old receipts may lack
  // newly registered capture pages, but match review must still be usable.
  void runtime.receiptMatching.getWorkspace(receiptId).then(value=>{
    if(active&&latest.current===id)setWorkspace(value);
  }).catch(()=>{if(active&&latest.current===id)setError(receiptErrorCopy.detail)})
  .finally(()=>{if(active&&latest.current===id)setLoading(false)});
  void captureService.get(receiptId).then(value=>{if(active&&latest.current===id)setCapture(value)})
   .catch(()=>{if(active&&latest.current===id)setSourceError("Original capture pages are not available for this receipt.")});
  return()=>{active=false;latest.current++};
 },[runtime,captureService,receiptId]);
 async function loadEvidence(){
  if(!captureService||!capture||sourceLoading)return;
  setSourceLoading(true);setSourceError(null);
  try{
   const result:EvidencePage[]=[];
   for(const p of capture.pages){
    // Always mint short-lived private Storage signed URLs, never persist them
    // or substitute a public finance-receipts bucket.
    const url=await captureService.createPreviewUrl(p.storagePath,120);
    result.push({id:p.id,filename:"Page "+(p.pageIndex+1),
      kind:p.mimeType.startsWith("image/")?"image":p.mimeType==="application/pdf"?"pdf":"other",signedUrl:url});
   }
   setEvidence(result);
  }catch{setSourceError("Private preview is unavailable. Refresh the preview links when needed.");setEvidence([])}
  finally{setSourceLoading(false)}
 }
 // Server actions change matching metadata, not ledger posting; confirmation is
 // manual and no queue-wide auto-confirm routine is invoked here.
 async function action(kind:"confirm"|"reject"|"unlink",matchId:string,amount?:number){
  if(!runtime||busy)return;
  setBusy(true);setActionError(null);setSuccess("");
  try{
   if(kind==="confirm"){
     if(amount===undefined)throw Error("Amount required");
     await runtime.receiptMatching.confirm({matchId,matchedAmountMinor:amount});
   }else if(kind==="reject")await runtime.receiptMatching.reject(matchId,"Rejected during receipt evidence review");
   else await runtime.receiptMatching.unconfirm(matchId,"Unlinked during receipt evidence review");
   setWorkspace(await runtime.receiptMatching.getWorkspace(receiptId));
   setSuccess(kind==="confirm"?"Match confirmed. Existing transaction remains the only posted ledger entry.":"Receipt matching decision updated.");
  }catch{setActionError(receiptErrorCopy.action)}
  finally{setBusy(false)}
 }
 async function refreshCandidates(){
  if(!runtime||busy)return;setBusy(true);setActionError(null);
  try{
   // P30 disables auto-confirm even if the service's old default is true.
   await runtime.receiptMatching.refreshReceipt(receiptId,false);
   setWorkspace(await runtime.receiptMatching.getWorkspace(receiptId));
   setSuccess("Candidates refreshed. Nothing has been automatically matched.");
  }catch{setActionError(receiptErrorCopy.action)}
  finally{setBusy(false)}
 }
 if(loading)return <FinancialState kind="loading" title="Loading receipt" description="Loading private receipt details without creating a ledger transaction."/>;
 if(error||!workspace)return <FinancialState kind="error" title="Receipt unavailable" description={error??receiptErrorCopy.detail}
   primaryAction={{label:"Back to inbox",onClick:()=>onNavigate("/receipts")}}/>;
 const r=workspace.receipt;
 const covered=percentCovered(r.totalMinor,r.coveredMinor);
 const confirmed=workspace.matches.filter(m=>m.status==="confirmed");
 const suggested=workspace.matches.filter(m=>m.status==="suggested");
 return <div className="sc-rstudio-detail" data-testid="finance-receipt-detail">
   <header className="sc-rstudio-detail__heading"><div>
     <button className="sc-rstudio-back" type="button" onClick={()=>onNavigate("/receipts")}>← Receipt inbox</button>
     <span className="sc-eyebrow">RECEIPT EVIDENCE · {receiptStatusLabel(r.matchStatus)}</span>
     <h1>{r.merchantName||"Unknown merchant"}</h1>
     <p>{readableDate(r.purchasedAt)} · {r.processingStatus}</p></div>
     <div className="sc-rstudio-detail__summary">{r.totalMinor===null?<strong>Total not extracted</strong>:
       <MoneyValue amountMinor={r.totalMinor} currency={r.currencyCode} size="large"/>}
       <DataProvenance source="receipt"/></div>
   </header>
   {success?<p role="status" className="sc-rstudio-success">{success}</p>:null}
   {actionError?<p role="alert" className="sc-rstudio-error">{actionError}</p>:null}
   <div className="sc-rstudio-detail__grid">
     <section className="sc-rstudio-panel sc-rstudio-source"><div className="sc-rstudio-panel__heading"><h2>Original document</h2>
       {capture?.pages.length?<FinanceButton variant="secondary" disabled={sourceLoading} onClick={()=>void loadEvidence()}>
         {sourceLoading?"Loading…":evidence.length?"Refresh links":"View originals"}</FinanceButton>:null}</div>
       {sourceError?<p className="sc-rstudio-muted" role="status">{sourceError}</p>:null}
       {!capture?.pages.length?<p className="sc-rstudio-missing">No original capture pages are available. Compare the extracted information carefully before matching.</p>:
        !evidence.length?<p className="sc-rstudio-muted">{capture.pages.length} private page(s). Choose View originals to generate short-lived signed access.</p>:
        <div className="sc-rstudio-evidence">{evidence.map(p=><div key={p.id} className="sc-rstudio-evidence__page">
          {p.kind==="image"?<a href={p.signedUrl} target="_blank" rel="noopener noreferrer"><img src={p.signedUrl} alt={p.filename+" of receipt"}/></a>:
           <span className="sc-rstudio-evidence__pdf">PDF page — open privately</span>}
          <a href={p.signedUrl} rel="noopener noreferrer" target="_blank">Open {p.filename}</a>
        </div>)}</div>}
       <p className="sc-rstudio-footnote">Preview URLs expire after approximately two minutes and are never stored in the public receipt list.</p>
     </section>
     <div className="sc-rstudio-detail__right">
       <section className="sc-rstudio-panel"><div className="sc-rstudio-panel__heading"><h2>Extracted details</h2>
         <span className="sc-rstudio-tag">Read-only evidence</span></div>
         <dl className="sc-rstudio-dl"><dt>Merchant</dt><dd>{r.merchantName||"Not extracted"}</dd>
           <dt>Purchase date</dt><dd>{readableDate(r.purchasedAt)}</dd>
           <dt>Receipt number</dt><dd>{r.receiptNumber??"Not extracted"}</dd>
           <dt>Payment</dt><dd>{r.paymentMethodRaw??"Not extracted"}</dd>
           <dt>Status</dt><dd>{receiptStatusLabel(r.processingStatus)}</dd>
           <dt>Confirmed matches</dt><dd>{confirmed.length}</dd></dl>
         {covered!==null?<div className="sc-rstudio-coverage"><div><strong>Matched coverage</strong><span>{covered}%</span></div>
           <div role="progressbar" aria-valuenow={covered} aria-valuemin={0} aria-valuemax={100} aria-label="Matched receipt total"><span style={{width:covered+"%"}}/></div></div>:null}
         {r.remainingMinor!==null&&r.remainingMinor>0?<p className="sc-rstudio-muted">Unmatched remainder: <MoneyValue amountMinor={r.remainingMinor} currency={r.currencyCode}/></p>:null}
       </section>
       <section className="sc-rstudio-panel"><div className="sc-rstudio-panel__heading"><h2>Transaction matching</h2>
         <FinanceButton variant="secondary" disabled={busy} onClick={()=>void refreshCandidates()}>Find candidates</FinanceButton></div>
         <p className="sc-rstudio-muted">A receipt provides evidence. Confirming a match links it to an existing posted transaction; it does not post another expense.</p>
         {confirmed.length>0?<><h3>Confirmed links</h3>{confirmed.map(m=><Candidate key={m.matchId} match={m}
           receiptCurrency={r.currencyCode} remaining={r.remainingMinor} busy={busy} onAction={action}/>)}</>:null}
         <h3>Suggestions ({suggested.length})</h3>
         {suggested.length===0?<p className="sc-rstudio-missing">No suggested transactions. Import or post the corresponding transaction, then refresh candidates.</p>:
          suggested.map(m=><Candidate key={m.matchId} match={m} receiptCurrency={r.currencyCode}
           remaining={r.remainingMinor} busy={busy} onAction={action}/>)}
       </section>
     </div>
   </div>
   <section className="sc-rstudio-panel"><div className="sc-rstudio-panel__heading"><h2>Receipt items ({workspace.items.length})</h2>
     <span className="sc-rstudio-tag">Extracted, not ledger entries</span></div>
     {workspace.items.length===0?<p className="sc-rstudio-muted">No individual line items were recognized.</p>:
       <div className="sc-rstudio-items">{workspace.items.map(i=><div key={i.itemId}>
         <span><strong>{i.productName??i.normalizedName??i.rawName}</strong>
           <small>{i.categoryName??"Unclassified"} · quantity {i.quantity}</small></span>
         <MoneyValue amountMinor={i.effectiveTotalMinor} currency={r.currencyCode}/>
       </div>)}</div>}
   </section>
 </div>;
}
