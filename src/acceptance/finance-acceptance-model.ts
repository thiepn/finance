import type {OverviewDashboard} from "../domain/overview.js";
import type {NetWorthDashboard} from "../domain/wealth.js";
import type {RecurringDashboard} from "../domain/recurring.js";
import type {PlanningDashboard} from "../domain/planning.js";
import type {ImportDashboard} from "../domain/imports.js";
export type DomainKey="overview"|"wealth"|"recurring"|"planning"|"imports";
export const domains:readonly DomainKey[]=["overview","wealth","recurring","planning","imports"];
export type DomainResult<T>={state:"success";value:T}|{state:"error";reason:string}|{state:"pending"};
export interface AcceptanceSnapshot {
 overview:DomainResult<OverviewDashboard>;wealth:DomainResult<NetWorthDashboard>;
 recurring:DomainResult<RecurringDashboard>;planning:DomainResult<PlanningDashboard>;imports:DomainResult<ImportDashboard>;
}
export type ResultKind="pass"|"attention"|"unverified";
export interface ConsistencyFinding {id:string;kind:ResultKind;source:DomainKey[];headline:string;detail:string;destination:string;}
export type ReleaseStage="staging"|"release"|"postrelease";
export interface GateDecision{stage:ReleaseStage;status:"NO_GO";reasons:readonly string[];}
export function safeCurrency(x:unknown):x is string{return typeof x==="string"&&/^[A-Z]{3}$/.test(x);}
const safe=(n:number):boolean=>Number.isSafeInteger(n);
export function analyzeFinanceSnapshot(s:AcceptanceSnapshot):ConsistencyFinding[]{
 const f:ConsistencyFinding[]=[];
 const push=(id:string,kind:ResultKind,source:DomainKey[],headline:string,detail:string,destination:string)=>f.push({id,kind,source,headline,detail,destination});
 for(const key of domains){const result=s[key];
  if(result.state!=="success")push("source-"+key,"unverified",[key],key+" source unavailable",result.state==="error"?result.reason:"No response loaded yet.",key==="imports"?"/import":key==="wealth"?"/wealth/accounts":key==="recurring"?"/plan/recurring":key==="planning"?"/plan":"/");
 }
 if(s.overview.state==="success"&&s.wealth.state==="success"){
  const ov=s.overview.value,w=s.wealth.value;
  if(!safeCurrency(ov.profile.currencyCode)||!safeCurrency(w.profile.currencyCode)||ov.profile.currencyCode!==w.profile.currencyCode)
   push("overview-wealth-currency","attention",["overview","wealth"],"Reporting currency disagreement","Overview and Wealth reporting units must agree before comparing quantities.","/wealth/net-worth");
  // Do not demand identical net worth across independently anchored timestamps.
  if(ov.anchorDate!==w.anchorDate)push("snapshot-anchor","unverified",["overview","wealth"],"Different reporting anchors","Dashboard values may be based on different dates. Do not infer a cash-flow discrepancy.","/");
 }
 if(s.planning.state==="success"&&s.recurring.state==="success"){
  const a=s.planning.value,b=s.recurring.value;
  if(a.profile.currencyCode!==b.profile.currencyCode)push("planning-recurring-currency","attention",["planning","recurring"],"Forecast currencies disagree","Plan and Recurring expose different reporting currencies.","/plan");
  if(a.anchorDate!==b.anchorDate)push("forecast-anchor","unverified",["planning","recurring"],"Different forecast anchors","Commitments are future estimates; they must not be added to posted spending or treated as already settled.","/plan/recurring");
 }
 if(s.wealth.state==="success"){
  const w=s.wealth.value,b=w.bridge,sum=w.summary;
  const values=[b.openingNetWorthMinor,b.closingNetWorthMinor,b.netWorthChangeMinor,b.ledgerSavingsMinor,b.valuationAndOtherChangeMinor,sum.netWorthMinor,sum.assetsMinor,sum.liabilitiesMinor];
  if(values.some(n=>!safe(n)))push("wealth-units","attention",["wealth"],"Unsafe balance minor units","A balance or bridge field is not an integer-safe minor-unit value.","/wealth/net-worth");
  else {
   if(sum.assetsMinor-sum.liabilitiesMinor!==sum.netWorthMinor)push("wealth-equation","attention",["wealth"],"Balance sheet does not reconcile","Assets minus liabilities differ from the reported net worth.","/wealth/net-worth");
   if(b.closingNetWorthMinor-b.openingNetWorthMinor!==b.netWorthChangeMinor||b.ledgerSavingsMinor+b.valuationAndOtherChangeMinor!==b.netWorthChangeMinor)
    push("wealth-bridge","attention",["wealth"],"Savings and valuation bridge mismatch","Reported posted savings plus valuation/other movement does not match net worth movement.","/wealth/net-worth");
  }
  if(w.accounts.some(a=>!safe(a.balanceMinor)||!safe(a.reportingBalanceMinor)))
   push("wealth-account-units","attention",["wealth"],"Unsafe account balance","At least one account balance is not integer-safe.","/wealth/accounts");
 }
 if(s.recurring.state==="success"){
  const r=s.recurring.value,v=r.summary;
  if(![v.monthlyExpenseMinor,v.annualizedExpenseMinor,v.monthlySubscriptionMinor,v.next30dExpenseMinor].every(safe))
   push("recurring-units","attention",["recurring"],"Recurring money precision invalid","An expense or estimate is not a safe integer in minor units.","/plan/recurring");
  if(v.monthlySubscriptionMinor>v.monthlyExpenseMinor && v.monthlyExpenseMinor>=0)
   push("recurring-subset","attention",["recurring"],"Subscription subset larger than expenses","Subscriptions should be included within recurring expenses, not added as a new total.","/plan/recurring");
  if(r.upcoming.some(x=>x.transactionType==="transfer"))
   push("transfer-forecast","unverified",["recurring"],"Transfer expectations in recurring feed","Transfer predictions are not expenses, and must not be added to spending or cash-flow totals.","/plan/recurring");
 }
 if(s.imports.state==="success"){
  const p=s.imports.value;
  for(const i of p.imports){
   if(![i.importedCount,i.duplicateCount,i.failedCount,i.rowCount].every(n=>safe(n)&&n>=0))
    push("import-count-"+i.importId,"attention",["imports"],"Invalid import counts","A saved statement reports invalid record counts.","/import");
   if(i.status==="review_required"||i.status==="failed")
    push("import-open-"+i.importId,"attention",["imports"],"Import reconciliation still open","Failed or review-required bank statement rows need explicit review. No posted correction is inferred.","/import");
  }
 }
 if(f.length===0)push("no-detected-mismatch","pass",domains.slice(),"No mismatches found in this sample","This is a limited read-only consistency check, not independent bank or release acceptance.","/settings/release");
 return f;
}
export const releaseEvidenceRequirements=[
 {id:"rls",label:"Independent production RLS / cross-account isolation",detail:"Signed owner-scoped disposable evidence and denied cross-user read/write attempts"},
 {id:"bank",label:"Independent bank statement and reconciliation provenance",detail:"Source-file rights, hash, duplicate replay and separate balance-anchor verification"},
 {id:"device",label:"Physical mobile/browser and PWA recovery",detail:"Named Android/iOS devices, offline, reconnect, safe retry and previous stable recovery witnesses"},
 {id:"access",label:"Manual accessibility",detail:"NVDA, TalkBack and VoiceOver keyboard/screen-reader witness with independent operator identity"},
 {id:"signer",label:"Independent operator trust roots",detail:"Off-repo signer fingerprint, custody, revocation chronology and protected witness artifacts"},
 {id:"owner",label:"Human owner finance and release approval",detail:"Explicit signed owner authorization separate from automated CI and product preview"},
 {id:"postrelease",label:"Postrelease rollback, monitoring and incident acceptance",detail:"Independent later acceptance with rollback origin and fresh financial observations"},
] as const;
export type EvidenceId=(typeof releaseEvidenceRequirements)[number]["id"];
export interface EvidenceReference {id:EvidenceId;reference:string;reviewer:string;date:string;}
export function validateEvidenceReference(e:EvidenceReference):string|null{
 if(!releaseEvidenceRequirements.some(x=>x.id===e.id))return "Unknown evidence category";
 if(e.reference.length>180||!/^(https:\/\/[\w.-]+\/[^\s]+|sha256:[a-f0-9]{64})$/i.test(e.reference))
  return "Use a bounded HTTPS evidence URL or SHA-256 digest; never insert financial data or personal identifiers.";
 if(e.reviewer.trim().length<3||e.reviewer.length>80||!/^\d{4}-\d{2}-\d{2}$/.test(e.date)||!Number.isFinite(Date.parse(e.date)))
  return "Reviewer identity and valid dated attestation are required.";
 return null;
}
/** A typed/pasted witness reference is an intake lead, NOT an authenticated approval. */
export function decisionForStage(stage:ReleaseStage,s:AcceptanceSnapshot,refs:readonly EvidenceReference[]):GateDecision {
 const findings=analyzeFinanceSnapshot(s),reasons:string[]=[];
 if(domains.some(d=>s[d].state!=="success"))reasons.push("Read-only financial source coverage incomplete.");
 if(findings.some(f=>f.kind==="attention"))reasons.push("Financial mismatch or unreconciled import attention is open.");
 if(refs.some(r=>validateEvidenceReference(r)!==null))reasons.push("Witness reference format invalid.");
 // Browser-submitted references cannot establish signer authority, revocation status,
 // physical presence or off-Git provenance. No approval API exists; fail closed.
 reasons.push("No independently authenticated off-Git reviewer, trust-root and revocation approval.");
 reasons.push("Human owner, physical accessibility and actual bank/RLS acceptance remain open.");
 if(stage==="release")reasons.push("Owner release/cutover authority is unapproved.");
 if(stage==="postrelease")reasons.push("A distinct postrelease witness and recovery acceptance have not occurred.");
 if(stage==="staging")reasons.push("Staging qualification is not release authorization.");
 return {stage,status:"NO_GO",reasons};
}
