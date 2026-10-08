import type { OverviewDashboard } from "../domain/overview.js";
import type { AnalyticsTimeSeries } from "../domain/analytics.js";
import type { RecurringDashboard } from "../domain/recurring.js";
import type { ActivityItem } from "../domain/activity.js";
const start="2026-09-30T22:00:00Z",end="2026-10-31T23:00:00Z";
const compareStart="2026-08-31T22:00:00Z",compareEnd=start;
const activity=(id:string,merchant:string,minor:number,kind:ActivityItem["transactionType"]):ActivityItem=>({
 id,entityKind:"transaction",occurredAt:"2026-10-08T12:00:00Z",transactionId:id,
 receiptId:null,transactionType:kind,status:"posted",source:"manual",merchantId:null,merchantName:merchant,title:merchant,
 description:null,note:null,currencyCode:"EUR",amountMinor:minor,financialEffect:true,hasReceipt:merchant==="REWE",
 receiptStatuses:[],accounts:[],categories:[{id:"c1",name:kind==="expense"?"Groceries":"Income",signedAmountMinor:minor,reportingAmountMinor:minor,necessity:"essential",memo:null}],
 productIds:[],productNames:[],tagIds:[],tagNames:[],receiptIds:[],receiptCount:merchant==="REWE"?1:0,itemCount:0
});
export const fixtureOverview: OverviewDashboard={
 periodKind:"month",anchorDate:"2026-10-20",
 profile:{currencyCode:"EUR",locale:"de-DE",timeZone:"Europe/Berlin"},
 period:{start,end,compareStart,compareEnd,asOf:"2026-10-20T11:00:00Z",elapsedRatio:.63},
 summary:{incomeMinor:165000,grossSpendMinor:86240,recoveriesMinor:0,netSpentMinor:86240,netCashFlowMinor:78760,savingsRate:.47733333333333333,transactionCount:21,expenseCount:20,availableToSpendMinor:63760},
 comparison:{incomeMinor:150000,grossSpendMinor:94400,recoveriesMinor:0,netSpentMinor:94400,netCashFlowMinor:55600,savingsRate:.37,transactionCount:25,expenseCount:24},
 planning:{configured:true,budgetPeriodCount:1,plannedIncomeMinor:165000,plannedSpendMinor:150000,budgetedSpentMinor:86240,remainingMinor:63760,paceRatio:.574933333,elapsedRatio:.63,projectedSpendMinor:136900},
 financialStatus:{code:"on_track",tone:"positive"},
 topCategories:[
 {categoryId:"c1",name:"Housing",currentMinor:41000,previousMinor:40000,deltaMinor:1000,deltaRatio:.025,share:.4754},
 {categoryId:"c2",name:"Groceries",currentMinor:18475,previousMinor:22000,deltaMinor:-3525,deltaRatio:-.16,share:.2142},
 {categoryId:"c3",name:"Transport",currentMinor:8420,previousMinor:9000,deltaMinor:-580,deltaRatio:-.064,share:.0976},
 {categoryId:"c4",name:"Dining",currentMinor:7260,previousMinor:9600,deltaMinor:-2340,deltaRatio:-.244,share:.0842},
 {categoryId:"c5",name:"Shopping",currentMinor:6840,previousMinor:9200,deltaMinor:-2360,deltaRatio:-.257,share:.0793}
 ],
 attention:{totalCount:3,items:[
   {code:"receipt_review_required",severity:"warning",entityId:"a1",entityKind:"receipt",subject:"REWE",detailCode:"2",action:"review_receipt",occurredAt:"2026-10-08T12:00:00Z"},
   {code:"unclassified_spending",severity:"warning",entityId:"a2",entityKind:"transaction",subject:"Unclassified transaction",detailCode:"",action:"open_activity",occurredAt:"2026-10-07T12:00:00Z"},
   {code:"receipt_match_suggested",severity:"accent",entityId:"a3",entityKind:"receipt",subject:"Receipt match",detailCode:"90",action:"review_match",occurredAt:"2026-10-06T12:00:00Z"}
 ]},
 recentActivity:[
   activity("r1","REWE",4235,"expense"),activity("r2","DB Regio",1280,"expense"),
   activity("r3","dm",1845,"expense"),activity("r4","Salary",165000,"income"),
   {...activity("evidence","Receipt evidence",0,null),entityKind:"receipt",amountMinor:null,financialEffect:false,transactionId:null,receiptId:"ev1",transactionType:null,status:"review_required"}
 ],
 accounts:{activeCount:2,trackedNetWorthMinor:287030}
};
export const fixtureTrend:AnalyticsTimeSeries={
 profile:{...fixtureOverview.profile},bucketKind:"day",period:{start,end,compareStart,compareEnd},
 current:Array.from({length:31},(_,i)=>{
  const date=new Date(Date.parse("2026-10-01T00:00:00Z")+i*86400000);
  const value=i<19?4000:i===19?10240:0;
  return {bucketIndex:i,bucketStart:date.toISOString(),bucketEnd:new Date(date.getTime()+86400000).toISOString(),
   grossSpendMinor:value,recoveriesMinor:0,netSpendMinor:value,incomeMinor:i===0?165000:0,cashFlowMinor:(i===0?165000:0)-value,transactionCount:i<20?1:0};
 }),
 comparison:[],totals:{current:{grossSpendMinor:86240,recoveriesMinor:0,netSpendMinor:86240,incomeMinor:165000,cashFlowMinor:78760,transactionCount:21},
  comparison:{grossSpendMinor:94400,recoveriesMinor:0,netSpendMinor:94400,incomeMinor:150000,cashFlowMinor:55600,transactionCount:25}}
};
export const fixtureUpcoming={
 profile:{...fixtureOverview.profile},
 summary:{next30dExpenseMinor:74500,next30dCount:4}
} as RecurringDashboard;
export function fixtureScenario(kind:"normal"|"no-plan"|"no-accounts"|"empty"|"overrun"|"source-error"){
 if(kind==="normal")return fixtureOverview;
 const d=structuredClone(fixtureOverview);
 if(kind==="no-plan"){d.planning.configured=false;d.planning.plannedSpendMinor=null;d.planning.budgetedSpentMinor=null;d.planning.remainingMinor=null;d.summary.availableToSpendMinor=null;d.financialStatus.code="positive_cash_flow";}
 if(kind==="no-accounts"){d.accounts.activeCount=0;d.accounts.trackedNetWorthMinor=0;}
 if(kind==="empty"){d.recentActivity=[];d.topCategories=[];d.attention={items:[],totalCount:0};d.summary={...d.summary,netSpentMinor:0,incomeMinor:0,netCashFlowMinor:0,expenseCount:0,transactionCount:0,availableToSpendMinor:null};d.planning.configured=false;d.planning.plannedSpendMinor=null;d.planning.budgetedSpentMinor=null;d.financialStatus={code:"no_activity",tone:"neutral"};}
 if(kind==="overrun"){d.planning.budgetedSpentMinor=165000;d.planning.remainingMinor=-15000;d.summary.availableToSpendMinor=-15000;d.financialStatus={code:"over_plan",tone:"negative"};}
 return d;
}
