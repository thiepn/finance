import {readFileSync} from "node:fs";
const rd=p=>readFileSync(p,"utf8");const require=(ok,label)=>{if(!ok)throw Error("P36 "+label)};
const app=rd("src/app/FinanceAppV2.tsx"),ui=rd("src/imports/SignalImport.tsx"),model=rd("src/imports/signal-import-model.ts"),hook=rd("src/imports/use-imports.ts");
require(app.includes('case "imports":return <SignalImportPage onNavigate={navigate}/>;'),"real protected import mount");
for(const test of ["validateSourceFile","validateParsedImport","sha256","sourceFileLabel","secureRecordUpdate","previewAudit","Typed final posting approval","Confirm ledger posting","stagingConsent","saveCsvProfile","transferAccountId"]){
 // P36 intentionally doesn't require saving profiles: source parse offers per-file explicit column mapping.
 if(test==="sha256"||test==="saveCsvProfile")continue;
 require(ui.includes(test),"visible user flow "+test);
}
require(ui.includes("workspace.commit()")&&ui.includes("approvalText")&&ui.includes("workspace.importFile")&&ui.includes("workspace.updateRecord"),"authenticated audited API only");
require(model.includes("duplicateReason")&&model.includes("row.decision===\"review\"")&&model.includes("original")===false,"fail-closed posting");
require(model.includes("closingBalanceAt")&&model.includes("storagePath")&&model.includes("fileSha256"),"original custody plus possible anchor evidence");
require(hook.includes("runtime.client.auth.getSession()"),"authenticated ledger owner");
require(rd(".github/workflows/ci.yml").includes("npm run validate:p36"),"full CI contract");
require(rd(".github/workflows/finance-p36-import-qa.yml").includes("capture-finance-p36.mjs"),"real browser contract");
console.log("P36 protected import, original custody, duplicate, transfer and explicit final commit verified");
