import type {AcceptanceSnapshot} from "./finance-acceptance-model.js";
export type AcceptanceScenario="unsampled"|"healthy"|"mismatch"|"partial"|"long";
const source=<T>(value:T)=>({state:"success" as const,value});
export function acceptanceFixture(type:AcceptanceScenario):AcceptanceSnapshot{
 if(type==="unsampled")return {overview:{state:"pending"},wealth:{state:"pending"},recurring:{state:"pending"},planning:{state:"pending"},imports:{state:"pending"}};
 const sample={
 overview:source({anchorDate:"2026-10-10",profile:{currencyCode:"EUR",locale:"de-DE",timeZone:"Europe/Berlin"},summary:{incomeMinor:200000,netSpentMinor:100000,netCashFlowMinor:100000}}),
 wealth:source({anchorDate:"2026-10-10",profile:{currencyCode:"EUR",locale:"de-DE",timeZone:"Europe/Berlin"},summary:{assetsMinor:1500000,liabilitiesMinor:500000,netWorthMinor:1000000},bridge:{openingNetWorthMinor:900000,closingNetWorthMinor:1000000,netWorthChangeMinor:100000,ledgerSavingsMinor:40000,valuationAndOtherChangeMinor:60000},
 accounts:[{accountId:"00000000-0000-4000-8000-000000000011",balanceMinor:500000,reportingBalanceMinor:500000}]}),
 recurring:source({anchorDate:"2026-10-10",profile:{currencyCode:"EUR"},summary:{monthlyExpenseMinor:120000,annualizedExpenseMinor:1440000,monthlySubscriptionMinor:6000,next30dExpenseMinor:120000},
 upcoming:[{transactionType:"expense",amountMinor:6000}]}),
 planning:source({anchorDate:"2026-10-10",profile:{currencyCode:"EUR"}}),
 imports:source({imports:[{importId:"00000000-0000-4000-8000-000000000022",status:"completed",importedCount:2,duplicateCount:0,failedCount:0,rowCount:2}]})
 } as unknown as AcceptanceSnapshot;
 if(type==="mismatch"){
  if(sample.wealth.state==="success")sample.wealth.value.summary.netWorthMinor=1100000;
  if(sample.recurring.state==="success")sample.recurring.value.summary.monthlySubscriptionMinor=155000;
 }
 if(type==="partial"){sample.imports={state:"error",reason:"No authenticated import read response"};}
 if(type==="long"){if(sample.imports.state==="success")sample.imports.value.imports=[
  {importId:"00000000-0000-4000-8000-000000000022",status:"failed",importedCount:0,duplicateCount:0,failedCount:1,rowCount:1,fileName:"A very long bank statement description with a highly extended original reference that must not overflow narrow display sizes"}
 ] as unknown as typeof sample.imports.value.imports;}
 return sample;
}
