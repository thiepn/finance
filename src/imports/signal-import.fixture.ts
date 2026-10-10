import type {ImportDashboard,ImportPreview,ImportPreviewRecord} from "../domain/imports.js";
const accountId="00000000-0000-4000-8000-000000000011",transferId="00000000-0000-4000-8000-000000000022",recId="00000000-0000-4000-8000-000000000033",catId="00000000-0000-4000-8000-000000000044";
export const dashboard:ImportDashboard={imports:[],profiles:[],accounts:[{accountId,name:"Main checking account",currencyCode:"EUR",kind:"checking",institutionName:"Example Bank"},
 {accountId:transferId,name:"Savings account",currencyCode:"EUR",kind:"savings",institutionName:"Example Bank"}]};
const row:ImportPreviewRecord={recordId:recId,rowNumber:1,status:"pending",decision:"import",externalId:"FITID-2026-08-01",bookedAt:"2026-10-01T12:00:00Z",
valueDate:"2026-10-01",amountMinor:-1299,reportingAmountMinor:-1299,exchangeRate:1,currencyCode:"EUR",description:"Example subscription",
counterpartyName:"Media service",counterpartyIban:null,reference:"Invoice 0458",sourceHash:"a".repeat(64),fingerprint:"b".repeat(64),
duplicateReason:null,duplicateTransactionId:null,duplicateRecordId:null,proposedType:"expense",categoryId:catId,necessity:"flexible",transferAccountId:null,
merchantId:null,classificationResult:{},transactionId:null,errorText:null};
export const basePreview:ImportPreview={import:{importId:accountId,accountId,source:"Test Bank",format:"csv",fileName:"synthetic-statement.csv",fileSha256:"c".repeat(64),
storagePath:accountId+"/"+accountId+"/source.csv",status:"review_required",rowCount:1,importedCount:0,duplicateCount:0,failedCount:0,
accountIdentifier:"DE00 0000 0000 0000 0000 00",statementCurrency:"EUR",statementFrom:"2026-10-01",statementTo:"2026-10-01",
closingBalanceMinor:254201,closingBalanceAt:"2026-10-01T23:59:00Z",mapping:{},detectedMetadata:{},metadata:{},createdAt:"2026-10-10T10:00:00Z",previewedAt:"2026-10-10T11:00:00Z",committedAt:null},
account:dashboard.accounts[0]!,summary:{readyCount:1,reviewCount:0,duplicateCount:0,ignoredCount:0,debitMinor:1299,creditMinor:0},
records:[row],categories:[{categoryId:catId,name:"Subscriptions",kind:"expense",necessityDefault:"flexible",depth:1,path:["Spending","Subscriptions"]}],
accounts:dashboard.accounts};
export type Scenario="normal"|"empty"|"duplicate"|"transfer"|"missing"|"long";
export function fixture(type:Scenario):ImportPreview{
 const p=structuredClone(basePreview);
 if(type==="empty"){p.records=[];p.import.rowCount=0;p.summary.readyCount=0;}
 if(type==="duplicate"){p.records[0]!.duplicateReason="source_id";p.records[0]!.duplicateTransactionId=transferId;}
 if(type==="transfer"){p.records[0]!.proposedType="transfer";p.records[0]!.transferAccountId=transferId;p.records[0]!.categoryId=null;}
 if(type==="missing")p.import.fileSha256=null;
 if(type==="long"){p.records[0]!.counterpartyName="An exceptionally long bank transaction description and international reference from a statement that has a high probability of overflowing mobile layouts unless layout is protected";
 p.import.fileName="very-long-filename-banking-account-record-synthetic-export-2026-with-reference-extra-information.csv";}
 return p;
}
