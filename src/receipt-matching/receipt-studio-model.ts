import type {ReceiptMatchStatus,ReceiptTransactionMatch,ReceiptMatchWorkspace} from "../domain/receipt-matching.js";
export type ReceiptQueueFilter = "attention"|"unmatched"|"suggested"|"partial"|"matched"|"all";
export const receiptFilterOptions:readonly {id:ReceiptQueueFilter;name:string}[]=[
 {id:"attention",name:"Needs review"},{id:"unmatched",name:"Unmatched"},
 {id:"suggested",name:"Suggested"},{id:"partial",name:"Partial"},
 {id:"matched",name:"Matched"},{id:"all",name:"All receipts"}
];
export function receiptStatusLabel(raw:string):string {
 return raw.replaceAll("_"," ").replace(/\b\w/g,x=>x.toUpperCase());
}
export function inReceiptQueue(status:ReceiptMatchStatus,filter:ReceiptQueueFilter):boolean {
 if(filter==="all")return true;
 if(filter==="attention")return status!=="matched"&&status!=="multi_payment_matched";
 if(filter==="unmatched")return status==="unmatched";
 if(filter==="suggested")return status==="suggested_match";
 if(filter==="partial")return status==="partially_matched";
 return status==="matched"||status==="multi_payment_matched";
}
export function percentCovered(total:number|null,covered:number):number|null {
 if(total===null||!Number.isSafeInteger(total)||total<=0||!Number.isSafeInteger(covered))return null;
 return Math.max(0,Math.min(100,Math.round(covered/total*100)));
}
export function validateMatchAmount(text:string,remaining:number|null,match:ReceiptTransactionMatch):number|null {
 const trimmed=text.trim();
 if(!/^\d+(?:[,.]\d{1,2})?$/.test(trimmed))return null;
 const [whole="0",fraction=""]=trimmed.replace(",",".").split(".");
 const cents=Number(whole)*100+Number(fraction.padEnd(2,"0"));
 if(!Number.isSafeInteger(cents)||cents<=0||match.status!=="suggested")return null;
 if(remaining!==null&&cents>remaining)return null;
 // Matching can never exceed transaction available matchable money.
 if(match.transaction.matchableAmountMinor!==null&&cents>match.transaction.matchableAmountMinor)return null;
 return cents;
}
export function receiptEvidenceCompleteness(workspace:ReceiptMatchWorkspace){
 return {hasTotal:workspace.receipt.totalMinor!==null,hasItems:workspace.items.length>0,
   confirmed:workspace.matches.filter(m=>m.status==="confirmed").length,
   remaining:workspace.receipt.remainingMinor};
}
export const receiptErrorCopy={
 queue:"Receipts could not be loaded. Your records have not changed.",
 detail:"Receipt details could not be loaded. Retry or return to the inbox.",
 capture:"Receipt files could not be loaded. The original evidence remains private.",
 action:"The action could not be confirmed. Reload the receipt status before retrying."
} as const;
