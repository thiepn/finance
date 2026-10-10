import {useState,type MouseEvent,type ReactNode,type FormEvent} from "react";
import {FinanceButton,FinancialState} from "../ui/v2/SignalCurrent.js";
import {useFinanceAcceptance,type AcceptanceWorkspace} from "./use-finance-acceptance.js";
import {analyzeFinanceSnapshot,decisionForStage,domains,releaseEvidenceRequirements,validateEvidenceReference,
 type AcceptanceSnapshot,type EvidenceReference,type EvidenceId,type ReleaseStage} from "./finance-acceptance-model.js";
import "./signal-release-review.css";
const stageNames:{id:ReleaseStage;label:string}[]=[{id:"staging",label:"Staging"},{id:"release",label:"Release"},{id:"postrelease",label:"Postrelease"}];
const links=[
 {label:"Home & posted summary",to:"/"},{label:"Activity ledger",to:"/activity"},
 {label:"Receipt evidence",to:"/receipts"},{label:"Plan & budgets",to:"/plan"},
 {label:"Spending insights",to:"/explore"},{label:"Merchants",to:"/explore/merchants"},
 {label:"Products",to:"/explore/products"},{label:"Recurring commitments",to:"/plan/recurring"},
 {label:"Account wealth",to:"/wealth/accounts"},{label:"Net worth bridge",to:"/wealth/net-worth"},
 {label:"Bank import reconciliation",to:"/import"},{label:"Classification rules",to:"/settings/rules"}
] as const;
function FinanceLink({to,onNavigate,children}:{to:string;onNavigate:(path:string)=>void;children:ReactNode}){
 const click=(e:MouseEvent<HTMLAnchorElement>)=>{if(e.button!==0||e.metaKey||e.ctrlKey||e.altKey||e.shiftKey)return;e.preventDefault();onNavigate(to)};
 return <a className="sc-release-link" href={to} onClick={click}>{children}</a>;
}
export function SignalReleaseView({workspace,onNavigate}:{workspace:AcceptanceWorkspace;onNavigate:(path:string)=>void}){
 const [stage,setStage]=useState<ReleaseStage>("staging");
 const [refs,setRefs]=useState<readonly EvidenceReference[]>([]);
 const [draftId,setDraftId]=useState<EvidenceId>("rls"),[draftRef,setDraftRef]=useState(""),[reviewer,setReviewer]=useState(""),[date,setDate]=useState("");
 const [intakeError,setIntakeError]=useState<string|null>(null);
 const [showRaw,setShowRaw]=useState(false);
 const findings=analyzeFinanceSnapshot(workspace.snapshot),decision=decisionForStage(stage,workspace.snapshot,refs);
 const add=(e:FormEvent)=>{e.preventDefault();const next={id:draftId,reference:draftRef.trim(),reviewer:reviewer.trim(),date};
  const err=validateEvidenceReference(next);if(err){setIntakeError(err);return}
  setRefs(list=>[...list.filter(x=>x.id!==next.id),next]);setIntakeError(null);setDraftRef("");setReviewer("");setDate("");
 };
 const clear=()=>{workspace.clear();setRefs([]);setIntakeError(null)};
 return <div className="sc-release">
 <header className="sc-release-header"><div><span className="sc-eyebrow">Signal Current / Settings</span>
 <h1>Acceptance & release review</h1>
 <p>Read-only account evidence checks and independent release requirements. This page cannot authorize a merge, deployment or real-world financial release.</p></div>
 <div className="sc-release-actions"><FinanceButton disabled={workspace.state==="loading"} onClick={()=>void workspace.run()}>
 {workspace.state==="loading"?"Checking sources…":"Run read-only checks"}</FinanceButton>
 <FinanceButton variant="secondary" onClick={clear}>Clear local review</FinanceButton></div></header>
 <section className="sc-release-decision" aria-labelledby="release-gate-title"><div>
 <span className="sc-eyebrow">Independent release authority</span><h2 id="release-gate-title">NO-GO · release not authorized</h2>
 <p>All three decision stages remain default-denied. Source data, browser tests, typed references and successful previews cannot independently grant human authority.</p></div>
 <div className="sc-release-stage" role="group" aria-label="Decision stage">
 {stageNames.map(v=><button key={v.id} type="button" aria-pressed={stage===v.id} onClick={()=>setStage(v.id)}>{v.label}</button>)}</div>
 <div role="status" aria-live="polite" className="sc-release-decision-reasons"><strong>{stage} decision: {decision.status}</strong>
 {decision.reasons.map(r=><p key={r}>{r}</p>)}</div></section>
 <section className="sc-release-panel" aria-labelledby="release-health-title"><div className="sc-release-panel-head"><div><span className="sc-eyebrow">Authenticated source sample</span>
 <h2 id="release-health-title">Financial integrity checks</h2><p>Five independent dashboard read RPCs, sampled on demand under the current verified account identity. No initialization, commit, update or sync operation is called.</p></div>
 <span className="sc-release-tag">{workspace.state}</span></div>
 {workspace.error?<p role="alert">{workspace.error}</p>:null}
 {workspace.state==="unauthenticated"||workspace.state==="unconfigured"?<p role="status">Sign in to a configured Finance account to run read-only checks. No synthetic values are presented as live evidence.</p>:null}
 {workspace.lastCheckedAt?<p className="sc-release-meta">Sampled at {new Date(workspace.lastCheckedAt).toLocaleString("de-DE")}. Separate RPCs are not guaranteed to be one atomic bank snapshot.</p>:null}
 <div className="sc-release-sources">{domains.map(d=><div key={d} className="sc-release-source"><strong>{d}</strong><span>{workspace.snapshot[d].state==="success"?"Read completed":workspace.snapshot[d].state==="error"?"Source unavailable":"Not sampled"}</span></div>)}</div>
 <div className="sc-release-findings">{findings.map(f=><div key={f.id} className="sc-release-finding">
 <span className={"sc-release-finding-kind is-"+f.kind}>{f.kind}</span><div><strong>{f.headline}</strong><p>{f.detail}</p><small>Sources: {f.source.join(" / ")}</small></div>
 <FinanceLink to={f.destination} onNavigate={onNavigate}>Investigate →</FinanceLink></div>)}</div>
 <button type="button" className="sc-release-text-button" aria-expanded={showRaw} onClick={()=>setShowRaw(v=>!v)}>{showRaw?"Hide check definitions":"Show what is and is not checked"}</button>
 {showRaw?<p className="sc-release-meta">Automated checks cover source availability, currency agreement, integer minor units, wealth balance equation, savings/valuation bridge, recurring subscription subset, transfer classification and import exception counts. They do not prove bank statement authenticity, immutable independent evidence, complete duplicate detection, real-user RLS, reconciled timing across distinct RPCs, physical accessibility or release authorization.</p>:null}
 </section>
 <section className="sc-release-panel" aria-labelledby="release-witness-title"><div className="sc-release-panel-head"><div><span className="sc-eyebrow">External independent acceptance</span>
 <h2 id="release-witness-title">Witness custody and physical-device intake</h2>
 <p>References entered below are untrusted leads for independent human review, never verified signatures, completed attestation or persisted approvals.</p></div>
 <span className="sc-release-tag">All approvals open</span></div>
 <div className="sc-release-evidence">{releaseEvidenceRequirements.map(e=><article key={e.id}>
 <div><strong>{e.label}</strong><p>{e.detail}</p></div>
 <span>{refs.some(r=>r.id===e.id)?"Reference entered · unverified":"Evidence required"}</span></article>)}</div>
 <form className="sc-release-reference" onSubmit={add} aria-label="Unverified witness reference intake">
 <h3>Register an unverified review lead</h3>
 <div className="sc-release-fields">
 <label>Required evidence<select value={draftId} onChange={e=>setDraftId(e.currentTarget.value as EvidenceId)}>
 {releaseEvidenceRequirements.map(e=><option key={e.id} value={e.id}>{e.label}</option>)}</select></label>
 <label>HTTPS evidence URL or SHA-256<input aria-label="Evidence reference" value={draftRef} maxLength={180} onChange={e=>setDraftRef(e.currentTarget.value)} placeholder="sha256:…"/></label>
 <label>Reviewer designation<input aria-label="Reviewer designation" maxLength={80} value={reviewer} onChange={e=>setReviewer(e.currentTarget.value)} placeholder="Independent reviewer"/></label>
 <label>Reference date<input aria-label="Reference date" type="date" value={date} onChange={e=>setDate(e.currentTarget.value)}/></label></div>
 {intakeError?<p role="alert" className="sc-release-error">{intakeError}</p>:null}
 <div className="sc-release-actions"><FinanceButton type="submit" variant="secondary">Add unverified reference</FinanceButton>
 <FinanceButton variant="quiet" type="button" disabled={!refs.length} onClick={()=>setRefs([])}>Discard references</FinanceButton></div></form>
 {refs.length?<div className="sc-release-reference-list"><h3>Session-only, independently unverified leads</h3>
 {refs.map(r=><div key={r.id}><strong>{r.id}</strong><span>{r.reference}</span><small>{r.reviewer} · {r.date} · NOT APPROVED</small>
 <button type="button" onClick={()=>setRefs(list=>list.filter(a=>a.id!==r.id))}>Remove</button></div>)}</div>:null}
 <p className="sc-release-meta">No references or financial results are persisted, submitted to servers, exported or promoted to authority. External attestor keys, signatures, organization control and revocations must be independently verified outside this app.</p></section>
 <section className="sc-release-panel" aria-labelledby="release-journeys-title"><div className="sc-release-panel-head"><div><span className="sc-eyebrow">Recovery & usability review</span><h2 id="release-journeys-title">Cross-workspace review journeys</h2>
 <p>Open the existing authenticated screens to inspect real source details, safe back-navigation and recovery states. Opening these links is not a sign-off.</p></div></div>
 <nav className="sc-release-journeys" aria-label="Finance review journeys">{links.map(l=><FinanceLink key={l.to} to={l.to} onNavigate={onNavigate}>{l.label} →</FinanceLink>)}</nav>
 <p className="sc-release-meta">Real Android Chrome/Samsung Internet, iOS Safari/PWA, NVDA, TalkBack, VoiceOver, keyboard navigation, offline/reconnect and previous-stable restore need separate physical or independently witnessed evidence.</p></section>
 </div>;
}
export function SignalReleaseReviewPage({onNavigate}:{onNavigate:(p:string)=>void}){
 const workspace=useFinanceAcceptance();return <SignalReleaseView workspace={workspace} onNavigate={onNavigate}/>;
}
