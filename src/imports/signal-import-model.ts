import type {ImportDashboard,ImportPreview,ImportPreviewRecord,ImportDashboardAccount,ParsedImportFile,UpdateImportRecordInput} from "../domain/imports.js";
export const importUuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function validImportId(id:string):boolean{return importUuid.test(id);}
export function safeImportedTransactionLink(id:string|null):string|null{return id&&validImportId(id)?"/activity/transaction/"+id:null;}
export const maxImportFileBytes=8*1024*1024;
export function validateSourceFile(file:{size:number;name:string},account:ImportDashboardAccount|null):string|null{
 if(!account||!validImportId(account.accountId))return "Select a verified Finance account.";
 if(!file.name||!/[.]((csv)|(xml)|(ofx)|(qfx))$/i.test(file.name))return "Use a CSV, XML, OFX or QFX bank export.";
 if(!Number.isSafeInteger(file.size)||file.size<=0||file.size>maxImportFileBytes)return "File must be between 1 byte and 8 MiB.";
 return null;
}
export function validateParsedImport(parsed:ParsedImportFile,account:ImportDashboardAccount):string[]{
 const reasons:string[]=[];
 if(parsed.rows.length===0||parsed.rows.length>10000)reasons.push("Use a non-empty statement with at most 10,000 entries.");
 if(parsed.statement.currencyCode && parsed.statement.currencyCode!==account.currencyCode)reasons.push("Statement currency differs from the selected Finance account. Review currency/FX outside this automatic intake.");
 if(parsed.rows.some(p=>!Number.isSafeInteger(p.amountMinor)||p.amountMinor===0))reasons.push("Statement includes zero, fractional or unsafe minor-unit amounts.");
 if(parsed.rows.some(p=>p.currencyCode!==account.currencyCode))reasons.push("Cross-currency rows require explicit FX handling; this intake does not infer exchange rates.");
 if(parsed.rows.some(p=>!Number.isFinite(Date.parse(p.bookedAt))))reasons.push("Statement includes invalid booking dates.");
 return reasons;
}
export type PreviewAudit={blocking:string[];warnings:string[];ready:number;duplicates:number;review:number;ignored:number;willAnchor:boolean};
export function previewAudit(p:ImportPreview,dashboard:ImportDashboard):PreviewAudit{
 const blocking:string[]=[],warnings:string[]=[];
 const account=dashboard.accounts.find(a=>a.accountId===p.account.accountId);
 if(!account||account.accountId!==p.import.accountId||!validImportId(p.import.importId))blocking.push("Import account or identity not present in authenticated account directory.");
 if(account&&account.currencyCode!==p.account.currencyCode)blocking.push("Source account currency disagrees with the authenticated directory.");
 if(p.import.status==="cancelled"||p.import.status==="completed"||p.import.status==="processing")blocking.push("This import is not an editable, ready-to-commit draft.");
 if(!p.import.fileSha256||!/^[0-9a-f]{64}$/i.test(p.import.fileSha256)||!p.import.storagePath)blocking.push("Original bank statement SHA-256 or custody path is unavailable.");
 if(p.import.status==="failed")blocking.push("Failed import must be investigated before retrying; no silent re-post.");
 if(p.records.length!==p.import.rowCount)blocking.push("Preview record count disagrees with file metadata. Refresh and review.");
 let ready=0,duplicates=0,review=0,ignored=0;
 for(const row of p.records){
  if(row.status==="imported"){continue;}
  if(!validImportId(row.recordId)||!Number.isSafeInteger(row.amountMinor)||row.amountMinor===0){blocking.push("Invalid record identity or minor-unit amount at row "+row.rowNumber);continue;}
  if(!Number.isFinite(Date.parse(row.bookedAt)))blocking.push("Invalid booking date at row "+row.rowNumber);
  if(row.currencyCode!==p.account.currencyCode && (!Number.isSafeInteger(row.reportingAmountMinor)||row.exchangeRate===null||!Number.isFinite(row.exchangeRate)||row.exchangeRate<=0))blocking.push("Missing verified FX reporting value/rate at row "+row.rowNumber);
  if(row.decision==="review"){review++;continue}
  if(row.decision==="duplicate"){duplicates++;continue}
  if(row.decision==="ignore"){ignored++;continue}
  if(row.decision!=="import"){blocking.push("Unknown decision on row "+row.rowNumber);continue;}
  ready++;
  if(row.duplicateReason || row.duplicateTransactionId || row.duplicateRecordId)blocking.push("Potential duplicate row "+row.rowNumber+" must be explicitly marked duplicate or ignored.");
  if(row.proposedType==="transfer"){
   if(!row.transferAccountId||!validImportId(row.transferAccountId)||row.transferAccountId===p.account.accountId){blocking.push("Transfer row "+row.rowNumber+" requires a different valid destination account.");continue}
   const destination=p.accounts.find(a=>a.accountId===row.transferAccountId);
   if(!destination||destination.currencyCode!==p.account.currencyCode)blocking.push("Transfer row "+row.rowNumber+" destination must be a listed same-currency account.");
  } else if(row.proposedType!=="expense"&&row.proposedType!=="income"){blocking.push("Unknown transaction kind on row "+row.rowNumber);}
  else if(!row.categoryId||!p.categories.some(c=>c.categoryId===row.categoryId&&(c.kind==="both"||c.kind===row.proposedType)))blocking.push("Unclassified row "+row.rowNumber+" requires a category matching its transaction kind.");
 }
 if(review>0)blocking.push("Resolve all "+review+" review decisions before posting. Partial posting is not enabled in P36.");
 if(ready===0)blocking.push("There are no approved, unposted transactions to commit.");
 if(ready!==p.summary.readyCount)warnings.push("Backend ready count differs from local verified records; refresh before posting.");
 if(p.import.statementCurrency&&p.import.statementCurrency!==p.account.currencyCode)warnings.push("Statement reports a different currency; inspect original bank export.");
 const willAnchor=p.import.closingBalanceMinor!==null&&p.import.closingBalanceAt!==null;
 if(willAnchor)warnings.push("When fully completed, backend may record the bank statement closing balance as an account observation (or report a cross-currency reconciliation variance).");
 return {blocking:[...new Set(blocking)],warnings,ready,duplicates,review,ignored,willAnchor};
}
export function canUpdateRecord(row:ImportPreviewRecord):boolean{return row.status==="pending"||row.status==="failed";}
export function secureRecordUpdate(input:UpdateImportRecordInput,record:ImportPreviewRecord,preview:ImportPreview):string|null{
 if(!canUpdateRecord(record)||input.recordId!==record.recordId||!validImportId(input.recordId))return "This row is not editable.";
 if(!input.decision||!["review","import","ignore","duplicate"].includes(input.decision))return "Choose a supported review decision.";
 if(input.decision!=="import")return null;
 if(record.duplicateReason||record.duplicateRecordId||record.duplicateTransactionId)return "Potential duplicate evidence requires a non-posting decision.";
 const type=input.proposedType??record.proposedType;
 if(type==="transfer"){
  const to=input.transferAccountId;
  if(!to||!validImportId(to)||to===preview.account.accountId)return "Transfers require a distinct destination account.";
  const target=preview.accounts.find(a=>a.accountId===to);
  if(!target||target.currencyCode!==preview.account.currencyCode)return "Transfers require an authenticated same-currency account.";
 }else if(type==="income"||type==="expense"){
  const category=input.categoryId??record.categoryId;
  if(!category||!preview.categories.some(c=>c.categoryId===category&&(c.kind==="both"||c.kind===type)))return "Choose a matching Finance category.";
 }else return "Transaction type is unsupported.";
 if(record.currencyCode!==preview.account.currencyCode){
  const rate=input.exchangeRate??record.exchangeRate;
  if(!rate||!Number.isFinite(rate)||rate<=0)return "Explicit valid FX rate required.";
 }
 return null;
}
export function sourceFileLabel(sha:string|null):string{return sha&&/^[a-f0-9]{64}$/i.test(sha)?sha.slice(0,12)+"…"+sha.slice(-8):"Not available";}
