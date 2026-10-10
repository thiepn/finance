import {useEffect,useState,type MouseEvent,type ReactNode} from "react";
import type {AccountKind} from "../domain/finance.js";
import type {NetWorthDashboard,WealthAccount,AccountWealthHistory,WealthRangeMonths} from "../domain/wealth.js";
import {useWealthWorkspace,type WealthWorkspace} from "./use-wealth.js";
import {FinanceButton,FinancialState,DataProvenance} from "../ui/v2/SignalCurrent.js";
import {formatSignalMoney} from "../ui/v2/finance-presentation.js";
import {accountActivityPath,accountGroups,accountNativeBalance,accountPath,balanceProvenance,bridgeReconciles,displayReportingBalance,historyForAccount,safeHistory,safeMinor,validObservationMinor,validRate} from "./signal-wealth-model.js";
import "./signal-wealth.css";
const choices:readonly WealthRangeMonths[]=[12,24,60];
const kinds:readonly AccountKind[]=["checking","savings","cash","credit_card","paypal","prepaid","gift_card","investment","loan","other"];
function Link({href,onNavigate,children}:{href:string|null;onNavigate:(path:string)=>void;children:ReactNode}){
 const click=(event:MouseEvent<HTMLAnchorElement>)=>{if(event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||!href)return;event.preventDefault();onNavigate(href);};
 return href?<a className="sc-wealth-link" href={href} onClick={click}>{children}</a>:<span className="sc-wealth-unavailable">{children}</span>;
}
function Money({amount,currency,locale}:{amount:number|null;currency:string;locale:string}){
 return <span className="sc-wealth-money">{amount===null?"Unavailable":formatSignalMoney(amount,currency,locale)}</span>;
}
function History({dashboard,accountHistory,selectedId,onNavigate}:{dashboard:NetWorthDashboard;accountHistory:AccountWealthHistory|null;selectedId:string|null;onNavigate:(path:string)=>void}){
 const [table,setTable]=useState(false),{profile}=dashboard;
 const single=selectedId!==null;
 const points=single?historyForAccount(accountHistory,selectedId,profile.currencyCode).map(p=>({date:p.date,value:p.reportingBalanceMinor})):
 safeHistory(dashboard).map(p=>({date:p.date,value:p.netWorthMinor}));
 const range=Math.max(1,...points.map(x=>Math.abs(x.value)));
 return <section className="sc-wealth-panel" aria-labelledby="wealth-history-title">
 <div className="sc-wealth-panel-head"><div><span className="sc-eyebrow">Reporting-currency history</span><h2 id="wealth-history-title">{single?"Account balance history":"Net worth history"}</h2>
 <p>{single?"Recorded observations with subsequent ledger movements; not historical available cash.":"Month-end net asset positions returned by Finance; not a forecast or bank statement."}</p></div>
 <button type="button" className="sc-wealth-text-button" aria-expanded={table} onClick={()=>setTable(x=>!x)}>{table?"Hide values":"View data table"}</button></div>
 {points.length?<div className="sc-wealth-bars" role="img" aria-label="Historical account or net-worth balances; exact values available in data table">
 {points.map(p=><div className="sc-wealth-bar" key={p.date}><div className="sc-wealth-bar-track"><div className={"sc-wealth-bar-fill"+(p.value<0?" is-negative":"")} style={{height:Math.max(0,Math.min(100,Math.abs(p.value)/range*100))+"%"}}/></div><span>{p.date.slice(2,7)}</span></div>)}
 </div>:<p className="sc-wealth-muted">No valid historical observations in the selected period.</p>}
 {table?<div className="sc-wealth-table-scroll" role="region" tabIndex={0} aria-label="Wealth history table"><table><caption>Backend reported {single?"balance":"net worth"} — {profile.currencyCode}</caption>
 <thead><tr><th scope="col">Date</th><th scope="col">Reported value</th></tr></thead>
 <tbody>{points.map(p=><tr key={p.date}><th scope="row">{p.date}</th><td><Money amount={safeMinor(p.value)} currency={profile.currencyCode} locale={profile.locale}/></td></tr>)}</tbody></table></div>:null}
 <div className="sc-wealth-history-foot"><DataProvenance source="valuation"/><Link href="/activity" onNavigate={onNavigate}>Review posted Activity →</Link></div>
 </section>;
}
function AccountEditor({account,dashboard,workspace,onNavigate}:{account:WealthAccount;dashboard:NetWorthDashboard;workspace:WealthWorkspace;onNavigate:(path:string)=>void}){
 const [amount,setAmount]=useState(""),[exchange,setExchange]=useState(""),[note,setNote]=useState(""),[source,setSource]=useState<"manual"|"statement"|"market">("manual");
 const [review,setReview]=useState(false),[inclusionReview,setInclusionReview]=useState<boolean|null>(null);
 const [archiveReview,setArchiveReview]=useState(false);
 const currency=dashboard.profile.currencyCode;
 const foreign=account.currencyCode!==currency;
 const parsed=validObservationMinor(amount,account.currencyCode);
 const rate=foreign?validRate(exchange):null;
 const eligible=parsed!==null&&(!foreign||rate!==null)&&note.length<=400;
 const pending=workspace.busyKey!==null;
 const record=()=>{if(!eligible||parsed===null)return;setReview(false);
 void workspace.recordObservation({accountId:account.accountId,balanceMinor:parsed,source, ...(foreign?{exchangeRate:rate!}:{}),...(note.trim()?{note:note.trim()}: {})});
 };
 return <div className="sc-wealth-editor">
 <h3>Account adjustments</h3><p>These actions update your Finance records, not a bank account. New observations anchor valuation and do not create income or transactions.</p>
 <div className="sc-wealth-editor-row"><div><strong>Include in net worth</strong><small>{account.includeInNetWorth?"Included":"Excluded"} · does not archive or delete posted transactions.</small></div>
 <FinanceButton disabled={pending} variant="secondary" onClick={()=>setInclusionReview(!account.includeInNetWorth)}>{account.includeInNetWorth?"Review exclusion":"Review inclusion"}</FinanceButton></div>
 {inclusionReview!==null?<div className="sc-wealth-confirm" role="group" aria-label="Confirm net worth inclusion"><strong>{inclusionReview?"Include":"Exclude"} {account.name} in net worth?</strong>
 <p>Only the reporting balance sheet is affected; past ledger entries remain intact.</p>
 <div className="sc-wealth-actions"><FinanceButton disabled={pending} onClick={()=>{void workspace.setInclusion(account.accountId,inclusionReview);setInclusionReview(null)}}>Confirm change</FinanceButton>
 <FinanceButton variant="secondary" onClick={()=>setInclusionReview(null)}>Cancel</FinanceButton></div></div>:null}
 <form className="sc-wealth-observation" onSubmit={e=>{e.preventDefault();if(eligible)setReview(true)}}>
 <h3>Record a balance observation</h3><label>Observed balance in {account.currencyCode}<input aria-label="Observed balance" inputMode="decimal" value={amount} placeholder="0.00" onChange={e=>{setAmount(e.currentTarget.value);setReview(false)}}/></label>
 <label>Evidence source<select aria-label="Evidence source" value={source} onChange={e=>setSource(e.currentTarget.value as typeof source)}><option value="manual">Manual observation</option><option value="statement">Account statement</option><option value="market">Market valuation</option></select></label>
 {foreign?<label>Reporting exchange rate · 1 {account.currencyCode} in {currency}<input aria-label="Reporting exchange rate" inputMode="decimal" value={exchange} onChange={e=>{setExchange(e.currentTarget.value);setReview(false)}} placeholder="Required for foreign balance"/></label>:null}
 <label>Evidence note (optional)<input aria-label="Evidence note" maxLength={400} value={note} onChange={e=>setNote(e.currentTarget.value)}/></label>
 <p className="sc-wealth-muted">Only actual observed amounts; no automatic FX market quote. The backend will handle reporting conversion using your submitted rate.</p>
 <FinanceButton disabled={!eligible||pending} type="submit">Review observation</FinanceButton></form>
 {review&&eligible?<div className="sc-wealth-confirm" role="group" aria-label="Confirm balance observation"><strong>Save {formatSignalMoney(parsed!,account.currencyCode,dashboard.profile.locale)} observation?</strong>
 <p>Evidence: {source}. {foreign?"Reporting exchange rate "+exchange+". ":""}This anchors the account history, not income.</p>
 <div className="sc-wealth-actions"><FinanceButton disabled={pending} onClick={record}>Confirm observation</FinanceButton><FinanceButton variant="secondary" onClick={()=>setReview(false)}>Cancel</FinanceButton></div></div>:null}
 <div className="sc-wealth-editor-row"><div><strong>{account.isArchived?"Restore account":"Archive account"}</strong><small>Archive visibility only; do not delete recorded ledger activity.</small></div>
 <FinanceButton variant="secondary" disabled={pending} onClick={()=>setArchiveReview(true)}>Review {account.isArchived?"restore":"archive"}</FinanceButton></div>
 {archiveReview?<div className="sc-wealth-confirm" role="group" aria-label="Confirm account archive"><strong>{account.isArchived?"Restore":"Archive"} {account.name}?</strong>
 <div className="sc-wealth-actions"><FinanceButton disabled={pending} onClick={()=>{void (account.isArchived?workspace.restoreAccount(account.accountId):workspace.archiveAccount(account.accountId));setArchiveReview(false)}}>Confirm</FinanceButton>
 <FinanceButton variant="secondary" onClick={()=>setArchiveReview(false)}>Cancel</FinanceButton></div></div>:null}
 <Link href={accountActivityPath(account.accountId)} onNavigate={onNavigate}>View account transaction evidence →</Link>
 </div>;
}
function AccountCard({account,dashboard,onNavigate,selected}:{account:WealthAccount;dashboard:NetWorthDashboard;onNavigate:(path:string)=>void;selected:boolean}){
 const {profile}=dashboard,reporting=displayReportingBalance(account,profile.currencyCode),native=accountNativeBalance(account);
 return <article className={"sc-wealth-account"+(selected?" is-selected":"")}><div className="sc-wealth-account-head">
 <div><strong>{account.name}</strong><small>{account.institutionName??"Independent account"} · {account.kind.replaceAll("_"," ")}{account.accountLast4?" · •••• "+account.accountLast4:""}</small>
 <small>{account.position==="liability"?"Liability":"Asset"} · {account.includeInNetWorth?"Included":"Excluded"}{account.isArchived?" · archived":""}</small></div>
 <span><Money amount={reporting} currency={profile.currencyCode} locale={profile.locale}/><small>Reporting {account.position==="liability"?"debt":"balance"}</small></span></div>
 <div className="sc-wealth-account-extra"><small>{balanceProvenance(account)}{account.observationAt?" · "+account.observationAt.slice(0,10):""}</small>
 {account.currencyCode!==profile.currencyCode?<small>Original currency: <Money amount={native} currency={account.currencyCode} locale={profile.locale}/> · No implied conversion without a qualified observation</small>:null}</div>
 <Link href={accountPath(account.accountId)} onNavigate={onNavigate}>{selected?"Selected account":"Open account details →"}</Link></article>;
}
export function SignalWealthView({dashboard,workspace,mode,selectedAccountId,range,onRange,onNavigate}:{dashboard:NetWorthDashboard;workspace:WealthWorkspace;mode:"accounts"|"net-worth"|"detail";selectedAccountId:string|null;range:WealthRangeMonths;onRange:(v:WealthRangeMonths)=>void;onNavigate:(path:string)=>void}){
 const {profile,summary,savings,bridge}=dashboard;const groups=accountGroups(dashboard);
 const selected=selectedAccountId?dashboard.accounts.find(a=>a.accountId===selectedAccountId):null;
 const [createOpen,setCreateOpen]=useState(false),[createName,setCreateName]=useState(""),[createKind,setCreateKind]=useState<AccountKind>("checking"),[createReview,setCreateReview]=useState(false);
 const reconciles=bridgeReconciles(dashboard),busy=workspace.busyKey!==null;
 const create=()=>{if(createName.trim().length<2)return;void workspace.createAccount({name:createName.trim(),kind:createKind,currencyCode:profile.currencyCode,openingBalanceMinor:0,includeInNetWorth:true});setCreateReview(false);setCreateName("");setCreateOpen(false)};
 return <div className="sc-wealth"><header className="sc-wealth-header"><div><span className="sc-eyebrow">Signal Current / Wealth</span>
 <h1>{mode==="detail"?"Account detail":mode==="net-worth"?"Net worth":"Accounts"}</h1>
 <p>Reported balances, posted cash flows and observed valuations, each with distinct evidence.</p></div>
 <div className="sc-wealth-header-actions"><label>History range<select aria-label="History range" value={range} onChange={e=>onRange(Number(e.currentTarget.value) as WealthRangeMonths)}>
 {choices.map(v=><option value={v} key={v}>{v} months</option>)}</select></label>
 <FinanceButton variant="secondary" disabled={busy} onClick={()=>void workspace.refresh()}>Refresh</FinanceButton></div></header>
 <nav className="sc-wealth-nav" aria-label="Wealth navigation"><Link href="/wealth/accounts" onNavigate={onNavigate}>Accounts</Link>
 <Link href="/wealth/net-worth" onNavigate={onNavigate}>Net worth</Link><Link href="/activity" onNavigate={onNavigate}>Activity</Link></nav>
 {workspace.actionError?<p role="alert" className="sc-wealth-error">Operation failed: {workspace.actionError}. No successful change is assumed.</p>:null}
 <section className="sc-wealth-metrics" aria-label="Balance sheet overview">
 <div><span>Reported net worth</span><strong><Money amount={safeMinor(summary.netWorthMinor)} currency={profile.currencyCode} locale={profile.locale}/></strong><DataProvenance source="valuation"/></div>
 <div><span>Assets</span><strong><Money amount={safeMinor(summary.assetsMinor)} currency={profile.currencyCode} locale={profile.locale}/></strong><small>Includes valued holdings, not necessarily liquid cash</small></div>
 <div><span>Liabilities</span><strong><Money amount={safeMinor(summary.liabilitiesMinor)} currency={profile.currencyCode} locale={profile.locale}/></strong><small>Debt and negative included balances</small></div>
 <div><span>Month-over-month</span><strong><Money amount={safeMinor(summary.monthChangeMinor)} currency={profile.currencyCode} locale={profile.locale}/></strong><small>Reported change · no cash implication</small></div>
 </section>
 <div className="sc-wealth-grid"><section className="sc-wealth-panel" aria-labelledby="wealth-groups-title"><div className="sc-wealth-panel-head"><div><span className="sc-eyebrow">Asset structure</span><h2 id="wealth-groups-title">Cash, holdings and debt</h2></div></div>
 <div className="sc-wealth-categories"><div><strong>{groups.cash.length}</strong><span>Cash-like accounts</span></div><div><strong>{groups.assets.length}</strong><span>Other asset accounts</span></div><div><strong>{groups.liabilities.length}</strong><span>Liabilities</span></div><div><strong>{groups.excluded.length}</strong><span>Excluded / archived</span></div></div>
 <p className="sc-wealth-muted">Accounts are grouped by recorded type and position. No available-cash total is inferred from investment values or debt.</p>
 {dashboard.composition.length?<div className="sc-wealth-table-scroll" role="region" tabIndex={0} aria-label="Balance sheet composition"><table><caption>Backend composition · {profile.currencyCode}</caption>
 <thead><tr><th scope="col">Account kind</th><th scope="col">Assets</th><th scope="col">Liabilities</th></tr></thead><tbody>
 {dashboard.composition.map(v=><tr key={v.kind}><th scope="row">{v.kind.replaceAll("_"," ")}</th><td><Money amount={safeMinor(v.assetMinor)} currency={profile.currencyCode} locale={profile.locale}/></td>
 <td><Money amount={safeMinor(v.liabilityMinor)} currency={profile.currencyCode} locale={profile.locale}/></td></tr>)}</tbody></table></div>:null}</section>
 <section className="sc-wealth-panel" aria-labelledby="wealth-bridge-title"><div className="sc-wealth-panel-head"><div><span className="sc-eyebrow">Reconciliation</span><h2 id="wealth-bridge-title">Why net worth moved</h2></div></div>
 <div className="sc-wealth-bridge"><div><span>Posted ledger savings</span><strong><Money amount={safeMinor(bridge.ledgerSavingsMinor)} currency={profile.currencyCode} locale={profile.locale}/></strong></div>
 <div><span>Valuation and other change</span><strong><Money amount={safeMinor(bridge.valuationAndOtherChangeMinor)} currency={profile.currencyCode} locale={profile.locale}/></strong></div>
 <div><span>Net worth change</span><strong><Money amount={safeMinor(bridge.netWorthChangeMinor)} currency={profile.currencyCode} locale={profile.locale}/></strong></div></div>
 <p className="sc-wealth-muted">{reconciles===true?"Backend bridge reconciles arithmetically.":reconciles===false?"Reported components disagree; do not interpret as reconciled.":"Bridge integrity unavailable."} Own-account transfers must not be interpreted as income or spending.</p>
 <DataProvenance source="posted"/></section></div>
 {mode==="detail"?selected?<><section className="sc-wealth-panel"><div className="sc-wealth-panel-head"><div><span className="sc-eyebrow">Authenticated account</span><h2>{selected.name}</h2></div></div>
 <AccountCard account={selected} dashboard={dashboard} onNavigate={onNavigate} selected/>
 <div className="sc-wealth-details"><span>Recorded balance basis: {balanceProvenance(selected)}</span><span>Last Activity: {selected.lastActivityAt?.slice(0,10)??"Not available"}</span>
 <span>Later reporting ledger movement: <Money amount={safeMinor(selected.reportingLedgerDeltaMinor)} currency={profile.currencyCode} locale={profile.locale}/></span></div>
 <AccountEditor key={selected.accountId} account={selected} dashboard={dashboard} workspace={workspace} onNavigate={onNavigate}/></section>
 <History dashboard={dashboard} accountHistory={workspace.accountHistory} selectedId={selected.accountId} onNavigate={onNavigate}/></>:
 <FinancialState kind="empty" title="Account not found" description="No account in the authenticated dashboard matches this protected route." primaryAction={{label:"Back to accounts",onClick:()=>onNavigate("/wealth/accounts")}}/>:
 <><History dashboard={dashboard} accountHistory={workspace.accountHistory} selectedId={null} onNavigate={onNavigate}/>
 <section className="sc-wealth-panel" aria-labelledby="wealth-accounts-title"><div className="sc-wealth-panel-head"><div><span className="sc-eyebrow">Account directory</span><h2 id="wealth-accounts-title">All tracked accounts</h2></div>
 {mode==="accounts"?<FinanceButton variant="secondary" onClick={()=>setCreateOpen(v=>!v)}>{createOpen?"Close":"Add account"}</FinanceButton>:<Link href="/wealth/accounts" onNavigate={onNavigate}>Manage accounts →</Link>}</div>
 {createOpen?<div className="sc-wealth-confirm"><h3>Create an account</h3><p>This creates a Finance account in {profile.currencyCode} with zero initial balance. Record any observed balance separately with evidence.</p>
 <label>Account name<input value={createName} aria-label="Account name" maxLength={100} onChange={e=>{setCreateName(e.currentTarget.value);setCreateReview(false)}}/></label>
 <label>Account type<select aria-label="Account type" value={createKind} onChange={e=>setCreateKind(e.currentTarget.value as AccountKind)}>{kinds.map(v=><option value={v} key={v}>{v.replaceAll("_"," ")}</option>)}</select></label>
 {createReview?<div className="sc-wealth-actions"><strong>Confirm creation of {createName.trim()}?</strong><FinanceButton disabled={busy} onClick={create}>Create account</FinanceButton><FinanceButton variant="secondary" onClick={()=>setCreateReview(false)}>Cancel</FinanceButton></div>:
 <FinanceButton disabled={busy||createName.trim().length<2} onClick={()=>setCreateReview(true)}>Review account creation</FinanceButton>}</div>:null}
 {dashboard.accounts.length?<div className="sc-wealth-account-list">{dashboard.accounts.map(a=><AccountCard key={a.accountId} account={a} dashboard={dashboard} onNavigate={onNavigate} selected={false}/>)}</div>:
 <p className="sc-wealth-muted">No accounts yet. Add your first account to start tracking your balance sheet.</p>}
 </section>
 {mode==="net-worth"&&dashboard.investmentBridges.length?<section className="sc-wealth-panel"><div className="sc-wealth-panel-head"><h2>Investment value bridges</h2></div>
 {dashboard.investmentBridges.map(b=><div className="sc-wealth-bridge-row" key={b.accountId}><strong>{b.name}</strong><small>Net posted transaction flow <Money amount={safeMinor(b.netTransactionFlowMinor)} currency={b.currencyCode} locale={profile.locale}/></small>
 <small>Residual valuation/other change <Money amount={safeMinor(b.residualValueChangeMinor)} currency={b.currencyCode} locale={profile.locale}/></small></div>)}
 <p className="sc-wealth-muted">Valuation movements are not realized income, available cash or additional ledger credits.</p></section>:null}
 </>}
 <p className="sc-wealth-disclaimer">Backend-authoritative Finance wealth RPCs · no inferred FX rates, automatic transfers, or market-price feeds. Observation writes, inclusion changes and account lifecycle actions require explicit review.</p></div>;
}
export function SignalWealthPage({mode,selectedAccountId,onNavigate}:{mode:"accounts"|"net-worth"|"detail";selectedAccountId:string|null;onNavigate:(path:string)=>void}){
 const [range,setRange]=useState<WealthRangeMonths>(12);const workspace=useWealthWorkspace(range);
 useEffect(()=>{if(mode!=="detail"||!selectedAccountId||workspace.state!=="ready")return;
 if(!workspace.dashboard?.accounts.some(a=>a.accountId===selectedAccountId))return;
 void workspace.loadAccountHistory(selectedAccountId);
 // Only key on selected ID, loaded dashboard identity and range; never refetch on mutation status toggles.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[selectedAccountId,mode,range,workspace.state,workspace.dashboard?.anchorDate]);
 if(workspace.state==="loading")return <FinancialState kind="loading" title="Loading wealth" description="Reading authenticated ledger balances and observations."/>;
 if(workspace.state!=="ready"||!workspace.dashboard)return <FinancialState kind={workspace.state==="error"?"error":"empty"} title="Wealth data unavailable"
 description={workspace.error??"A configured, authenticated Finance session is required."} primaryAction={workspace.state==="error"?{label:"Retry",onClick:()=>void workspace.refresh()}:undefined}/>;
 return <SignalWealthView dashboard={workspace.dashboard} workspace={workspace} mode={mode} selectedAccountId={selectedAccountId} range={range} onRange={setRange} onNavigate={onNavigate}/>;
}
