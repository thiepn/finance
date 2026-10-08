import {
  assertMinorUnits, boundedPercent, currencyMinorDigits, formatSignalMoney,
  moneySourceLabels
} from "./finance-presentation.js";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  SignalCurrentScope, MoneyValue, DataProvenance, MoneyMetric,
  FinancialState, FinanceTable, BudgetAllocationRow, FinanceTrend,
  ReceiptCompare, LedgerRow, FinanceButton, FinancePageHeader
} from "./SignalCurrent.js";
function assert(ok:unknown,msg:string): asserts ok { if(!ok)throw new Error("P26: "+msg); }
function shouldThrow(action:()=>void,msg:string){
 let threw=false;try{action()}catch{threw=true;} assert(threw,msg);
}
assert(currencyMinorDigits("EUR")===2,"EUR has two decimals");
assert(currencyMinorDigits("JPY")===0,"JPY has zero minor digits");
assert(currencyMinorDigits("KWD")===3,"KWD has three minor digits");
assert(formatSignalMoney(4235,"EUR","de-DE").includes("42,35"),"de-DE minor formatting");
assert(formatSignalMoney(-4235,"EUR","de-DE").includes("-"),"signed expense formatting");
assert(formatSignalMoney(500,"JPY","ja-JP").includes("500"),"JPY amount not divided by 100");
assert(formatSignalMoney(1234,"KWD","en-US").includes("1.234"),"KWD milli-unit precision");
assert(formatSignalMoney(0,"EUR","de-DE","exceptZero").includes("0"),"zero no positive sign");
shouldThrow(()=>assertMinorUnits(2.1),"fractional minor amount rejected");
shouldThrow(()=>formatSignalMoney(Number.MAX_SAFE_INTEGER+1),"unsafe integer rejected");
shouldThrow(()=>formatSignalMoney(1,"invalid currency"),"invalid currency rejected");
shouldThrow(()=>boundedPercent(NaN,100),"NaN progress rejected");
assert(boundedPercent(110,100)===100,"progress clamps overage to 100");
assert(boundedPercent(-10,100)===0,"negative progress clamps to 0");
assert(boundedPercent(20,0)===0,"zero budget handled");
assert(moneySourceLabels.receipt.includes("not a ledger posting"),"receipt source caveat");
const render=(el:ReturnType<typeof createElement>)=>renderToStaticMarkup(el);
const money=render(createElement(MoneyValue,{amountMinor:-4235,currency:"EUR",tone:"negative"}));
assert(money.includes("42,35")&&money.includes("sc-money--negative"),"MoneyValue renders correct amount/tone");
const source=render(createElement(DataProvenance,{source:"receipt"}));
assert(source.includes("not a ledger posting"),"receipt provenance is visible");
const balance=render(createElement(MoneyMetric,{label:"Cash",amountMinor:287030,source:"posted",emphasis:true}));
assert(balance.includes("Cash")&&balance.includes("Posted ledger"),"metric source distinguishes posted");
const scope=render(createElement(SignalCurrentScope,{theme:"dark",children:createElement("p",null,"Sample")}));
assert(scope.includes('data-sc-theme="dark"'),"scope requires explicit dark palette");
assert(!scope.includes("sc-root f-shell"),"scope doesn't mix production shell");
const state=render(createElement(FinancialState,{kind:"sign-in",title:"Sign in",description:"Private money only"}));
assert(state.includes("Sign in")&&!state.includes("finance_initialize"),"state hides RPC implementation");
const failure=render(createElement(FinancialState,{kind:"error",title:"Something went wrong",description:"Try again"}));
assert(failure.includes('role="alert"'),"critical error announced");
const table=render(createElement(FinanceTable,{
 caption:"Synthetic ledger",rows:[{id:"a",amount:-100}],rowKey:(x:{id:string;amount:number})=>x.id,
 columns:[{id:"amount",label:"Amount",render:(x:{id:string;amount:number})=>String(x.amount),align:"end"}],
 rowHref:(x:{id:string;amount:number})=>"/activity/transaction/"+x.id
}));
assert(table.includes("<caption>")&&table.includes('scope="col"')&&table.includes("View"),"semantic table includes accessible details");
const row=render(createElement(LedgerRow,{merchant:"REWE",dateLabel:"8 Oct",category:"Groceries",amountMinor:-4235,href:"/activity"}));
assert(row.includes('href="/activity"')&&row.includes("REWE"),"ledger row preserves route");
const bar=render(createElement(BudgetAllocationRow,{label:"Shopping",plannedMinor:10000,spentMinor:12000}));
assert(bar.includes("Overspent")&&bar.includes('aria-valuenow="100"'),"overrun warned and progress clamped");
const chart=render(createElement(FinanceTrend,{title:"Spending",points:[{label:"Mon",actualMinor:100},{label:"Tue",actualMinor:null,plannedMinor:200}]}));
assert(chart.includes("View data table")&&chart.includes("Unavailable")&&chart.includes("Not planned"),"chart exposes missing values in data table");
const receipt=render(createElement(ReceiptCompare,{title:"Review",details:createElement("p",null,"Suggested amount"),status:"needs-review"}));
assert(receipt.includes("Original document not available")&&receipt.includes("not a ledger posting"),"no false verified receipt");
const button=render(createElement(FinanceButton,{children:"Add expense"}));
assert(button.includes('type="button"'),"safe default non-submit button");
const page=render(createElement(FinancePageHeader,{title:"Activity"}));
assert(page.includes("<h1>Activity</h1>"),"small task header semantics");
console.log("P26 presentation domain and SSR component fixtures passed.");
