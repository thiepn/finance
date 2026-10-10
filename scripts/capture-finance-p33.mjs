#!/usr/bin/env node
/* P33 real React components in isolated synthetic browser harness; no private or production data */
import {chromium} from "playwright";import AxeBuilder from "@axe-core/playwright";
import {spawn} from "node:child_process";import fs from "node:fs/promises";import path from "node:path";
const output=path.resolve("p33-artifacts");await fs.mkdir(path.join(output,"screenshots"),{recursive:true});
const url="http://127.0.0.1:4183/p33-intelligence-preview.html";
const server=spawn("npm",["run","dev","--","--host","127.0.0.1","--port","4183","--strictPort"],{stdio:"ignore"});
const results=[],failures=[];let browser;
try{
 let ready=false;for(let i=0;i<70;i++){try{if((await fetch(url)).ok){ready=true;break}}catch{}
 if(server.exitCode!==null)break;await new Promise(r=>setTimeout(r,350))}
 if(!ready)throw Error("P33 preview server did not start");
 browser=await chromium.launch({headless:true});
 for(const d of [{name:"desktop",width:1440,height:900},{name:"tablet",width:1024,height:768},{name:"mobile",width:390,height:844},{name:"narrow",width:320,height:640}])
 for(const theme of ["dark","light"])for(const screen of ["products","merchants","rules"]){
 const id=[d.name,theme,screen].join("-"),context=await browser.newContext({viewport:{width:d.width,height:d.height},reducedMotion:"reduce"}),page=await context.newPage();
 const row={id},errors=[];page.on("pageerror",e=>errors.push(String(e)));
 try{
 await page.goto(url,{waitUntil:"networkidle",timeout:30000});
 await page.getByRole("combobox",{name:"Preview screen"}).selectOption(screen);
 await page.getByRole("heading",{name:screen==="rules"?"Classification rules":screen[0].toUpperCase()+screen.slice(1),exact:true}).waitFor({timeout:12000});
 if(theme==="light")await page.getByRole("button",{name:"Switch to light appearance"}).first().click();
 if(screen==="products"){
  if(!await page.getByRole("link",{name:/View receipt/}).count())failures.push(id+": receipt provenance absent");
  if(!await page.getByText(/same recorded unit-price basis/).count())failures.push(id+": basis description missing");
 }else if(screen==="merchants"){
  await page.getByRole("button",{name:/Weekly Market/}).first().click();
  await page.getByRole("textbox",{name:"Merchant alias"}).fill("Weekly Markt");
  if(await page.getByRole("button",{name:"Save alias"}).isEnabled())failures.push(id+": alias saved without explicit confirmation");
  await page.getByRole("checkbox",{name:/Confirm alias/}).check();
  if(!await page.getByRole("button",{name:"Save alias"}).isEnabled())failures.push(id+": confirmed alias not enabled");
 }else{
  await page.getByRole("button",{name:"Delete",exact:true}).first().click();
  if(!await page.getByRole("button",{name:"Confirm delete"}).count())failures.push(id+": missing delete confirmation");
  await page.getByRole("button",{name:"Cancel",exact:true}).click();
  await page.getByRole("textbox",{name:"Rule name"}).fill("Groceries check");
  await page.getByRole("textbox",{name:"Match text"}).fill("Market");
  await page.getByRole("combobox",{name:"Assign category"}).selectOption("00000000-0000-4000-8000-000000000011");
  await page.getByRole("textbox",{name:"Sample input"}).fill("Weekly Market");
  if(!await page.getByText("Sample contains the rule text.").count())failures.push(id+": local sample disclosure missing");
 }
 const geometry=await page.evaluate(()=>({overflow:Math.max(0,document.documentElement.scrollWidth-document.documentElement.clientWidth),
  theme:document.querySelector(".sc-root")?.getAttribute("data-sc-theme")}));
 row.geometry=geometry;
 const axe=await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21a","wcag21aa","wcag22aa"]).analyze();
 row.axe=axe.violations.map(x=>({id:x.id,nodes:x.nodes.length}));
 if(geometry.overflow>1)failures.push(id+": horizontal overflow "+geometry.overflow);
 if(geometry.theme!==theme)failures.push(id+": wrong theme");
 if(row.axe.length)failures.push(id+": axe violations "+row.axe.map(x=>x.id).join(","));
 if(errors.length)failures.push(id+": JS "+errors.join("; "));
 row.png="screenshots/"+id+".png";await page.screenshot({path:path.join(output,row.png),animations:"disabled",fullPage:d.width>600});
 }catch(e){row.error=String(e).slice(0,420);failures.push(id+": "+row.error)}
 results.push(row);console.log(JSON.stringify({id,overflow:row.geometry?.overflow,axe:row.axe?.map(x=>x.id),error:row.error??null}));
 await context.close();
 }
}finally{if(browser)await browser.close();server.kill("SIGTERM")}
await fs.writeFile(path.join(output,"report.json"),JSON.stringify({phase:"P33",source:"actual React components with synthetic fixture",results,failures},null,2)+"\n");
console.log("P33 BROWSER SUMMARY "+JSON.stringify({cases:results.length,failures:failures.length,details:failures.slice(0,40)}));if(failures.length)process.exitCode=1;
