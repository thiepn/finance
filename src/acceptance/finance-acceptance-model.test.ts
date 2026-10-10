import type {AcceptanceSnapshot,EvidenceReference} from "./finance-acceptance-model.js";
import {analyzeFinanceSnapshot,decisionForStage,validateEvidenceReference,releaseEvidenceRequirements} from "./finance-acceptance-model.js";
const ok=(v:unknown,m:string)=>{if(!v)throw Error("P37 "+m);};
const incomplete:AcceptanceSnapshot={overview:{state:"pending"},wealth:{state:"pending"},recurring:{state:"pending"},planning:{state:"pending"},imports:{state:"pending"}};
for(const stage of ["staging","release","postrelease"] as const)ok(decisionForStage(stage,incomplete,[]).status==="NO_GO","empty evidence fails closed");
const sample={...incomplete,overview:{state:"success",value:{anchorDate:"2026-10-10",profile:{currencyCode:"EUR"}}},wealth:{state:"success",value:{anchorDate:"2026-10-10",profile:{currencyCode:"EUR"},summary:{netWorthMinor:100,assetsMinor:150,liabilitiesMinor:50},bridge:{openingNetWorthMinor:50,closingNetWorthMinor:100,netWorthChangeMinor:50,ledgerSavingsMinor:20,valuationAndOtherChangeMinor:30},accounts:[]}},recurring:{state:"success",value:{anchorDate:"2026-10-10",profile:{currencyCode:"EUR"},summary:{monthlyExpenseMinor:1000,annualizedExpenseMinor:12000,monthlySubscriptionMinor:100,next30dExpenseMinor:1000},upcoming:[]}},planning:{state:"success",value:{anchorDate:"2026-10-10",profile:{currencyCode:"EUR"}}},imports:{state:"success",value:{imports:[]}}} as unknown as AcceptanceSnapshot;
ok(analyzeFinanceSnapshot(sample).every(f=>f.kind!=="attention"),"internally consistent sources not misclassified");
ok(analyzeFinanceSnapshot({...sample,wealth:{state:"success",value:{...sample.wealth.state==="success"?sample.wealth.value:{},summary:{netWorthMinor:1,assetsMinor:150,liabilitiesMinor:50},bridge:{openingNetWorthMinor:50,closingNetWorthMinor:100,netWorthChangeMinor:50,ledgerSavingsMinor:20,valuationAndOtherChangeMinor:30},accounts:[],profile:{currencyCode:"EUR"},anchorDate:"2026-10-10"}}} as AcceptanceSnapshot).some(f=>f.id==="wealth-equation"),"mismatch detected");
const compromised=[{id:"owner",reference:"sha256:"+"a".repeat(64),reviewer:"Self-attested",date:"2026-10-10"}] as EvidenceReference[];
ok(validateEvidenceReference(compromised[0]!)===null,"bounded intake accepted");
for(const stage of ["staging","release","postrelease"] as const){
 ok(decisionForStage(stage,sample,compromised).status==="NO_GO","self attested never authorizes "+stage);
}
ok(validateEvidenceReference({...compromised[0]!,reference:"javascript:alert(1)"})!==null,"rejects XSS reference");
ok(validateEvidenceReference({...compromised[0]!,reference:"https://example.org/white space"})!==null,"rejects whitespace");
ok(releaseEvidenceRequirements.length>=7,"all human/custody gates represented");
console.log("P37 independent release default deny, cross-domain financial integrity and witness intake tests passed");
