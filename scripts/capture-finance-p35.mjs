#!/usr/bin/env node
/* Isolated actual-component Chromium/axe review; no real session/bank details or mutations */
import {chromium} from "playwright";import AxeBuilder from "@axe-core/playwright";
import {spawn} from "node:child_process";import fs from "node:fs/promises";import path from "node:path";
const out=path.resolve("p35-artifacts");await fs.mkdir(path.join(out,"screenshots"),{recursive:true});
const origin="http://127.0.0.1:4185/p35-wealth-preview.html";
const server=spawn("npm",["run","dev","--","--host","127.0.0.1","--port","4185","--strictPort"],{stdio:"ignore"});
const failures=[],results=[];let browser;
try{
 let live=false;for(let i=0;i<75;i++){try{if((await fetch(origin)).ok){live=true;break}}catch{}if(server.exitCode!==null)break;await new Promise(r=>setTimeout(r,350))}
 if(!live)throw Error("P35 React fixture unavailable");
 browser=await chromium.launch({headless:true});
 for(const width of [{name:"desktop",w:1440,h:900},{name:"tablet",w:1024,h:768},{name:"mobile",w:390,h:844},{name:"narrow",w:320,h:640}])
 for(const theme of ["dark","light"])
 for(const variant of (width.w>600?["accounts","detail"]:["accounts","detail","empty","foreign","long"])){
 const label=[width.name,theme,variant].join("-"),context=await browser.newContext({viewport:{width:width.w,height:width.h},reducedMotion:"reduce"});
 const page=await context.newPage(),row={id:label},errors=[];
 page.on("pageerror",error=>errors.push(String(error)));
 try{
 await page.goto(origin,{waitUntil:"networkidle",timeout:30000});
 if(theme==="light")await page.getByRole("button",{name:"Switch to light appearance"}).first().click();
 if(variant==="detail")await page.getByRole("combobox",{name:"Preview screen"}).selectOption("detail");
 if(["empty","foreign","long"].includes(variant))await page.getByRole("combobox",{name:"Scenario"}).selectOption(variant);
 await page.getByRole("heading",{name:variant==="detail"?"Account detail":"Accounts",exact:true}).first().waitFor({timeout:12000});
 if(await page.getByTestId("write-count").innerText()!=="Writes: 0")failures.push(label+": unauthorized load write");
 if(variant==="accounts"){
  await page.getByRole("button",{name:"View data table"}).click();
  if(!await page.getByRole("region",{name:"Wealth history table"}).count())failures.push(label+": accessible history absent");
  await page.getByRole("button",{name:"Add account"}).click();
  await page.getByRole("textbox",{name:"Account name"}).fill("New account");
  await page.getByRole("button",{name:"Review account creation"}).click();
  if(await page.getByTestId("write-count").innerText()!=="Writes: 0")failures.push(label+": created account without confirmation");
  await page.getByRole("button",{name:"Cancel",exact:true}).click();
 }
 if(variant==="detail"){
  await page.getByRole("button",{name:"Review exclusion"}).click();
  if(await page.getByTestId("write-count").innerText()!=="Writes: 0")failures.push(label+": exclusion without confirmation");
  await page.getByRole("button",{name:"Cancel",exact:true}).first().click();
  await page.getByRole("textbox",{name:"Observed balance"}).fill("2000.50");
  await page.getByRole("button",{name:"Review observation"}).click();
  if(await page.getByTestId("write-count").innerText()!=="Writes: 0")failures.push(label+": observation without confirmation");
 }
 if(variant==="foreign"&&!await page.getByText(/No implied conversion without a qualified observation/).count())failures.push(label+": foreign currency caution missing");
 row.geometry=await page.evaluate(()=>({overflow:Math.max(0,document.documentElement.scrollWidth-document.documentElement.clientWidth),theme:document.querySelector(".sc-root")?.getAttribute("data-sc-theme")}));
 const axe=await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21a","wcag21aa","wcag22aa"]).analyze();
 row.axe=axe.violations.map(x=>({id:x.id,nodes:x.nodes.length}));
 if(row.geometry.overflow>1)failures.push(label+": overflow "+row.geometry.overflow);
 if(row.geometry.theme!==theme)failures.push(label+": wrong theme");
 if(row.axe.length)failures.push(label+": axe "+row.axe.map(x=>x.id).join(","));
 if(errors.length)failures.push(label+": JS "+errors.join("; "));
 row.png="screenshots/"+label+".png";await page.screenshot({path:path.join(out,row.png),animations:"disabled",fullPage:width.w>600});
 }catch(error){row.error=String(error).slice(0,440);failures.push(label+": "+row.error)}
 results.push(row);console.log(JSON.stringify({id:label,overflow:row.geometry?.overflow,axe:row.axe?.map(x=>x.id),error:row.error??null}));
 await context.close();
 }
}finally{if(browser)await browser.close();server.kill("SIGTERM")}
await fs.writeFile(path.join(out,"report.json"),JSON.stringify({phase:"P35",source:"Actual React components, synthetic-only account values",results,failures},null,2)+"\n");
console.log("P35 BROWSER SUMMARY "+JSON.stringify({cases:results.length,failures:failures.length,details:failures.slice(0,40)}));
if(failures.length)process.exitCode=1;
