#!/usr/bin/env node
/* Real production React component, synthetic source/ledger values only. */
import {chromium} from "playwright";import AxeBuilder from "@axe-core/playwright";
import {spawn} from "node:child_process";import fs from "node:fs/promises";import path from "node:path";
const out=path.resolve("p36-artifacts");await fs.mkdir(path.join(out,"screenshots"),{recursive:true});
const origin="http://127.0.0.1:4186/p36-import-preview.html";
const server=spawn("npm",["run","dev","--","--host","127.0.0.1","--port","4186","--strictPort"],{stdio:"ignore"});
let browser;const results=[],failures=[];
try{
 let ready=false;for(let i=0;i<75;i++){try{if((await fetch(origin)).ok){ready=true;break}}catch{}if(server.exitCode!==null)break;await new Promise(r=>setTimeout(r,350))}
 if(!ready)throw Error("P36 React preview unavailable");
 browser=await chromium.launch({headless:true});
 const sizes=[{name:"desktop",w:1440,h:900},{name:"tablet",w:1024,h:768},{name:"mobile",w:390,h:844},{name:"narrow",w:320,h:640}];
 for(const vp of sizes)for(const theme of ["dark","light"])
 for(const scenario of (vp.w>600?["normal","duplicate"]:["normal","duplicate","empty","transfer","missing","long"])){
 const context=await browser.newContext({viewport:{width:vp.w,height:vp.h},reducedMotion:"reduce"});
 const page=await context.newPage(),id=[vp.name,theme,scenario].join("-"),row={id},errors=[];
 page.on("pageerror",error=>errors.push(String(error)));
 try{
 await page.goto(origin,{waitUntil:"networkidle",timeout:30000});
 await page.getByRole("heading",{name:"Import & reconcile"}).waitFor({timeout:15000});
 if(theme==="light")await page.getByRole("button",{name:"Switch to light appearance"}).first().click();
 await page.getByRole("combobox",{name:"Scenario"}).selectOption(scenario);
 if(await page.getByTestId("write-count").innerText()!=="Writes: 0")failures.push(id+": preview unexpectedly wrote");
 if(scenario==="normal"){
  await page.getByRole("button",{name:"Review final posting"}).click();
  if(await page.getByRole("button",{name:"Confirm ledger posting"}).isEnabled())failures.push(id+": no consent required");
  if(await page.getByTestId("write-count").innerText()!=="Writes: 0")failures.push(id+": opening confirm wrote");
  await page.getByRole("button",{name:"Cancel",exact:true}).last().click();
  await page.getByRole("button",{name:"Review row"}).first().click();
  if(await page.getByRole("button",{name:"Save reviewed decision"}).isEnabled())failures.push(id+": row posted without confirmation");
  await page.getByRole("button",{name:"Cancel",exact:true}).first().click();
 }
 if(["duplicate","empty","missing"].includes(scenario)){
  if(await page.getByRole("button",{name:"Review final posting"}).isEnabled())failures.push(id+": invalid import allowed");
 }
 row.geometry=await page.evaluate(()=>({overflow:Math.max(0,document.documentElement.scrollWidth-document.documentElement.clientWidth),
 theme:document.querySelector(".sc-root")?.getAttribute("data-sc-theme")}));
 const axe=await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21a","wcag21aa","wcag22aa"]).analyze();
 row.axe=axe.violations.map(v=>({id:v.id,nodes:v.nodes.length}));
 if(row.geometry.overflow>1)failures.push(id+": horizontal overflow "+row.geometry.overflow);
 if(row.geometry.theme!==theme)failures.push(id+": theme mismatch");
 if(row.axe.length)failures.push(id+": axe violations "+row.axe.map(v=>v.id).join(","));
 if(errors.length)failures.push(id+": JS exceptions "+errors.join("; "));
 row.png="screenshots/"+id+".png";await page.screenshot({path:path.join(out,row.png),animations:"disabled",fullPage:vp.w>600});
 }catch(error){row.error=String(error).slice(0,420);failures.push(id+": "+row.error)}
 results.push(row);console.log(JSON.stringify({id,overflow:row.geometry?.overflow,axe:row.axe?.map(x=>x.id),error:row.error??null}));
 await context.close();
 }
}finally{if(browser)await browser.close();server.kill("SIGTERM")}
await fs.writeFile(path.join(out,"report.json"),JSON.stringify({phase:"P36",source:"actual React import components, synthetic statement evidence",results,failures},null,2)+"\n");
console.log("P36 BROWSER SUMMARY "+JSON.stringify({cases:results.length,failures:failures.length,details:failures.slice(0,40)}));
if(failures.length)process.exitCode=1;
