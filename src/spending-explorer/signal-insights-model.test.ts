
const assert = Object.assign(
 (value:unknown,message="Assertion failed"):void => {if(!value)throw Error(message)},
 {equal:(a:unknown,b:unknown,message="Values differ"):void=>{if(a!==b)throw Error(message+": "+String(a)+" !== "+String(b))},
  deepEqual:(a:unknown,b:unknown):void=>{if(JSON.stringify(a)!==JSON.stringify(b))throw Error("Deep equality failed")},
  throws:(fn:()=>unknown):void=>{let threw=false;try{fn()}catch{threw=true}if(!threw)throw Error("Expected exception")}}
);
import { syntheticAnalytics, syntheticExplorer } from "./signal-insights.fixture.js";
import { activityHref, defaultInsightsFilters, insightsChartPoints, insightsHref, parseInsightsFilters, validMinor } from "./signal-insights-model.js";
const cat="00000000-0000-4000-8000-000000000011";
const merchant="00000000-0000-4000-8000-000000000021";
assert.deepEqual(parseInsightsFilters("?period=bad&category=../../foo&merchant=evil&necessity=maybe"),defaultInsightsFilters);
const q=parseInsightsFilters("?period=quarter&category="+cat+"&merchant="+merchant+"&necessity=essential");
assert.equal(q.periodKind,"quarter");assert.equal(q.categoryId,cat);assert.equal(q.merchantId,merchant);
assert.equal(parseInsightsFilters(insightsHref(q)).necessity,"essential");
assert.equal(parseInsightsFilters(insightsHref(q,"/explore/categories")).categoryId,cat);
assert(!insightsHref({...q,categoryId:"/activity?token=BAD"}).includes("BAD"),"unsafe detail filtered");
const current=insightsChartPoints(syntheticExplorer,syntheticAnalytics,"net_spend");
assert.equal(current[2]?.current,-1000,"refund bucket remains negative");
assert.equal(current[2]?.previous,null,"missing comparison must not be zero");
assert.equal(current[0]?.previous,50000);
const cash=insightsChartPoints(syntheticExplorer,syntheticAnalytics,"cash_flow");
assert.equal(cash[0]?.current,164000,"cash flow sourced from global ledger RPC");
assert.equal(insightsChartPoints(syntheticExplorer,null,"cash_flow").length,0,"no fabricated cash");
const mismatched=structuredClone(syntheticAnalytics);mismatched.profile.currencyCode="USD";
assert.equal(insightsChartPoints(syntheticExplorer,mismatched,"cash_flow").length,0,"no currency conflation");
const wrongPeriod=structuredClone(syntheticAnalytics);wrongPeriod.period.start="2025-01-01";
assert.equal(insightsChartPoints(syntheticExplorer,wrongPeriod,"income").length,0,"no stale period extrapolation");
assert.throws(()=>validMinor(1.5));assert.throws(()=>validMinor(Number.MAX_SAFE_INTEGER+1));
const ledger=activityHref(syntheticExplorer,merchant);
assert(ledger.startsWith("/activity?"),"only protected canonical activity route");
assert(ledger.includes("from=2026-10-01")&&ledger.includes("to=2026-10-31"),"Berlin DST accounting bounds");
assert(ledger.includes("merchant="+merchant));
assert(!ledger.includes("category"),"activity does not implement fake category filter");
console.log("P32 URL, cash flow, receipt and safe-money invariants passed");
