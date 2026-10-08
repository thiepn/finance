#!/usr/bin/env node
/**
 * P25 isolated public synthetic visual design review.
 * Static design sketches; never access live Finance or authenticated data.
 * npm install --no-save --no-package-lock playwright @axe-core/playwright
 * npx playwright install chromium
 * node scripts/capture-finance-p25.mjs
 */
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve("design/p25/visual-lab/index.html");
const base = pathToFileURL(root).toString();
const out = path.resolve("p25-artifacts");
const dir = path.join(out, "screenshots");
await fs.mkdir(dir, { recursive: true });
const variants = ["a","b","c"];
const modes = ["default","alternate"];
const devices = [
  {key:"desktop",width:1440,height:900,screens:["home","activity","receipt"]},
  {key:"mobile",width:390,height:844,screens:["home","scan","plan"]}
];
const results = [], failures = [];
const browser = await chromium.launch({headless:true});
try {
 for(const variant of variants)for(const mode of modes)for(const device of devices)for(const screen of device.screens){
  const ctx=await browser.newContext({viewport:{width:device.width,height:device.height},deviceScaleFactor:1,colorScheme:mode==="alternate"?"dark":"light",reducedMotion:"reduce"});
  const page=await ctx.newPage();
  const item={direction:variant,mode,device:device.key,screen};
  const errors=[];
  page.on("pageerror", e=>errors.push(String(e).slice(0,240)));
  try{
   const url = base + "?capture=1&direction="+variant+"&mode="+mode+"&device="+device.key+"&screen="+screen;
   await page.goto(url,{waitUntil:"load",timeout:30000});
   await page.locator(".screen:visible").waitFor({state:"visible",timeout:15000});
   item.measures=await page.evaluate(()=>{
    const d=document.documentElement,frame=document.querySelector(".frame"),visible=document.querySelector(".screen:not([style*='display: none'])");
    const screens=[...document.querySelectorAll(".screen")].filter(node=>getComputedStyle(node).display!=="none");
    return {width:d.clientWidth,overflow:Math.max(0,d.scrollWidth-d.clientWidth),activeScreens:screens.length,contentHeight:frame?.scrollHeight??0,screen:screens[0]?.className,mobileNavVisible:getComputedStyle(document.querySelector(".mobile-tabs")).display!=="none"};
   });
   const name=[variant,mode,device.key,screen].join("-");
   item.filename="screenshots/"+name+".png";
   await page.screenshot({path:path.join(out,item.filename),fullPage:device.key==="desktop",animations:"disabled"});
   // Axe covers design preview, not production app; exclude intentional static UI controls from claims of functionality.
   const a=await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21a","wcag21aa","wcag22aa"]).analyze();
   item.axe=a.violations.map(v=>({id:v.id,impact:v.impact,count:v.nodes.length,targets:v.nodes.slice(0,3).map(n=>n.target.join(" "))}));
   if(item.measures.overflow>1)failures.push(name+": "+item.measures.overflow+" px page overflow");
   if(item.measures.activeScreens!==1)failures.push(name+": "+item.measures.activeScreens+" visible screens");
   if(item.measures.mobileNavVisible!==(device.key==="mobile"))failures.push(name+": wrong responsive navigation visibility");
   if(errors.length)failures.push(name+": JS errors "+errors.length);
  }catch(e){item.error=String(e).slice(0,400);failures.push(JSON.stringify(item))}
  results.push(item);
  console.log(JSON.stringify({name:[variant,mode,device.key,screen].join("-"),overflow:item.measures?.overflow,axe:item.axe?.map(x=>x.id),err:item.error||null}));
  await ctx.close();
 }
 // Additional 320px and 1024px visual stress, primary mode, without duplicating every scenario.
 for(const variant of variants)for(const [device,screen,width,height] of [["mobile","home",320,640],["desktop","activity",1024,768]]){
   const ctx=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,reducedMotion:"reduce"});
   const page=await ctx.newPage();const name=[variant,"stress",device,screen,width].join("-");
   const item={direction:variant,mode:"stress",device,screen};
   try{
     await page.goto(base+"?capture=1&direction="+variant+"&device="+device+"&screen="+screen,{waitUntil:"load"});
     item.filename="screenshots/"+name+".png";
     item.overflow=await page.evaluate(()=>Math.max(0,document.documentElement.scrollWidth-document.documentElement.clientWidth));
     await page.screenshot({path:path.join(out,item.filename),fullPage:true});
     if(item.overflow>1)failures.push(name+": "+item.overflow+" px page overflow");
   }catch(e){item.error=String(e).slice(0,300);failures.push(name+": "+item.error);}
   results.push(item);
   await ctx.close();
 }
}finally{await browser.close()}
const report={phase:"P25",date:new Date().toISOString(),source:"Standalone static Finance visual lab; synthetic data",screens:results.length,results,failures};
await fs.writeFile(path.join(out,"report.json"),JSON.stringify(report,null,2)+"\n");
const h=s=>String(s??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll('"',"&quot;");
const cards=results.filter(x=>x.filename).map(x=>'<article><h3>'+h(x.direction.toUpperCase()+" · "+x.mode+" · "+x.device+" · "+x.screen)+'</h3><p>'+h("Overflow "+(x.measures?.overflow??x.overflow??"n/a")+" px; axe violations "+(x.axe?.length??"not tested"))+'</p><a href="'+h(x.filename)+'"><img loading="lazy" alt="'+h(x.filename)+'" src="'+h(x.filename)+'"></a></article>').join("");
await fs.writeFile(path.join(out,"index.html"),'<meta charset="utf-8"><title>P25 Finance concept screenshots</title><style>body{font:13px system-ui;background:#f1f1ef;margin:24px;color:#171c1e}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:18px}article{background:white;padding:14px;border:1px solid #ccc}img{display:block;width:100%;max-height:590px;object-fit:contain;object-position:top;background:#aaa}h3{margin:0 0 6px;font-size:14px}</style><h1>THIEPN Finance P25 · Three Concept Directions</h1><p>Static HTML mockups only; no account access, no real financial data, no backend behavior. Click image to inspect pixel resolution.</p><p>'+results.length+' views; '+failures.length+' smoke failures; see report.json for accessibility results.</p><main>'+cards+'</main>');
console.log("P25 CAPTURE SUMMARY: "+JSON.stringify({
 captured:results.filter(x=>x.filename).length,
 total:results.length,failures:failures.length,
 overflow:results.filter(x=>((x.measures?.overflow??x.overflow??0)>1)).length,
 axeViolations:results.reduce((sum,x)=>sum+(x.axe?.length||0),0)
}));
if(failures.length)process.exitCode=1;
