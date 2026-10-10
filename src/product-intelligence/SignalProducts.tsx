import {useDeferredValue,useMemo,useState, type MouseEvent, type ReactNode} from "react";
import type {ProductAnalytics,ProductAnalyticsRange,ProductCatalog,ProductCatalogItem} from "../domain/product-intelligence.js";
import type {ProductPurchaseEvidence} from "../domain/spending-explorer.js";
import {useProductAnalytics,useProductCatalog} from "./use-product-intelligence.js";
import {useProductPurchaseEvidence} from "../spending-explorer/use-spending-explorer.js";
import {DataProvenance,FinanceButton,FinancialState,MoneyValue} from "../ui/v2/SignalCurrent.js";
import {formatSignalMoney} from "../ui/v2/finance-presentation.js";
import {comparableMerchantRows,comparableVariants,latestCatalogPrice,merchantExploreHref,productHref,receiptHref,safePriceHistory,transactionHref} from "./signal-product-model.js";
import "./signal-products.css";
const ranges:ProductAnalyticsRange[]=["1m","3m","6m","1y","all"];
const money=(minor:number,currency:string,locale:string)=>formatSignalMoney(minor,currency,locale);
function Link({href,onNavigate,children}: {href:string|null;onNavigate:(path:string)=>void;children:ReactNode}){
 const click=(e:MouseEvent<HTMLAnchorElement>)=>{if(e.button!==0||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;e.preventDefault();if(href)onNavigate(href);};
 return href?<a href={href} onClick={click} className="sc-product-link">{children}</a>:<span className="sc-product-unavailable">{children}</span>;
}
export function SignalProductsView({catalog,analytics,evidence,selectedProductId,query,range,onQuery,onRange,onNavigate,detailState="ready"}:{
 catalog:ProductCatalog|null;analytics:ProductAnalytics|null;evidence:ProductPurchaseEvidence|null;selectedProductId:string|null;query:string;range:ProductAnalyticsRange;
 onQuery:(q:string)=>void;onRange:(r:ProductAnalyticsRange)=>void;onNavigate:(path:string)=>void;detailState?:"idle"|"loading"|"ready"|"error";
}){
 const profile=catalog?.profile??analytics?.profile;
 const current=analytics?.summary.current;
 const merchants=analytics?comparableMerchantRows(analytics):[];
 const variants=analytics?comparableVariants(analytics):[];
 const prices=analytics?safePriceHistory(analytics):[];
 return <div className="sc-products"><header className="sc-products-header"><div><span className="sc-eyebrow">Signal Current / Receipt intelligence</span><h1>Products</h1><p>Normalized products and observed prices, always backed by itemized receipts.</p></div>
 {selectedProductId?<FinanceButton variant="secondary" onClick={()=>onNavigate("/explore/products")}>All products</FinanceButton>:null}</header>
 <div className="sc-products-layout"><section className="sc-products-catalog" aria-label="Searchable product catalog">
 <label>Search products, brands and families<input aria-label="Search products" type="search" value={query} onChange={e=>onQuery(e.currentTarget.value)} placeholder="Search your purchases"/></label>
 <div className="sc-products-count">{catalog?catalog.products.length+" results":"Catalog unavailable"}</div>
 {catalog&&!catalog.products.length?<p className="sc-products-muted">No products match your search.</p>:null}
 <div className="sc-products-list">{catalog?.products.map(p=>{
 const href=productHref(p.productId),latest=profile?latestCatalogPrice(p,profile.currencyCode):null;
 return <div className={"sc-product-row"+(selectedProductId===p.productId?" is-current":"")} key={p.productId}>
 <Link href={href} onNavigate={onNavigate}><strong>{p.name}</strong><small>{[p.brand,p.familyName,p.variantName].filter(Boolean).join(" · ")||"Individual product"}</small>
 <small>{p.purchaseCount} observed purchases</small></Link>
 <span>{latest===null?"No comparable latest price":money(latest,p.priceCurrencyCode,profile!.locale)}{p.basisLabel&&p.latestBasisPriceMinor!==null?<small> · {p.basisLabel}: {money(p.latestBasisPriceMinor,p.priceCurrencyCode,profile?.locale??"de-DE")}</small>:null}</span>
 </div>})}</div></section>
 <section className="sc-products-detail" aria-label="Product purchase evidence">
 {!selectedProductId?<FinancialState kind="empty" title="Choose a product" description="Select a product to review normalized family variants, observed prices and source receipts."/>:
 detailState==="loading"?<FinancialState kind="loading" title="Loading product evidence" description="Reading account-scoped observations."/>:
 detailState==="error"||!analytics?<FinancialState kind="error" title="Product details unavailable" description="The underlying product evidence could not be retrieved."/>:
 <><div className="sc-products-detail-header"><div><span className="sc-eyebrow">Product evidence</span><h2>{analytics.product.name}</h2><p>{[analytics.product.brand,analytics.product.familyName,analytics.product.variantName,analytics.product.sizeValue&&analytics.product.sizeUnit?analytics.product.sizeValue+" "+analytics.product.sizeUnit:null].filter(Boolean).join(" · ")}</p></div>
 <label>History range<select aria-label="History range" value={range} onChange={e=>onRange(e.currentTarget.value as ProductAnalyticsRange)}>{ranges.map(v=><option key={v} value={v}>{v==="all"?"All time":v}</option>)}</select></label></div>
 <div className="sc-product-metrics"><div><span>Observed item spending</span><strong>{money(current!.totalSpendMinor,analytics.profile.currencyCode,analytics.profile.locale)}</strong><DataProvenance source="receipt"/></div>
 <div><span>Recorded purchases</span><strong>{current!.purchaseCount}</strong><small>Receipt item observations</small></div>
 <div><span>Latest unit price</span><strong>{analytics.latestPrice.latestUnitPriceMinor===null?"Unavailable":money(analytics.latestPrice.latestUnitPriceMinor,analytics.profile.currencyCode,analytics.profile.locale)}</strong><small>{analytics.latestPrice.merchantName??"Merchant unknown"}</small></div></div>
 <section className="sc-products-panel"><h3>Observed price history</h3><p>Each price points to its original receipt. Changes are observations, not predictions.</p><div className="sc-product-scroll" role="region" tabIndex={0} aria-label="Observed price table">
 <table><caption>Receipt-backed prices · {analytics.profile.currencyCode}</caption><thead><tr><th scope="col">Date</th><th scope="col">Merchant</th><th scope="col">Unit price</th><th scope="col">Original</th></tr></thead>
 <tbody>{prices.map(p=><tr key={p.receiptItemId}><td>{new Intl.DateTimeFormat(analytics.profile.locale,{dateStyle:"medium",timeZone:analytics.profile.timeZone}).format(new Date(p.observedAt))}</td><td>{p.merchantName}</td>
 <td>{money(p.effectiveUnitPriceMinor,p.currencyCode,analytics.profile.locale)}</td><td><Link href={receiptHref(p.receiptId)} onNavigate={onNavigate}>View receipt</Link></td></tr>)}
 {!prices.length?<tr><td colSpan={4}>No matching currency price observations.</td></tr>:null}</tbody></table></div>
 {analytics.priceHistoryTruncated?<p className="sc-products-muted">The backend has more observations than this response includes; the displayed table is incomplete.</p>:null}</section>
 <section className="sc-products-panel"><h3>Where this exact product was purchased</h3><p>Prices compare this exact product only, not unequal package sizes or currencies.</p>
 <div className="sc-products-ranked">{merchants.map(m=><div className="sc-products-rank" key={m.merchantId??m.merchantName}>
 <span><strong>{m.merchantName}</strong><small>{m.purchaseCount} recorded purchases</small></span><strong>{money(m.latestUnitPriceMinor!,analytics.profile.currencyCode,analytics.profile.locale)}</strong><Link href={m.merchantId?merchantExploreHref(m.merchantId):null} onNavigate={onNavigate}>Explore merchant</Link></div>)}
 {!merchants.length?<p className="sc-products-muted">No comparable merchant prices yet.</p>:null}</div></section>
 <section className="sc-products-panel"><h3>Family and package variants</h3><p>Only variants with the same recorded unit-price basis are compared.</p>
 {variants.map(v=><div className="sc-products-rank" key={v.productId}><span><strong>{v.name}</strong><small>{v.variantName??"Variant"} · {v.purchaseCount} purchases</small></span>
 <strong>{money(v.basisPriceMinor!,analytics.profile.currencyCode,analytics.profile.locale)} / {v.basisLabel}</strong><Link href={productHref(v.productId)} onNavigate={onNavigate}>Open</Link></div>)}
 {!variants.length?<p className="sc-products-muted">No comparable normalized variants. Different unit bases must not be ranked together.</p>:null}</section>
 <section className="sc-products-panel"><h3>Source purchase timeline</h3><p>Receipt amounts here explain spending already recorded in the ledger; never add them to ledger totals.</p>
 {evidence?.purchases.map(row=><div className="sc-products-rank" key={row.receiptItemId}><span><strong>{row.merchantName}</strong><small>{new Intl.DateTimeFormat(analytics.profile.locale,{dateStyle:"medium",timeZone:analytics.profile.timeZone}).format(new Date(row.occurredAt))} · Quantity {row.quantity}</small></span>
 <strong>{money(row.effectiveTotalMinor,analytics.profile.currencyCode,analytics.profile.locale)}</strong><span className="sc-product-actions"><Link href={receiptHref(row.receiptId)} onNavigate={onNavigate}>Receipt</Link>{row.transactionIds.map(id=><Link key={id} href={transactionHref(id)} onNavigate={onNavigate}>Transaction</Link>)}</span></div>)}
 {!evidence?<p className="sc-products-muted">Purchase source records unavailable; summary observations are not proof that these links exist.</p>:!evidence.purchases.length?<p className="sc-products-muted">No source purchase rows for this date range.</p>:null}</section></>}
 </section></div><p className="sc-products-footnote">Source: existing account-scoped product intelligence and purchase-evidence RPCs. No live price quotes or estimated future purchases.</p></div>;
}
export function SignalProductsPage({selectedProductId,onNavigate}:{selectedProductId:string|null;onNavigate:(path:string)=>void}){
 const [query,setQuery]=useState("");const deferred=useDeferredValue(query);const [range,setRange]=useState<ProductAnalyticsRange>("1y");
 const catalog=useProductCatalog(deferred);const detail=useProductAnalytics(selectedProductId,range);
 const req=useMemo(()=>detail.analytics?{productId:detail.analytics.product.id,periodStart:detail.analytics.period.start,periodEnd:detail.analytics.period.end,limit:40}:null,[detail.analytics]);
 const evidence=useProductPurchaseEvidence(req);
 if(catalog.state==="loading"&&!catalog.catalog)return <FinancialState kind="loading" title="Loading product catalog" description="Reading normalized receipt evidence."/>;
 if(catalog.state==="error"||catalog.state==="unconfigured"||catalog.state==="unauthenticated")return <FinancialState kind={catalog.state==="error"?"error":"empty"} title="Product catalog unavailable" description="Finance could not obtain authenticated product data." primaryAction={catalog.state==="error"?{label:"Retry",onClick:()=>void catalog.refresh()}:undefined}/>;
 return <SignalProductsView catalog={catalog.catalog} analytics={detail.analytics} evidence={evidence.state==="ready"?evidence.evidence:null}
 selectedProductId={selectedProductId} detailState={detail.state==="loading"?"loading":detail.state==="error"?"error":detail.state==="ready"?"ready":"idle"}
 query={query} onQuery={setQuery} range={range} onRange={setRange} onNavigate={onNavigate}/>;
}
