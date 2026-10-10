#!/usr/bin/env node
/* Production React acceptance component, isolated simulated financial data only. */
import{chromium}from"playwright";import AxeBuilder from"@axe-core/playwright";
import{spawn}from"node:child_process";import fs from"node:fs/promises";import path from"node:path";
const out=path.resolve("p37-artifacts");await fs.mkdir(path.join(out,"screenshots"),{recursive:true});
const origin="http://127.0.0.1:4187/p37-acceptance-preview.html";
const server=spawn("npm",["run","dev","--","--host","127.0.0.1","--port","4187","--strictPort"],{stdio:"ignore"});
let browser;const results=[],failures=[];
try{
 let ready=false;for(let i=0;i<70;i++){try{if((await fetch(origin)).ok){ready=true;break}}catch{}
  if(server.exitCode!==null)break;await new Promise(r=>setTimeout(r,350))}
 if(!ready)throw Error("P37 React fixture unavailable");
 browser=await chromium.launch({headless:true});
 for(const size of [{name:"desktop",width:1440,height:900},{name:"tablet",width:1024,height:768},{name:"mobile",width:390,height:844},{name:"narrow",width:320,height:640}])
 for(const theme of ["dark","light"])for(const scenario of (size.width>600?["healthy","mismatch"]:["healthy","mismatch","partial","long"])){
  const context=await browser.newContext({viewport:{width:size.width,height:size.height},reducedMotion:"reduce"});
  const page=await context.newPage(),id=[size.name,theme,scenario].join("-"),item={id},errors=[];
  page.on("pageerror",e=>errors.push(String(e)));
  try{
   await page.goto(origin,{waitUntil:"networkidle",timeout:30000});await page.getByRole("heading",{name:"Acceptance & release review"}).waitFor({timeout:16000});
   if(theme==="light")await page.getByRole("button",{name:"Switch to light appearance"}).first().click();
   await page.getByRole("combobox",{name:"Scenario"}).selectOption(scenario);
   await page.getByRole("button",{name:"Run read-only checks"}).click();
   if(await page.getByTestId("write-count").innerText()!=="Writes: 0")failures.push(id+": implicit mutation");
   for(const stage of ["Staging","Release","Postrelease"]){
    await page.getByRole("button",{name:stage,exact:true}).click();
    if(!await page.getByText(new RegExp(stage+" decision: NO_GO","i")).count())failures.push(id+": unauthorized stage "+stage);
   }
   if(scenario==="healthy"){
    await page.getByRole("combobox",{name:"Required evidence"}).selectOption("owner");
    await page.getByRole("textbox",{name:"Evidence reference"}).fill("sha256:"+"a".repeat(64));
    await page.getByRole("textbox",{name:"Reviewer designation"}).fill("Test reviewer");
    await page.getByRole("textbox",{name:"Reference date"}).fill("2026-10-10");
    await page.getByRole("button",{name:"Add unverified reference"}).click();
    if(!await page.getByText(/Reference entered · unverified/).count())failures.push(id+": reference not marked unverified");
    if(!await page.getByText(/NO-GO · release not authorized/).count())failures.push(id+": reference forged release");
   }
   if(scenario==="mismatch"&&!await page.getByText("Balance sheet does not reconcile").count())failures.push(id+": missing mismatch");
   if(scenario==="partial"&&!await page.getByText("imports source unavailable").count())failures.push(id+": source denial ignored");
   if(await page.getByTestId("write-count").innerText()!=="Writes: 0")failures.push(id+": witness action performed mutation");
   item.geometry=await page.evaluate(()=>({overflow:Math.max(0,document.documentElement.scrollWidth-document.documentElement.clientWidth),
     theme:document.querySelector(".sc-root")?.getAttribute("data-sc-theme")}));
   const axe=await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21a","wcag21aa","wcag22aa"]).analyze();
   item.axe=axe.violations.map(v=>({id:v.id,nodes:v.nodes.length}));
   if(item.geometry.overflow>1)failures.push(id+": overflow "+item.geometry.overflow);
   if(item.geometry.theme!==theme)failures.push(id+": wrong appearance");
   if(item.axe.length)failures.push(id+": axe "+item.axe.map(v=>v.id).join(","));
   if(errors.length)failures.push(id+": JavaScript "+errors.join("; "));
   item.png="screenshots/"+id+".png";await page.screenshot({path:path.join(out,item.png),animations:"disabled",fullPage:size.width>600});
  }catch(e){item.error=String(e).slice(0,420);failures.push(id+": "+item.error)}
  results.push(item);console.log(JSON.stringify({id,overflow:item.geometry?.overflow,axe:item.axe?.map(v=>v.id),error:item.error??null}));
  await context.close();
 }
}finally{if(browser)await browser.close();server.kill("SIGTERM")}
await fs.writeFile(path.join(out,"report.json"),JSON.stringify({phase:"P37",head:"Provided by GitHub Actions archive context, not assumed here",source:"actual React release review, synthetic account data only",results,failures},null,2)+"\n");
console.log("P37 BROWSER SUMMARY "+JSON.stringify({cases:results.length,failures:failures.length,details:failures.slice(0,30)}));
if(failures.length)process.exitCode=1;
