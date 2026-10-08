#!/usr/bin/env node
/** Verifies the explicitly selected P25L design, tokens, and approved screenshot manifest.
 * Does not claim the production Finance app is visually migrated or WCAG certified.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import {createHash} from "node:crypto";
const read = path=>JSON.parse(fs.readFileSync(path,"utf8"));
const selection=read("design/p25/selection.json");
const directions=read("design/p25/directions.json");
const tokens=read("design/p25/signal-current.tokens.json");
const manifest=read("design/p25/signal-current-reference-manifest.json");
assert.equal(selection.selectedId,"b");
assert.equal(selection.decision,"locked");
assert.equal(selection.referenceSource.qaRun,manifest.sourceRun);
assert.equal(directions.selectedDirection,"b");
assert.equal(directions.status,"selected-and-locked");
assert.equal(tokens.name,"Signal Current");
assert.equal(tokens.phase,"P25L");
assert.equal(manifest.direction,"b");
assert.equal(manifest.exactReferenceCount,18);
assert.equal(manifest.files.length,18);
assert.equal(new Set(manifest.files.map(x=>x.name)).size,18);
assert(manifest.files.every(x=>/^b-(default|alternate|stress)-(desktop|mobile)-[a-z0-9-]+\.png$/.test(x.name)));
assert(manifest.files.every(x=>/^[a-f0-9]{64}$/.test(x.sha256)));
for(const mode of ["dark","light"]){
 const t=tokens.theme[mode];
 for(const key of ["canvas","surface","sidebar","text","textSecondary","border","accent","accentText","accentSecondary","positive","negative","warning","subtle"]){
   assert(/^#[0-9a-f]{6}$/i.test(t[key]),mode+" missing valid "+key);
 }
 assert.equal(t.mode,mode==="dark"?"default":"alternate");
}
function luminance(hex){
 const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
 return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
}
function contrast(a,b){
 const l=[luminance(a),luminance(b)].sort((a,b)=>b-a);
 return (l[0]+.05)/(l[1]+.05);
}
for(const mode of ["dark","light"]){
 const t=tokens.theme[mode];
 for(const key of ["text","textSecondary","accent","accentSecondary","positive","negative","warning"]){
   const score=contrast(t[key],t.surface);
   assert(score>=4.5,mode+" "+key+" below 4.5:1 on surface ("+score.toFixed(2)+")");
 }
 assert(contrast(t.text,t.canvas)>=4.5,mode+" text contrast on canvas too low");
 assert(contrast(t.accentText,t.accent)>=4.5,mode+" button text contrast below 4.5:1");
}
const html=fs.readFileSync("design/p25/visual-lab/index.html","utf8");
assert(html.includes('body data-direction="b"'),"Selected lab view must default to Signal Current");
const prefix="design/p25/locked-references/";
if(fs.existsSync(prefix)){
 for(const reference of manifest.files){
  const f=prefix+reference.name;
  assert(fs.existsSync(f),"Incomplete locked asset set: "+f);
  const sha=createHash("sha256").update(fs.readFileSync(f)).digest("hex");
  assert.equal(sha,reference.sha256,"Pinned reference mismatch: "+f);
 }
}
console.log("P25L Signal Current locked: 2 accessible token modes, 18 SHA-pinned reference manifests, 0 contract mismatches."+(fs.existsSync(prefix)?" PNG bytes verified.":" PNG bytes pending reference freeze action."));
