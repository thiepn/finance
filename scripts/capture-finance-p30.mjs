#!/usr/bin/env node
/** P30: test the real receipt inbox React component without private credentials. */
import {chromium} from "playwright";
import AxeBuilder from "@axe-core/playwright";
import {spawn} from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
const out=path.resolve("p30-artifacts");
await fs.mkdir(path.join(out,"screenshots"),{recursive:true});
const origin="http://127.0.0.1:4178/p30-receipt-preview.html";
const server=spawn("npm",["run","dev","--","--host","127.0.0.1","--port","4178","--strictPort"],{stdio:"ignore",env:{...process.env,NODE_ENV:"development"}});
let browser;const results=[],failures=[];
try{
 let ready=false;
 for(let i=0;i<75;i++){
  try{const r=await fetch(origin);if(r.ok){ready=true;break}}catch{}
  if(server.exitCode!==null)break;
  await new Promise(r=>setTimeout(r,350));
 }
 if(!ready)throw Error("P30 synthetic React preview server unavailable");
 browser=await chromium.launch({headless:true});
 for(const device of [{id:"desktop",width:1440,height:900},{id:"tablet",width:1024,height:768},{id:"mobile",width:390,height:844},{id:"narrow",width:320,height:640}])
 for(const theme of ["dark","light"])
 for(const scenario of (device.width<600?["normal","empty"]:["normal"])){
   const context=await browser.newContext({viewport:{width:device.width,height:device.height},reducedMotion:"reduce",deviceScaleFactor:1});
   const page=await context.newPage(),id=[device.id,theme,scenario].join("-"),item={id};
   const exceptions=[];page.on("pageerror",e=>exceptions.push(String(e)));
   try{
    await page.goto(origin,{waitUntil:"networkidle",timeout:30000});
    await page.getByRole("heading",{name:"Receipts",exact:true}).waitFor({timeout:10000});
    if(theme==="light")await page.getByRole("button",{name:"Switch to light appearance"}).first().click();
    if(scenario==="empty")await page.getByRole("combobox",{name:"Scenario"}).selectOption("empty");
    item.bounds=await page.evaluate(()=>({overflow:Math.max(0,document.documentElement.scrollWidth-document.documentElement.clientWidth),theme:document.querySelector(".sc-root")?.getAttribute("data-sc-theme")}));
    item.path="screenshots/"+id+".png";await page.screenshot({path:path.join(out,item.path),animations:"disabled",fullPage:device.width>600});
    const axe=await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21a","wcag21aa","wcag22aa"]).analyze();
    item.axe=axe.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.length}));
    if(item.bounds.overflow>1)failures.push(id+": overflow "+item.bounds.overflow);
    const filtersFullyVisible=await page.locator(".sc-receipt-studio__filters button").evaluateAll(buttons=>
      buttons.every(button=>{
       const rect=button.getBoundingClientRect();
       return rect.left>=-1&&rect.right<=document.documentElement.clientWidth+1;
      }));
    if(!filtersFullyVisible)failures.push(id+": at least one filter is hidden off-screen");
    if(item.bounds.theme!==theme)failures.push(id+": theme mismatch");
    if(item.axe.length)failures.push(id+": axe "+item.axe.map(v=>v.id).join(","));
    if(exceptions.length)failures.push(id+": JS "+exceptions.join(";"));
    if(scenario==="normal"){
      const q=page.locator(".sc-receipt-studio__row");
      if(await q.count()!==6)failures.push(id+": incorrect review count");
      await page.getByRole("button",{name:"Matched",exact:true}).click();
      if(await q.count()!==2)failures.push(id+": matched filter wrong");
      await page.getByRole("button",{name:"All receipts",exact:true}).click();
      if(await q.count()!==8)failures.push(id+": all filter wrong");
      const href=await q.first().getAttribute("href");
      if(!href?.startsWith("/receipts/synthetic-"))failures.push(id+": canonical detail URL not found");
    }
   }catch(e){item.error=String(e).slice(0,350);failures.push(id+": "+item.error)}
   results.push(item);
   console.log(JSON.stringify({id,overflow:item.bounds?.overflow,axe:item.axe?.map(v=>v.id),error:item.error??null}));
   await context.close();
 }
}finally{if(browser)await browser.close();server.kill("SIGTERM")}
await fs.writeFile(path.join(out,"report.json"),JSON.stringify({phase:"P30",scope:"Real React receipt inbox, synthetic non-authenticated finance fixtures",results,failures},null,2)+"\n");
const esc=s=>String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll('"',"&quot;");
const html='<meta charset="utf-8"><title>Finance P30 Visual QA</title><style>body{font:13px system-ui;background:#e9edf3;color:#182234;margin:20px}main{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:17px}article{background:white;padding:11px}img{width:100%;height:500px;object-fit:contain;object-position:top}</style><h1>P30 Receipt Inbox — Signal Current</h1><p>Actual React component using synthetic receipt data. No Supabase session.</p><main>'+results.map(x=>'<article><h3>'+esc(x.id)+'</h3><p>Overflow '+esc(x.bounds?.overflow??"?")+'px · axe '+esc(x.axe?.length??"?")+'</p>'+(x.path?'<a href="'+esc(x.path)+'"><img src="'+esc(x.path)+'"></a>':"Capture failed")+'</article>').join("")+"</main>";
await fs.writeFile(path.join(out,"index.html"),html);
console.log("P30 CAPTURE SUMMARY: "+JSON.stringify({captured:results.filter(x=>x.path).length,failures:failures.length,details:failures.slice(0,22)}));
if(failures.length)process.exitCode=1;
