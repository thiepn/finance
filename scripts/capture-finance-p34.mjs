#!/usr/bin/env node
/* Tests actual React Recurring page with isolated synthetic data only. No implicit ledger writes. */
import {chromium} from "playwright";import AxeBuilder from "@axe-core/playwright";
import {spawn} from "node:child_process";import fs from "node:fs/promises";import path from "node:path";
const dir=path.resolve("p34-artifacts");await fs.mkdir(path.join(dir,"screenshots"),{recursive:true});
const origin="http://127.0.0.1:4184/p34-recurring-preview.html";
const server=spawn("npm",["run","dev","--","--host","127.0.0.1","--port","4184","--strictPort"],{stdio:"ignore"});
const failures=[],results=[];let browser;
try{
 let ready=false;for(let i=0;i<75;i++){try{if((await fetch(origin)).ok){ready=true;break}}catch{}
 if(server.exitCode!==null)break;await new Promise(r=>setTimeout(r,350))}
 if(!ready)throw Error("P34 React fixture unavailable");
 browser=await chromium.launch({headless:true});
 for(const viewport of [{name:"desktop",width:1440,height:900},{name:"tablet",width:1024,height:768},{name:"mobile",width:390,height:844},{name:"narrow",width:320,height:640}])
 for(const theme of ["dark","light"])for(const scenario of (viewport.width<600?["normal","empty","late","long"]:["normal","empty"])){
  const context=await browser.newContext({viewport:{width:viewport.width,height:viewport.height},reducedMotion:"reduce"});
  const page=await context.newPage(),id=[viewport.name,theme,scenario].join("-");const errs=[],result={id};
  page.on("pageerror",e=>errs.push(String(e)));
  try{
   await page.goto(origin,{waitUntil:"networkidle",timeout:30000});
   await page.getByRole("heading",{name:"Recurring & commitments",exact:true}).waitFor({timeout:15000});
   if(theme==="light")await page.getByRole("button",{name:"Switch to light appearance"}).first().click();
   await page.getByRole("combobox",{name:"Scenario"}).selectOption(scenario);
   if(await page.getByTestId("write-count").innerText()!=="Writes: 0")failures.push(id+": mount triggered unauthorized writes");
   if(scenario!=="empty"){
    await page.getByRole("button",{name:"View table"}).click();
    if(await page.getByRole("table",{name:/Backend posted recurring expenses/}).count()!==1)failures.push(id+": accessible data table absent");
    await page.getByRole("button",{name:"Hide values"}).click();
   }
   if(scenario==="normal"){
    await page.getByRole("button",{name:"Review reconciliation"}).click();
    if(await page.getByTestId("write-count").innerText()!=="Writes: 0")failures.push(id+": reconciliation auto-ran");
    await page.getByRole("button",{name:"Cancel",exact:true}).last().click();
    await page.getByRole("button",{name:"Review suggestion"}).click();
    if(await page.getByRole("button",{name:"Confirm pattern"}).isEnabled())failures.push(id+": candidate confirmed without review");
    await page.getByRole("checkbox",{name:/I reviewed the source transactions/}).check();
    if(!await page.getByRole("button",{name:"Confirm pattern"}).isEnabled())failures.push(id+": reviewed candidate still disabled");
    await page.getByRole("button",{name:"Cancel",exact:true}).last().click();
   }
   result.geometry=await page.evaluate(()=>({overflow:Math.max(0,document.documentElement.scrollWidth-document.documentElement.clientWidth),theme:document.querySelector(".sc-root")?.getAttribute("data-sc-theme")}));
   const axe=await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21a","wcag21aa","wcag22aa"]).analyze();
   result.axe=axe.violations.map(v=>({id:v.id,nodes:v.nodes.length}));
   if(result.geometry.overflow>1)failures.push(id+": horizontal overflow "+result.geometry.overflow);
   if(result.geometry.theme!==theme)failures.push(id+": wrong theme");
   if(result.axe.length)failures.push(id+": axe "+result.axe.map(x=>x.id).join(","));
   if(errs.length)failures.push(id+": JS "+errs.join("; "));
   result.png="screenshots/"+id+".png";
   await page.screenshot({path:path.join(dir,result.png),animations:"disabled",fullPage:viewport.width>600});
  }catch(e){result.error=String(e).slice(0,400);failures.push(id+": "+result.error)}
  results.push(result);console.log(JSON.stringify({id,overflow:result.geometry?.overflow,axe:result.axe?.map(x=>x.id),error:result.error??null}));
  await context.close();
 }
}finally{if(browser)await browser.close();server.kill("SIGTERM")}
await fs.writeFile(path.join(dir,"report.json"),JSON.stringify({phase:"P34",source:"actual React components, synthetic values only",results,failures},null,2)+"\n");
console.log("P34 BROWSER SUMMARY "+JSON.stringify({cases:results.length,failures:failures.length,details:failures.slice(0,30)}));if(failures.length)process.exitCode=1;
