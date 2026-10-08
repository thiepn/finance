#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
const vercel=JSON.parse(fs.readFileSync("vercel.json","utf8"));
const rewrite=vercel.rewrites.find(r=>r.destination==="/index.html");
assert(rewrite,"P27 requires direct-refresh fallback for canonical client paths");
const routed=["/activity","/activity/new","/plan","/plan/goals","/explore","/explore/products/item123","/receipts","/receipts/capture","/wealth/accounts","/import","/settings","/ask","/sign-in","/auth/callback"];
const excluded=["/api/mcp","/.well-known/oauth-protected-resource","/privacy","/terms","/support","/assets/main.js"];
const pattern=new RegExp("^"+rewrite.source+"$");
for(const p of routed)assert(pattern.test(p),"Missing SPA route rewrite: "+p);
for(const p of excluded)assert(!pattern.test(p),"Protected server route shadowed: "+p);
const main=fs.readFileSync("src/app/main.tsx","utf8");
assert(main.includes("finance-app-shell.css")&&main.includes("finance-auth.css"),"P27 app styles absent");
const app=fs.readFileSync("src/app/FinanceApp.tsx","utf8");
assert(app.includes("FinanceAppV2"),"P27 active app shell not mounted");
const v2=fs.readFileSync("src/app/FinanceAppV2.tsx","utf8");
assert(v2.includes('useFinanceSession()'),"Private routes missing session guard");
assert(v2.indexOf('session.status==="signed-out"')<v2.indexOf("<FinancePrivatePage"),"Data pages rendered ahead of auth gate");
const shell=fs.readFileSync("src/ui/v2/FinanceV2Shell.tsx","utf8");
assert(shell.includes("Primary desktop navigation")&&shell.includes("Primary mobile navigation"),"Primary navigation landmarks absent");
assert(shell.includes('aria-expanded={menuOpen}'),"More menu state must be exposed");
const p24=JSON.parse(fs.readFileSync("design/p24/route-contract.json","utf8"));
const router=fs.readFileSync("src/app/finance-router.ts","utf8");
for(const def of p24.routes){assert(router.includes('id:"'+def.id+'"')&&router.includes('path:"'+def.path+'"'),"Missing P24 route contract: "+def.id)}
assert(!main.includes("showcase-main.tsx"),"Synthetic showcase mounted in production");
console.log("P27 route rewrite, auth gate, navigation and backward compatibility static checks passed");
