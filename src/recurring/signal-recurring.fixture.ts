import type {RecurringDashboard,RecurringDetectionResult} from "../domain/recurring.js";
const id="00000000-0000-4000-8000-000000000011",mid="00000000-0000-4000-8000-000000000022",tid="00000000-0000-4000-8000-000000000033";
const profile={currencyCode:"EUR",locale:"de-DE",timeZone:"Europe/Berlin"};
export const fixtureDashboard:RecurringDashboard={
 profile,anchorDate:"2026-10-10",horizonDays:45,
 summary:{activeCount:2,subscriptionCount:1,monthlyExpenseMinor:149900,annualizedExpenseMinor:1798800,monthlyIncomeMinor:200000,monthlyTransferMinor:30000,
 monthlySubscriptionMinor:1499,baselineMonthlyExpenseMinor:139900,creepDeltaMinor:10000,creepDeltaRatio:.07148,next30dExpenseMinor:151399,next30dCount:2,
 missingCount:1,priceIncreaseCount:1,attentionCount:2},
 categories:[{categoryId:mid,categoryName:"Housing",monthlyMinor:148401,annualizedMinor:1780812,patternCount:1,share:.989}],
 trend:[{monthStart:"2026-08-01",expenseMinor:129900,incomeMinor:0,subscriptionMinor:1299},{monthStart:"2026-09-01",expenseMinor:139900,incomeMinor:0,subscriptionMinor:1399},{monthStart:"2026-10-01",expenseMinor:149900,incomeMinor:0,subscriptionMinor:1499}],
 attention:[{patternId:id,kind:"price_increase",severity:"warning",title:"Streaming service price increase",detail:"Observed posted charge increased.",
 expectedAt:"2026-11-05T08:00:00Z",changeMinor:200,changeRatio:.1539},
 {patternId:mid,kind:"missing",severity:"negative",title:"Rent expectation",detail:"Expected payment not matched.",expectedAt:"2026-10-04T08:00:00Z",changeMinor:null,changeRatio:null}],
 upcoming:[{patternId:id,name:"Media subscription",transactionType:"expense",merchantName:"Media",isSubscription:true,amountMinor:1499,currencyCode:"EUR",
 nextExpectedAt:"2026-11-05T08:00:00Z",daysToNext:26,health:"upcoming"},
 {patternId:mid,name:"Rent",transactionType:"expense",merchantName:null,isSubscription:false,amountMinor:149900,currencyCode:"EUR",
 nextExpectedAt:"2026-11-01T08:00:00Z",daysToNext:22,health:"upcoming"},
 {patternId:tid,name:"Transfer between accounts",transactionType:"transfer",merchantName:null,isSubscription:false,amountMinor:30000,currencyCode:"EUR",
 nextExpectedAt:"2026-11-03T08:00:00Z",daysToNext:24,health:"upcoming"}],
 patterns:[
 {patternId:id,name:"Media subscription",transactionType:"expense",status:"active",health:"upcoming",merchantId:mid,merchantName:"Media",categoryId:null,categoryName:"Subscriptions",
 accountId:null,accountName:null,currencyCode:"EUR",rrule:"FREQ=MONTHLY",cadence:"monthly",cadenceInterval:1,anchorAt:"2026-01-05T08:00:00Z",
 nextExpectedAt:"2026-11-05T08:00:00Z",daysToNext:26,toleranceDays:2,amountToleranceMinor:100,source:"user",confidence:1,
 expectedAmountMinor:1499,effectiveAmountMinor:1499,monthlyEquivalentMinor:1499,annualizedMinor:17988,
 occurrenceCount:8,firstOccurrenceAt:"2026-01-05T08:00:00Z",lastOccurrenceAt:"2026-10-05T08:00:00Z",
 averageAmountMinor:1399,latestAmountMinor:1499,previousAmountMinor:1299,latestTransactionId:tid,
 priceChangeMinor:200,priceChangeRatio:.1539,priceDirection:"up",
 subscription:{subscriptionId:mid,name:"Media",amountMinor:1499,billingFrequency:"monthly",startedOn:"2026-01-05",cancelledOn:null,nextChargeAt:"2026-11-05T08:00:00Z"},
 recentOccurrences:[{transactionId:tid,occurredAt:"2026-10-05T08:00:00Z",amountMinor:1499,expectedAt:"2026-10-05T08:00:00Z",
 amountDeltaMinor:200,timingDeltaDays:0,matchSource:"user",confidence:1}]},
 {patternId:mid,name:"Apartment rent",transactionType:"expense",status:"active",health:"missing",merchantId:null,merchantName:null,categoryId:null,categoryName:"Housing",accountId:null,accountName:null,
 currencyCode:"EUR",rrule:"FREQ=MONTHLY",cadence:"monthly",cadenceInterval:1,anchorAt:"2026-01-01T08:00:00Z",
 nextExpectedAt:"2026-11-01T08:00:00Z",daysToNext:22,toleranceDays:3,amountToleranceMinor:0,source:"learned",confidence:.9,
 expectedAmountMinor:148401,effectiveAmountMinor:148401,monthlyEquivalentMinor:148401,annualizedMinor:1780812,
 occurrenceCount:8,firstOccurrenceAt:"2026-01-01T08:00:00Z",lastOccurrenceAt:"2026-09-01T08:00:00Z",
 averageAmountMinor:148401,latestAmountMinor:148401,previousAmountMinor:148401,latestTransactionId:null,
 priceChangeMinor:0,priceChangeRatio:0,priceDirection:"stable",subscription:null,recentOccurrences:[]}
 ]};
