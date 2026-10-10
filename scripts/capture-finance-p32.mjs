
#!/usr/bin/env node
/* Actual React SignalInsightsView with isolated, explicitly synthetic fixtures. */
import {chromium} from "playwright";
import AxeBuilder from "@axe-core/playwright";
import {spawn} from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
const out=path.resolve("p32-artifacts");
await fs.mkdir(path.join(out,"screenshots"),{recursive:true});
const origin="http://127.0.0.1:4180/p32-insights-preview.html";
const server=spawn("npm",["run","dev","--","--host","127.0.0.1","--port","4180","--strictPort"],{stdio:"ignore",env:{...process.env,NODE_ENV:"development"}});
const results=[],failures=[];let browser;
try {
 let ready=false;for(let i=0;i<80;i++){try{const r=await fetch(origin);if(r.ok){ready=true;break}}catch{}
  if(server.exitCode!==null)break;await new Promise(r=>setTimeout(r,350))}
 if(!ready)throw Error("P32 React preview not reachable");
 browser=await chromium.launch({headless:true});
 for(const dev of [{id:"desktop",width:1440,height:900},{id:"tablet",width:1024,height:768},{id:"mobile",width:390,height:844},{id:"narrow",width:320,height:640}])
 for(const theme of ["dark","light"])
 for(const scenario of (dev.width<600?["normal","empty","refund","long"]:["normal"])){
  const context=await browser.newContext({viewport:{width:dev.width,height:dev.height},reducedMotion:"reduce"});
  const page=await context.newPage(),id=[dev.id,theme,scenario].join("-");
  const exceptions=[];page.on("pageerror",e=>exceptions.push(String(e)));
  const item={id};try{
   await page.goto(origin,{waitUntil:"networkidle",timeout:30000});
   await page.getByRole("heading",{name:"Insights",exact:true}).waitFor({timeout:15000});
   if(theme==="light")await page.getByRole("button",{name:"Switch to light appearance"}).first().click();
   await page.getByRole("combobox",{name:"Scenario"}).selectOption(scenario);
   const trend=page.getByRole("button",{name:"View source values"});
   await trend.click();
   if(await page.getByRole("table",{name:/Ledger analytics/}).count()!==1) failures.push(id+": source table missing");
   await page.getByRole("button",{name:"Hide source values"}).click();
   if(scenario==="normal"){
    await page.getByRole("button",{name:"Cash flow",exact:true}).click();
    if(!await page.getByText(/All-account net cash flow/).count())failures.push(id+": global scope not disclosed");
    await page.getByRole("button",{name:"Spending",exact:true}).click();
    await page.getByRole("link",{name:/Groceries/}).first().click();
    if(!String(await page.getByTestId("preview-route").innerText()).includes("category="))failures.push(id+": category drill-down lost");
   }
   if(scenario==="refund"){
    const svg=page.locator(".sc-insight-svg");
    if(!await svg.count())failures.push(id+": negative refund series not rendered");
   }
   item.geometry=await page.evaluate(()=>({overflow:Math.max(0,document.documentElement.scrollWidth-document.documentElement.clientWidth),
      theme:document.querySelector(".sc-root")?.getAttribute("data-sc-theme")}));
   const axe=await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21a","wcag21aa","wcag22aa"]).analyze();
   item.axe=axe.violations.map(v=>({id:v.id,nodes:v.nodes.length}));
   if(item.geometry.overflow>1)failures.push(id+": horizontal overflow "+item.geometry.overflow);
   if(item.geometry.theme!==theme)failures.push(id+": wrong theme");
   if(item.axe.length)failures.push(id+": accessibility "+item.axe.map(x=>x.id).join(","));
   if(exceptions.length)failures.push(id+": JS "+exceptions.join(";"));
   item.png="screenshots/"+id+".png";
   await page.screenshot({path:path.join(out,item.png),animations:"disabled",fullPage:dev.width>600});
  }catch(e){item.error=String(e).slice(0,500);failures.push(id+": "+item.error)}
  results.push(item);console.log(JSON.stringify({id,overflow:item.geometry?.overflow,axe:item.axe?.map(x=>x.id),error:item.error??null}));
  await context.close();
 }
} finally{if(browser)await browser.close();server.kill("SIGTERM");}
await fs.writeFile(path.join(out,"report.json"),JSON.stringify({phase:"P32",scope:"actual React Insights component, synthetic fixture only",results,failures},null,2)+"\n");
console.log("P32 summary "+JSON.stringify({cases:results.length,failures}));
if(failures.length)process.exitCode=1;
