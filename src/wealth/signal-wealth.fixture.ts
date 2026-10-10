import type {NetWorthDashboard,AccountWealthHistory,WealthAccount} from "../domain/wealth.js";
const checkingId="00000000-0000-4000-8000-000000000011",investmentId="00000000-0000-4000-8000-000000000022",
loanId="00000000-0000-4000-8000-000000000033",foreignId="00000000-0000-4000-8000-000000000044";
export const profile={currencyCode:"EUR",locale:"de-DE",timeZone:"Europe/Berlin"};
const base:WealthAccount={accountId:checkingId,name:"Everyday checking",kind:"checking",currencyCode:"EUR",institutionName:"Local bank",accountLast4:"4581",includeInNetWorth:true,isArchived:false,
balanceMinor:387250,reportingBalanceMinor:387250,position:"asset",displayBalanceMinor:387250,
observationId:null,observationAt:null,observationSource:null,ledgerDeltaMinor:387250,reportingLedgerDeltaMinor:387250,lastActivityAt:"2026-10-06T12:00:00Z",balanceBasis:"ledger"};
export const dashboard:NetWorthDashboard={profile,anchorDate:"2026-10-10",range:{months:12,startDate:"2025-11-01",asOf:"2026-10-10T12:00:00Z"},
summary:{netWorthMinor:1807250,assetsMinor:2207250,liabilitiesMinor:400000,previousMonthNetWorthMinor:1757250,monthChangeMinor:50000,monthChangeRatio:.0284,yearStartNetWorthMinor:1600000,ytdChangeMinor:207250},
savings:{currentMonthIncomeMinor:200000,currentMonthSpendMinor:180000,currentMonthSavingsMinor:20000,currentMonthSavingsRate:.1,
ytdIncomeMinor:2200000,ytdSpendMinor:1850000,ytdSavingsMinor:350000,ytdSavingsRate:.159},
bridge:{openingNetWorthMinor:1757250,closingNetWorthMinor:1807250,netWorthChangeMinor:50000,ledgerSavingsMinor:20000,valuationAndOtherChangeMinor:30000},
accounts:[base,{...base,accountId:investmentId,name:"Index investment portfolio",kind:"investment",institutionName:"Broker",accountLast4:null,
balanceMinor:1820000,reportingBalanceMinor:1820000,displayBalanceMinor:1820000,observationId:investmentId,observationAt:"2026-10-10T10:00:00Z",
observationSource:"market",ledgerDeltaMinor:0,reportingLedgerDeltaMinor:0,lastActivityAt:"2026-10-05T00:00:00Z",balanceBasis:"observation"},
{...base,accountId:loanId,name:"Car loan",kind:"loan",institutionName:"Bank",accountLast4:null,position:"liability",
balanceMinor:-400000,reportingBalanceMinor:-400000,displayBalanceMinor:400000,observationId:loanId,observationAt:"2026-10-01T00:00:00Z",
observationSource:"statement",ledgerDeltaMinor:0,reportingLedgerDeltaMinor:0,balanceBasis:"observation"},
{...base,accountId:foreignId,name:"Dollar account",kind:"savings",currencyCode:"USD",institutionName:"Global bank",accountLast4:null,
balanceMinor:90000,reportingBalanceMinor:81000,displayBalanceMinor:81000,observationId:null,balanceBasis:"ledger"}],
history:[{monthStart:"2026-07-01",date:"2026-07-31",netWorthMinor:1657250,assetsMinor:2057250,liabilitiesMinor:400000},
{monthStart:"2026-08-01",date:"2026-08-31",netWorthMinor:1717250,assetsMinor:2117250,liabilitiesMinor:400000},
{monthStart:"2026-09-01",date:"2026-09-30",netWorthMinor:1757250,assetsMinor:2157250,liabilitiesMinor:400000},
{monthStart:"2026-10-01",date:"2026-10-10",netWorthMinor:1807250,assetsMinor:2207250,liabilitiesMinor:400000}],
savingsHistory:[{monthStart:"2026-10-01",incomeMinor:200000,netSpentMinor:180000,savingsMinor:20000,savingsRate:.1}],
composition:[{kind:"checking",netMinor:387250,assetMinor:387250,liabilityMinor:0,accountCount:1},
{kind:"investment",netMinor:1820000,assetMinor:1820000,liabilityMinor:0,accountCount:1},
{kind:"loan",netMinor:-400000,assetMinor:0,liabilityMinor:400000,accountCount:1}],
investmentBridges:[{accountId:investmentId,name:"Index investment portfolio",currencyCode:"EUR",openingBalanceMinor:1790000,closingBalanceMinor:1820000,
netTransactionFlowMinor:0,residualValueChangeMinor:30000}]};
export const history:AccountWealthHistory={profile,account:{accountId:checkingId,name:"Everyday checking",kind:"checking",currencyCode:"EUR",institutionName:"Local bank",
includeInNetWorth:true,isArchived:false},history:[{date:"2026-08-31",balanceMinor:310000,reportingBalanceMinor:310000},{date:"2026-09-30",balanceMinor:342000,reportingBalanceMinor:342000},
{date:"2026-10-10",balanceMinor:387250,reportingBalanceMinor:387250}]};
export type Scenario="normal"|"empty"|"foreign"|"long";
export function fixture(scenario:Scenario):NetWorthDashboard {
 const d=structuredClone(dashboard);
 if(scenario==="empty"){d.accounts=[];d.history=[];d.composition=[];d.investmentBridges=[];d.summary={...d.summary,netWorthMinor:0,assetsMinor:0,liabilitiesMinor:0,monthChangeMinor:0};
 d.bridge={openingNetWorthMinor:0,closingNetWorthMinor:0,netWorthChangeMinor:0,ledgerSavingsMinor:0,valuationAndOtherChangeMinor:0};}
 if(scenario==="foreign"){d.accounts=[d.accounts.find(a=>a.accountId===foreignId)!];d.summary.netWorthMinor=0;d.summary.assetsMinor=0;d.summary.liabilitiesMinor=0;}
 if(scenario==="long"){d.accounts[0]!.name="An extremely detailed account title for a shared savings arrangement and legacy checking balance / very long institution identifier that should never horizontally overflow";}
 return d;
}
