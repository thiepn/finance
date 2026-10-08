#!/usr/bin/env node
/* P31: exercise the actual SignalPlanView on synthetic fixtures, not private accounts. */
import {chromium} from "playwright";
import AxeBuilder from "@axe-core/playwright";
import {spawn} from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
const out=path.resolve("p31-artifacts");await fs.mkdir(path.join(out,"screenshots"),{recursive:true});
const origin="http://127.0.0.1:4179/p31-plan-preview.html";
const server=spawn("npm",["run","dev","--","--host","127.0.0.1","--port","4179","--strictPort"],{stdio:"ignore",env:{...process.env,NODE_ENV:"development"}});
const results=[],failures=[];let browser;
try{
 let ready=false;for(let i=0;i<70;i++){try{const r=await fetch(origin);if(r.ok){ready=true;break}}catch{}
  if(server.exitCode!==null)break;await new Promise(r=>setTimeout(r,350))}
 if(!ready)throw Error("P31 React preview server unavailable");
 browser=await chromium.launch({headless:true});
 for(const dev of [{id:"desktop",width:1440,height:900},{id:"tablet",width:1024,height:768},{id:"mobile",width:390,height:844},{id:"narrow",width:320,height:640}])
 for(const theme of ["dark","light"])
 for(const scenario of (dev.width<600?["normal","empty","overspent","no-plan"]:["normal"])){
   const context=await browser.newContext({viewport:{width:dev.width,height:dev.height},reducedMotion:"reduce",deviceScaleFactor:1});
   const page=await context.newPage();const id=[dev.id,theme,scenario].join("-"),item={id};
   const exceptions=[];page.on("pageerror",e=>exceptions.push(String(e)));
   try{
    await page.goto(origin,{waitUntil:"networkidle",timeout:30000});
    await page.getByRole("heading",{name:"Plan",exact:true}).waitFor({timeout:15000});
    if(theme==="light")await page.getByRole("button",{name:"Switch to light appearance"}).first().click();
    await page.getByRole("combobox",{name:"Scenario"}).selectOption(scenario);
    item.geometry=await page.evaluate(()=>{
      const width=document.documentElement.clientWidth;
      let clipped=0;
      for(const el of document.querySelectorAll(".sc-plan-position .sc-money,.sc-plan-allocation .sc-money")){
        if(!el.getClientRects().length)continue;
        const r=document.createRange();r.selectNodeContents(el);
        const host=el.getBoundingClientRect();
        for(const b of r.getClientRects())if(b.width>0&&(b.left<host.left-2||b.right>host.right+2))clipped++;
      }
      return {overflow:Math.max(0,document.documentElement.scrollWidth-width),clipped,
       theme:document.querySelector(".sc-root")?.getAttribute("data-sc-theme")};
    });
    item.png="screenshots/"+id+".png";
    await page.screenshot({path:path.join(out,item.png),animations:"disabled",fullPage:dev.width>600});
    const axe=await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21a","wcag21aa","wcag22aa"]).analyze();
    item.axe=axe.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.length}));
    if(item.geometry.overflow>1)failures.push(id+": overflow "+item.geometry.overflow);
    if(item.geometry.clipped)failures.push(id+": currency text clipped "+item.geometry.clipped);
    if(item.geometry.theme!==theme)failures.push(id+": wrong theme");
    if(item.axe.length)failures.push(id+": axe "+item.axe.map(v=>v.id).join(","));
    if(exceptions.length)failures.push(id+": JS "+exceptions.join(";"));
    if(scenario==="normal"){
      const adjust=page.getByRole("button",{name:"Adjust"}).first();
      await adjust.click();
      if(await page.getByRole("button",{name:"Save limit"}).count()!==1)failures.push(id+": edit panel failed");
    }
    if(scenario==="overspent"){
      const txt=await page.locator(".sc-plan-position").innerText();
      if(!txt.toLocaleLowerCase().includes("over budget")||!/[-−]/.test(txt))failures.push(id+": overrun not visibly disclosed");
    }
    if(scenario==="no-plan"&&await page.getByRole("button",{name:"Create budget"}).count()!==1)failures.push(id+": setup action unavailable");
   }catch(e){item.error=String(e).slice(0,350);failures.push(id+": "+item.error)}
   results.push(item);console.log(JSON.stringify({id,overflow:item.geometry?.overflow,axe:item.axe?.map(x=>x.id),error:item.error??null}));
   await context.close();
 }
}finally{if(browser)await browser.close();server.kill("SIGTERM")}
await fs.writeFile(path.join(out,"report.json"),JSON.stringify({phase:"P31",scope:"Actual Plan React components, synthetic sample values only",results,failures},null,2)+"\n");
const esc=s=>String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll('"',"&quot;");
const gallery='<meta charset="utf-8"><title>P31 Budget Visual QA</title><style>body{font:13px system-ui;background:#e9edf3;color:#182234;margin:20px}main{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:17px}article{background:white;padding:11px}img{width:100%;height:500px;object-fit:contain;object-position:top}</style><h1>Finance Plan · Signal Current P31</h1><p>Actual React page with synthetic figures, no authenticated finance account.</p><main>'+results.map(x=>'<article><h3>'+esc(x.id)+'</h3><p>Overflow '+esc(x.geometry?.overflow??"?")+'px · axe '+esc(x.axe?.length??"?")+'</p>'+(x.png?'<a href="'+esc(x.png)+'"><img src="'+esc(x.png)+'"></a>':"Capture missing")+'</article>').join("")+'</main>';
await fs.writeFile(path.join(out,"index.html"),gallery);
console.log("P31 BROWSER SUMMARY: "+JSON.stringify({screenshots:results.filter(x=>x.png).length,failed:failures.length,details:failures.slice(0,24)}));
if(failures.length)process.exitCode=1;
