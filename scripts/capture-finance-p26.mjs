#!/usr/bin/env node
/** P26 real React component screenshot, overflow and axe audit.
 * Runs only on isolated synthetic Vite showcase. Does not access production.
 */
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
const origin="http://127.0.0.1:4174/p26-showcase.html";
const out=path.resolve("p26-artifacts");
await fs.mkdir(path.join(out,"screenshots"),{recursive:true});
const server=spawn("npm",["run","dev","--","--host","127.0.0.1","--port","4174","--strictPort"],{stdio:"ignore",env:{...process.env,NODE_ENV:"development"}});
let browser;
const results=[],failures=[];
try {
 let ready=false;
 for(let i=0;i<60;i++){
   try{const r=await fetch(origin);if(r.ok){ready=true;break;}}catch{}
   if(server.exitCode!==null)break;
   await new Promise(r=>setTimeout(r,350));
 }
 if(!ready)throw Error("Vite synthetic preview did not start on localhost:4174");
 browser=await chromium.launch({headless:true});
 const devices=[{name:"desktop",width:1440,height:900},{name:"mobile",width:390,height:844},{name:"narrow",width:320,height:640},{name:"tablet",width:1024,height:768}];
 const screens=["home","activity","receipt","plan","states"];
 for(const device of devices)for(const theme of ["dark","light"])for(const screen of (["narrow","tablet"].includes(device.name)?["home","activity"]:screens)){
   const context=await browser.newContext({viewport:{width:device.width,height:device.height},locale:"de-DE",reducedMotion:"reduce",deviceScaleFactor:1});
   const page=await context.newPage();
   const errors=[];page.on("pageerror",err=>errors.push(String(err)));
   const id=[device.name,theme,screen].join("-");
   const item={device:device.name,theme,screen,id};
   try{
     await page.goto(origin+"?screen="+screen,{waitUntil:"networkidle",timeout:30000});
     await page.getByRole("combobox",{name:"Theme"}).selectOption(theme);
     await page.locator(".sc-root").waitFor({state:"visible",timeout:12000});
     item.status=await page.evaluate(()=>{
       const root=document.querySelector(".sc-root");
       const visibleWidth=document.documentElement.clientWidth;
       return {theme:root?.getAttribute("data-sc-theme"),overflowX:Math.max(0,document.documentElement.scrollWidth-visibleWidth),visibleMain:!!document.querySelector("main"),money:document.querySelectorAll(".sc-money").length};
     });
     item.png="screenshots/"+id+".png";
     await page.screenshot({path:path.join(out,item.png),fullPage:device.width>500,animations:"disabled"});
     const axe=await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21a","wcag21aa","wcag22aa"]).analyze();
     item.axe=axe.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.length,targets:v.nodes.slice(0,3).map(n=>n.target.join(" "))}));
     if(item.status.theme!==theme)failures.push(id+": theme mismatch");
     if(item.status.overflowX>1)failures.push(id+": overflow "+item.status.overflowX+"px");
     if(!item.status.visibleMain)failures.push(id+": missing main");
     if(item.axe.length)failures.push(id+": axe "+item.axe.map(v=>v.id).join(", "));
     if(errors.length)failures.push(id+": JS errors "+errors.length);
   }catch(e){item.error=String(e).slice(0,280);failures.push(id+": "+item.error);}
   results.push(item);
   console.log(JSON.stringify({id,overflow:item.status?.overflowX,axe:item.axe?.map(x=>x.id),error:item.error??null}));
   await context.close();
 }
}finally{if(browser)await browser.close();server.kill("SIGTERM");}
await fs.writeFile(path.join(out,"report.json"),JSON.stringify({type:"P26 synthetic React-only component QA",timestamp:new Date().toISOString(),results,failures},null,2)+"\n");
const esc=s=>String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll('"',"&quot;");
const h='<meta charset="utf-8"><title>Signal Current P26 Review</title><style>body{font:13px system-ui;margin:25px;background:#e9edf3;color:#182234}main{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:20px}article{background:white;padding:12px}img{width:100%;height:480px;object-fit:contain;object-position:top;background:#eee}</style><h1>P26 React Component Visual QA</h1><p>Synthetic data only. No authentication or financial posting.</p><main>'+results.map(x=>'<article><h3>'+esc(x.id)+'</h3><p>Overflow '+esc(x.status?.overflowX??"?")+"px · axe "+esc(x.axe?.length??"?")+'</p>'+(x.png?'<a href="'+esc(x.png)+'"><img src="'+esc(x.png)+'" loading="lazy"></a>':'Capture failed')+'</article>').join("")+"</main>";
await fs.writeFile(path.join(out,"index.html"),h);
console.log("P26 CAPTURE SUMMARY: "+JSON.stringify({captured:results.filter(x=>x.png).length,failed:failures.length,violations:results.reduce((n,x)=>n+(x.axe?.length??0),0),overflow:results.filter(x=>x.status?.overflowX>1).length,failures:failures.slice(0,25)}));
if(failures.length)process.exitCode=1;
