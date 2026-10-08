import { useCallback, useEffect, useMemo, useState } from "react";
import type { OverviewDashboard, OverviewPeriodKind } from "../domain/overview.js";
import type { AnalyticsTimeSeries } from "../domain/analytics.js";
import type { RecurringDashboard } from "../domain/recurring.js";
import { createFinanceBrowserRuntime } from "../integrations/supabase-client.js";
import { useOverview } from "./use-overview.js";
import { availableToSpend, buildSpendingPace, formatActivityDate, percentOf,
  periodTitle, safeMinor, signedActivityAmount, trackedPosition } from "./signal-home-model.js";
import { overviewStatusCopy, attentionCopy, overviewMetricTrend } from "./overview-model.js";
import { Icon } from "../ui/icons/Icon.js";
import { DataProvenance, FinanceButton, FinanceTrend, FinancialState, MoneyValue,
  type MoneySource, type FinanceTrendPoint } from "../ui/v2/SignalCurrent.js";
import "./signal-home.css";

type ExtraState<T> = {status:"loading"|"ready"|"error";value:T|null};
type Extras = {upcoming:ExtraState<RecurringDashboard>;trend:ExtraState<AnalyticsTimeSeries>;refresh:()=>void};
function useHomeExtras(dashboard:OverviewDashboard|null):Extras {
  const runtime=useMemo(createFinanceBrowserRuntime,[]);
  const [cycle,setCycle]=useState(0);
  const [upcoming,setUpcoming]=useState<ExtraState<RecurringDashboard>>({status:"loading",value:null});
  const [trend,setTrend]=useState<ExtraState<AnalyticsTimeSeries>>({status:"loading",value:null});
  const start=dashboard?.period.start,end=dashboard?.period.end,compareStart=dashboard?.period.compareStart,compareEnd=dashboard?.period.compareEnd;
  const asOf=dashboard?.period.asOf;
  const periodKind=dashboard?.periodKind;
  useEffect(()=>{
    if(!runtime||!start||!end||!compareStart||!compareEnd||!asOf||!periodKind)return;
    let alive=true;
    setUpcoming({status:"loading",value:null});
    setTrend({status:"loading",value:null});
    void runtime.recurring.getDashboard(null,30).then(value=>{
      if(alive)setUpcoming({status:"ready",value});
    }).catch(()=>{if(alive)setUpcoming({status:"error",value:null});});
    const bucketKind=periodKind==="week"?"day":periodKind==="month"?"day":periodKind==="quarter"?"week":"month";
    void runtime.analytics.getTimeSeries({periodStart:start,periodEnd:end,compareStart,compareEnd,bucketKind}).then(value=>{
      if(alive)setTrend({status:"ready",value});
    }).catch(()=>{if(alive)setTrend({status:"error",value:null});});
    return()=>{alive=false;};
  },[runtime,start,end,compareStart,compareEnd,asOf,periodKind,cycle]);
  return{upcoming,trend,refresh:()=>setCycle(n=>n+1)};
}

