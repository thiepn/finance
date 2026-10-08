#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
const read=p=>fs.readFileSync(p,"utf8");
const app=read("src/app/FinanceAppV2.tsx"),inbox=read("src/receipt-matching/ReceiptStudioInbox.tsx"),
 detail=read("src/receipt-matching/ReceiptStudioDetail.tsx"),capture=read("src/capture/CapturePage.tsx"),
 model=read("src/receipt-matching/receipt-studio-model.ts");
assert(app.includes('case "receipt-detail":return <ReceiptStudioDetail'),"P30 receipt detail route must be mounted");
assert(app.includes('case "receipts":return <ReceiptMatchingPage onNavigate={navigate}/>'),"P30 inbox must be mounted");
assert(read("src/receipt-matching/ReceiptMatchingPage.tsx").includes("ReceiptStudioInbox.js"),"legacy inbox not replaced");
assert(inbox.includes("receiptMatching.getDashboard(80)"),"real private receipt query required");
assert(detail.includes("receiptMatching.getWorkspace(receiptId)"),"real receipt detail required");
assert(detail.includes("createPreviewUrl(p.storagePath,120)"),"private short-lived signed originals required");
assert(detail.includes("receiptMatching.refreshReceipt(receiptId,false)"),"candidate refresh must disable automatic matching");
assert(detail.includes("validateMatchAmount"),"manual match must validate exact cents");
assert(detail.includes("receiptMatching.unconfirm"),"unlink must use authorized service");
assert(capture.includes("ReceiptLocalPagePreview"),"offline preview not integrated");
assert(capture.includes("confirmDiscard"),"draft discard guard absent");
assert(model.includes("match.transaction.matchableAmountMinor"),"cannot overconfirm a transaction");
assert(!inbox.includes("fixture")&&!detail.includes("fixture"),"production pages may not load sample values");
assert(!detail.includes(".from(\"finance-receipts\").getPublicUrl"),"private bucket should not expose public links");
console.log("P30 private evidence, non-auto-confirm matching, capture isolation and live route checks passed");
