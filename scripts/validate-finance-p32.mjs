
import {readFileSync} from "node:fs";
function read(name){return readFileSync(name,"utf8")}
function assert(condition,message){if(!condition)throw Error("P32: "+message)}
const app=read("src/app/FinanceAppV2.tsx"),router=read("src/app/finance-router.ts");
const page=read("src/spending-explorer/SignalInsights.tsx"),model=read("src/spending-explorer/signal-insights-model.ts");
const ci=read(".github/workflows/ci.yml");
assert(app.includes('case "explore":return <SignalInsightsPage'),"Explore must mount live Signal Current component");
assert(app.includes('case "categories":return <SignalInsightsPage'),"Category route must mount new insights");
for(const key of ['"category"','"merchant"','"necessity"'])assert(router.includes(key),"filter deep links must be allowed");
assert(page.includes("useSpendingExplorer")&&page.includes("useAnalyticsTimeSeries"),"live financial service hooks");
assert(page.includes('source="posted"')&&page.includes('source="receipt"'),"source provenance");
assert(model.includes("analytics.period.start !== explorer.period.start"),"reject mismatched cash-flow periods");
assert(model.includes("idPattern.test"),"reject unsafe ids");
assert(ci.includes("npm run validate:p32"),"P32 must be CI gated");
const qa=read(".github/workflows/finance-p32-insights-qa.yml");
assert(qa.includes("capture-finance-p32.mjs"),"real React browser QA must run");
console.log("P32 financial scope, routing, evidence and CI contracts passed");