const periods:{value:OverviewPeriodKind;label:string}[]=[
 {value:"week",label:"Week"},{value:"month",label:"Month"},{value:"quarter",label:"Quarter"},{value:"year",label:"Year"}
];
type MetricProps={label:string;minor:number|null;currency:string;locale:string;source:MoneySource;detail:string;primary?:boolean;tone?:"default"|"negative"|"warning";status?:"loading"|"error"};
function HomeMetric({label,minor,currency,locale,source,detail,primary=false,tone="default",status}:MetricProps){
 return <section className={"sc-home-metric"+(primary?" sc-home-metric--primary":"")} aria-label={label}>
  <div className="sc-home-metric__label">{label}</div>
  {minor===null?<span className="sc-home-metric__unknown" aria-label={status==="loading"?"Loading":"Not available"}>{status==="loading"?"Loading…":"—"}</span>:
    <MoneyValue amountMinor={minor} currency={currency} locale={locale} size="large" tone={tone}/>}
  <span className="sc-home-metric__detail">{status==="error"?"Source unavailable":detail}</span>
  <DataProvenance source={source}/>
 </section>;
}
function MoneyOrDash({amount,board}: {amount:number|null;board:OverviewDashboard}){
 return amount===null?<span className="sc-home-dash">—</span>:
 <MoneyValue amountMinor={amount} currency={board.profile.currencyCode} locale={board.profile.locale} tone={amount<0?"negative":"default"}/>;
}
export interface SignalHomeViewProps {
 dashboard:OverviewDashboard;
 upcoming?: ExtraState<RecurringDashboard>;
 trend?: ExtraState<AnalyticsTimeSeries>;
 onNavigate:(key:string)=>void;
 periodKind:OverviewPeriodKind;
 onPeriodChange:(kind:OverviewPeriodKind)=>void;
 onRefresh:()=>void;
 refreshing?:boolean;
}
export function SignalHomeView({dashboard,upcoming,trend,onNavigate,periodKind,onPeriodChange,onRefresh,refreshing=false}:SignalHomeViewProps){
 const currency=dashboard.profile.currencyCode,locale=dashboard.profile.locale;
 const available=availableToSpend(dashboard),position=trackedPosition(dashboard);
 const upcomingMinor=upcoming?.status==="ready"&&upcoming.value?.profile.currencyCode===currency
   ? safeMinor(upcoming.value.summary.next30dExpenseMinor):null;
 const recurringStatus=upcoming?.status??"loading";
 const recent=dashboard.recentActivity.slice(0,6);
 const trendPoints:FinanceTrendPoint[]=trend?.status==="ready"?buildSpendingPace(dashboard,trend.value):[];
 const totalBudget=safeMinor(dashboard.planning.plannedSpendMinor);
 const used=safeMinor(dashboard.planning.budgetedSpentMinor);
 const planRemaining=safeMinor(dashboard.planning.remainingMinor);
 const planPercent=used!==null&&totalBudget!==null?percentOf(used,totalBudget):0;
 const status=overviewStatusCopy(dashboard.financialStatus,dashboard);
 const spendingTrend=overviewMetricTrend(dashboard,"spending");
 const incomeTrend=overviewMetricTrend(dashboard,"income");
 const formatTrend=(ratio:number|null)=>ratio===null?"No prior baseline":new Intl.NumberFormat(locale,{style:"percent",maximumFractionDigits:0,signDisplay:"exceptZero"}).format(ratio);
 const categories=[...dashboard.topCategories].slice(0,5);
 const maxCategory=Math.max(1,...categories.map(c=>c.currentMinor));
 const asOf=new Date(dashboard.period.asOf);
 const freshness=Number.isFinite(asOf.getTime())?new Intl.DateTimeFormat(locale,{dateStyle:"medium",timeStyle:"short",timeZone:dashboard.profile.timeZone}).format(asOf):"Time unavailable";
 const view=(key:string)=>onNavigate(key);
 return <div className="sc-home" data-testid="finance-real-home">
   <header className="sc-home-header">
     <div className="sc-home-header__title"><span className="sc-eyebrow">{periodTitle(dashboard)}</span><h1>Home</h1></div>
     <div className="sc-home-header__actions">
       <label className="sc-home-period" htmlFor="sc-home-period"><span>Period</span>
         <select id="sc-home-period" value={periodKind} onChange={e=>onPeriodChange(e.currentTarget.value as OverviewPeriodKind)}>
         {periods.map(p=><option key={p.value} value={p.value}>{p.label}</option>)}</select></label>
       <FinanceButton variant="secondary" onClick={()=>view("scan")}>Scan receipt</FinanceButton>
       <FinanceButton onClick={()=>view("activity-new")}>New transaction</FinanceButton>
     </div>
   </header>
   <div className="sc-home-refresh"><div className="sc-home-status"><span className={"sc-home-status__dot sc-home-status__dot--"+dashboard.financialStatus.tone} aria-hidden="true"/>
     <strong>{status.title}</strong><span>{status.detail}</span></div>
     <div className="sc-home-freshness"><span>As of {freshness}</span><button type="button" disabled={refreshing} onClick={onRefresh} aria-label="Refresh Finance Home">
       <Icon name="refresh" size={15}/><span>Refresh</span></button></div>
   </div>
   <div className="sc-home-metrics">
     <HomeMetric label="Available to spend" minor={available} currency={currency} locale={locale} source="planned"
       detail={dashboard.planning.configured?"Remaining in configured allocations":"Set a budget to see available-to-spend"} primary tone={available!==null&&available<0?"negative":"default"}/>
     <HomeMetric label="Tracked net position" minor={position} currency={currency} locale={locale} source="valuation"
       detail={dashboard.accounts.activeCount?dashboard.accounts.activeCount+" active tracked account"+(dashboard.accounts.activeCount===1?"":"s"):"No tracked accounts yet"}
       tone={position!==null&&position<0?"negative":"default"}/>
     <HomeMetric label="Upcoming · 30 days" minor={upcomingMinor} currency={currency} locale={locale} source="forecast"
       status={recurringStatus} detail={upcoming?.status==="ready"?"Tracked recurring expenses only":"Recurring commitments source"} tone="warning"/>
     <HomeMetric label="Net spending" minor={safeMinor(dashboard.summary.netSpentMinor)} currency={currency} locale={locale}
       source="posted" detail={dashboard.summary.expenseCount+" posted expense"+(dashboard.summary.expenseCount===1?"":"s")}/>
   </div>
   <div className="sc-home-brief">
     <div><span>Posted income</span><MoneyOrDash amount={safeMinor(dashboard.summary.incomeMinor)} board={dashboard}/>
       <small>{formatTrend(incomeTrend.ratio)} vs previous period</small></div>
     <div><span>Net cash flow</span><MoneyOrDash amount={safeMinor(dashboard.summary.netCashFlowMinor)} board={dashboard}/>
       <small>Posted income minus net spend</small></div>
     <div><span>Spending change</span><strong className={spendingTrend.tone==="negative"?"sc-home-is-negative":"sc-home-is-positive"}>{formatTrend(spendingTrend.ratio)}</strong><small>Compared with previous period</small></div>
   </div>
   <div className="sc-home-main-grid">
     <section className="sc-home-panel sc-home-attention">
       <div className="sc-home-panel__heading"><div><span className="sc-eyebrow">FOLLOW UP</span><h2>Needs attention</h2></div>
         <span className="sc-home-count">{dashboard.attention.totalCount}</span></div>
       {dashboard.attention.items.length===0?
         <p className="sc-home-empty">No review blockers or reconciliation issues currently surfaced.</p>:
         <div className="sc-home-attention__list">{dashboard.attention.items.slice(0,6).map((item,i)=>{
           const c=attentionCopy(item);
           return <button className="sc-home-attention-item" type="button" onClick={()=>view(c.routeKey)}
             key={item.code+"-"+(item.entityId??i)}>
             <span className={"sc-home-severity sc-home-severity--"+item.severity} aria-hidden="true"/>
             <span><strong>{item.subject||c.title}</strong><small>{c.title} · {c.detail}</small></span>
             <Icon name="chevronRight" size={16}/></button>;
         })}</div>}
       {dashboard.attention.totalCount>dashboard.attention.items.length?<p className="sc-home-attention-more">Showing {dashboard.attention.items.length} of {dashboard.attention.totalCount} issues</p>:null}
     </section>
     <section className="sc-home-pace">
       {trendPoints.length>0?<FinanceTrend title="Spending pace" description="Cumulative posted net expenses vs. linear budget allocation · not a forecast" points={trendPoints} currency={currency}/>:
       <section className="sc-home-panel sc-home-pace-empty"><div className="sc-home-panel__heading"><div><span className="sc-eyebrow">LEDGER TRENDS</span><h2>Spending pace</h2></div></div>
         <p role="status">{trend?.status==="loading"?"Loading posted spending data…":trend?.status==="error"?"Spending trend could not load. The totals above remain available.":"No comparable spending series is available for this period."}</p>
       </section>}
       <div className="sc-home-pace__footer"><span>{dashboard.planning.configured&&dashboard.planning.projectedSpendMinor!==null?
         <>Estimated full-period spending <MoneyOrDash amount={safeMinor(dashboard.planning.projectedSpendMinor)} board={dashboard}/></>:
         "Set a budget to compare actual spending against a plan"}</span>
         <button type="button" onClick={()=>view("insights")}>Explore spending <Icon name="chevronRight" size={15}/></button></div>
     </section>
   </div>
   <div className="sc-home-secondary-grid">
     <section className="sc-home-panel sc-home-budget">
       <div className="sc-home-panel__heading"><div><span className="sc-eyebrow">ALLOCATIONS</span><h2>Budget progress</h2></div>
         <button type="button" className="sc-home-text-action" onClick={()=>view("budget")}>Open Plan <Icon name="chevronRight" size={14}/></button></div>
       {dashboard.planning.configured&&totalBudget!==null&&used!==null?
         <><div className="sc-home-budget__amount"><MoneyOrDash amount={planRemaining} board={dashboard}/><span>remaining</span></div>
         <div className="sc-home-budget__track" role="progressbar" aria-label="Budget used" aria-valuemin={0} aria-valuemax={100}
           aria-valuenow={Math.round(planPercent)}><span style={{width:planPercent+"%"}}/></div>
         <div className="sc-home-budget__facts"><span><MoneyOrDash amount={used} board={dashboard}/> used</span><span>of <MoneyOrDash amount={totalBudget} board={dashboard}/></span></div>
         {used>totalBudget?<p className="sc-home-budget__warning">The configured budget has been exceeded.</p>:null}
         <DataProvenance source="planned"/></>:
         <div className="sc-home-empty"><p>No budget for this period. Finance cannot calculate spendable money without real allocations.</p>
           <FinanceButton variant="secondary" onClick={()=>view("budget")}>Configure budget</FinanceButton></div>}
     </section>
     <section className="sc-home-panel sc-home-activity">
       <div className="sc-home-panel__heading"><div><span className="sc-eyebrow">POSTED RECORDS & EVIDENCE</span><h2>Recent activity</h2></div>
         <button type="button" className="sc-home-text-action" onClick={()=>view("activity")}>View all <Icon name="chevronRight" size={14}/></button></div>
       {recent.length===0?<p className="sc-home-empty">No recent activity. Add a transaction or capture your first receipt.</p>:
         <div className="sc-home-activity__list">{recent.map(item=>{
           const amount=signedActivityAmount(item),receipt=item.entityKind==="receipt";
           return <button type="button" className="sc-home-activity-row" key={item.entityKind+":"+item.id}
             onClick={()=>view(receipt?"receipts":"activity")}>
             <span className="sc-home-activity-row__initial" aria-hidden="true">{(item.merchantName??item.title??"·").slice(0,1).toLocaleUpperCase()}</span>
             <span className="sc-home-activity-row__label"><strong>{item.merchantName??item.title}</strong>
               <small>{formatActivityDate(item.occurredAt,locale,dashboard.profile.timeZone)} · {item.categories[0]?.name??(receipt?"Receipt evidence":item.transactionType??"Transaction")}
                 {item.hasReceipt?" · Receipt linked":""}</small></span>
             {amount===null?<span className="sc-home-activity-row__evidence">{receipt?"Evidence":"Not posted"}</span>:
               <MoneyValue amountMinor={amount} currency={item.currencyCode} locale={locale}
                 tone={item.transactionType==="transfer"?"muted":amount>0?"positive":"default"}/>}
           </button>;
         })}</div>}
     </section>
   </div>
   <section className="sc-home-categories">
     <div className="sc-home-panel__heading"><div><span className="sc-eyebrow">BREAKDOWN</span><h2>Top spending categories</h2></div>
       <button type="button" className="sc-home-text-action" onClick={()=>view("categories")}>All categories <Icon name="chevronRight" size={14}/></button></div>
     {categories.length===0?<p className="sc-home-empty">No classified spending in this period.</p>:
       <div className="sc-home-categories__grid">{categories.map(category=><button key={category.categoryId}
         onClick={()=>view("categories")} type="button" className="sc-home-category">
         <div><strong>{category.name}</strong><MoneyOrDash amount={safeMinor(category.currentMinor)} board={dashboard}/></div>
         <div className="sc-home-category__track"><span style={{width:percentOf(category.currentMinor,maxCategory)+"%"}}/></div>
         <small>{category.share===null?"Share unavailable":new Intl.NumberFormat(locale,{style:"percent",maximumFractionDigits:0}).format(category.share)+" of classified spending"}</small>
       </button>)}</div>}
   </section>
 </div>;
}
export function OverviewPage({onNavigate}:{onNavigate:(key:string)=>void}){
 const [periodKind,setPeriodKind]=useState<OverviewPeriodKind>("month");
 const loader=useOverview(periodKind);
 const extras=useHomeExtras(loader.dashboard);
 const refresh=useCallback(()=>{extras.refresh();void loader.refresh();},[extras.refresh,loader.refresh]);
 if(loader.state==="loading")return <div className="sc-home sc-home-loading" aria-busy="true">
   <header className="sc-home-header"><div><span className="sc-eyebrow">FINANCE HOME</span><h1>Home</h1></div></header>
   <div className="sc-home-loading__metrics">{[0,1,2,3].map(i=><div key={i} className="sc-home-placeholder"/>)}</div>
   <div className="sc-home-loading__panels"><div className="sc-home-placeholder"/><div className="sc-home-placeholder"/></div>
   <span className="sc-visually-hidden" role="status">Loading private financial overview</span>
 </div>;
 if(loader.state!=="ready"||!loader.dashboard)return <div className="sc-home">
   <FinancialState kind={loader.state==="unauthenticated"?"sign-in":loader.state==="unconfigured"?"error":"offline"}
     title={loader.state==="unauthenticated"?"Sign in to view your finances":loader.state==="unconfigured"?"Finance backend is not configured":"Home couldn't load"}
     description={loader.state==="unauthenticated"?"Sign in before accessing private financial data.":
       loader.state==="unconfigured"?"This deployment is missing the required Finance backend configuration.":
       "Your posted records remain unchanged. Check your connection and retry."}
     {...(loader.state==="error"?{primaryAction:{label:"Retry loading",onClick:()=>void loader.refresh()}}:{})}/>
 </div>;
 return <SignalHomeView dashboard={loader.dashboard} upcoming={extras.upcoming} trend={extras.trend}
   onNavigate={onNavigate} periodKind={periodKind} onPeriodChange={setPeriodKind} onRefresh={refresh}/>;
}
