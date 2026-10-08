#!/usr/bin/env node
/**
 * P27 canonical routing / authentication gate smoke tests.
 * Uses dummy Supabase publishable config and a fresh storage context.
 * Never logs in, imports production account data or supplies tokens.
 */
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
const origin="http://127.0.0.1:4175";
const dest=path.resolve("p27-artifacts");
await fs.mkdir(path.join(dest,"screenshots"),{recursive:true});
const server=spawn("npm",["run","dev","--","--host","127.0.0.1","--port","4175","--strictPort"],{
 stdio:"ignore",env:{...process.env,VITE_SUPABASE_URL:"https://p27-example.invalid",VITE_SUPABASE_PUBLISHABLE_KEY:"sb_publishable_p27_test",NODE_ENV:"development"}
});
let browser;
const report={phase:"P27",type:"Unauthenticated browser navigation and recovery smoke only",results:[],failures:[]};
const add=(name,success,details="")=>{report.results.push({name,success,details});if(!success)report.failures.push(name+": "+details);};
try{
 let ready=false;
 for(let i=0;i<65;i++){
  try{const r=await fetch(origin+"/sign-in");if(r.ok){ready=true;break;}}catch{}
  if(server.exitCode!==null)break;
  await new Promise(r=>setTimeout(r,300));
 }
 if(!ready)throw Error("Finance P27 test server did not become ready");
 browser=await chromium.launch({headless:true});
 for(const device of [{id:"desktop",width:1440,height:900},{id:"mobile",width:390,height:844},{id:"narrow",width:320,height:640}]){
   const ctx=await browser.newContext({viewport:{width:device.width,height:device.height},reducedMotion:"reduce",colorScheme:"dark"});
   await ctx.route("**/auth/v1/**",route=>route.abort());
   const page=await ctx.newPage();
   const errors=[];page.on("pageerror",e=>errors.push(String(e)));
   await page.goto(origin+"/sign-in",{waitUntil:"networkidle"});
   await page.getByRole("heading",{name:"Sign in"}).waitFor({timeout:12000});
   const target=path.join(dest,"screenshots",device.id+"-signed-out.png");
   await page.screenshot({path:target,animations:"disabled"});
   const overflow=await page.evaluate(()=>Math.max(0,document.documentElement.scrollWidth-document.documentElement.clientWidth));
   add(device.id+" sign-in visual",overflow<=1 && !errors.length,"overflow="+overflow+" page errors="+errors.join(";"));
   const axe=await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21a","wcag21aa"]).analyze();
   add(device.id+" sign-in accessibility",axe.violations.length===0,axe.violations.map(x=>x.id).join(","));
   await page.goto(origin+"/#activity?q=REWE",{waitUntil:"networkidle"});
   await page.waitForURL(url=>url.pathname==="/sign-in",{timeout:12000});
   const next=new URL(page.url()).searchParams.get("next");
   add(device.id+" legacy deep-link",next==="/activity?q=REWE",String(next));
   await page.goto(origin+"/activity?q=coffee",{waitUntil:"networkidle"});
   await page.waitForURL(url=>url.pathname==="/sign-in",{timeout:12000});
   add(device.id+" canonical auth protection",new URL(page.url()).searchParams.get("next")==="/activity?q=coffee");
   const text=await page.locator("body").innerText();
   add(device.id+" no private data errors",!text.includes("finance_initialize")&&!text.includes("permission denied")&&!text.includes("Your financial position"));
   await page.goto(origin+"/sign-in?next="+encodeURIComponent("//other.example"),{waitUntil:"networkidle"});
   add(device.id+" rejected external return",!(await page.locator(".sc-auth__return").count()));
   await ctx.close();
 }
}finally{if(browser)await browser.close();server.kill("SIGTERM")}
await fs.writeFile(path.join(dest,"report.json"),JSON.stringify(report,null,2)+"\n");
console.log("P27 BROWSER SUMMARY: "+JSON.stringify({checks:report.results.length,failures:report.failures}));
if(report.failures.length)process.exitCode=1;
