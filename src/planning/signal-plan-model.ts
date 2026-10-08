import type {PlanningAllocation,PlanningDashboard,PlanningForecastPoint} from "../domain/planning.js";
import type {FinanceTrendPoint} from "../ui/v2/SignalCurrent.js";

/** Decimal input is converted to exact 2-digit units; never round binary floats. */
export function planMoneyToMinor(raw:string, allowZero=true):number|null {
 const text=raw.trim();
 if(!/^\d+(?:[,.]\d{1,2})?$/.test(text))return null;
 const [whole="0",fraction=""]=text.replace(",",".").split(".");
 const amount=Number(whole)*100+Number(fraction.padEnd(2,"0"));
 if(!Number.isSafeInteger(amount)||amount<0||(!allowZero&&amount===0))return null;
 return amount;
}
export function minorToPlanInput(value:number|null):string {
 if(value===null||!Number.isSafeInteger(value))return "";
 const neg=value<0?"-":"",abs=Math.abs(value);
 return neg+Math.floor(abs/100)+","+(abs%100).toString().padStart(2,"0");
}
export function verifiedPlanMoney(value:number|null|undefined):number|null {
 return value!==null&&value!==undefined&&Number.isSafeInteger(value)?value:null;
}
export function budgetFraction(used:number,planned:number):number|null {
 if(!Number.isSafeInteger(used)||!Number.isSafeInteger(planned)||planned<=0)return null;
 return Math.min(100,Math.max(0,Math.round(100*used/planned)));
}
export function orderedAllocations(rows:readonly PlanningAllocation[]):PlanningAllocation[] {
 const weights={over:0,at_risk:1,watch:2,empty:3,on_track:4};
 return [...rows].sort((a,b)=>weights[a.status]-weights[b.status]||a.categoryName.localeCompare(b.categoryName));
}
export function planForecastPoints(dashboard:PlanningDashboard):FinanceTrendPoint[] {
 return dashboard.forecast.map((p:PlanningForecastPoint,i)=>({
   label:new Intl.DateTimeFormat(dashboard.profile.locale,{
     day:"numeric",month:"short",timeZone:dashboard.profile.timeZone
   }).format(new Date(p.bucketEnd)),
   actualMinor:verifiedPlanMoney(p.actualCumulativeMinor),
   plannedMinor:dashboard.budget.configured?verifiedPlanMoney(p.plannedCumulativeMinor):null,
 })).filter((p,i)=>i<120);
}
export function validPlanAnchor(value:string):boolean {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const d=new Date(value+"T12:00:00Z");
 return !Number.isNaN(d.valueOf())&&d.toISOString().slice(0,10)===value;
}
export function budgetOutcomeLabel(status:PlanningDashboard["budget"]["status"]):string {
 const labels={unconfigured:"Not configured",needs_allocations:"Set allocations",
   overplanned:"More allocated than available",at_risk:"Spending pace at risk",
   over:"Over budget",on_track:"On track"} as const;
 return labels[status];
}
export function actionableBudgetCount(dashboard:PlanningDashboard):number {
 return dashboard.allocations.filter(a=>a.status==="over"||a.status==="at_risk").length;
}
export function isEligibleGoalMovement(goalId:string,amount:number,kind:"contribution"|"withdrawal",
 dashboard:PlanningDashboard):boolean {
 const g=dashboard.goals.find(g=>g.goalId===goalId);
 return !!g&&g.status==="active"&&Number.isSafeInteger(amount)&&amount>0 &&
   (kind!=="withdrawal"||g.fundedMinor>=amount);
}
