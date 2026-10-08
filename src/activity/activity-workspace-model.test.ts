import type {ActivityItem} from "../domain/activity.js";
import {activityDetailHref,activityFiltersForRpc,moneyCategory,normalizeActivityError,
 parseActivityRoute,serializeActivityRoute,signedActivityDisplay,validateAllocationsForPosting} from "./activity-workspace-model.js";
function assert(ok:unknown,msg:string):asserts ok{if(!ok)throw Error("P29: "+msg)}
const item=(partial:Partial<ActivityItem>):ActivityItem=>({
 id:"tx-123",entityKind:"transaction",occurredAt:"2026-10-07T12:00:00Z",
 transactionId:"tx-123",receiptId:null,transactionType:"expense",status:"posted",
 source:"manual",merchantId:null,merchantName:"REWE",title:"Groceries",
 description:null,note:null,currencyCode:"EUR",amountMinor:4235,financialEffect:true,
 hasReceipt:false,receiptStatuses:[],accounts:[],categories:[],productIds:[],
 productNames:[],tagIds:[],tagNames:[],receiptIds:[],receiptCount:0,itemCount:0,...partial
});
const f=parseActivityRoute("?q=Rewe&from=2026-10-01&to=2026-10-31&kind=transaction&merchant=m-1&account=a-1");
assert(f.q==="Rewe"&&f.kind==="transaction","URL parsing");
assert(serializeActivityRoute(f)==="/activity?q=Rewe&from=2026-10-01&to=2026-10-31&kind=transaction&merchant=m-1&account=a-1","canonical stable query");
const rpc=activityFiltersForRpc(f);
assert(rpc.accountIds?.[0]==="a-1"&&rpc.merchantIds?.[0]==="m-1"&&rpc.entityKinds?.[0]==="transaction","filters passed to server");
assert(parseActivityRoute("?kind=not-a-kind&from=bad").kind===""&&parseActivityRoute("?from=bad").from==="","invalid filters not applied");
assert(serializeActivityRoute(parseActivityRoute(""))==="/activity","clean search default");
assert(signedActivityDisplay(item({}))===-4235,"expense negative");
assert(signedActivityDisplay(item({transactionType:"income"}))===4235,"income positive");
assert(signedActivityDisplay(item({transactionType:"refund"}))===4235,"refund positive");
assert(signedActivityDisplay(item({transactionType:"reimbursement"}))===4235,"reimbursement positive");
assert(signedActivityDisplay(item({transactionType:"transfer",amountMinor:-999}))===-999,"transfer signed source preserved");
assert(signedActivityDisplay(item({entityKind:"receipt",transactionType:null,amountMinor:5000}))===null,"receipt evidence never posted");
assert(signedActivityDisplay(item({financialEffect:false}))===null,"unposted item not counted");
assert(moneyCategory(item({transactionType:"transfer"}))==="muted","transfers distinguished");
assert(activityDetailHref(item({}))==="/activity/transaction/tx-123","transaction detail pathname");
assert(activityDetailHref(item({id:"r-3",entityKind:"receipt",transactionId:null,receiptId:"r-3"}))==="/receipts/r-3","receipt detail pathname");
assert(validateAllocationsForPosting(4235,[{categoryId:"food",amountMinor:2000},{categoryId:"home",amountMinor:2235}])===null,"correct splits post");
assert(validateAllocationsForPosting(4235,[{categoryId:"food",amountMinor:4234}])!==null,"nonbalancing splits refused");
assert(validateAllocationsForPosting(4235,[{categoryId:"",amountMinor:4235}])!==null,"empty category refused");
assert(validateAllocationsForPosting(4235,[{categoryId:"food",amountMinor:0}])!==null,"zero split refused");
assert(validateAllocationsForPosting(Number.MAX_SAFE_INTEGER,[{categoryId:"food",amountMinor:Number.MAX_SAFE_INTEGER},{categoryId:"home",amountMinor:1}])!==null,"overflow refused");
assert(!normalizeActivityError(new Error("permission denied for function finance_get_activity_detail"),"detail").includes("finance_"),"no raw RPC in error");
console.log("P29 route filters, source-safe signs, deep links, exact splits and error redaction passed");
