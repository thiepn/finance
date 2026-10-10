import type {RecurringDashboard,RecurringPattern,RecurringDetectionCandidate,RecurringUpcomingItem,RecurringAttentionItem} from "../domain/recurring.js";
export type RecurringFilter="all"|"subscriptions"|"expenses"|"attention"|"paused";
export const financeId=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function safeRecurringId(id:string):boolean{return financeId.test(id);}
export function activityTransactionPath(id:string|null):string|null{return id&&safeRecurringId(id)?"/activity/transaction/"+encodeURIComponent(id):null;}
export function merchantRecurringPath(id:string|null):string|null{return id&&safeRecurringId(id)?"/explore?merchant="+encodeURIComponent(id):null;}
export function recurringFilter(items:readonly RecurringPattern[],filter:RecurringFilter):RecurringPattern[]{
 return items.filter(p=>filter==="all"||filter==="subscriptions"&&Boolean(p.subscription)||filter==="expenses"&&p.transactionType==="expense"||
 filter==="attention"&&["late","missing","due"].includes(p.health)||filter==="paused"&&p.status==="paused");
}
export function safeAmount(value:number):number|null{return Number.isSafeInteger(value)?value:null;}
export function profileAmount(value:number,currency:string,reportCurrency:string):number|null{return currency===reportCurrency?safeAmount(value):null;}
export function recurrenceKind(item:RecurringUpcomingItem):"expense"|"income"|"transfer"|"other"{
 if(item.transactionType==="expense")return "expense";
 if(item.transactionType==="income")return "income";
 if(item.transactionType==="transfer")return "transfer";
 return "other";
}
export function expectedCharges(dashboard:RecurringDashboard):RecurringUpcomingItem[]{
 return dashboard.upcoming.filter(p=>recurrenceKind(p)==="expense")
 .slice().sort((a,b)=>Date.parse(a.nextExpectedAt)-Date.parse(b.nextExpectedAt));
}
export function alerts(dashboard:RecurringDashboard):RecurringAttentionItem[]{
 const order={missing:0,late:1,price_increase:2};
 return dashboard.attention.slice().sort((a,b)=>order[a.kind]-order[b.kind]);
}
export function statusChangeAllowed(pattern:RecurringPattern,target:"active"|"paused"|"ended"):boolean{
 return (target==="paused"&&pattern.status==="active")||(target==="active"&&pattern.status==="paused");
}
export function candidateEligible(candidate:RecurringDetectionCandidate,profileCurrency:string):boolean{
 return candidate.currencyCode===profileCurrency&&candidate.occurrenceCount>=2&&Number.isSafeInteger(candidate.latestAmountMinor)&&
 Number.isSafeInteger(candidate.monthlyEquivalentMinor)&&candidate.confidence>=0&&candidate.confidence<=1&&
 candidate.transactionIds.length>=2&&candidate.transactionIds.every(safeRecurringId)&&Number.isFinite(Date.parse(candidate.nextExpectedAt));
}
export function percentChange(value:number|null,locale:string):string{
 if(value===null||!Number.isFinite(value))return "No comparable baseline";
 return new Intl.NumberFormat(locale,{style:"percent",maximumFractionDigits:1,signDisplay:"exceptZero"}).format(value);
}
export function displayDate(instant:string,locale:string,timeZone:string):string{
 const d=new Date(instant);if(!Number.isFinite(d.getTime()))return "Date unavailable";
 return new Intl.DateTimeFormat(locale,{day:"numeric",month:"short",year:"numeric",timeZone}).format(d);
}
/** No client-side bank aggregation or forecasting: RPC values are authoritative and non-additive. */
export function safeMonthlySummary(dashboard:RecurringDashboard):{
 monthlyExpense:number|null;annualized:number|null;subscription:number|null;next30:number|null;
}{
 const s=dashboard.summary;
 return {monthlyExpense:safeAmount(s.monthlyExpenseMinor),annualized:safeAmount(s.annualizedExpenseMinor),
 subscription:safeAmount(s.monthlySubscriptionMinor),next30:safeAmount(s.next30dExpenseMinor)};
}
