import type {ActivityItem, ActivitySearchFilters, ActivityEntityKind} from "../domain/activity.js";
import type {CategoryAllocation} from "../domain/finance.js";

export interface ActivityRouteFilters {
 q:string;from:string;to:string;kind:"" | ActivityEntityKind;merchant:string;account:string;
}
export const emptyActivityFilters:ActivityRouteFilters={q:"",from:"",to:"",kind:"",merchant:"",account:""};
const safeDate=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value+"T12:00:00Z"));
export function parseActivityRoute(search:string):ActivityRouteFilters {
 const q=new URLSearchParams(search);
 const kind=q.get("kind");
 return {q:(q.get("q")??"").slice(0,250),from:safeDate(q.get("from")??"")?q.get("from")!:"",
  to:safeDate(q.get("to")??"")?q.get("to")!:"",
  kind:kind==="receipt"||kind==="transaction"?kind:"",
  merchant:(q.get("merchant")??"").slice(0,160),account:(q.get("account")??"").slice(0,160)};
}
export function serializeActivityRoute(f:ActivityRouteFilters):string {
 const q=new URLSearchParams();
 for(const key of ["q","from","to","kind","merchant","account"] as const)if(f[key])q.set(key,f[key]);
 return "/activity"+(q.size?"?"+q.toString():"");
}
export function activityFiltersForRpc(f:ActivityRouteFilters):ActivitySearchFilters {
 return {...(f.from?{from:f.from}:{}),...(f.to?{to:f.to}:{}),
  ...(f.kind?{entityKinds:[f.kind]}:{}),...(f.merchant?{merchantIds:[f.merchant]}:{}),
  ...(f.account?{accountIds:[f.account]}:{})};
}
export function activityDetailHref(item:ActivityItem):string {
 if(item.entityKind==="receipt")return "/receipts/"+encodeURIComponent(item.receiptId??item.id);
 return "/activity/transaction/"+encodeURIComponent(item.transactionId??item.id);
}
export function signedActivityDisplay(item:ActivityItem):number|null {
 if(item.entityKind==="receipt"||!item.financialEffect||item.amountMinor===null||!Number.isSafeInteger(item.amountMinor))return null;
 if(["income","refund","reimbursement"].includes(item.transactionType??""))return Math.abs(item.amountMinor);
 if(item.transactionType==="transfer"||item.transactionType==="opening_balance"||item.transactionType==="adjustment")return item.amountMinor;
 return -Math.abs(item.amountMinor);
}
export function moneyCategory(item:ActivityItem):"positive"|"negative"|"muted"|"default" {
 if(item.entityKind==="receipt"||item.transactionType==="transfer")return"muted";
 return ["income","refund","reimbursement"].includes(item.transactionType??"")?"positive":"default";
}
export function normalizeActivityError(_cause:unknown,operation:"search"|"detail"|"catalog"|"write"):string {
 const copies={search:"Activity could not be loaded. Check your connection and retry.",
  detail:"This record could not be loaded. It may have been removed or you may not have access.",
  catalog:"Some filters are temporarily unavailable.",
  write:"The transaction could not be saved. No successful posting was confirmed; check Activity before retrying."};
 return copies[operation];
}
/** Split totals never round floating point amounts. All values are minor-unit integers. */
export function validateAllocationsForPosting(amountMinor:number,allocations:readonly CategoryAllocation[]):string|null {
 if(!Number.isSafeInteger(amountMinor)||amountMinor<=0)return"Enter a positive amount.";
 if(!allocations.length)return"Add at least one category.";
 let total=0;
 for(const row of allocations){
  if(!row.categoryId)return"Every split needs a category.";
  if(!Number.isSafeInteger(row.amountMinor)||row.amountMinor<=0)return"Split amounts must be positive whole minor units.";
  total+=row.amountMinor;
  if(!Number.isSafeInteger(total))return"Split total is too large.";
 }
 if(total!==amountMinor)return"Category splits must add up exactly to the transaction amount.";
 return null;
}
