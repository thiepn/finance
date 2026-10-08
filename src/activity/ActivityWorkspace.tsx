import {useEffect,useMemo,useRef,useState,type FormEvent} from "react";
import type {ActivityItem,ActivitySearchPage,ActivityFilterCatalog} from "../domain/activity.js";
import {ActivityController} from "./activity-controller.js";
import {createFinanceBrowserRuntime} from "../integrations/supabase-client.js";
import {MoneyValue,FinanceButton,FinancialState} from "../ui/v2/SignalCurrent.js";
import {Icon} from "../ui/icons/Icon.js";
import {activityFiltersForRpc,activityDetailHref,emptyActivityFilters,moneyCategory,
 normalizeActivityError,parseActivityRoute,serializeActivityRoute,signedActivityDisplay,
 type ActivityRouteFilters} from "./activity-workspace-model.js";
import "./activity-workspace.css";
const LIMIT=40;
const dateText=(raw:string)=>{
 const d=new Date(raw);
 return Number.isFinite(d.getTime())?new Intl.DateTimeFormat("de-DE",{day:"2-digit",month:"short",year:"numeric"}).format(d):"Unknown date";
};
type Props={
 rows:readonly ActivityItem[];catalog:ActivityFilterCatalog|null;filter:ActivityRouteFilters;
 loading:boolean;loadingMore:boolean;error:string|null;catalogError:boolean;hasMore:boolean;
 onNavigate:(url:string)=>void;onSearch:(f:ActivityRouteFilters)=>void;onLoadMore:()=>void;onRefresh:()=>void;
};
export function ActivityWorkspaceView({rows,catalog,filter,loading,loadingMore,error,catalogError,hasMore,
 onNavigate,onSearch,onLoadMore,onRefresh}:Props){
 const [draft,setDraft]=useState(filter);
 useEffect(()=>setDraft(filter),[filter.q,filter.from,filter.to,filter.kind,filter.merchant,filter.account]);
 function submit(event:FormEvent){event.preventDefault();onSearch(draft);}
 const resultCount=rows.length;
 return <div className="sc-activity" data-testid="finance-activity-workspace">
   <header className="sc-activity-heading">
     <div><span className="sc-eyebrow">TRANSACTIONS & RECEIPT EVIDENCE</span><h1>Activity</h1>
      <p>Search posted ledger entries and unposted receipt evidence.</p></div>
     <div className="sc-activity-heading__buttons">
       <FinanceButton variant="secondary" onClick={()=>onNavigate("/import")}>Import</FinanceButton>
       <FinanceButton onClick={()=>onNavigate("/activity/new")}><Icon name="plus" size={15}/>New transaction</FinanceButton>
     </div>
   </header>
   <form className="sc-activity-filter" onSubmit={submit} aria-label="Filter financial activity">
     <label className="sc-activity-filter__search">Search
       <input type="search" value={draft.q} maxLength={250} onChange={e=>setDraft({...draft,q:e.target.value})}
         placeholder="Merchant, category or note" autoComplete="off" aria-label="Search financial activity"/></label>
     <label>From<input type="date" value={draft.from} max={draft.to||undefined} onChange={e=>setDraft({...draft,from:e.target.value})}/></label>
     <label>To<input type="date" value={draft.to} min={draft.from||undefined} onChange={e=>setDraft({...draft,to:e.target.value})}/></label>
     <label>Type<select value={draft.kind} onChange={e=>setDraft({...draft,kind:e.target.value as ActivityRouteFilters["kind"]})}>
       <option value="">All types</option><option value="transaction">Transactions</option><option value="receipt">Receipts</option>
     </select></label>
     <label>Account<select value={draft.account} onChange={e=>setDraft({...draft,account:e.target.value})}>
       <option value="">All accounts</option>{catalog?.accounts.filter(x=>!x.isArchived).map(x=><option value={x.id} key={x.id}>{x.name} ({x.currencyCode})</option>)}
     </select></label>
     <label>Merchant<select value={draft.merchant} onChange={e=>setDraft({...draft,merchant:e.target.value})}>
       <option value="">All merchants</option>{catalog?.merchants.map(x=><option value={x.id} key={x.id}>{x.name}</option>)}
     </select></label>
     <div className="sc-activity-filter__actions"><FinanceButton type="submit">Apply</FinanceButton>
       <FinanceButton variant="quiet" onClick={()=>{setDraft(emptyActivityFilters);onSearch(emptyActivityFilters)}}>Clear</FinanceButton></div>
   </form>
   {catalogError?<p className="sc-activity-filter-alert" role="status">Some filter options are temporarily unavailable. Search remains usable.</p>:null}
   <section className="sc-activity-ledger" aria-label="Activity results">
     <div className="sc-activity-ledger__heading">
       <div><span className="sc-eyebrow">LEDGER HISTORY</span><h2>Transactions and receipts</h2>
         <span className="sc-activity-count" aria-live="polite">{loading?"Loading":resultCount+" shown"+(hasMore?" · more available":"")}</span></div>
       <button type="button" onClick={onRefresh} disabled={loading} className="sc-activity-refresh">
         <Icon name="recurring" size={16}/> Refresh</button>
     </div>
     {error?<div className="sc-activity-result-state"><FinancialState kind="error" title="Activity unavailable"
       description={error} primaryAction={{label:"Retry",onClick:onRefresh}}/></div>:
       loading?<div className="sc-activity-loading" role="status" aria-busy="true">Loading your financial records…</div>:
       !rows.length?<div className="sc-activity-result-state"><FinancialState kind="empty" title="No matching records"
         description="Try a different search or date range. No transaction data has been changed."
         primaryAction={{label:"Clear filters",onClick:()=>onSearch(emptyActivityFilters)}}/></div>:
       <div className="sc-activity-table-region" role="region" aria-label="Financial activity table" tabIndex={0}>
        <table className="sc-activity-table"><caption>Activity search results — {rows.length} shown</caption>
         <thead><tr><th scope="col">Date</th><th scope="col">Transaction or receipt</th><th scope="col">Account</th><th scope="col">Type</th><th scope="col" className="sc-activity-number">Amount</th></tr></thead>
         <tbody>{rows.map(item=>{
           const money=signedActivityDisplay(item),href=activityDetailHref(item);
           const evidence=item.entityKind==="receipt";
           return <tr key={item.entityKind+":"+item.id} className={evidence?"sc-activity-row--evidence":""}>
             <td className="sc-activity-date">{dateText(item.occurredAt)}</td>
             <td><a href={href} className="sc-activity-description" onClick={e=>{
               if(e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;
               e.preventDefault();onNavigate(href);
             }}><span className="sc-activity-avatar" aria-hidden="true">{evidence?"R":(item.merchantName??item.title).slice(0,1).toUpperCase()}</span>
               <span><strong>{item.merchantName??item.title}</strong>
                <small>{item.categories[0]?.name??item.description??(evidence?"Receipt evidence":item.status)}
                   {item.hasReceipt?" · Receipt linked":""}</small></span></a></td>
             <td className="sc-activity-account">{item.accounts.map(a=>a.name).join(", ")||"—"}</td>
             <td><span className="sc-activity-type">{evidence?"Receipt · "+item.status:item.transactionType??item.status}</span></td>
             <td className="sc-activity-number">{money===null?<span className="sc-activity-unposted">{evidence?"Evidence only":"Not posted"}</span>:
               <MoneyValue amountMinor={money} currency={item.currencyCode} tone={moneyCategory(item)}/>}</td>
           </tr>;
         })}</tbody>
        </table></div>}
     {hasMore&&!loading&&!error?<div className="sc-activity-pagination">
       <FinanceButton variant="secondary" disabled={loadingMore} onClick={onLoadMore}>{loadingMore?"Loading more…":"Load more records"}</FinanceButton>
       <span>Results load in groups of {LIMIT}.</span></div>:null}
   </section>
 </div>;
}
export function ActivityPage({onNavigate}:{onNavigate:(url:string)=>void}){
 const runtime=createFinanceBrowserRuntime();
 const controller=useMemo(()=>runtime?new ActivityController(runtime.activity):null,[runtime]);
 const [filter,setFilter]=useState(()=>parseActivityRoute(window.location.search));
 const [catalog,setCatalog]=useState<ActivityFilterCatalog|null>(null);
 const [catalogError,setCatalogError]=useState(false);
 const [page,setPage]=useState<ActivitySearchPage|null>(null);
 const [error,setError]=useState<string|null>(null);
 const [loading,setLoading]=useState(true);
 const [loadingMore,setLoadingMore]=useState(false);
 const [refresh,setRefresh]=useState(0);
 const request=useRef(0),loadingCursor=useRef(false);
 useEffect(()=>{
  const sync=()=>{if(location.pathname!=="/activity")return;setFilter(parseActivityRoute(location.search));};
  window.addEventListener("popstate",sync);window.addEventListener("finance:navigate",sync);
  return()=>{window.removeEventListener("popstate",sync);window.removeEventListener("finance:navigate",sync)};
 },[]);
 useEffect(()=>{
  if(!controller)return;
  let alive=true;
  void controller.getFilterCatalog().then(v=>{if(alive){setCatalog(v);setCatalogError(false)}})
    .catch(()=>{if(alive)setCatalogError(true)});
  return()=>{alive=false};
 },[controller]);
 const filters=activityFiltersForRpc(filter);
 useEffect(()=>{
  if(!controller){setLoading(false);setError("Finance backend is not configured.");return;}
  const id=++request.current;
  setPage(null);setError(null);setLoading(true);
  void controller.search({query:filter.q,filters,limit:LIMIT}).then(v=>{if(id===request.current)setPage(v)})
   .catch(e=>{if(id===request.current)setError(normalizeActivityError(e,"search"))})
   .finally(()=>{if(id===request.current)setLoading(false)});
  return()=>{request.current++};
 },[controller,filter.q,filter.from,filter.to,filter.kind,filter.merchant,filter.account,refresh]);
 async function loadMore(){
  if(!controller||!page?.nextCursor||!page.hasMore||loadingCursor.current)return;
  loadingCursor.current=true;setLoadingMore(true);
  const id=request.current;
  try{
   const next=await controller.search({query:filter.q,filters,limit:LIMIT,cursor:page.nextCursor});
   if(id!==request.current)return;
   const seen=new Set(page.items.map(i=>i.entityKind+":"+i.id));
   setPage({...next,items:[...page.items,...next.items.filter(i=>!seen.has(i.entityKind+":"+i.id))]});
  }catch(e){if(id===request.current)setError(normalizeActivityError(e,"search"))}
  finally{loadingCursor.current=false;setLoadingMore(false)}
 }
 function search(next:ActivityRouteFilters){
   if(next.from&&next.to&&next.from>next.to)return;
   const path=serializeActivityRoute(next);
   onNavigate(path);
   setFilter(next);
 }
 return <ActivityWorkspaceView rows={page?.items??[]} catalog={catalog} filter={filter} loading={loading}
  loadingMore={loadingMore} error={error} catalogError={catalogError} hasMore={Boolean(page?.hasMore)}
  onNavigate={onNavigate} onSearch={search} onLoadMore={()=>void loadMore()} onRefresh={()=>setRefresh(x=>x+1)}/>;
}
