import type {NetWorthDashboard,WealthAccount,AccountWealthHistory,WealthRangeMonths} from "../domain/wealth.js";
export const wealthUuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function safeWealthId(id:string):boolean{return wealthUuid.test(id);}
export function accountPath(id:string):string|null{return safeWealthId(id)?"/wealth/accounts/"+id:null;}
export function accountActivityPath(id:string):string|null{return safeWealthId(id)?"/activity?account="+id:null;}
export function safeMinor(value:number|null|undefined):number|null{return value!=null&&Number.isSafeInteger(value)?value:null;}
export function displayReportingBalance(a:WealthAccount,reportCurrency:string):number|null{
 return a.currencyCode===reportCurrency?safeMinor(a.reportingBalanceMinor):a.observationId!==null?safeMinor(a.reportingBalanceMinor):null;
}
/** A foreign-currency balance without a qualified reporting observation must never be converted by assumption. */
export function accountNativeBalance(a:WealthAccount):number|null{return safeMinor(a.balanceMinor);}
export function includedAccounts(d:NetWorthDashboard):WealthAccount[]{return d.accounts.filter(a=>!a.isArchived&&a.includeInNetWorth);}
export function accountGroups(d:NetWorthDashboard):{cash:WealthAccount[];assets:WealthAccount[];liabilities:WealthAccount[];excluded:WealthAccount[]}{
 const cashKinds=new Set(["checking","savings","cash"]);
 const cash:WealthAccount[]=[],assets:WealthAccount[]=[],liabilities:WealthAccount[]=[],excluded:WealthAccount[]=[];
 for(const a of d.accounts){if(a.isArchived||!a.includeInNetWorth){excluded.push(a);continue;}
  if(a.position==="liability"){liabilities.push(a);continue;}
  (cashKinds.has(a.kind)?cash:assets).push(a);
 }
 return {cash,assets,liabilities,excluded};
}
export function validObservationMinor(raw:string,currency:string):number|null{
 const digits=new Intl.NumberFormat("en",{style:"currency",currency}).resolvedOptions().maximumFractionDigits??2;
 const input=raw.trim().replace(",",".");
 if(!/^-?\d{1,13}(?:\.\d+)?$/.test(input))return null;
 const [whole,fraction=""]=input.split(".");
 if(fraction.length>digits)return null;
 const n=Number(whole)*10**digits+(whole!.startsWith("-")?-1:1)*Number(fraction.padEnd(digits,"0"));
 return Number.isSafeInteger(n)?n:null;
}
export function validRate(raw:string):number|null{
 const value=Number(raw.trim().replace(",","."));return Number.isFinite(value)&&value>0&&value<=1000000?value:null;
}
export function safeHistory(d:NetWorthDashboard):NetWorthDashboard["history"]{
 return d.history.filter(p=>safeMinor(p.netWorthMinor)!==null&&safeMinor(p.assetsMinor)!==null&&safeMinor(p.liabilitiesMinor)!==null)
 .slice().sort((a,b)=>a.date.localeCompare(b.date));
}
export function historyForAccount(history:AccountWealthHistory|null,id:string,reportCurrency:string):AccountWealthHistory["history"]{
 if(!history||history.account.accountId!==id||history.profile.currencyCode!==reportCurrency)return[];
 return history.history.filter(p=>safeMinor(p.reportingBalanceMinor)!==null&&safeMinor(p.balanceMinor)!==null).slice().sort((a,b)=>a.date.localeCompare(b.date));
}
export function balanceProvenance(a:WealthAccount):string{
 if(a.balanceBasis==="ledger")return "Posted ledger movements";
 if(a.balanceBasis==="observation")return "Explicit "+(a.observationSource??"manual")+" balance observation";
 return "Explicit "+(a.observationSource??"manual")+" observation + later ledger movements";
}
export function bridgeReconciles(d:NetWorthDashboard):boolean|null{
 const b=d.bridge;if([b.openingNetWorthMinor,b.closingNetWorthMinor,b.netWorthChangeMinor,b.ledgerSavingsMinor,b.valuationAndOtherChangeMinor].some(v=>safeMinor(v)===null))return null;
 return b.closingNetWorthMinor-b.openingNetWorthMinor===b.netWorthChangeMinor&&
 b.ledgerSavingsMinor+b.valuationAndOtherChangeMinor===b.netWorthChangeMinor;
}
export function verifiedMonths(value:number):WealthRangeMonths{return value===24||value===60?value:12;}
