import {StrictMode,useState} from "react";import {createRoot} from "react-dom/client";
import {FinanceV2Shell} from "../ui/v2/FinanceV2Shell.js";
import {SignalProductsView} from "./SignalProducts.js";import {SignalMerchantsView,SignalRulesView} from "./SignalDirectory.js";
import type {ProductCatalog,ProductAnalytics} from "../domain/product-intelligence.js";
import type {ProductPurchaseEvidence} from "../domain/spending-explorer.js";
import type {MerchantSummary,ClassificationRule,CategoryNode} from "../domain/classification.js";
import "../ui/styles/base.css";import "../ui/v2/finance-app-shell.css";import "./signal-intelligence-preview.css";
const id="00000000-0000-4000-8000-000000000011",merchant="00000000-0000-4000-8000-000000000022",receipt="00000000-0000-4000-8000-000000000033";
const profile={currencyCode:"EUR",locale:"de-DE",timeZone:"Europe/Berlin"};
const product={productId:id,name:"Oat milk 1 L",brand:"Home Farm",familyId:"00000000-0000-4000-8000-000000000044",familyName:"Oat milk",variantName:"1 L",productType:"Drinks",
 sizeValue:1,sizeUnit:"L",categoryId:null,categoryName:"Groceries",necessity:"essential",purchaseCount:6,totalSpendMinor:1134,totalQuantity:6,firstPurchaseAt:"2026-09-01T10:00:00Z",lastPurchaseAt:"2026-10-05T10:00:00Z",
 latestUnitPriceMinor:189,priceCurrencyCode:"EUR",latestMerchantId:merchant,latestMerchantName:"Weekly Market",latestPriceAt:"2026-10-05T10:00:00Z",latestBasisPriceMinor:189,basisLabel:"1 L"};
const catalog={profile,query:null,products:[product,{...product,productId:"00000000-0000-4000-8000-000000000099",name:"Sourdough Bread with Extra Long Description and Packaging"}]} as ProductCatalog;
const analytics={profile,range:"1y",period:{start:"2026-01-01T00:00:00Z",end:"2026-11-01T00:00:00Z",compareStart:null,compareEnd:null},
 product:{id,name:product.name,brand:product.brand,familyName:product.familyName,variantName:product.variantName,sizeValue:1,sizeUnit:"L"},
 summary:{current:{totalSpendMinor:1134,purchaseCount:6}},latestPrice:{latestUnitPriceMinor:189,merchantName:"Weekly Market",basisLabel:"1 L",basisPriceMinor:189},
 merchants:[{merchantId:merchant,merchantName:"Weekly Market",purchaseCount:6,latestUnitPriceMinor:189},{merchantId:null,merchantName:"Unknown merchant",purchaseCount:1,latestUnitPriceMinor:null}],
 familyVariants:[{productId:id,name:"Oat milk 1 L",variantName:"1 L",purchaseCount:6,basisLabel:"1 L",basisPriceMinor:189},
 {productId:"00000000-0000-4000-8000-000000000088",name:"Oat milk 500 ml",variantName:"500 ml",purchaseCount:4,basisLabel:"1 L",basisPriceMinor:199}],
 priceHistory:[{receiptItemId:"00000000-0000-4000-8000-000000000077",receiptId:receipt,currencyCode:"EUR",effectiveUnitPriceMinor:189,observedAt:"2026-10-05T10:00:00Z",merchantName:"Weekly Market"}],
 priceHistoryTruncated:false
} as ProductAnalytics;
const evidence={product:{productId:id,name:product.name},period:{start:"2026-01-01T00:00:00Z",end:"2026-11-01T00:00:00Z"},
 purchases:[{receiptItemId:"00000000-0000-4000-8000-000000000077",receiptId:receipt,occurredAt:"2026-10-05T10:00:00Z",
 transactionIds:["00000000-0000-4000-8000-000000000055"],merchantName:"Weekly Market",quantity:2,effectiveTotalMinor:378}]
} as ProductPurchaseEvidence;
const merchants=[{id:merchant,name:"Weekly Market",merchantGroup:"Groceries",purchaseCount:6,netSpendMinor:20000,isArchived:false,aliases:[{id:receipt,rawName:"W. Market",source:"user",confidence:1,timesConfirmed:1}]} as MerchantSummary];
const categories=[{id,name:"Groceries",namePath:["Groceries"],kind:"expense",isArchived:false} as CategoryNode];
const rules=[{id,name:"Groceries at Market",scope:"transaction",condition:{merchant_name_contains:"Market"},action:{category_id:id},
 priority:1000,matchCount:7,enabled:true,stopProcessing:false} as ClassificationRule];
function Preview(){
 const [tab,setTab]=useState<"products"|"merchants"|"rules">("products");
 const [selected,setSelected]=useState<string|null>(id);const [query,setQuery]=useState("");
 const [route,setRoute]=useState("/explore/products");const [ruleRows,setRuleRows]=useState(rules);const [merchantRows,setMerchantRows]=useState(merchants);
 const navigate=(target:string)=>{setRoute(target);if(target==="/explore/merchants")setTab("merchants");if(target==="/settings/rules")setTab("rules");if(target==="/explore/products")setTab("products");if(target.startsWith("/explore/products/")){setSelected(id);setTab("products");}};
 return <FinanceV2Shell routeId={tab==="products"?"products":tab==="merchants"?"merchants":"rules"} section={tab==="rules"?"settings":"explore"}
 email="synthetic@example.invalid" title={tab} onNavigate={navigate} onSignOut={async()=>{}}>
 <div className="sc-p33-preview-banner"><strong>P33 SYNTHETIC FINANCIAL DATA — NO REAL ACCOUNT</strong>
 <label>Preview screen<select value={tab} aria-label="Preview screen" onChange={e=>setTab(e.target.value as typeof tab)}>
 <option value="products">Products</option><option value="merchants">Merchants</option><option value="rules">Rules</option></select></label>
 <span data-testid="navigation">{route}</span></div>
 {tab==="products"?<SignalProductsView selectedProductId={selected} catalog={catalog} analytics={selected?analytics:null} evidence={evidence}
 query={query} onQuery={setQuery} range="1y" onRange={()=>{}} onNavigate={navigate}/>:
 tab==="merchants"?<SignalMerchantsView rows={merchantRows} currency={profile} onNavigate={navigate}
 onCreate={async name=>setMerchantRows(prev=>[...prev,{...merchants[0]!,id:"00000000-0000-4000-8000-000000000066",name}])}
 onAlias={async(_,name)=>setMerchantRows(prev=>prev.map(m=>({...m,aliases:[...m.aliases,{...m.aliases[0]!,id:"00000000-0000-4000-8000-000000000067",rawName:name}]})))}/>:
 <SignalRulesView rules={ruleRows} categories={categories}
 onCreate={async input=>setRuleRows(prev=>[...prev,{...rules[0]!,id:"00000000-0000-4000-8000-000000000068",name:input.name}])}
 onUpdate={async(rule,enabled)=>setRuleRows(prev=>prev.map(x=>x.id===rule.id?{...x,enabled}:x))}
 onDelete={async rule=>setRuleRows(prev=>prev.filter(x=>x.id!==rule.id))}/>}
 </FinanceV2Shell>;
}
const mount=document.getElementById("p33-preview");if(!mount)throw Error("P33 synthetic preview missing");
createRoot(mount).render(<StrictMode><Preview/></StrictMode>);
