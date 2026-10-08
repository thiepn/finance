import type {BudgetPeriodKind,PlanningAllocation,PlanningDashboard,PlanningForecastPoint} from "../domain/planning.js";
export const planStatusCopy={
 unconfigured:"Create a plan",needs_allocations:"Allocate your budget",overplanned:"Plan exceeds expected income",
 at_risk:"Spending may exceed plan",over:"Over budget",on_track:"On track",
} as const;
export function parsePlanMoney(text:string):number|null {
 const raw=text.trim();
 if(!/^\d+(?:[,.]\d{1,2})?$/.test(raw))return null;
 const [whole="0",fraction=""]=raw.replace(",",".").split(".");
 const amount=Number(whole)*100+Number(fraction.padEnd(2,"0"));
 return Number.isSafeInteger(amount)&&amount>=0?amount:null;
}
export function planMoneyInput(minor:number|null):string {
 return minor===null?"":(minor/100).toFixed(2);
}
export function safePlanValue(minor:number|null|undefined):number|null {
 return minor!==null&&minor!==undefined&&Number.isSafeInteger(minor)?minor:null;
}
export function planPercent(spent:number,planned:number):number{
 if(!Number.isFinite(spent)||!Number.isFinite(planned)||planned<=0)return 0;
 return Math.max(0,Math.min(100,(spent/planned)*100));
}
export function sortedAllocations(rows:readonly PlanningAllocation[]):PlanningAllocation[]{
 const priority={over:0,at_risk:1,watch:2,empty:3,on_track:4};
 return [...rows].sort((a,b)=>priority[a.status]-priority[b.status]||b.spentMinor-a.spentMinor||a.categoryName.localeCompare(b.categoryName));
}
export function verifiedAnchor(input:string|null):string|null{
 if(!input||!/^\d{4}-\d{2}-\d{2}$/.test(input))return null;
 const date=new Date(input+"T12:00:00Z");
 if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==input)return null;
 return input;
}
export function shiftPlanPeriod(anchor:string,cadence:BudgetPeriodKind|null,offset:number):string|null {
 const safe=verifiedAnchor(anchor);
 if(!safe||!Number.isSafeInteger(offset)||Math.abs(offset)>12)return null;
 if(cadence==="custom")return null;
 const date=new Date(safe+"T12:00:00Z");
 if(cadence==="weekly")date.setUTCDate(date.getUTCDate()+7*offset);
 else {
  const months=cadence==="quarterly"?3:cadence==="yearly"?12:1;
  const day=date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth()+months*offset);
  const last=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();
  date.setUTCDate(Math.min(day,last));
 }
 return date.toISOString().slice(0,10);
}
export function planPeriodLabel(dashboard:PlanningDashboard):string {
 const {startsOn,endsOn}=dashboard.budget;
 if(!startsOn||!endsOn)return"Active budget period";
 const opt: Intl.DateTimeFormatOptions={month:"short",day:"numeric",year:"numeric",timeZone:"UTC"};
 const fmt=new Intl.DateTimeFormat(dashboard.profile.locale,opt);
 return fmt.format(new Date(startsOn+"T12:00:00Z"))+" – "+fmt.format(new Date(endsOn+"T12:00:00Z"));
}
export type PlanTrendPoint={label:string;actualMinor:number|null;plannedMinor:number|null};
export function planTrend(dashboard:PlanningDashboard):PlanTrendPoint[]{
 if(!dashboard.budget.configured)return[];
 return dashboard.forecast.map((p:PlanningForecastPoint)=>{
  const parsed=new Date(p.bucketStart);
  return {label:Number.isFinite(parsed.getTime())?new Intl.DateTimeFormat(dashboard.profile.locale,{
   day:"numeric",month:"short",timeZone:dashboard.profile.timeZone}).format(parsed):"Period",
   actualMinor:safePlanValue(p.actualCumulativeMinor),
   plannedMinor:safePlanValue(p.plannedCumulativeMinor)};
 });
}
export function canCommitPlanAllocation(dashboard:PlanningDashboard,minor:number,categoryId:string):boolean{
 return !!dashboard.budget.periodId && !!categoryId &&
  dashboard.availableCategories.some(c=>c.categoryId===categoryId) &&
  safePlanValue(minor)!==null&&minor>=0;
}
