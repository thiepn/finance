
import type { SpendingExplorer } from "../domain/spending-explorer.js";
import type { AnalyticsTimeSeries } from "../domain/analytics.js";
const cat="00000000-0000-4000-8000-000000000011", merchant="00000000-0000-4000-8000-000000000021";
export const syntheticExplorer:SpendingExplorer={
 periodKind:"month",anchorDate:"2026-10-10",profile:{currencyCode:"EUR",locale:"de-DE",timeZone:"Europe/Berlin"},
 period:{start:"2026-09-30T22:00:00Z",end:"2026-10-31T23:00:00Z",compareStart:"2026-08-31T22:00:00Z",compareEnd:"2026-09-30T22:00:00Z"},
 bucketKind:"day",scope:{categoryId:null,merchantId:null,necessity:null,categoryName:null,merchantName:null,breadcrumb:[]},
 summary:{current:{grossSpendMinor:124000,recoveriesMinor:6000,netSpendMinor:118000,transactionCount:23},
  comparison:{grossSpendMinor:102000,recoveriesMinor:2000,netSpendMinor:100000,transactionCount:20},
  deltaMinor:18000,deltaRatio:.18,itemizedEvidenceMinor:33000,itemizedCoverageRatio:.28},
 series:{
  current:[{bucketIndex:0,bucketStart:"2026-09-30T22:00:00Z",bucketEnd:"2026-10-01T22:00:00Z",grossSpendMinor:56000,recoveriesMinor:0,netSpendMinor:56000,transactionCount:2},
   {bucketIndex:1,bucketStart:"2026-10-01T22:00:00Z",bucketEnd:"2026-10-02T22:00:00Z",grossSpendMinor:30000,recoveriesMinor:0,netSpendMinor:30000,transactionCount:4},
   {bucketIndex:2,bucketStart:"2026-10-02T22:00:00Z",bucketEnd:"2026-10-03T22:00:00Z",grossSpendMinor:5000,recoveriesMinor:6000,netSpendMinor:-1000,transactionCount:2},
   {bucketIndex:3,bucketStart:"2026-10-03T22:00:00Z",bucketEnd:"2026-10-04T22:00:00Z",grossSpendMinor:33000,recoveriesMinor:0,netSpendMinor:33000,transactionCount:3}],
  comparison:[{bucketIndex:0,bucketStart:"2026-08-31T22:00:00Z",bucketEnd:"2026-09-01T22:00:00Z",grossSpendMinor:50000,recoveriesMinor:0,netSpendMinor:50000,transactionCount:2},
   {bucketIndex:1,bucketStart:"2026-09-01T22:00:00Z",bucketEnd:"2026-09-02T22:00:00Z",grossSpendMinor:22000,recoveriesMinor:2000,netSpendMinor:20000,transactionCount:3},
   {bucketIndex:3,bucketStart:"2026-09-03T22:00:00Z",bucketEnd:"2026-09-04T22:00:00Z",grossSpendMinor:28000,recoveriesMinor:0,netSpendMinor:28000,transactionCount:4}]},
 children:[{categoryId:cat,name:"Groceries",currentMinor:43000,previousMinor:32000,deltaMinor:11000,deltaRatio:.34375,share:.36,transactionCount:11,hasChildren:true},
  {categoryId:"00000000-0000-4000-8000-000000000012",name:"Housing",currentMinor:56000,previousMinor:55000,deltaMinor:1000,deltaRatio:.01818,share:.47,transactionCount:2,hasChildren:false},
  {categoryId:"00000000-0000-4000-8000-000000000013",name:"Transport",currentMinor:19000,previousMinor:13000,deltaMinor:6000,deltaRatio:.46,share:.16,transactionCount:5,hasChildren:false}],
 directCategoryMinor:0,merchants:[{merchantId:merchant,name:"Weekly Market",currentMinor:40000,previousMinor:32000,deltaMinor:8000,deltaRatio:.25,share:.34,transactionCount:7},
  {merchantId:"00000000-0000-4000-8000-000000000022",name:"City Services",currentMinor:24000,previousMinor:20000,deltaMinor:4000,deltaRatio:.2,share:.20,transactionCount:3}],
 necessities:[{necessity:"essential",label:"Essential",currentMinor:95000,previousMinor:78000,deltaMinor:17000,deltaRatio:.21,share:.8}],
 products:[{productId:"00000000-0000-4000-8000-000000000031",name:"Oat milk 1 L",brand:null,familyId:null,familyName:null,productType:null,
  currentItemizedMinor:1580,previousItemizedMinor:1200,deltaMinor:380,deltaRatio:.316,purchaseCount:6,quantity:6,shareOfItemized:.0479}]
};
export const syntheticAnalytics:AnalyticsTimeSeries={
 profile:syntheticExplorer.profile,bucketKind:"day",period:syntheticExplorer.period,
 current:syntheticExplorer.series.current.map(p=>({...p,incomeMinor:p.bucketIndex===0?220000:0,cashFlowMinor:(p.bucketIndex===0?220000:0)-p.netSpendMinor})),
 comparison:syntheticExplorer.series.comparison.map(p=>({...p,incomeMinor:p.bucketIndex===0?210000:0,cashFlowMinor:(p.bucketIndex===0?210000:0)-p.netSpendMinor})),
 totals:{current:{grossSpendMinor:124000,recoveriesMinor:6000,netSpendMinor:118000,incomeMinor:220000,cashFlowMinor:102000,transactionCount:23},
  comparison:{grossSpendMinor:102000,recoveriesMinor:2000,netSpendMinor:100000,incomeMinor:210000,cashFlowMinor:110000,transactionCount:20}}
};
export function insightsScenario(name:"normal"|"empty"|"refund"|"long"):SpendingExplorer{
 const e=structuredClone(syntheticExplorer);
 if(name==="empty"){e.children=[];e.merchants=[];e.products=[];e.series.current=[];e.series.comparison=[];e.summary.current.netSpendMinor=0;e.summary.current.transactionCount=0;e.summary.itemizedCoverageRatio=null;}
 if(name==="refund"){e.series.current[2]!.netSpendMinor=-20000;e.series.current[2]!.recoveriesMinor=25000;}
 if(name==="long"){e.merchants[0]!.name="Extremely long merchant name with an internationalized location and detailed invoice description";e.children[0]!.name="Supermarket and specialty groceries with very long descriptive names";}
 return e;
}
