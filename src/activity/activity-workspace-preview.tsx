import {StrictMode,useState} from "react";
import {createRoot} from "react-dom/client";
import type {ActivityItem,ActivityFilterCatalog} from "../domain/activity.js";
import {FinanceV2Shell} from "../ui/v2/FinanceV2Shell.js";
import {ActivityWorkspaceView} from "./ActivityWorkspace.js";
import {FinancialState} from "../ui/v2/SignalCurrent.js";
import {emptyActivityFilters,type ActivityRouteFilters} from "./activity-workspace-model.js";
import "../ui/v2/finance-app-shell.css";
import "./activity-workspace-preview.css";
const rows:ActivityItem[]=Array.from({length:24},(_,i):ActivityItem=>({
 id:"synthetic-"+i,entityKind:i===3?"receipt":"transaction",
 occurredAt:new Date(Date.UTC(2026,9,24-i,11,0)).toISOString(),
 transactionId:i===3?null:"synthetic-"+i,receiptId:i===3?"receipt-3":null,
 transactionType:i===3?null:i===8?"income":i===10?"transfer":"expense",status:i===3?"review_required":"posted",
 source:i===3?"receipt":"manual",merchantId:null,merchantName:i===3?"dm Receipt":i===8?"Salary":i===10?"Savings transfer":["REWE","DB Regio","dm","Aldi","Online Store"][i%5]!,
 title:"Transaction "+i,description:null,note:null,currencyCode:i===5?"USD":"EUR",
 amountMinor:i===8?165000:750+i*229,financialEffect:i!==3,hasReceipt:i%6===0,
 receiptStatuses:[],accounts:i===3?[]:[{id:"ac-1",name:i===5?"USD Account":"Main checking",kind:"checking",currencyCode:i===5?"USD":"EUR",signedAmountMinor:-750,reportingAmountMinor:-750}],
 categories:[],productIds:[],productNames:[],tagIds:[],tagNames:[],receiptIds:[],receiptCount:0,itemCount:0,
}));
const catalog:ActivityFilterCatalog={accounts:[{id:"ac-1",name:"Main checking",kind:"checking",currencyCode:"EUR",isArchived:false}],
 merchants:[{id:"merchant-1",name:"REWE",merchantGroup:null}],categories:[],tags:[],products:[]};
function Preview(){
 const [filter,setFilter]=useState<ActivityRouteFilters>(emptyActivityFilters);
 const [route,setRoute]=useState("/activity");
 const [condition,setCondition]=useState("normal");
 const [more,setMore]=useState(false);
 const filtered=rows.filter(x=>(filter.kind?x.entityKind===filter.kind:true)&&
   (!filter.q||(x.merchantName??x.title).toLowerCase().includes(filter.q.toLowerCase())));
 const navigate=(p:string)=>setRoute(p);
 return <FinanceV2Shell routeId={route==="/activity"?"activity":route==="/"?"home":"activity-detail"}
   title={route==="/activity"?"Activity":"Transaction"} section="activity" onNavigate={navigate} onSignOut={async()=>setRoute("/sign-in")}
   email="synthetic@example.invalid">
   <div className="sc-p29-demo-controls"><strong>P29 TEST DATA — NOT A FINANCE ACCOUNT</strong>
    <label>Scenario <select aria-label="Scenario" value={condition} onChange={e=>setCondition(e.target.value)}>
      <option value="normal">normal</option><option value="empty">empty</option><option value="loading">loading</option>
      <option value="error">error</option><option value="catalog">catalog unavailable</option></select></label>
   </div>
   {route==="/activity"||route==="/"?
     <ActivityWorkspaceView rows={condition==="empty"?[]:filtered} catalog={condition==="catalog"?null:catalog} filter={filter}
        loading={condition==="loading"} loadingMore={false} error={condition==="error"?"The Activity request failed.":null}
        catalogError={condition==="catalog"} hasMore={more&&condition==="normal"}
        onNavigate={navigate} onSearch={setFilter} onLoadMore={()=>setMore(false)} onRefresh={()=>setCondition("normal")}/>:
     <FinancialState kind="empty" title="Example record detail" description="The production detail page loads data directly from the authenticated Finance service."
        primaryAction={{label:"Back to Activity",onClick:()=>navigate("/activity")}}/>}
 </FinanceV2Shell>;
}
const mount=document.querySelector("#p29-preview-root");
if(!mount)throw Error("P29 preview mount missing");
createRoot(mount).render(<StrictMode><Preview/></StrictMode>);
