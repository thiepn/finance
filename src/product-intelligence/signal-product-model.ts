import type { ProductAnalytics, ProductCatalogItem, ProductFamilyVariant, ProductMerchantPrice, ProductPricePoint } from "../domain/product-intelligence.js";
import type { MerchantSummary, ClassificationRule } from "../domain/classification.js";
export const financeUuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function safeFinanceId(id:string):boolean{return financeUuid.test(id);}
export function productHref(id:string):string|null{return safeFinanceId(id)?"/explore/products/"+encodeURIComponent(id):null;}
export function receiptHref(id:string):string|null{return safeFinanceId(id)?"/receipts/"+encodeURIComponent(id):null;}
export function transactionHref(id:string):string|null{return safeFinanceId(id)?"/activity/transaction/"+encodeURIComponent(id):null;}
export function merchantExploreHref(id:string):string|null{return safeFinanceId(id)?"/explore?merchant="+encodeURIComponent(id):null;}
export function exactMinor(value:number):number{if(!Number.isSafeInteger(value))throw new RangeError("Unsafe financial minor unit");return value;}
export function latestCatalogPrice(item:ProductCatalogItem,reportCurrency:string):number|null{
 if(item.latestUnitPriceMinor===null||item.priceCurrencyCode!==reportCurrency)return null;
 return exactMinor(item.latestUnitPriceMinor);
}
export function comparableMerchantRows(analytics:ProductAnalytics):ProductMerchantPrice[]{
 return analytics.merchants.filter(m=>m.latestUnitPriceMinor!==null&&Number.isSafeInteger(m.latestUnitPriceMinor)&&m.purchaseCount>0)
 .sort((a,b)=>a.latestUnitPriceMinor!-b.latestUnitPriceMinor!||a.merchantName.localeCompare(b.merchantName));
}
export function comparableVariants(analytics:ProductAnalytics):ProductFamilyVariant[]{
 const basis=analytics.latestPrice.basisLabel;
 if(!basis||analytics.latestPrice.basisPriceMinor===null)return [];
 return analytics.familyVariants.filter(v=>v.basisLabel===basis&&v.basisPriceMinor!==null&&Number.isSafeInteger(v.basisPriceMinor))
 .sort((a,b)=>a.basisPriceMinor!-b.basisPriceMinor!);
}
export function safePriceHistory(analytics:ProductAnalytics):ProductPricePoint[]{
 return analytics.priceHistory.filter(p=>p.currencyCode===analytics.profile.currencyCode&&Number.isSafeInteger(p.effectiveUnitPriceMinor))
 .sort((a,b)=>Date.parse(b.observedAt)-Date.parse(a.observedAt));
}
export function merchantSearch(rows:readonly MerchantSummary[],query:string):MerchantSummary[]{
 const q=query.trim().toLocaleLowerCase();
 return rows.filter(row=>!row.isArchived&&(!q||[row.name,row.merchantGroup??"",...row.aliases.map(a=>a.rawName)].some(v=>v.toLocaleLowerCase().includes(q))))
 .slice().sort((a,b)=>b.purchaseCount-a.purchaseCount||a.name.localeCompare(b.name));
}
export function validRuleDraft(name:string,pattern:string,categoryId:string,categories:readonly {id:string;isArchived:boolean;kind:string}[]):boolean{
 return name.trim().length>=2&&name.trim().length<=120&&pattern.trim().length>=2&&pattern.trim().length<=160
 &&categories.some(c=>c.id===categoryId&&!c.isArchived&&c.kind!=="income");
}
export function safeRuleSummary(rule:ClassificationRule):string{
 const allowed=["merchant_name_contains","description_contains","raw_name_contains","normalized_name_contains"];
 const parts=Object.entries(rule.condition).filter(([k])=>allowed.includes(k)).map(([k,v])=>k.replaceAll("_"," ")+": "+String(v).slice(0,120));
 return parts.length?parts.join("; "):"Additional rule conditions — review in settings";
}
