#!/usr/bin/env node
/** P26 CSS tokens generated from immutable P25L Signal Current contract. */
import fs from "node:fs";
const ref=JSON.parse(fs.readFileSync("design/p25/signal-current.tokens.json","utf8"));
if(ref.name!=="Signal Current"||ref.phase!=="P25L")throw Error("Incorrect design source");
const names={canvas:"canvas",surface:"surface",sidebar:"sidebar",text:"text",textSecondary:"muted",border:"border",accent:"accent",accentText:"accent-ink",accentSecondary:"coral",positive:"positive",negative:"negative",warning:"warning",subtle:"subtle",chartActual:"chart-actual",chartBudget:"chart-budget",grid:"grid"};
const theme=(mode)=>{const t=ref.theme[mode];return '.sc-root[data-sc-theme="'+mode+'"] {\n'+Object.entries(names).map(([key,name])=>"  --sc-"+name+": "+t[key]+";").join("\n")+"\n  color-scheme: "+mode+";\n}\n";};
const css="/* GENERATED: source design/p25/signal-current.tokens.json; do not hand edit. */\n"+theme("dark")+"\n"+theme("light");
const file="src/ui/v2/signal-current.tokens.css";
if(process.argv.includes("--check")) {
  if(!fs.existsSync(file)||fs.readFileSync(file,"utf8")!==css) { console.error("P26 tokens diverged from P25L. Run npm run generate:signal-tokens."); process.exit(1); }
  console.log("Signal Current CSS tokens match P25L.");
} else {fs.mkdirSync("src/ui/v2",{recursive:true});fs.writeFileSync(file,css);console.log("Generated "+file);}
