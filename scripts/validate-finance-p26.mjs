#!/usr/bin/env node
/** P26 checks for isolation, locked tokens and dev-only preview. */
import fs from "node:fs";
import assert from "node:assert/strict";
const selection=JSON.parse(fs.readFileSync("design/p25/selection.json","utf8"));
assert.equal(selection.selectedId,"b");
const css=fs.readFileSync("src/ui/v2/signal-current.css","utf8");
const generated=fs.readFileSync("src/ui/v2/signal-current.tokens.css","utf8");
const components=fs.readFileSync("src/ui/v2/SignalCurrent.tsx","utf8");
const main=fs.readFileSync("src/app/main.tsx","utf8");
const index=fs.readFileSync("index.html","utf8");
assert(css.startsWith('@import "./signal-current.tokens.css";'));
assert(!main.includes("showcase-main.tsx")&&!index.includes("p26-showcase"),"P26 synthetic showcase must not be production-mounted");
assert(fs.existsSync("p26-showcase.html"));
assert(generated.includes('data-sc-theme="dark"')&&generated.includes('data-sc-theme="light"'));
for(const c of ["SignalCurrentScope","FinancePageHeader","MoneyValue","DataProvenance","FinanceTable","LedgerRow","BudgetAllocationRow","FinanceTrend","FinancialState","ReceiptCompare","PeriodPicker","AccountSwitcher","ActionMenu","FilterBar","AttentionRow"]){
 assert(components.includes("export function "+c+"(")||components.includes("export function "+c+"<"),"Missing P26 primitive "+c);
}
assert(!css.includes(".f-"),"P26 styles should never rewrite legacy finance components");
assert(!css.includes("linear-gradient("),"Avoid generic gradient/card styling");
assert(css.includes("prefers-reduced-motion"),"Respect reduced motion");
console.log("P26 design system isolation, finance components, and production entrypoint checks passed.");