export const fixtureDetection:RecurringDetectionResult={
 anchorDate:"2026-10-10",historyMonths:18,
 candidates:[{candidateId:"test-candidate",name:"Phone plan",transactionType:"expense",merchantId:mid,merchantName:"Telecom",matchDescription:null,currencyCode:"EUR",
 occurrenceCount:4,firstAt:"2026-06-08T08:00:00Z",lastAt:"2026-10-08T08:00:00Z",averageAmountMinor:1199,latestAmountMinor:1199,amountStddevMinor:0,
 amountToleranceMinor:100,averageIntervalDays:30.4,intervalStddevDays:.4,cadence:"monthly",cadenceInterval:1,rrule:"FREQ=MONTHLY",nextExpectedAt:"2026-11-08T08:00:00Z",
 monthlyEquivalentMinor:1199,confidence:.92,transactionIds:[id,mid,tid],subscriptionLikely:true}]
};
export type RecurringFixtureScenario="normal"|"empty"|"late"|"long";
export function recurringScenario(type:RecurringFixtureScenario):{dashboard:RecurringDashboard;detection:RecurringDetectionResult}{
 const dashboard=structuredClone(fixtureDashboard),detection=structuredClone(fixtureDetection);
 if(type==="empty"){dashboard.summary={...dashboard.summary,activeCount:0,subscriptionCount:0,monthlyExpenseMinor:0,annualizedExpenseMinor:0,monthlySubscriptionMinor:0,next30dExpenseMinor:0,next30dCount:0,missingCount:0,priceIncreaseCount:0,attentionCount:0};
 dashboard.patterns=[];dashboard.upcoming=[];dashboard.attention=[];dashboard.trend=[];dashboard.categories=[];detection.candidates=[];}
 if(type==="late"){dashboard.patterns[0]!.health="late";dashboard.attention[0]!.kind="late";dashboard.attention[0]!.title="Unmatched late expected payment";}
 if(type==="long"){dashboard.patterns[0]!.name="Very long recurring merchant and subscription description with an unusually extended reference and billing agreement";
 dashboard.upcoming[0]!.name=dashboard.patterns[0]!.name;}
 return {dashboard,detection};
}
