#!/usr/bin/env node
import {chromium} from "playwright";
import AxeBuilder from "@axe-core/playwright";
import {spawn} from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
const dir=path.resolve("p31-artifacts");await fs.mkdir(path.join(dir,"screenshots"),{recursive:true});
const origin="http://127.0.0.1:4179/p31-plan-preview.html";
const server=spawn("npm",["run","dev","--","--host","127.0.0.1","--port","4179","--strictPort"],{stdio:"ignore",env:{...process.env,NODE_ENV:"development"}});
const results=[],failures=[];let browser;
try{
 let ready=false;for(let i=0;i<70;i++){try{if((await fetch(origin)).ok){ready=true;break}}catch{}
  if(server.exitCode!==null)break;await new Promise(r=>setTimeout(r,350))}
 if(!ready)throw Error("P31 React preview server unavailable");
 browser=await chromium.launch({headless:true});
 for(const dev of [{id:"desktop",width:1440,height:900},{id:"tablet",width:1024,height:768},{id:"mobile",width:390,height:844},{id:"narrow",width:320,height:640}])
 for(const mode of ["dark","light"])
 for(const scenario of (dev.width<600?["normal","no-budget","goals","over"]:["normal"])){
  const context=await browser.newContext({viewport:{width:dev.width,height:dev.height},deviceScaleFactor:1,reducedMotion:"reduce"});
  const page=await context.newPage();const errors=[];page.on("pageerror",e=>errors.push(String(e)));
  const id=[dev.id,mode,scenario].join("-"),item={id};
  try{
   await page.goto(origin,{waitUntil:"networkidle",timeout:30000});
   await page.getByRole("heading",{name:"Plan",exact:true}).waitFor({timeout:12000});
   if(mode==="light")await page.getByRole("button",{name:"Switch to light appearance"}).first().click();
   if(scenario==="goals")await page.getByRole("combobox",{name:"View"}).selectOption("goals");
   else if(scenario!=="normal")await page.getByRole("combobox",{name:"Scenario"}).selectOption(scenario);
   item.geometry=await page.evaluate(()=>{
     const width=document.documentElement.clientWidth;
     let clipped=0;for(const el of document.querySelectorAll(".sc-plan-kpi .sc-money,.sc-plan-allocation__values .sc-money,.sc-plan-obligation .sc-money,.sc-plan-goal__amount .sc-money")){
      const p=el.parentElement;if(!p||getComputedStyle(p).display==="none")continue;
      const rect=p.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(el);
      for(const line of range.getClientRects())if(line.width>0&&(line.left<rect.left-1||line.right>rect.right+1))clipped++;
     }
     return{overflow:Math.max(0,document.documentElement.scrollWidth-width),clipped,
      theme:document.querySelector(".sc-root")?.getAttribute("data-sc-theme")};
   });
   item.png="screenshots/"+id+".png";
   await page.screenshot({path:path.join(dir,item.png),animations:"disabled",fullPage:dev.width>600});
   const axe=await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21a","wcag21aa","wcag22aa"]).analyze();
   item.axe=axe.violations.map(v=>({id:v.id,nodes:v.nodes.length,impact:v.impact}));
   if(item.geometry.overflow>1)failures.push(id+": horizontal overflow "+item.geometry.overflow);
   if(item.geometry.clipped)failures.push(id+": financial figure cropped "+item.geometry.clipped);
   if(item.geometry.theme!==mode)failures.push(id+": theme mismatch");
   if(errors.length)failures.push(id+": JS "+errors.join(";"));
   if(item.axe.length)failures.push(id+": accessibility "+item.axe.map(a=>a.id).join(","));
   if(scenario==="no-budget"&&await page.locator(".sc-plan-kpi .sc-money").count())failures.push(id+": invented plan money");
   if(scenario==="normal"){
    const go=page.getByRole("button",{name:"Savings goals",exact:true});await go.click();
    if(!await page.getByText("Emergency reserve").count())failures.push(id+": goal navigation failed");
   }
  }catch(e){item.error=String(e).slice(0,450);failures.push(id+": "+item.error)}
  results.push(item);console.log(JSON.stringify({id,overflow:item.geometry?.overflow,clipped:item.geometry?.clipped,axe:item.axe?.map(a=>a.id),error:item.error??null}));
  await context.close();
 }
}finally{if(browser)await browser.close();server.kill("SIGTERM")}
await fs.writeFile(path.join(dir,"report.json"),JSON.stringify({phase:"P31",scope:"Real React Plan, synthetic-only datasets",results,failures},null,2)+"\n");
const esc=s=>String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll('"',"&quot;");
const html='<meta charset="utf-8"><title>P31 Plan QA</title><style>body{font:13px system-ui;color:#182234;background:#e9edf3;margin:20px}main{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:14px}article{background:white;padding:11px}img{width:100%;height:510px;object-fit:contain;object-position:top}</style><h1>Signal Current Plan · P31</h1><p>Actual React UI with synthetic budgets and goals; no authenticated financial account.</p><main>'+results.map(x=>'<article><h3>'+esc(x.id)+'</h3><p>Overflow '+esc(x.geometry?.overflow??"?")+'px · clipped values '+esc(x.geometry?.clipped??"?")+' · axe '+esc(x.axe?.length??"?")+'</p>'+(x.png?'<a href="'+esc(x.png)+'"><img src="'+esc(x.png)+'"></a>':"Unavailable")+'</article>').join("")+'</main>';
await fs.writeFile(path.join(dir,"index.html"),html);
console.log("P31 CAPTURE SUMMARY: "+JSON.stringify({captured:results.filter(x=>x.png).length,failures:failures.length,details:failures.slice(0,35)}));
if(failures.length)process.exitCode=1;
