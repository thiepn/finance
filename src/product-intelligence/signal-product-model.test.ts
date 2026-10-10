import type { ProductAnalytics, ProductCatalogItem } from "../domain/product-intelligence.js";
import type { MerchantSummary } from "../domain/classification.js";
import { comparableMerchantRows,comparableVariants,exactMinor,latestCatalogPrice,merchantExploreHref,merchantSearch,productHref,receiptHref,safePriceHistory,transactionHref,validRuleDraft } from "./signal-product-model.js";
const a=(value:unknown,msg:string)=>{if(!value)throw Error(msg);};
const uuid="00000000-0000-4000-8000-000000000011";
a(productHref(uuid)!==null,"valid item path");
for(const id of ["../../api/mcp","https://attacker", "bad/evil","", "test?token=a"])a(productHref(id)===null&&receiptHref(id)===null&&transactionHref(id)===null&&merchantExploreHref(id)===null,"reject unsafe ids "+id);
const product={priceCurrencyCode:"USD",latestUnitPriceMinor:1234} as ProductCatalogItem;
a(latestCatalogPrice(product,"EUR")===null,"no false FX");
a(latestCatalogPrice({...product,priceCurrencyCode:"EUR"},"EUR")===1234,"same-unit money");
let threw=false;try{exactMinor(1.5)}catch{threw=true}a(threw,"fractional money rejected");
const analytics={profile:{currencyCode:"EUR",locale:"de-DE",timeZone:"Europe/Berlin"},latestPrice:{basisLabel:"100 g",basisPriceMinor:150},merchants:[
{merchantId:uuid,merchantName:"B",purchaseCount:3,latestUnitPriceMinor:320},{merchantId:uuid,merchantName:"A",purchaseCount:2,latestUnitPriceMinor:250},{merchantId:null,merchantName:"unknown",purchaseCount:1,latestUnitPriceMinor:null}],
familyVariants:[{productId:uuid,name:"250 g",basisLabel:"100 g",basisPriceMinor:190},{productId:uuid,name:"500 ml",basisLabel:"100 ml",basisPriceMinor:120}],
priceHistory:[{receiptItemId:uuid,receiptId:uuid,currencyCode:"USD",effectiveUnitPriceMinor:100,observedAt:"2026-01-01T00:00:00Z"},{receiptItemId:uuid,receiptId:uuid,currencyCode:"EUR",effectiveUnitPriceMinor:200,observedAt:"2026-02-01T00:00:00Z"}]
} as unknown as ProductAnalytics;
a(comparableMerchantRows(analytics).map(x=>x.merchantName).join(",")==="A,B","same product merchant prices sorted");
a(comparableVariants(analytics).length===1,"incompatible unit basis excluded");
a(safePriceHistory(analytics).length===1,"foreign currency observations excluded");
const rows=[{name:"Weekly Market",merchantGroup:"Store",aliases:[{rawName:"W Markt"}],purchaseCount:4,isArchived:false},
{name:"Deleted",merchantGroup:null,aliases:[],purchaseCount:20,isArchived:true}] as unknown as MerchantSummary[];
a(merchantSearch(rows,"Markt").length===1,"merchant aliases searchable");
a(validRuleDraft("Groceries","W Markt",uuid,[{id:uuid,isArchived:false,kind:"expense"}]),"valid rule");
a(!validRuleDraft("a","x",uuid,[{id:uuid,isArchived:false,kind:"expense"}]),"weak rule refused");
a(!validRuleDraft("Groceries","W Markt",uuid,[{id:uuid,isArchived:true,kind:"expense"}]),"archived category refused");
console.log("P33 unit prices, currencies, routes, merchant search and rule validations passed");