const assert={
 equal(actual:unknown,expected:unknown,message="values differ"){if(actual!==expected)throw Error(message+": "+String(actual)+" !== "+String(expected))},
 throws(fn:()=>unknown){let threw=false;try{fn()}catch{threw=true}if(!threw)throw Error("Expected validation to throw")}
};
import { financeRoutes, financePathFor, fromLegacyKey, resolveFinanceLocation, safePrivatePath, isServerPath } from "./finance-router.js";

const legacy=financeRoutes.filter(r=>"legacy" in r);
assert.equal(legacy.length,17,"all P24 legacy routes have canonical aliases");
for(const r of legacy){
 const old=(r as {legacy:string}).legacy;
 const actual=resolveFinanceLocation("/#"+old);
 assert.equal(actual.id,r.id,"old hash "+old+" maps to "+r.id);
 assert.equal(actual.canonical,r.path);
 assert.equal(actual.normalized,true);
 assert.equal(fromLegacyKey(old),r.path);
}
assert.equal(resolveFinanceLocation("/#activity?q=REWE").canonical,"/activity?q=REWE");
assert.equal(resolveFinanceLocation("/#products?product=A%20B").canonical,"/explore/products/A%20B");
assert.equal(resolveFinanceLocation("/#scan").canonical,"/receipts/capture");
assert.equal(resolveFinanceLocation("/activity?q=REWE&bogus=secret").canonical,"/activity?q=REWE");
assert.equal(resolveFinanceLocation("/activity?q=coffee").id,"activity");
assert.equal(resolveFinanceLocation("/activity/transaction/tr123").params.transactionId,"tr123");
assert.equal(resolveFinanceLocation("/explore/products/sku123").params.productId,"sku123");
assert.equal(resolveFinanceLocation("/receipts/receipt123").id,"receipt-detail");
assert.equal(resolveFinanceLocation("/wealth/accounts/ac123").id,"account-detail");
assert.equal(resolveFinanceLocation("/activity/new?type=expense").id,"activity-new");
assert.equal(resolveFinanceLocation("/sign-in").isPublic,true);
assert.equal(resolveFinanceLocation("/auth/callback").isPublic,true);
assert.equal(resolveFinanceLocation("/missing-page").id,"not-found");
assert.equal(resolveFinanceLocation("/#finance-main").id,"home");
assert.equal(resolveFinanceLocation("/?code=oauthcode#overview").normalized,false,"PKCE callback untouched");
assert.equal(resolveFinanceLocation("/#access_token=secret").normalized,false,"implicit flow untouched");
assert.equal(financePathFor("product-detail",{productId:"café & milk"}),"/explore/products/caf%C3%A9%20%26%20milk");
assert.throws(()=>financePathFor("product-detail",{productId:"../../api"}));
assert.equal(safePrivatePath("/activity?q=milk"),"/activity?q=milk");
for(const invalid of [
 "//evil.example","https://evil.example","javascript:alert(1)", "/api/mcp", "/.well-known/openid-configuration",
 "/sign-in","/auth/callback","/unknown","/privacy","/%2F%2Fevil","/activity\\evil", "/settings?q=some-private-data"
]){
 const value=safePrivatePath(invalid);
 assert.equal(value,invalid==="/settings?q=some-private-data"?"/settings":null,invalid+" rejected or canonicalized");
}
for(const uri of ["/api/mcp","/api/oauth-protected-resource","/.well-known/oauth-protected-resource","/privacy","/terms","/support","/assets/a.js"])assert(isServerPath(uri),uri+" is reserved");
console.log("P27 router and return-target safeguards passed");
