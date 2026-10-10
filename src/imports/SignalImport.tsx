import {useMemo,useState,type ChangeEvent,type FormEvent,type MouseEvent,type ReactNode} from "react";
import type {CsvImportMapping,ImportPreview,ImportPreviewRecord,ParsedImportFile,UpdateImportRecordInput} from "../domain/imports.js";
import {FinanceButton,FinancialState,DataProvenance} from "../ui/v2/SignalCurrent.js";
import {formatSignalMoney} from "../ui/v2/finance-presentation.js";
import {detectImportFormat,inspectCsv,parseBankFile,parseCsv,importHeaderSignature} from "./parsers.js";
import {useImportWorkspace,type ImportWorkspace} from "./use-imports.js";
import {previewAudit,safeImportedTransactionLink,secureRecordUpdate,sourceFileLabel,validateParsedImport,validateSourceFile,validImportId} from "./signal-import-model.js";
import "./signal-import.css";
function Money({value,currency}:{value:number,currency:string}){return <span className="sc-import-money">{Number.isSafeInteger(value)?formatSignalMoney(value,currency):"Amount unavailable"}</span>}
function Link({href,onNavigate,children}:{href:string|null;onNavigate:(path:string)=>void;children:ReactNode}){
 const click=(event:MouseEvent<HTMLAnchorElement>)=>{if(event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||!href)return;event.preventDefault();onNavigate(href)};
 return href?<a href={href} onClick={click} className="sc-import-link">{children}</a>:<span className="sc-import-muted">{children}</span>;
}
const emptyMapping:CsvImportMapping={bookedAt:"",amount:"",dateFormat:"auto",decimalSeparator:"auto"};
function Mapping({headers,mapping,onChange,onApply}:{headers:readonly string[],mapping:CsvImportMapping,onChange:(v:CsvImportMapping)=>void,onApply:()=>void}){
 const bind=(field:keyof CsvImportMapping,value:string)=>onChange({...mapping,[field]:value||null});
 const fields:[keyof CsvImportMapping,string][]=[["bookedAt","Booking date"],["amount","Amount"],["debit","Debit amount"],["credit","Credit amount"],["description","Description"],["counterpartyName","Counterparty"],["currency","Currency"],["reference","Reference"],["externalId","Bank transaction ID"],["counterpartyIban","Counterparty IBAN"],["valueDate","Value date"]];
 return <section className="sc-import-panel"><h2>Map CSV fields</h2><p className="sc-import-muted">Missing or ambiguous mappings must be resolved before creating an import. No rows have been uploaded.</p>
 <div className="sc-import-fields">{fields.map(([field,label])=><label key={field}>{label}<select aria-label={label} value={mapping[field]??""} onChange={e=>bind(field,e.currentTarget.value)}>
 <option value="">Not mapped</option>{headers.map(h=><option key={h} value={h}>{h}</option>)}</select></label>)}
 <label>Date order<select aria-label="Date order" value={mapping.dateFormat??"auto"} onChange={e=>onChange({...mapping,dateFormat:e.currentTarget.value as NonNullable<CsvImportMapping["dateFormat"]>})}>
 <option value="auto">Detect</option><option value="dmy">Day/month/year</option><option value="mdy">Month/day/year</option><option value="ymd">Year/month/day</option></select></label>
 <label>Decimal separator<select aria-label="Decimal separator" value={mapping.decimalSeparator??"auto"} onChange={e=>onChange({...mapping,decimalSeparator:e.currentTarget.value as NonNullable<CsvImportMapping["decimalSeparator"]>})}>
 <option value="auto">Detect</option><option value=",">Comma</option><option value=".">Period</option></select></label></div>
 <FinanceButton variant="secondary" disabled={!mapping.bookedAt||!(mapping.amount||(mapping.debit&&mapping.credit))} onClick={onApply}>Apply CSV mapping</FinanceButton></section>;
}
function ReviewRecord({record,preview,workspace,onNavigate}:{record:ImportPreviewRecord,preview:ImportPreview,workspace:ImportWorkspace,onNavigate:(path:string)=>void}){
 const [expanded,setExpanded]=useState(false),[decision,setDecision]=useState<ImportPreviewRecord["decision"]>(record.decision);
 const [kind,setKind]=useState<ImportPreviewRecord["proposedType"]>(record.proposedType);
 const [category,setCategory]=useState(record.categoryId??"");
 const [transfer,setTransfer]=useState(record.transferAccountId??"");
 const [rate,setRate]=useState(record.exchangeRate===null?"":String(record.exchangeRate));
 const [confirmed,setConfirmed]=useState(false);
 const [inlineError,setInlineError]=useState<string|null>(null);
 const input:UpdateImportRecordInput={recordId:record.recordId,decision,proposedType:kind,categoryId:kind==="transfer"?null:category||null,
 transferAccountId:kind==="transfer"?transfer||null:null,exchangeRate:rate.trim()?Number(rate):null};
 const validation=secureRecordUpdate(input,record,preview);
 const editable=record.status==="pending"||record.status==="failed";
 const change=(fn:()=>void)=>{fn();setConfirmed(false);setInlineError(null)};
 const submit=(e:FormEvent)=>{e.preventDefault();if(validation){setInlineError(validation);return}if(!confirmed){setInlineError("Review the source row and confirm this decision first.");return}void workspace.updateRecord(input);setExpanded(false);setConfirmed(false)};
 return <article className="sc-import-record"><div className="sc-import-record-main">
 <div><span className="sc-import-tag">{record.decision}</span>{record.duplicateReason?<span className="sc-import-tag is-warning">Duplicate: {record.duplicateReason.replaceAll("_"," ")}</span>:null}
 <strong>{record.counterpartyName??record.description??"Statement row "+record.rowNumber}</strong>
 <small>Row {record.rowNumber} · {record.bookedAt.slice(0,10)} · {record.proposedType} · {record.status}</small>
 {record.reference?<small>Reference: {record.reference}</small>:null}
 {record.externalId?<small>External bank ID: {record.externalId.slice(0,64)}</small>:null}
 <small>Source hash: {sourceFileLabel(record.sourceHash)} · Fingerprint: {sourceFileLabel(record.fingerprint)}</small>
 {record.errorText?<small className="sc-import-error">{record.errorText}</small>:null}
 <div className="sc-import-links"><Link href={safeImportedTransactionLink(record.transactionId)} onNavigate={onNavigate}>Posted transaction</Link>
 <Link href={safeImportedTransactionLink(record.duplicateTransactionId)} onNavigate={onNavigate}>Potential existing match</Link></div></div>
 <div className="sc-import-record-end"><strong><Money value={record.amountMinor} currency={record.currencyCode}/></strong>
 <button type="button" className="sc-import-text-button" aria-expanded={expanded} disabled={!editable} onClick={()=>setExpanded(v=>!v)}>{editable?(expanded?"Close review":"Review row"):"Read-only"}</button></div></div>
 {expanded&&editable?<form className="sc-import-record-form" onSubmit={submit}><div className="sc-import-fields">
 <label>Decision<select aria-label={"Decision row "+record.rowNumber} value={decision} onChange={e=>change(()=>setDecision(e.currentTarget.value as ImportPreviewRecord["decision"]))}>
 <option value="review">Keep for review</option><option value="import">Approve for posting</option><option value="duplicate">Duplicate — no posting</option><option value="ignore">Ignore — no posting</option></select></label>
 <label>Transaction type<select aria-label={"Type row "+record.rowNumber} value={kind} disabled={decision!=="import"} onChange={e=>change(()=>setKind(e.currentTarget.value as ImportPreviewRecord["proposedType"]))}>
 <option value="expense">Expense</option><option value="income">Income</option><option value="transfer">Transfer between owned accounts</option></select></label>
 {kind!=="transfer"&&decision==="import"?<label>Category<select aria-label={"Category row "+record.rowNumber} value={category} onChange={e=>change(()=>setCategory(e.currentTarget.value))}>
 <option value="">Choose verified category</option>{preview.categories.filter(c=>c.kind==="both"||c.kind===kind).map(c=><option key={c.categoryId} value={c.categoryId}>{c.path.join(" / ")||c.name}</option>)}</select></label>:null}
 {kind==="transfer"&&decision==="import"?<label>Destination account<select aria-label={"Transfer destination row "+record.rowNumber} value={transfer} onChange={e=>change(()=>setTransfer(e.currentTarget.value))}>
 <option value="">Choose different account</option>{preview.accounts.filter(a=>a.accountId!==preview.account.accountId&&a.currencyCode===preview.account.currencyCode).map(a=><option value={a.accountId} key={a.accountId}>{a.name} · {a.currencyCode}</option>)}</select></label>:null}
 {record.currencyCode!==preview.account.currencyCode&&decision==="import"?<label>Explicit FX exchange rate<input aria-label={"FX rate row "+record.rowNumber} value={rate} inputMode="decimal" onChange={e=>change(()=>setRate(e.currentTarget.value))}/></label>:null}</div>
 <p className="sc-import-muted">{kind==="transfer"?"The backend posts both legs of a transfer together. Never import the other bank statement leg as another transfer without reviewing duplicate evidence.":"Only explicit, approved rows may post. Bank identifiers and duplicate signals remain visible."}</p>
 {inlineError?<p role="alert" className="sc-import-error">{inlineError}</p>:null}
 <label className="sc-import-check"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.currentTarget.checked)}/> I reviewed this source entry and selected the correct treatment.</label>
 <div className="sc-import-actions"><FinanceButton disabled={workspace.busyKey!==null||!confirmed||Boolean(validation)} type="submit">Save reviewed decision</FinanceButton>
 <FinanceButton variant="secondary" type="button" onClick={()=>setExpanded(false)}>Cancel</FinanceButton></div></form>:null}
 </article>;
}
export function SignalImportView({workspace,onNavigate}:{workspace:ImportWorkspace;onNavigate:(path:string)=>void}){
 const dashboard=workspace.dashboard!;
 const [accountId,setAccountId]=useState(""),[source,setSource]=useState(""),[file,setFile]=useState<File|null>(null),[fileText,setFileText]=useState(""),
 [parsed,setParsed]=useState<ParsedImportFile|null>(null),[mapping,setMapping]=useState<CsvImportMapping|null>(null),
 [parseError,setParseError]=useState<string|null>(null),[stagingConsent,setStagingConsent]=useState(false),[commitReview,setCommitReview]=useState(false),
 [approval,setApproval]=useState(false),[approvalText,setApprovalText]=useState("");
 const account=dashboard.accounts.find(a=>a.accountId===accountId)??null;
 const preview=workspace.preview;
 const audit=useMemo(()=>preview?previewAudit(preview,dashboard):null,[preview,dashboard]);
 const busy=workspace.busyKey!==null;
 const clearFile=()=>{setFile(null);setFileText("");setParsed(null);setMapping(null);setParseError(null);setStagingConsent(false)};
 const onFile=async(event:ChangeEvent<HTMLInputElement>)=>{
  const f=event.currentTarget.files?.[0]??null;clearFile();setFile(f);if(!f)return;
  const problem=validateSourceFile(f,account);if(problem){setParseError(problem);return}
  try{const contents=await f.text(),format=detectImportFormat(f.name,f.type,contents);setFileText(contents);
   if(format==="csv"){
    const inspect=inspectCsv(contents);const signature=importHeaderSignature(inspect.headers);
    const saved=dashboard.profiles.find(p=>p.format==="csv"&&p.headerSignature===signature&&(!p.accountId||p.accountId===account?.accountId));
    const initial=(saved?.mapping as unknown as CsvImportMapping|undefined)??inspect.mapping??emptyMapping;
    setMapping(initial);
    if(initial.bookedAt&&(initial.amount||(initial.debit&&initial.credit)))setParsed(parseCsv(contents,initial,account!.currencyCode));
    else setParsed({format:"csv",rows:[],statement:{accountIdentifier:null,currencyCode:null,statementFrom:null,statementTo:null,closingBalanceMinor:null,closingBalanceAt:null,metadata:{}},csv:{...inspect,mapping:initial}});
   }else setParsed(parseBankFile(contents,format,account!.currencyCode));
   if(!source.trim())setSource(account?.institutionName??f.name.replace(/\.[^.]+$/,""));
  }catch(e){setParseError(e instanceof Error?e.message:"Parsing failed");setParsed(null)}
 };
 const applyMapping=()=>{if(!mapping||!account||!fileText)return;try{setParsed(parseCsv(fileText,mapping,account.currencyCode));setParseError(null)}catch(e){setParseError(e instanceof Error?e.message:"Mapping failed");setParsed(null)}};
 const parseIssues=parsed&&account?validateParsedImport(parsed,account):[];
 const upload=()=>{if(!file||!parsed||!account||!source.trim()||parseIssues.length||!stagingConsent)return;
  void workspace.importFile({file,parsed,accountId:account.accountId,source:source.trim()});setStagingConsent(false)};
 const canCommit=Boolean(audit&&audit.blocking.length===0&&!busy&&preview);
 const startCommit=()=>{setCommitReview(true);setApproval(false);setApprovalText("")};
 const finish=()=>{if(!preview||!audit||audit.blocking.length||!approval||approvalText!=="POST "+audit.ready)return;
  setCommitReview(false);setApproval(false);setApprovalText("");void workspace.commit()};
 return <div className="sc-import"><header className="sc-import-header"><div><span className="sc-eyebrow">Signal Current / Activity</span><h1>Import & reconcile</h1>
 <p>Review bank-export evidence and resolve duplicates, transfers and posting decisions before any ledger mutation.</p></div>
 <div className="sc-import-header-buttons"><FinanceButton variant="secondary" disabled={busy} onClick={()=>void workspace.refresh()}>Refresh import history</FinanceButton>
 {preview?<FinanceButton variant="secondary" onClick={()=>{workspace.clearPreview();clearFile();setCommitReview(false)}}>New statement</FinanceButton>:null}</div></header>
 {workspace.actionError||parseError?<p role="alert" className="sc-import-error">Action requires attention: {workspace.actionError??parseError}. No successful posting is assumed.</p>:null}
 {workspace.commitResult?<section className="sc-import-panel" aria-label="Backend commit result"><h2>Commit result: {workspace.commitResult.status.replaceAll("_"," ")}</h2>
 <p>Backend reports {workspace.commitResult.importedCount} imported, {workspace.commitResult.duplicateCount} duplicates, {workspace.commitResult.failedCount} failed and {workspace.commitResult.reviewCount} still under review.</p>
 <p className="sc-import-muted">Reconciliation: {JSON.stringify(workspace.commitResult.reconciliation).slice(0,500)}. Never assume bank settlement from this result.</p><Link href="/activity" onNavigate={onNavigate}>Open posted Activity →</Link></section>:null}
 {!preview?<><section className="sc-import-panel" aria-label="Statement intake"><div className="sc-import-panel-head"><h2>1. Select private statement source</h2><DataProvenance source="pending"/></div>
 <div className="sc-import-fields"><label>Destination Finance account<select aria-label="Destination Finance account" value={accountId} onChange={e=>{setAccountId(e.currentTarget.value);clearFile()}}>
 <option value="">Choose account</option>{dashboard.accounts.filter(a=>validImportId(a.accountId)).map(a=><option key={a.accountId} value={a.accountId}>{a.name} · {a.currencyCode}</option>)}</select></label>
 <label>Bank or source<input aria-label="Bank or source" maxLength={80} value={source} onChange={e=>setSource(e.currentTarget.value)} placeholder="Bank export origin"/></label>
 <label>CSV / CAMT.053 / OFX / QFX<input aria-label="Statement file" type="file" accept=".csv,.xml,.ofx,.qfx,text/csv,text/xml,application/xml" disabled={!account} onChange={e=>void onFile(e)}/></label></div>
 <p className="sc-import-muted">Local parser first. Maximum 8 MiB. Selecting a file does not upload or post it. Originals are uploaded only after explicit custody authorization.</p></section>
 {parsed?.format==="csv"&&mapping&&parsed.rows.length===0&&parsed.csv?<Mapping headers={parsed.csv.headers} mapping={mapping} onChange={setMapping} onApply={applyMapping}/>:null}
 {parsed&&parsed.rows.length>0&&account&&file?<section className="sc-import-panel" aria-label="Local source verification"><div className="sc-import-panel-head"><h2>2. Verify parsed statement</h2><span className="sc-import-tag">{parsed.format.toUpperCase()}</span></div>
 <p><strong>{parsed.rows.length}</strong> source rows · {parsed.statement.statementFrom??"unknown start"} – {parsed.statement.statementTo??"unknown end"} · original {file.name}</p>
 <p className="sc-import-muted">Statement account: {parsed.statement.accountIdentifier??"Not provided"} · Selected: {account.name} ({account.currencyCode})</p>
 {parsed.statement.closingBalanceMinor!==null?<p>Closing balance evidence: <Money value={parsed.statement.closingBalanceMinor} currency={parsed.statement.currencyCode??account.currencyCode}/> · may anchor balance at commit after complete posting.</p>:null}
 {parseIssues.map(x=><p className="sc-import-error" key={x}>{x}</p>)}
 <div className="sc-import-table-wrap" role="region" tabIndex={0} aria-label="Parsed source rows"><table><caption>Local parsing preview · no ledger writes</caption>
 <thead><tr><th scope="col">Book date</th><th scope="col">Counterparty / description</th><th scope="col">Bank amount</th></tr></thead>
 <tbody>{parsed.rows.slice(0,12).map((x,i)=><tr key={i}><td>{x.bookedAt.slice(0,10)}</td><td>{x.counterpartyName??x.description??"—"}</td><td><Money value={x.amountMinor} currency={x.currencyCode}/></td></tr>)}</tbody></table></div>
 {parsed.rows.length>12?<p className="sc-import-muted">Showing first 12 of {parsed.rows.length} rows. The server preview will show all staged decisions.</p>:null}
 <label className="sc-import-check"><input type="checkbox" checked={stagingConsent} onChange={e=>setStagingConsent(e.currentTarget.checked)}/> I reviewed the file and approve private original-file storage and creation of a pending import draft.</label>
 <FinanceButton disabled={!stagingConsent||busy||parseIssues.length>0||!source.trim()} onClick={upload}>Create secure import preview</FinanceButton></section>:null}
 <section className="sc-import-panel" aria-labelledby="import-history-title"><h2 id="import-history-title">Earlier imports</h2>
 {dashboard.imports.length?dashboard.imports.map(i=><div className="sc-import-history-row" key={i.importId}>
 <div><strong>{i.fileName??i.source}</strong><small>{i.accountName??"Unknown account"} · {i.status.replaceAll("_"," ")} · {i.rowCount} rows · {i.createdAt.slice(0,10)}</small></div>
 <FinanceButton variant="secondary" disabled={!validImportId(i.importId)||busy} onClick={()=>void workspace.openImport(i.importId)}>Open evidence</FinanceButton></div>):
 <p className="sc-import-muted">No retained statement imports in this authenticated account.</p>}</section></>:
 <><section className="sc-import-panel" aria-label="Staged import provenance"><div className="sc-import-panel-head"><div><span className="sc-eyebrow">3. Source custody and reconciliation</span><h2>{preview.import.fileName??"Bank import"}</h2></div><span className="sc-import-tag">{preview.import.status.replaceAll("_"," ")}</span></div>
 <div className="sc-import-custody"><div><span>Account</span><strong>{preview.account.name} · {preview.account.currencyCode}</strong></div>
 <div><span>Source SHA-256</span><strong>{sourceFileLabel(preview.import.fileSha256)}</strong></div>
 <div><span>Private object path</span><strong>{preview.import.storagePath?"Registered in private import bucket":"Unavailable"}</strong></div>
 <div><span>Bank statement coverage</span><strong>{preview.import.statementFrom??"Unknown"} – {preview.import.statementTo??"Unknown"}</strong></div></div>
 <p className="sc-import-muted">This hash identifies the retained source file; it is not proof of independent bank authenticity or signer validation. Duplicate matches are suggestions until reviewed.</p>
 {preview.import.closingBalanceMinor!==null?<p>Statement closing balance: <Money value={preview.import.closingBalanceMinor} currency={preview.import.statementCurrency??preview.account.currencyCode}/> · possible balance observation at completed posting</p>:null}
 <div className="sc-import-counts"><div><strong>{audit?.ready??0}</strong><span>Proposed post</span></div><div><strong>{audit?.review??0}</strong><span>Needs review</span></div>
 <div><strong>{audit?.duplicates??0}</strong><span>Duplicates</span></div><div><strong>{audit?.ignored??0}</strong><span>Ignored</span></div></div></section>
 <section className="sc-import-panel" aria-labelledby="import-review-title"><div className="sc-import-panel-head"><div><span className="sc-eyebrow">4. Human review</span><h2 id="import-review-title">Source transactions</h2></div>
 <FinanceButton variant="secondary" disabled={busy} onClick={()=>void workspace.openImport(preview.import.importId)}>Refresh server evidence</FinanceButton></div>
 {preview.records.length?preview.records.map(row=><ReviewRecord key={row.recordId} record={row} preview={preview} workspace={workspace} onNavigate={onNavigate}/>):
 <p className="sc-import-muted">No staged rows in this source. Nothing can be posted.</p>}</section>
 <section className="sc-import-panel" aria-labelledby="import-commit-title"><div className="sc-import-panel-head"><div><span className="sc-eyebrow">5. Controlled ledger mutation</span><h2 id="import-commit-title">Final reconciliation approval</h2></div><DataProvenance source="pending"/></div>
 {audit?.blocking.length?<div role="status" className="sc-import-blocked"><strong>Posting is blocked</strong>{audit.blocking.map((reason,index)=><p key={index}>{reason}</p>)}</div>:<p>All {audit?.ready??0} selected unposted transactions have passed the local preflight. Backend will independently authorize and reconcile each entry.</p>}
 {audit?.warnings.map((x,i)=><p className="sc-import-warning" key={i}>{x}</p>)}
 <p className="sc-import-muted">Commit can create posted expense/income/transfer ledger entries and, for a successfully completed single-currency statement, anchor its closing balance. It cannot be automatically undone. Bank settlement and complete duplicate coverage are not guaranteed.</p>
 {!commitReview?<FinanceButton disabled={!canCommit} onClick={startCommit}>Review final posting</FinanceButton>:
 <div className="sc-import-confirm" role="group" aria-label="Final bank import authorization"><h3>Confirm posting {audit?.ready??0} reviewed rows?</h3>
 <p>Re-read source hashes, duplicate decisions, destination account and the possible closing-balance observation before authorizing.</p>
 <label className="sc-import-check"><input type="checkbox" checked={approval} onChange={e=>setApproval(e.currentTarget.checked)}/> I authorize the selected ledger postings and any documented import balance observation.</label>
 <label>Type POST {audit?.ready??0} to confirm<input aria-label="Typed final posting approval" value={approvalText} onChange={e=>setApprovalText(e.currentTarget.value)} autoComplete="off"/></label>
 <div className="sc-import-actions"><FinanceButton disabled={!canCommit||!approval||approvalText!=="POST "+audit?.ready} onClick={finish}>Confirm ledger posting</FinanceButton>
 <FinanceButton variant="secondary" onClick={()=>{setCommitReview(false);setApproval(false);setApprovalText("")}}>Cancel</FinanceButton></div></div>}
 {preview.import.status!=="completed"&&preview.import.status!=="cancelled"?<FinanceButton variant="secondary" disabled={busy} onClick={()=>{setCommitReview(false);setApproval(false);void workspace.cancel()}}>Cancel staged import (no posted rows)</FinanceButton>:null}
 </section></>}
 <p className="sc-import-disclaimer">Finance import RPCs use authenticated user-scoped storage and ledger authorization. P36 adds client-side fail-closed review, not a replacement for server-side authorization or a guarantee of bank-file authenticity.</p></div>;
}
export function SignalImportPage({onNavigate}:{onNavigate:(path:string)=>void}){
 const workspace=useImportWorkspace();
 if(workspace.state==="loading")return <FinancialState kind="loading" title="Loading imports" description="Reading authenticated import history. No bank file is being uploaded."/>;
 if(workspace.state!=="ready"||!workspace.dashboard)return <FinancialState kind={workspace.state==="error"?"error":"empty"}
 title="Import service unavailable" description={workspace.error??"Configured Finance backend and authenticated session required."}
 primaryAction={workspace.state==="error"?{label:"Retry",onClick:()=>void workspace.refresh()}:undefined}/>;
 return <SignalImportView workspace={workspace} onNavigate={onNavigate}/>;
}
