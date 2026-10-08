#!/usr/bin/env node
/* P29 tests actual ActivityWorkspaceView in a synthetic-only isolated Vite page. */
import {chromium} from "playwright";
import AxeBuilder from "@axe-core/playwright";
import {spawn} from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
const out=path.resolve("p29-artifacts");await fs.mkdir(path.join(out,"screenshots"),{recursive:true});
const origin="http://127.0.0.1:4177/p29-activity-preview.html";
const server=spawn("npm",["run","dev","--","--host","127.0.0.1","--port","4177","--strictPort"],{stdio:"ignore",env:{...process.env,NODE_ENV:"development"}});
let browser;const results=[],failures=[];
try{
 let ready=false;
 for(let i=0;i<70;i++){try{const r=await fetch(origin);if(r.ok){ready=true;break}}catch{}
  if(server.exitCode!==null)break;await new Promise(r=>setTimeout(r,350))}
 if(!ready)throw Error("P29 synthetic preview server unavailable");
 browser=await chromium.launch({headless:true});
 for(const dev of [{id:"desktop",width:1440,height:900},{id:"tablet",width:1024,height:768},{id:"mobile",width:390,height:844},{id:"narrow",width:320,height:640}])
 for(const mode of ["dark","light"])
 for(const state of ((dev.width<600)?["normal","empty","error"]:["normal"])){
  const context=await browser.newContext({viewport:{width:dev.width,height:dev.height},deviceScaleFactor:1,reducedMotion:"reduce"});
  const page=await context.newPage();const errors=[];page.on("pageerror",e=>errors.push(String(e)));
  const id=[dev.id,mode,state].join("-"),item={id};
  try{
   await page.goto(origin,{waitUntil:"networkidle",timeout:30000});
   await page.getByRole("heading",{name:"Activity",exact:true}).waitFor({timeout:10000});
   if(mode==="light")await page.getByRole("button",{name:"Switch to light appearance"}).first().click();
   if(state!=="normal")await page.getByRole("combobox",{name:"Scenario"}).selectOption(state);
   item.bounds=await page.evaluate(()=>{
    const viewport=document.documentElement.clientWidth;
    const table=document.querySelector(".sc-activity-table-region");
    const visible=table?table.getBoundingClientRect():null;
    return{horizontalOverflow:Math.max(0,document.documentElement.scrollWidth-viewport),
      tableScrollable:!!table && table.scrollWidth>table.clientWidth,
      tableInViewport:!visible||(visible.left>=-1&&visible.right<=viewport+1),
      theme:document.querySelector(".sc-root")?.getAttribute("data-sc-theme")};
   });
   item.file="screenshots/"+id+".png";
   await page.screenshot({path:path.join(out,item.file),animations:"disabled",fullPage:dev.width>600});
   const axe=await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21a","wcag21aa","wcag22aa"]).analyze();
   item.axe=axe.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.length}));
   if(item.bounds.horizontalOverflow>1)failures.push(id+": page overflow "+item.bounds.horizontalOverflow);
   if(!item.bounds.tableInViewport)failures.push(id+": table region outside viewport");
   if(item.bounds.theme!==mode)failures.push(id+": theme mismatch");
   if(errors.length)failures.push(id+": JS "+errors.join(";"));
   if(item.axe.length)failures.push(id+": axe "+item.axe.map(v=>v.id).join(","));
   if(state==="normal"){
    if(dev.width<600){
      const toggle=page.getByRole("button",{name:/More filters/});
      if(!await toggle.isVisible())failures.push(id+": mobile filters not discoverable");
      else{
        await toggle.click();
        if(!await page.getByLabel("From",{exact:true}).isVisible())failures.push(id+": advanced filters fail to expand");
        await page.getByRole("button",{name:/Hide filters/}).click();
      }
    }
    const detail=await page.locator(".sc-activity-description").first().getAttribute("href");
    if(!detail?.startsWith("/activity/transaction/"))failures.push(id+": no deep-link in ledger");
    await page.getByRole("searchbox",{name:"Search financial activity"}).fill("REWE");
    await page.getByRole("button",{name:"Apply"}).click();
    await page.waitForTimeout(70);
    if(!await page.getByText("REWE",{exact:true}).count())failures.push(id+": Search not applied");
   }
  }catch(e){item.error=String(e).slice(0,350);failures.push(id+": "+item.error)}
  results.push(item);console.log(JSON.stringify({id,overflow:item.bounds?.horizontalOverflow,axe:item.axe?.map(v=>v.id),error:item.error??null}));
  await context.close();
 }
}finally{if(browser)await browser.close();server.kill("SIGTERM")}
await fs.writeFile(path.join(out,"report.json"),JSON.stringify({phase:"P29",scope:"Real React Activity components, synthetic values only",results,failures},null,2)+"\n");
const esc=x=>String(x).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll('"',"&quot;");
const gallery='<meta charset="utf-8"><title>P29 Activity Review</title><style>body{background:#e9edf3;font:13px system-ui;color:#182234;margin:20px}main{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:17px}article{padding:10px;background:white}img{width:100%;height:490px;object-fit:contain;object-position:top}</style><h1>Signal Current Activity — P29</h1><p>Real React components; synthetic finance fixture without backend authentication.</p><main>'+results.map(x=>'<article><h3>'+esc(x.id)+'</h3><p>Overflow '+esc(x.bounds?.horizontalOverflow??"?")+'px · axe '+esc(x.axe?.length??"?")+'</p>'+(x.file?'<a href="'+esc(x.file)+'"><img src="'+esc(x.file)+'"></a>':'Capture failed')+'</article>').join("")+"</main>";
await fs.writeFile(path.join(out,"index.html"),gallery);
console.log("P29 BROWSER SUMMARY: "+JSON.stringify({captured:results.filter(x=>x.file).length,failures:failures.length,details:failures.slice(0,24)}));
if(failures.length)process.exitCode=1;
