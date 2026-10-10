
import { useMemo, useState, type MouseEvent } from "react";
import type { AnalyticsTimeSeries } from "../domain/analytics.js";
import type { SpendingExplorer } from "../domain/spending-explorer.js";
import { useAnalyticsTimeSeries } from "../analytics/use-analytics.js";
import { useSpendingExplorer } from "./use-spending-explorer.js";
import { DataProvenance, FinanceButton, FinancialState, MoneyValue } from "../ui/v2/SignalCurrent.js";
import { formatSignalMoney } from "../ui/v2/finance-presentation.js";
import {
  activityHref, defaultInsightsFilters, insightsChartPoints, insightsHref, parseInsightsFilters,
  validMinor, type InsightsFilters, type InsightsMetric, type InsightsChartPoint,
} from "./signal-insights-model.js";
import "./signal-insights.css";

const periods = ["week","month","quarter","year"] as const;
const necessities = ["essential","flexible","discretionary","unclassified"] as const;
const money = (value: number, explorer: SpendingExplorer) =>
  formatSignalMoney(validMinor(value), explorer.profile.currencyCode, explorer.profile.locale);
function delta(value: number, previous: number, explorer: SpendingExplorer): string {
  return (value - previous >= 0 ? "+" : "") + money(value - previous, explorer);
}
function AppLink({href,onNavigate,children,className}:{
  href:string;onNavigate:(path:string)=>void;children:React.ReactNode;className?:string;
}) {
  const click = (e:MouseEvent<HTMLAnchorElement>) => {
    if(e.button!==0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault(); onNavigate(href);
  };
  return <a href={href} onClick={click} className={className}>{children}</a>;
}
function Timeline({points, explorer}: {points:InsightsChartPoint[];explorer:SpendingExplorer}) {
  const [showValues,setShowValues]=useState(false);
  const values = points.flatMap(p=>[p.current,p.previous].filter((v):v is number=>v!==null));
  const min = Math.min(0,...values), max = Math.max(0,...values);
  const range = max-min||1;
  const x = (i:number)=>40+(points.length<=1?0:i/(points.length-1)*620);
  const y = (v:number)=>187-(v-min)/range*155;
  const pathFor=(key:"current"|"previous")=>{
    let path="";
    points.forEach((p,i)=>{
      const v=p[key];
      if(v===null){return;}
      // Missing comparison buckets are not zeroes; break the polyline.
      const missing=i===0 || points[i-1]?.[key]===null;
      path+=(missing?"M":" L")+x(i).toFixed(1)+" "+y(v).toFixed(1)+" ";
    });
    return path.trim();
  };
  return <div className="sc-insight-timeline">
    <div className="sc-insight-chart-key"><span>Current period</span><span>Previous period</span></div>
    {points.length ? <svg className="sc-insight-svg" viewBox="0 0 700 212" role="img" aria-label="Current versus previous period, data table available directly below">
      {[46,93,140,187].map(v=><line className="sc-insight-gridline" key={v} x1="40" x2="660" y1={v} y2={v}/>)}
      <path className="sc-insight-zero" d={"M40 "+y(0)+" H660"}/>
      <path className="sc-insight-previous" d={pathFor("previous")}/>
      <path className="sc-insight-current" d={pathFor("current")}/>
    </svg>: <p className="sc-insight-muted">No ledger observations in this interval.</p>}
    <button type="button" className="sc-insight-text-button" aria-expanded={showValues}
      onClick={()=>setShowValues(x=>!x)}>{showValues?"Hide source values":"View source values"}</button>
    {showValues?<div className="sc-insight-table-scroll" role="region" tabIndex={0} aria-label="Chart source values">
      <table><caption>Ledger analytics — bucket values in {explorer.profile.currencyCode}</caption>
       <thead><tr><th scope="col">Current bucket</th><th scope="col">Current</th><th scope="col">Previous bucket</th><th scope="col">Previous</th></tr></thead>
       <tbody>{points.map(p=><tr key={p.key}><th scope="row">{p.label}</th><td>{money(p.current,explorer)}</td>
         <td>{p.previousLabel??"No counterpart"}</td><td>{p.previous===null?"Unavailable":money(p.previous,explorer)}</td></tr>)}</tbody>
      </table></div>:null}
  </div>;
}
export function SignalInsightsView({explorer,analytics,filters,onNavigate,categoryMode=false,analyticsPending=false,
  analyticsError=false}:{
 explorer:SpendingExplorer;analytics:AnalyticsTimeSeries|null;filters:InsightsFilters;
 onNavigate:(path:string)=>void;categoryMode?:boolean;analyticsPending?:boolean;analyticsError?:boolean;
}) {
 const [metric,setMetric]=useState<InsightsMetric>("net_spend");
 const path=categoryMode?"/explore/categories":"/explore";
 const next=(updates:Partial<InsightsFilters>)=>insightsHref({...filters,...updates},path);
 const points=insightsChartPoints(explorer,analytics,metric);
 const scoped=Boolean(filters.categoryId||filters.merchantId||filters.necessity);
 const availableGlobal=analytics && analytics.profile.currencyCode===explorer.profile.currencyCode
   && analytics.period.start===explorer.period.start && analytics.period.end===explorer.period.end;
 const title=categoryMode?"Categories":"Insights";
 const previous=explorer.summary.comparison.netSpendMinor;
 const net=explorer.summary.current.netSpendMinor;
 const refreshEvidence=explorer.summary.itemizedCoverageRatio;
 return <div className="sc-insights" aria-label="Financial insights">
  <header className="sc-insights-header"><div><span className="sc-eyebrow">Signal Current / Posted ledger</span>
   <h1>{title}</h1><p>Investigate real spending, compare periods and open the supporting records.</p></div>
   <div className="sc-insights-header__actions"><label>Period
    <select aria-label="Insight period" value={filters.periodKind}
      onChange={e=>onNavigate(next({periodKind:e.currentTarget.value as InsightsFilters["periodKind"]}))}>
     {periods.map(p=><option value={p} key={p}>{p[0]!.toUpperCase()+p.slice(1)}</option>)}
    </select></label>
    <FinanceButton variant="secondary" onClick={()=>onNavigate(activityHref(explorer))}>View activity</FinanceButton>
   </div></header>
  <nav className="sc-insight-breadcrumb" aria-label="Category drill-down">
    <AppLink href={next({categoryId:null,merchantId:null})} onNavigate={onNavigate}>All spending</AppLink>
    {explorer.scope.breadcrumb.map(b=><span key={b.categoryId}> / <AppLink
      href={next({categoryId:b.categoryId,merchantId:null})} onNavigate={onNavigate}>{b.name}</AppLink></span>)}
  </nav>
  <div className="sc-insight-filter"><span>Necessity</span>
   <select aria-label="Filter necessity" value={filters.necessity??""}
     onChange={e=>onNavigate(next({necessity:e.currentTarget.value?e.currentTarget.value as InsightsFilters["necessity"]:null}))}>
    <option value="">All spending</option>{necessities.map(n=><option key={n} value={n}>{n}</option>)}
   </select>
   {filters.merchantId?<AppLink onNavigate={onNavigate} href={next({merchantId:null})}>Clear merchant: {explorer.scope.merchantName??"selected"}</AppLink>:null}
   {scoped?<AppLink onNavigate={onNavigate} href={insightsHref(defaultInsightsFilters,path)}>Reset filters</AppLink>:null}
  </div>
  <section className="sc-insight-metrics" aria-label="Spending summary">
    <div className="sc-insight-metric sc-insight-metric--primary"><span>Net spending · current</span>
      <MoneyValue amountMinor={validMinor(net)} currency={explorer.profile.currencyCode} locale={explorer.profile.locale} size="large"/>
      <small>Gross {money(explorer.summary.current.grossSpendMinor,explorer)} less recoveries {money(explorer.summary.current.recoveriesMinor,explorer)}</small>
      <DataProvenance source="posted"/></div>
    <div className="sc-insight-metric"><span>Previous period</span>
      <MoneyValue amountMinor={validMinor(previous)} currency={explorer.profile.currencyCode} locale={explorer.profile.locale} size="medium"/>
      <small>Change {delta(net,previous,explorer)} · {explorer.summary.deltaRatio===null?"No comparison baseline":(explorer.summary.deltaRatio*100).toFixed(1)+"%"}</small>
      <DataProvenance source="posted"/></div>
    <div className="sc-insight-metric"><span>Distinct posted transactions</span>
      <strong>{explorer.summary.current.transactionCount.toLocaleString(explorer.profile.locale)}</strong>
      <small>Not receipt counts</small><DataProvenance source="posted"/></div>
    <div className="sc-insight-metric"><span>Itemized receipt evidence</span>
      <MoneyValue amountMinor={validMinor(explorer.summary.itemizedEvidenceMinor)} currency={explorer.profile.currencyCode} locale={explorer.profile.locale} size="medium"/>
      <small>{refreshEvidence===null?"Coverage unavailable":(refreshEvidence*100).toFixed(0)+"% coverage of scoped spend"} · not extra spending</small>
      <DataProvenance source="receipt"/></div>
  </section>
  <section className="sc-insight-panel" aria-labelledby="sc-insight-trend-title">
   <div className="sc-insight-panel-heading"><div><span className="sc-eyebrow">Time comparison</span><h2 id="sc-insight-trend-title">Ledger movement</h2>
     <p>{metric==="net_spend"?"Scoped net spending after refunds and reimbursements.": "All-account "+(metric==="income"?"posted income":"net cash flow")+" — not restricted by category or merchant filters."}</p></div>
     <div className="sc-insight-tabs" role="group" aria-label="Chart measure">
      {([["net_spend","Spending"],["income","Income"],["cash_flow","Cash flow"]] as const).map(([key,label])=><button
       aria-pressed={metric===key} key={key} type="button" onClick={()=>setMetric(key)}>{label}</button>)}
     </div></div>
   {metric!=="net_spend"&&!availableGlobal?
    <FinancialState kind={analyticsError?"error":analyticsPending?"loading":"empty"} title="Account-wide analytics unavailable"
      description="Spending remains available. Income and cash flow require verified, matching-period ledger analytics; they are never estimated from receipt items."/>:
    <Timeline points={points} explorer={explorer}/>}
   <div className="sc-insight-panel-footer"><DataProvenance source="posted"/>
      <AppLink href={activityHref(explorer)} onNavigate={onNavigate} className="sc-insight-record-link">Open posted records →</AppLink></div>
  </section>
  <div className="sc-insight-columns">
   <section className="sc-insight-panel" aria-labelledby="sc-insight-categories-title">
    <div className="sc-insight-panel-heading"><div><span className="sc-eyebrow">Category hierarchy</span>
      <h2 id="sc-insight-categories-title">{filters.categoryId?"Subcategories":"Category breakdown"}</h2>
      <p>Posted spending only; click a category to investigate.</p></div></div>
    {explorer.directCategoryMinor!==null&&explorer.directCategoryMinor!==0?<p className="sc-insight-direct">
      Directly assigned within category: {money(explorer.directCategoryMinor,explorer)}</p>:null}
    {explorer.children.length?<div className="sc-insight-ranked">{explorer.children.map((row,i)=><AppLink
      key={row.categoryId} href={next({categoryId:row.categoryId,merchantId:null})} onNavigate={onNavigate}
      className="sc-insight-ranked-row"><span className="sc-insight-rank">{i+1}</span>
      <span className="sc-insight-ranked-name"><strong>{row.name}</strong><small>{row.transactionCount} transactions · {row.hasChildren?"More categories":"Inspect scope"}</small></span>
      <span className="sc-insight-ranked-value"><b>{money(row.currentMinor,explorer)}</b>
      <small>{delta(row.currentMinor,row.previousMinor,explorer)} vs prior</small></span></AppLink>)}</div>:
      <p className="sc-insight-muted">No child categories here. Direct-category spending can still be reviewed in Activity.</p>}
   </section>
   <section className="sc-insight-panel" aria-labelledby="sc-insight-merchant-title">
    <div className="sc-insight-panel-heading"><div><span className="sc-eyebrow">Merchant comparison</span>
      <h2 id="sc-insight-merchant-title">Where spending happened</h2><p>Ledger totals, not itemized receipt sums.</p></div></div>
    {explorer.merchants.length?<div className="sc-insight-ranked">{explorer.merchants.map((row,i)=>
      <div className="sc-insight-merchant-row" key={row.merchantId??"unassigned"}>
       {row.merchantId?<AppLink href={next({merchantId:row.merchantId})} onNavigate={onNavigate}
         className="sc-insight-ranked-row"><span className="sc-insight-rank">{i+1}</span>
         <span className="sc-insight-ranked-name"><strong>{row.name}</strong><small>{row.transactionCount} transactions</small></span>
         <span className="sc-insight-ranked-value"><b>{money(row.currentMinor,explorer)}</b>
          <small>{delta(row.currentMinor,row.previousMinor,explorer)} vs prior</small></span></AppLink>:
         <div className="sc-insight-ranked-row"><span className="sc-insight-rank">{i+1}</span>
         <span className="sc-insight-ranked-name"><strong>{row.name}</strong><small>Unknown merchant</small></span>
         <b>{money(row.currentMinor,explorer)}</b></div>}
       <AppLink href={activityHref(explorer,row.merchantId)} onNavigate={onNavigate} className="sc-insight-merchant-records">
         Records</AppLink>
      </div>)}</div>:<p className="sc-insight-muted">No merchant totals in this scope.</p>}
   </section>
  </div>
  <section className="sc-insight-panel" aria-labelledby="sc-insight-product-title">
   <div className="sc-insight-panel-heading"><div><span className="sc-eyebrow">Separate receipt evidence</span>
     <h2 id="sc-insight-product-title">Products appearing on receipts</h2>
     <p>These amounts explain purchases. Never add them to posted ledger totals.</p></div>
     <AppLink href="/explore/products" onNavigate={onNavigate} className="sc-insight-record-link">Full product catalog →</AppLink></div>
   <div className="sc-insight-product-list">{explorer.products.length?explorer.products.map(row=>
     <AppLink key={row.productId} href={"/explore/products/"+encodeURIComponent(row.productId)} onNavigate={onNavigate}
       className="sc-insight-product"><span><strong>{row.name}</strong><small>{row.purchaseCount} itemized purchases</small></span>
       <span>{money(row.currentItemizedMinor,explorer)}</span></AppLink>):
     <p className="sc-insight-muted">No itemized product evidence in this scope.</p>}</div>
  </section>
  <p className="sc-insight-disclaimer">Data source: authenticated, account-scoped Finance RPCs. Transfers are not income or spending.
   Receipt items provide supporting evidence only. Positive expense changes do not imply additional bank cash.</p>
 </div>;
}
export function SignalInsightsPage({search,onNavigate,categoryMode=false}:{
 search:string;onNavigate:(path:string)=>void;categoryMode?:boolean;
}) {
 const filters=useMemo(()=>parseInsightsFilters(search),[search]);
 const request=useMemo(()=>({
  periodKind:filters.periodKind,categoryId:filters.categoryId,merchantId:filters.merchantId,
  necessity:filters.necessity,limit:10,
 }),[filters]);
 const explorer=useSpendingExplorer(request);
 const seriesRequest=useMemo(()=>{
   if(explorer.state!=="ready"||!explorer.explorer) return null;
   const e=explorer.explorer;
   return {periodStart:e.period.start,periodEnd:e.period.end,compareStart:e.period.compareStart,
     compareEnd:e.period.compareEnd,bucketKind:e.bucketKind};
 },[explorer.state,explorer.explorer]);
 const analytics=useAnalyticsTimeSeries(seriesRequest);
 if(explorer.state==="loading")return <FinancialState kind="loading" title="Loading insights" description="Reading posted ledger data."/>;
 if(explorer.state!=="ready"||!explorer.explorer)return <FinancialState
  kind={explorer.state==="error"?"error":explorer.state==="unauthenticated"?"sign-in":"empty"}
  title="Insights unavailable" description="Finance data could not be loaded. Your account data was not changed."
  primaryAction={explorer.state==="error"?{label:"Retry",onClick:()=>void explorer.refresh()}:undefined}/>;
 return <SignalInsightsView explorer={explorer.explorer} analytics={analytics.state==="ready"?analytics.series:null}
  analyticsPending={analytics.state==="loading"} analyticsError={analytics.state==="error"}
  filters={filters} categoryMode={categoryMode} onNavigate={onNavigate}/>;
}
