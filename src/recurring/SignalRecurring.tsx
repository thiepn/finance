import {useState,type MouseEvent,type ReactNode} from "react";
import type {RecurringDashboard,RecurringDetectionResult,RecurringDetectionCandidate,RecurringPattern,RecurringStatus} from "../domain/recurring.js";
import type {RecurringWorkspace} from "./use-recurring.js";
import {useRecurringWorkspace} from "./use-recurring.js";
import {FinanceButton,FinancialState,DataProvenance} from "../ui/v2/SignalCurrent.js";
import {formatSignalMoney} from "../ui/v2/finance-presentation.js";
import {activityTransactionPath,alerts,candidateEligible,displayDate,expectedCharges,merchantRecurringPath,percentChange,profileAmount,recurringFilter,safeMonthlySummary,statusChangeAllowed,type RecurringFilter} from "./signal-recurring-model.js";
import "./signal-recurring.css";
function Navigation({href,onNavigate,children}:{href:string|null;onNavigate:(path:string)=>void;children:ReactNode}){
 const click=(event:MouseEvent<HTMLAnchorElement>)=>{if(event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||!href)return;event.preventDefault();onNavigate(href);};
 return href?<a className="sc-recurring-link" href={href} onClick={click}>{children}</a>:<span className="sc-recurring-unavailable">{children}</span>;
}
function Money({value,currency,locale}:{value:number|null;currency:string;locale:string}){
 return <span className="sc-recurring-money">{value===null?"Unavailable":formatSignalMoney(value,currency,locale)}</span>;
}
function History({dashboard,onNavigate}:{dashboard:RecurringDashboard;onNavigate:(path:string)=>void}){
 const [showTable,setShowTable]=useState(false);
 const {profile,trend}=dashboard;
 const max=Math.max(1,...trend.map(v=>Math.max(0,v.expenseMinor)));
 return <section className="sc-recurring-panel" aria-labelledby="recurring-trend-title">
 <div className="sc-recurring-panel-heading"><div><span className="sc-eyebrow">Posted evidence</span>
 <h2 id="recurring-trend-title">Recurring expense history</h2><p>Monthly posted transactions linked to recurring patterns. Subscription spending is a subset, not an additional total.</p></div>
 <button className="sc-recurring-text-button" aria-expanded={showTable} type="button" onClick={()=>setShowTable(v=>!v)}>{showTable?"Hide values":"View table"}</button></div>
 {trend.length?<div className="sc-recurring-bars" role="img" aria-label="Monthly recurring expense bars with subscription subset, exact values available in table">
 {trend.map(row=><div className="sc-recurring-bar" key={row.monthStart} title={row.monthStart}>
  <div className="sc-recurring-bar-track"><div className="sc-recurring-bar-total" style={{height:Math.max(0,Math.min(100,row.expenseMinor/max*100))+"%"}}/>
  <div className="sc-recurring-bar-subset" style={{height:Math.max(0,Math.min(100,row.subscriptionMinor/max*100))+"%"}}/></div>
  <span>{row.monthStart.slice(5)}</span></div>)}</div>:<p className="sc-recurring-muted">No linked posted history in this period.</p>}
 {showTable?<div className="sc-recurring-table-scroll" role="region" tabIndex={0} aria-label="Recurring chart data">
 <table><caption>Backend posted recurring expenses — {profile.currencyCode}</caption><thead><tr><th scope="col">Month</th><th scope="col">Recurring expense</th><th scope="col">Of which subscriptions</th></tr></thead>
 <tbody>{trend.map(row=><tr key={row.monthStart}><th scope="row">{row.monthStart}</th>
 <td><Money value={row.expenseMinor} currency={profile.currencyCode} locale={profile.locale}/></td>
 <td><Money value={row.subscriptionMinor} currency={profile.currencyCode} locale={profile.locale}/></td></tr>)}</tbody></table></div>:null}
 <div className="sc-recurring-footrow"><DataProvenance source="posted"/><Navigation href="/activity" onNavigate={onNavigate}>Review posted Activity →</Navigation></div>
 </section>;
}
function RecurringItem({pattern,selected,onSelect,dashboard,onNavigate,workspace,onRequestedStatus}:{
 pattern:RecurringPattern;selected:boolean;onSelect:()=>void;dashboard:RecurringDashboard;onNavigate:(path:string)=>void;workspace:RecurringWorkspace;
 onRequestedStatus:(pattern:RecurringPattern,status:RecurringStatus)=>void;
}){
 const {profile}=dashboard,compatible=pattern.currencyCode===profile.currencyCode;
 const busy=workspace.busyKey!==null;
 return <article className="sc-recurring-item">
 <button className="sc-recurring-item-heading" aria-expanded={selected} type="button" onClick={onSelect}>
 <span className="sc-recurring-item-title"><strong>{pattern.name}</strong>
 <small>{pattern.merchantName??"Unassigned merchant"} · {pattern.cadence??"Unscheduled"} · {pattern.status}</small></span>
 <span className="sc-recurring-item-total"><Money value={compatible?pattern.monthlyEquivalentMinor:null} currency={profile.currencyCode} locale={profile.locale}/><small>monthly equivalent</small></span>
 <span aria-hidden="true">{selected?"−":"+"}</span></button>
 {selected?<div className="sc-recurring-item-detail">
 <div className="sc-recurring-detail-grid">
 <div><span>Status</span><strong>{pattern.health.replaceAll("_"," ")}</strong></div>
 <div><span>Next expected</span><strong>{pattern.nextExpectedAt?displayDate(pattern.nextExpectedAt,profile.locale,profile.timeZone):"Unscheduled"}</strong></div>
 <div><span>Annualized run rate</span><strong><Money value={compatible?pattern.annualizedMinor:null} currency={profile.currencyCode} locale={profile.locale}/></strong></div>
 <div><span>Observed last charge</span><strong><Money value={compatible?pattern.latestAmountMinor:null} currency={profile.currencyCode} locale={profile.locale}/></strong></div>
 <div><span>Price movement</span><strong>{pattern.priceChangeMinor===null?"No history":<Money value={compatible?pattern.priceChangeMinor:null} currency={profile.currencyCode} locale={profile.locale}/>}</strong></div>
 <div><span>Price comparison</span><strong>{percentChange(pattern.priceChangeRatio,profile.locale)}</strong></div>
 </div>
 {pattern.subscription?<p className="sc-recurring-caption">Subscription: {pattern.subscription.name}. Frequency: {pattern.subscription.billingFrequency}. No cancellation is inferred from an unmatched charge.</p>:null}
 <p className="sc-recurring-caption">Source: {pattern.source} · {pattern.occurrenceCount} matched posted occurrences · not a bank authorization or confirmed future debit.</p>
 <div className="sc-recurring-detail-actions">
 <Navigation href={activityTransactionPath(pattern.latestTransactionId)} onNavigate={onNavigate}>Latest transaction</Navigation>
 <Navigation href={merchantRecurringPath(pattern.merchantId)} onNavigate={onNavigate}>Merchant spending</Navigation>
 <Navigation href="/plan" onNavigate={onNavigate}>Budget</Navigation>
 {statusChangeAllowed(pattern,"paused")?<FinanceButton variant="secondary" disabled={busy} onClick={()=>onRequestedStatus(pattern,"paused")}>Pause pattern</FinanceButton>:null}
 {statusChangeAllowed(pattern,"active")?<FinanceButton variant="secondary" disabled={busy} onClick={()=>onRequestedStatus(pattern,"active")}>Resume pattern</FinanceButton>:null}
 </div>
 {pattern.recentOccurrences.length?<div className="sc-recurring-table-scroll" role="region" tabIndex={0} aria-label={"Linked transactions for "+pattern.name}>
 <table><caption>Matched posted transaction evidence</caption><thead><tr><th scope="col">Date</th><th scope="col">Amount</th><th scope="col">Source</th><th scope="col">Record</th></tr></thead>
 <tbody>{pattern.recentOccurrences.map(row=><tr key={row.transactionId}><th scope="row">{displayDate(row.occurredAt,profile.locale,profile.timeZone)}</th>
 <td><Money value={compatible?row.amountMinor:null} currency={profile.currencyCode} locale={profile.locale}/></td>
 <td>{row.matchSource}</td><td><Navigation href={activityTransactionPath(row.transactionId)} onNavigate={onNavigate}>View posted entry</Navigation></td></tr>)}</tbody></table></div>:<p className="sc-recurring-muted">No linked occurrence records in this response.</p>}
 </div>:null}
 </article>;
}
export function SignalRecurringView({dashboard,detection,workspace,onNavigate}:{
 dashboard:RecurringDashboard;detection:RecurringDetectionResult;workspace:RecurringWorkspace;onNavigate:(path:string)=>void;
}){
 const [filter,setFilter]=useState<RecurringFilter>("all");
 const [selected,setSelected]=useState<string|null>(null);
 const [pendingStatus,setPendingStatus]=useState<{pattern:RecurringPattern;target:RecurringStatus}|null>(null);
 const [pendingCandidate,setPendingCandidate]=useState<RecurringDetectionCandidate|null>(null);
 const [candidateType,setCandidateType]=useState<"subscription"|"recurring">("recurring");
 const [confirmEvidence,setConfirmEvidence]=useState(false);
 const [syncReview,setSyncReview]=useState(false);
 const {profile,summary}=dashboard;const money=safeMonthlySummary(dashboard);
 const all=recurringFilter(dashboard.patterns,filter),attention=alerts(dashboard),upcoming=expectedCharges(dashboard);
 const goPattern=(id:string)=>{setSelected(id);document.getElementById("recurring-patterns")?.scrollIntoView({behavior:"smooth",block:"start"});};
 return <div className="sc-recurring" aria-label="Recurring commitments">
 <header className="sc-recurring-header"><div><span className="sc-eyebrow">Signal Current / Plan</span><h1>Recurring & commitments</h1>
 <p>Track scheduled obligations and observed posted charges without counting the same ledger transaction twice.</p></div>
 <div className="sc-recurring-header-actions"><FinanceButton variant="secondary" onClick={()=>onNavigate("/plan")}>Open budget</FinanceButton>
 <FinanceButton variant="secondary" disabled={workspace.busyKey!==null} onClick={()=>void workspace.refresh()}>Refresh read-only</FinanceButton></div></header>
 {workspace.actionError?<p className="sc-recurring-action-error" role="alert">Action failed: {workspace.actionError}. No successful change is assumed.</p>:null}
 <section className="sc-recurring-metrics" aria-label="Recurring exposure">
 <div className="sc-recurring-metric sc-recurring-metric--primary"><span>Monthly recurring expenses</span><strong><Money value={money.monthlyExpense} currency={profile.currencyCode} locale={profile.locale}/></strong><small>Backend normalized active-expense run rate</small><DataProvenance source="derived"/></div>
 <div className="sc-recurring-metric"><span>Annualized exposure</span><strong><Money value={money.annualized} currency={profile.currencyCode} locale={profile.locale}/></strong><small>Run rate, not a payment forecast</small><DataProvenance source="derived"/></div>
 <div className="sc-recurring-metric"><span>Subscription portion</span><strong><Money value={money.subscription} currency={profile.currencyCode} locale={profile.locale}/></strong><small>{summary.subscriptionCount} tracked subscriptions · included above</small><DataProvenance source="derived"/></div>
 <div className="sc-recurring-metric"><span>Next 30 days · expected</span><strong><Money value={money.next30} currency={profile.currencyCode} locale={profile.locale}/></strong><small>{summary.next30dCount} anticipated recurring expenses</small><DataProvenance source="derived"/></div>
 </section>
 <div className="sc-recurring-overview"><span>{summary.activeCount} active patterns</span><span>{summary.missingCount} missing expectations</span><span>{summary.priceIncreaseCount} price increases</span><span>3-month run-rate change: {percentChange(summary.creepDeltaRatio,profile.locale)}</span></div>
 <History dashboard={dashboard} onNavigate={onNavigate}/>
 <div className="sc-recurring-two-columns">
 <section className="sc-recurring-panel" aria-labelledby="recurring-alert-title"><div className="sc-recurring-panel-heading"><div><span className="sc-eyebrow">Reconciliation</span>
 <h2 id="recurring-alert-title">Requires attention</h2><p>Missing and late are expected-match alerts, not proof of an unpaid charge.</p></div></div>
 {attention.length?attention.map((item,i)=><button className="sc-recurring-alert" type="button" key={item.patternId+"-"+item.kind+"-"+i} onClick={()=>goPattern(item.patternId)}>
 <span className={"sc-recurring-alert-kind sc-recurring-alert-kind--"+item.severity}>{item.kind.replaceAll("_"," ")}</span>
 <span><strong>{item.title}</strong><small>{item.detail}</small></span>
 <span>{item.changeMinor!==null?<Money value={item.changeMinor} currency={profile.currencyCode} locale={profile.locale}/>:item.expectedAt?displayDate(item.expectedAt,profile.locale,profile.timeZone):"Review"}</span></button>):
 <p className="sc-recurring-muted">No missing, late or price-change alerts from the recurring RPC.</p>}
 </section>
 <section className="sc-recurring-panel" aria-labelledby="recurring-next-title"><div className="sc-recurring-panel-heading"><div><span className="sc-eyebrow">Deterministic outlook</span>
 <h2 id="recurring-next-title">Upcoming expenses</h2><p>Expected events for the next {dashboard.horizonDays} days; not confirmed bank debits.</p></div></div>
 {upcoming.length?upcoming.map((item,i)=><button key={item.patternId+"-"+i} type="button" className="sc-recurring-next" onClick={()=>goPattern(item.patternId)}>
 <span><strong>{item.name}</strong><small>{displayDate(item.nextExpectedAt,profile.locale,profile.timeZone)} · {item.merchantName??"No merchant"}</small></span>
 <span><Money value={profileAmount(item.amountMinor,item.currencyCode,profile.currencyCode)} currency={profile.currencyCode} locale={profile.locale}/><small>{item.health.replaceAll("_"," ")}</small></span></button>):
 <p className="sc-recurring-muted">No upcoming expense-pattern predictions for this horizon. Income and transfers are not included.</p>}
 </section></div>
 <section className="sc-recurring-panel" id="recurring-patterns" aria-labelledby="recurring-list-title">
 <div className="sc-recurring-panel-heading"><div><span className="sc-eyebrow">Confirmed patterns</span><h2 id="recurring-list-title">Commitments</h2>
 <p>Account-scoped recurring patterns, derived from historical transactions.</p></div></div>
 <div className="sc-recurring-filters" role="group" aria-label="Filter recurring commitments">
 {(["all","subscriptions","expenses","attention","paused"] as const).map(v=><button type="button" key={v} aria-pressed={filter===v} onClick={()=>setFilter(v)}>{v[0]!.toUpperCase()+v.slice(1)}</button>)}</div>
 {all.length?all.map(p=><RecurringItem key={p.patternId} pattern={p} selected={selected===p.patternId} onSelect={()=>setSelected(selected===p.patternId?null:p.patternId)}
 dashboard={dashboard} onNavigate={onNavigate} workspace={workspace} onRequestedStatus={(pattern,target)=>setPendingStatus({pattern,target})}/>):
 <p className="sc-recurring-muted">No recurring patterns in this filter. No spending or forecast is inferred.</p>}
 {pendingStatus?<div className="sc-recurring-confirm" role="group" aria-label="Confirm recurring status">
 <strong>{pendingStatus.target==="paused"?"Pause":"Resume"} “{pendingStatus.pattern.name}”?</strong>
 <p>This updates recurring-pattern tracking, not the bank subscription or your posted transaction history.</p>
 <div className="sc-recurring-actions"><FinanceButton disabled={workspace.busyKey!==null} onClick={()=>{void workspace.setPatternStatus(pendingStatus.pattern.patternId,pendingStatus.target);setPendingStatus(null)}}>Confirm change</FinanceButton>
 <FinanceButton variant="secondary" onClick={()=>setPendingStatus(null)}>Cancel</FinanceButton></div></div>:null}
 </section>
 <section className="sc-recurring-panel" aria-labelledby="recurring-detect-title"><div className="sc-recurring-panel-heading"><div><span className="sc-eyebrow">Unconfirmed suggestions</span>
 <h2 id="recurring-detect-title">Review detected patterns</h2><p>Suggestions are not active subscriptions until you explicitly confirm them.</p></div></div>
 {detection.candidates.length?detection.candidates.map(c=><div className="sc-recurring-candidate" key={c.candidateId}>
 <div><strong>{c.name}</strong><small>{c.occurrenceCount} historical charges · {(c.confidence*100).toFixed(0)}% algorithm confidence · {c.cadence}</small>
 <small>Monthly equivalent: <Money value={profileAmount(c.monthlyEquivalentMinor,c.currencyCode,profile.currencyCode)} currency={profile.currencyCode} locale={profile.locale}/></small>
 <span className="sc-recurring-inline-links">{c.transactionIds.slice(0,4).map((id,index)=><Navigation key={id+"-"+index} href={activityTransactionPath(id)} onNavigate={onNavigate}>Source {index+1}</Navigation>)}</span></div>
 <FinanceButton disabled={!candidateEligible(c,profile.currencyCode)||workspace.busyKey!==null} variant="secondary" onClick={()=>{setPendingCandidate(c);setConfirmEvidence(false);setCandidateType(c.subscriptionLikely?"subscription":"recurring")}}>Review suggestion</FinanceButton>
 </div>):<p className="sc-recurring-muted">No additional recurring candidates. No new patterns have been created.</p>}
 {pendingCandidate?<div className="sc-recurring-confirm" role="group" aria-label="Confirm new recurring pattern"><h3>Confirm “{pendingCandidate.name}”</h3>
 <p>Creation links historical posted transactions to a new recurring pattern. It does not authorize a bank charge or cancel a subscription.</p>
 <div className="sc-recurring-actions" role="group" aria-label="Classification of candidate">
 <label><input type="radio" name="recurring-kind" checked={candidateType==="recurring"} onChange={()=>setCandidateType("recurring")}/> Recurring payment</label>
 <label><input type="radio" name="recurring-kind" checked={candidateType==="subscription"} onChange={()=>setCandidateType("subscription")}/> Subscription</label></div>
 <label className="sc-recurring-check"><input type="checkbox" checked={confirmEvidence} onChange={e=>setConfirmEvidence(e.currentTarget.checked)}/> I reviewed the source transactions and want to link this pattern.</label>
 <div className="sc-recurring-actions"><FinanceButton disabled={!confirmEvidence||workspace.busyKey!==null} onClick={()=>{void workspace.confirmCandidate(pendingCandidate,candidateType==="subscription");setPendingCandidate(null);setConfirmEvidence(false)}}>Confirm pattern</FinanceButton>
 <FinanceButton variant="secondary" onClick={()=>setPendingCandidate(null)}>Cancel</FinanceButton></div></div>:null}
 </section>
 <section className="sc-recurring-panel sc-recurring-reconcile"><div><h2>Reconcile existing matches</h2>
 <p>The matching RPC can link posted transactions to recurring patterns. Opening and refreshing this page never runs that write operation.</p></div>
 {!syncReview?<FinanceButton variant="secondary" disabled={workspace.busyKey!==null} onClick={()=>setSyncReview(true)}>Review reconciliation</FinanceButton>:
 <div className="sc-recurring-confirm" role="group" aria-label="Confirm transaction linking"><strong>Run recurring transaction matching?</strong>
 <p>This may create or update recurring occurrence associations in your account. The posted ledger amounts are not changed.</p>
 <div className="sc-recurring-actions"><FinanceButton disabled={workspace.busyKey!==null} onClick={()=>{setSyncReview(false);void workspace.syncPatterns()}}>Confirm reconciliation</FinanceButton>
 <FinanceButton variant="secondary" onClick={()=>setSyncReview(false)}>Cancel</FinanceButton></div></div>}
 </section>
 <p className="sc-recurring-disclaimer">Data source: authenticated recurring Finance RPCs. Scheduled commitments are forecasts, not posted charges; subscription totals are included in recurring expenses. This page never charges or cancels services.</p>
 </div>;
}
export function SignalRecurringPage({onNavigate}:{onNavigate:(path:string)=>void}){
 const workspace=useRecurringWorkspace();
 if(workspace.state==="loading")return <FinancialState kind="loading" title="Loading commitments" description="Reading account-scoped recurring evidence without synchronizing transactions."/>;
 if(workspace.state!=="ready"||!workspace.dashboard||!workspace.detection)return <FinancialState kind={workspace.state==="error"?"error":workspace.state==="unauthenticated"?"sign-in":"empty"}
 title="Recurring data unavailable" description={workspace.state==="error"?"The recurring workspace could not load; no records were modified.":"A configured and authenticated Finance session is required."}
 primaryAction={workspace.state==="error"?{label:"Retry",onClick:()=>void workspace.refresh()}:undefined}/>;
 return <SignalRecurringView dashboard={workspace.dashboard} detection={workspace.detection} workspace={workspace} onNavigate={onNavigate}/>;
}
