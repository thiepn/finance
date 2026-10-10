import type {NetWorthDashboard,WealthAccount,AccountWealthHistory} from "../domain/wealth.js";
import {safeWealthId,accountPath,accountActivityPath,validObservationMinor,validRate,safeHistory,historyForAccount,bridgeReconciles,accountGroups,displayReportingBalance,accountNativeBalance,balanceProvenance} from "./signal-wealth-model.js";
const ok=(v:unknown,msg:string)=>{if(!v)throw Error("P35 "+msg);};
const id="00000000-0000-4000-8000-000000000011";
ok(safeWealthId(id)&&accountPath(id)==="/wealth/accounts/"+id&&accountActivityPath(id)==="/activity?account="+id,"allowed ID");
for(const invalid of ["../../api","https://evil","",id+"?token=x","%2F"])ok(!safeWealthId(invalid)&&accountPath(invalid)===null&&accountActivityPath(invalid)===null,"unsafe ID");
ok(validObservationMinor("100,25","EUR")===10025,"locale decimal amount");ok(validObservationMinor("-25.30","EUR")===-2530,"negative amount");
ok(validObservationMinor("25.000","EUR")===null,"fractional minor rejects");ok(validObservationMinor("1e10","EUR")===null,"exponent rejects");
ok(validObservationMinor("100.25","JPY")===null&&validObservationMinor("100","JPY")===100,"non two-decimal currency");
ok(validRate("1.08")===1.08&&validRate("-1")===null&&validRate("Infinity")===null,"exchange rate gate");
const account={accountId:id,kind:"savings",position:"asset",isArchived:false,includeInNetWorth:true,currencyCode:"USD",
 observationId:null,balanceBasis:"ledger",balanceMinor:50000,reportingBalanceMinor:45000} as WealthAccount;
ok(displayReportingBalance(account,"EUR")===null,"foreign currency without qualified observation hidden");
ok(accountNativeBalance(account)===50000,"native amount separate");
ok(displayReportingBalance({...account,observationId:id},"EUR")===45000,"qualified reporting value allowed");
const d={accounts:[account,{...account,kind:"investment",accountId:"a",currencyCode:"EUR"},{...account,kind:"credit_card",accountId:"b",position:"liability"}],
 bridge:{openingNetWorthMinor:10000,closingNetWorthMinor:9000,netWorthChangeMinor:-1000,ledgerSavingsMinor:-1500,valuationAndOtherChangeMinor:500},
 history:[{date:"2026-02-01",netWorthMinor:5000,assetsMinor:6000,liabilitiesMinor:1000},{date:"2026-01-01",netWorthMinor:4500,assetsMinor:5000,liabilitiesMinor:500}]} as unknown as NetWorthDashboard;
ok(accountGroups(d).cash.length===1&&accountGroups(d).assets.length===1&&accountGroups(d).liabilities.length===1,"no asset/liability conflation");
ok(bridgeReconciles(d)===true&&bridgeReconciles({...d,bridge:{...d.bridge,valuationAndOtherChangeMinor:200}})===false,"bridge check");
ok(safeHistory(d)[0]?.date==="2026-01-01","chronological history");
const h={profile:{currencyCode:"EUR"},account:{accountId:id},history:[{date:"2026-01-01",balanceMinor:5000,reportingBalanceMinor:4300}]} as unknown as AccountWealthHistory;
ok(historyForAccount(h,id,"USD").length===0&&historyForAccount(h,"foreign","EUR").length===0,"identity / currency crossmix rejected");
ok(historyForAccount(h,id,"EUR").length===1,"valid history");
ok(balanceProvenance({...account,balanceBasis:"observation_plus_ledger",observationSource:"statement"}).includes("statement"),"source label");
console.log("P35 account identity, currencies, precision, assets and bridge regression passed");
