import type { AnalyticsTimeSeries } from "../domain/analytics.js";
import type { OverviewDashboard } from "../domain/overview.js";
import type { ActivityItem } from "../domain/activity.js";
import type { FinanceTrendPoint } from "../ui/v2/SignalCurrent.js";

export function safeMinor(value:number|null|undefined):number|null {
  return value!=null && Number.isSafeInteger(value)?value:null;
}

/** Dashboard values are already materialized by the account-scoped backend.
 * This model only describes display semantics; never recalculates ledger totals. */
export function availableToSpend(dashboard:OverviewDashboard): number|null {
  if(!dashboard.planning.configured)return null;
  return safeMinor(dashboard.summary.availableToSpendMinor);
}
export function trackedPosition(dashboard:OverviewDashboard):number|null {
  return dashboard.accounts.activeCount>0?safeMinor(dashboard.accounts.trackedNetWorthMinor):null;
}
export function signedActivityAmount(item:ActivityItem):number|null {
  if(item.entityKind!=="transaction"||!item.financialEffect)return null;
  const minor=safeMinor(item.amountMinor);
  if(minor===null)return null;
  if(item.transactionType==="income"||item.transactionType==="refund"||item.transactionType==="reimbursement")return Math.abs(minor);
  if(item.transactionType==="transfer")return minor;
  return -Math.abs(minor);
}
export function isExpense(item:ActivityItem):boolean {
  return item.entityKind==="transaction" && item.transactionType==="expense" && item.financialEffect;
}
export function percentOf(part:number,total:number):number {
  if(!Number.isFinite(part)||!Number.isFinite(total)||total<=0)return 0;
  return Math.max(0,Math.min(100,(part/total)*100));
}
export function periodTitle(dashboard:OverviewDashboard):string {
  const {periodKind,period,profile}=dashboard;
  const start=new Date(period.start),end=new Date(new Date(period.end).getTime()-1);
  const base={timeZone:profile.timeZone} as Intl.DateTimeFormatOptions;
  const formatter=(date:Date,opts:Intl.DateTimeFormatOptions)=>new Intl.DateTimeFormat(profile.locale,{...base,...opts}).format(date);
  if(periodKind==="year")return formatter(start,{year:"numeric"});
  if(periodKind==="quarter")return "Q"+(Math.floor((Number(formatter(start,{month:"numeric"}))-1)/3)+1)+" "+formatter(start,{year:"numeric"});
  if(periodKind==="month")return formatter(start,{month:"long",year:"numeric"});
  return formatter(start,{day:"numeric",month:"short"})+" – "+formatter(end,{day:"numeric",month:"short"});
}
export function formatActivityDate(date:string,locale:string,timeZone:string):string {
  const parsed=new Date(date);
  if(!Number.isFinite(parsed.getTime()))return "Date unavailable";
  return new Intl.DateTimeFormat(locale,{day:"numeric",month:"short",timeZone}).format(parsed);
}
export function buildSpendingPace(
  dashboard:OverviewDashboard,series:AnalyticsTimeSeries|null,
):FinanceTrendPoint[] {
  if(!series || !series.current.length)return[];
  // Currency/period disagreement means never chart a seemingly authoritative amount.
  // The RPCs may encode equivalent UTC instants differently (Z / +00:00).
  // Compare instants, not timestamp serialization bytes.
  if(series.profile.currencyCode!==dashboard.profile.currencyCode||
     Date.parse(series.period.start)!==Date.parse(dashboard.period.start)||
     Date.parse(series.period.end)!==Date.parse(dashboard.period.end))return[];
  const periodStart=Date.parse(dashboard.period.start),periodEnd=Date.parse(dashboard.period.end);
  const asOf=Date.parse(dashboard.period.asOf);
  if(!Number.isFinite(periodStart)||!Number.isFinite(periodEnd)||periodEnd<=periodStart||!Number.isFinite(asOf))return[];
  const limit=Math.max(periodStart,Math.min(asOf,periodEnd));
  const planned=dashboard.planning.configured ? safeMinor(dashboard.planning.plannedSpendMinor) : null;
  let cumulative=0;
  const output:FinanceTrendPoint[]=[];
  for(const p of series.current){
    const bucketStart=Date.parse(p.bucketStart),bucketEnd=Date.parse(p.bucketEnd);
    if(!Number.isFinite(bucketStart)||!Number.isFinite(bucketEnd))return[];
    const value=safeMinor(p.netSpendMinor);
    if(value===null)return[];
    const isPosted=bucketStart<=limit;
    if(isPosted)cumulative+=value;
    if(!Number.isSafeInteger(cumulative))return[];
    const fraction=Math.max(0,Math.min(1,(bucketEnd-periodStart)/(periodEnd-periodStart)));
    const plannedMinor=planned===null?null:Math.round(planned*fraction);
    output.push({
      label:new Intl.DateTimeFormat(dashboard.profile.locale,{day:"numeric",month:"short",timeZone:dashboard.profile.timeZone}).format(new Date(bucketStart)),
      actualMinor:isPosted?cumulative:null,
      plannedMinor,
    });
  }
  return output;
}
