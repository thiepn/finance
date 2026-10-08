#!/usr/bin/env node
/** P28 browser QA of REAL Home component, with synthetic fixtures and no auth. */
import {chromium} from "playwright";
import AxeBuilder from "@axe-core/playwright";
import {spawn} from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
const out=path.resolve("p28-artifacts");
await fs.mkdir(path.join(out,"screenshots"),{recursive:true});
const origin="http://127.0.0.1:4176/p28-home-preview.html";
const server=spawn("npm",["run","dev","--","--host","127.0.0.1","--port","4176","--strictPort"],{stdio:"ignore",env:{...process.env,NODE_ENV:"development"}});
let browser;const results=[],failures=[];
try{
 let ready=false;
 for(let i=0;i<80;i++){
  try{const res=await fetch(origin);if(res.ok){ready=true;break;}}catch{}
  if(server.exitCode!==null)break;
  await new Promise(r=>setTimeout(r,300));
 }
 if(!ready)throw Error("P28 Home React preview server unavailable");
 browser=await chromium.launch({headless:true});
 const devices=[{id:"desktop",width:1440,height:900},{id:"tablet",width:1024,height:768},{id:"mobile",width:390,height:844},{id:"narrow",width:320,height:640}];
 for(const dev of devices)for(const mode of ["dark","light"]){
  const scenarios=dev.id==="mobile"||dev.id==="narrow"?["normal","no-plan","empty","overrun","source-error"]:["normal"];
  for(const scenario of scenarios){
   const context=await browser.newContext({viewport:{width:dev.width,height:dev.height},reducedMotion:"reduce",deviceScaleFactor:1});
   const page=await context.newPage();
   const errors=[];page.on("pageerror",e=>errors.push(String(e)));
   const id=dev.id+"-"+mode+"-"+scenario,item={id,device:dev.id,mode,scenario};
   try{
    await page.goto(origin,{waitUntil:"networkidle",timeout:30000});
    await page.getByRole("heading",{name:"Home",exact:true}).waitFor({timeout:12000});
    if(mode==="light")await page.getByRole("button",{name:"Switch to light appearance"}).first().click();
    await page.getByRole("combobox",{name:"Scenario"}).selectOption(scenario);
    item.geometry=await page.evaluate(()=>{
      const width=document.documentElement.clientWidth;
      let clipped=0;
      for(const el of document.querySelectorAll(".sc-home-metric .sc-money,.sc-home-brief .sc-money,.sc-home-mobile-spent .sc-money")){
       const parent=el.parentElement;
       if(!parent||getComputedStyle(parent).display==="none")continue;
       const rect=parent.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(el);
       for(const span of range.getClientRects())if(span.width>0&&(span.right>rect.right+1||span.left<rect.left-1))clipped++;
      }
      return {overflowX:Math.max(0,document.documentElement.scrollWidth-width),clipped,theme:document.querySelector(".sc-root")?.getAttribute("data-sc-theme")};
    });
    item.png="screenshots/"+id+".png";
    await page.screenshot({path:path.join(out,item.png),animations:"disabled",fullPage:dev.width>600});
    const axe=await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21a","wcag21aa","wcag22aa"]).analyze();
    item.axe=axe.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.length}));
    if(item.geometry.overflowX>1)failures.push(id+": horizontal overflow "+item.geometry.overflowX);
    if(item.geometry.clipped)failures.push(id+": clipped financial values "+item.geometry.clipped);
    if(item.geometry.theme!==mode)failures.push(id+": wrong theme "+item.geometry.theme);
    if(item.axe.length)failures.push(id+": axe "+item.axe.map(v=>v.id).join(","));
    if(errors.length)failures.push(id+": JS "+errors.join(";"));
    if(scenario==="no-plan"){
     const msg=await page.locator(".sc-home-metric--primary .sc-money").count();
     if(msg!==0)failures.push(id+": invented spendable balance");
    }
    if(scenario==="source-error"){
     const text=await page.locator(".sc-home").innerText();
     if(!text.includes("Source unavailable")||!text.includes("Spending trend could not load"))failures.push(id+": missing source outage disclosure");
    }
   }catch(e){item.error=String(e).slice(0,350);failures.push(id+": "+item.error);}
   results.push(item);
   console.log(JSON.stringify({id,overflow:item.geometry?.overflowX,clipped:item.geometry?.clipped,axe:item.axe?.map(a=>a.id),error:item.error??null}));
   await context.close();
  }
 }
}finally{if(browser)await browser.close();server.kill("SIGTERM");}
await fs.writeFile(path.join(out,"report.json"),JSON.stringify({phase:"P28",note:"Isolated synthetic-data React QA; real authenticated Finance flows not tested.",results,failures},null,2)+"\n");
const esc=s=>String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll('"',"&quot;");
const html='<meta charset="utf-8"><title>P28 React Home QA</title><style>body{font:13px system-ui;background:#e9edf3;color:#182234;margin:22px}main{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:15px}article{background:#fff;padding:10px}img{max-width:100%;width:100%;height:500px;object-fit:contain;object-position:top}</style><h1>Finance Home · Signal Current P28</h1><p>Real UI components with synthetic values. Not an authenticated session.</p><main>'+results.map(x=>'<article><h3>'+esc(x.id)+'</h3><p>Overflow '+esc(x.geometry?.overflowX??"?")+'px · Clipped amounts '+esc(x.geometry?.clipped??"?")+' · axe '+esc(x.axe?.length??"?")+'</p>'+(x.png?'<a href="'+esc(x.png)+'"><img src="'+esc(x.png)+'"></a>':"Capture unavailable")+'</article>').join("")+'</main>';
await fs.writeFile(path.join(out,"index.html"),html);
console.log("P28 CAPTURE SUMMARY: "+JSON.stringify({captured:results.filter(r=>r.png).length,failures:failures.length,details:failures.slice(0,25)}));
if(failures.length)process.exitCode=1;
