#!/usr/bin/env node
/**
 * P25L: Promote exact, user-approved B (Signal Current) PNGs into the repository.
 *
 * Usage:
 *  1. Download trusted run 37765096582 artifact to p25-artifacts/.
 *  2. node scripts/promote-finance-p25-references.mjs
 *
 * Never download arbitrary PR artifacts, never accept financial data,
 * never overwrite a reference unless its SHA-256 matches the manifest.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

const cwd=process.cwd();
const manifest=JSON.parse(await fs.readFile(path.join(cwd,"design/p25/signal-current-reference-manifest.json"),"utf8"));
if(manifest.direction!=="b"||manifest.exactReferenceCount!==18)throw new Error("Unexpected P25L selection/asset count");
const source=path.join(cwd,"p25-artifacts","screenshots");
const dst=path.join(cwd,"design","p25","locked-references");
await fs.mkdir(dst,{recursive:true});
let copied=0;
for(const ref of manifest.files){
  if(!/^b-(?:default|alternate|stress)-(?:desktop|mobile)-[a-z0-9-]+\.png$/.test(ref.name))throw Error("Invalid approved name: "+ref.name);
  const data=await fs.readFile(path.join(source,ref.name));
  const actual=createHash("sha256").update(data).digest("hex");
  if(actual!==ref.sha256)throw Error("Screenshot drift detected: "+ref.name+" (expected "+ref.sha256+", got "+actual+"). Never silently freeze a changed reference.");
  if(data.length<1000||data.toString("hex",0,8)!=="89504e470d0a1a0a")throw Error("Invalid PNG: "+ref.name);
  await fs.writeFile(path.join(dst,ref.name),data);
  copied++;
}
console.log("P25L reference pin verified: "+copied+" exact approved PNGs.");
