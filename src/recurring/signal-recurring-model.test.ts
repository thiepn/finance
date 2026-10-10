import type {RecurringDashboard,RecurringPattern,RecurringDetectionCandidate} from "../domain/recurring.js";
import {activityTransactionPath,merchantRecurringPath,candidateEligible,expectedCharges,recurringFilter,safeMonthlySummary,percentChange,statusChangeAllowed,profileAmount} from "./signal-recurring-model.js";
const check=(v:unknown,label:string)=>{if(!v)throw Error("P34: "+label)};
const id="00000000-0000-4000-8000-000000000011";
check(activityTransactionPath(id)==="/activity/transaction/"+id,"activity route");
check(merchantRecurringPath(id)==="/explore?merchant="+id,"merchant route");
for(const evil of ["https://evil.test","../../api","",id+"?secret=1"]){
 check(activityTransactionPath(evil)===null&&merchantRecurringPath(evil)===null,"unsafe navigation rejected");
}
const pattern={patternId:id,status:"active",health:"missing",transactionType:"expense",subscription:{subscriptionId:id}} as RecurringPattern;
check(recurringFilter([pattern],"attention").length===1,"missing flagged");
check(recurringFilter([pattern],"subscriptions").length===1,"subscription shown");
check(statusChangeAllowed(pattern,"paused"),"pause allowed");
check(!statusChangeAllowed(pattern,"ended"),"ending forbidden without audited reversible contract");
const candidate={currencyCode:"EUR",occurrenceCount:3,latestAmountMinor:1299,monthlyEquivalentMinor:1299,confidence:.91,nextExpectedAt:"2026-11-02T00:00:00Z",transactionIds:[id,id]} as RecurringDetectionCandidate;
check(candidateEligible(candidate,"EUR"),"candidate eligible");
check(!candidateEligible({...candidate,currencyCode:"USD"},"EUR"),"cross currency cannot confirm");
check(!candidateEligible({...candidate,transactionIds:["fake"]},"EUR"),"invalid evidence IDs refused");
check(!candidateEligible({...candidate,latestAmountMinor:1.5},"EUR"),"fractional minor refused");
const dash={summary:{monthlyExpenseMinor:2000,annualizedExpenseMinor:24000,monthlySubscriptionMinor:800,next30dExpenseMinor:1600},
 upcoming:[{patternId:id,transactionType:"transfer",nextExpectedAt:"2026-10-11T10:00:00Z"},{patternId:id,transactionType:"expense",nextExpectedAt:"2026-10-12T10:00:00Z"},{patternId:id,transactionType:"income",nextExpectedAt:"2026-10-10T10:00:00Z"}]} as RecurringDashboard;
check(expectedCharges(dash).length===1,"transfers/income excluded from expense commitments");
check(safeMonthlySummary(dash).annualized===24000,"RPC total preserved");
check(profileAmount(1200,"USD","EUR")===null,"cross-currency aggregation blocked");
check(profileAmount(Number.MAX_SAFE_INTEGER+10,"EUR","EUR")===null,"unsafe money blocked");
check(percentChange(null,"de-DE").includes("No comparable"),"missing comparison not 0 percent");
console.log("P34 recurring forecasts, evidence, safe routes and mutation contract passed");