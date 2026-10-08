import { useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createFinanceBrowserRuntime, invalidateFinanceInitialization } from "../integrations/supabase-client.js";
import { safePrivatePath } from "./finance-router.js";

export type FinanceSessionState =
  | { status: "restoring" }
  | { status: "signed-out" }
  | { status: "ready"; user: User }
  | { status: "unconfigured" }
  | { status: "error" };

const key="finance.returnTo.v2";
const ttl=10*60*1000;
interface ReturnIntent { path:string; created:number; }
export function storeReturnIntent(path:string):boolean {
  const safe=safePrivatePath(path);
  if(!safe || typeof sessionStorage==="undefined")return false;
  try{sessionStorage.setItem(key,JSON.stringify({path:safe,created:Date.now()} satisfies ReturnIntent));return true}catch{return false}
}
export function consumeReturnIntent(now=Date.now()):string|null {
  if(typeof sessionStorage==="undefined")return null;
  let raw:string|null;
  try{raw=sessionStorage.getItem(key);sessionStorage.removeItem(key)}catch{return null}
  if(!raw)return null;
  try{
    const v=JSON.parse(raw) as ReturnIntent;
    if(typeof v.created!=="number"||now-v.created>ttl||v.created>now+60000)return null;
    return safePrivatePath(v.path);
  }catch{return null}
}
export function clearReturnIntent():void {
  try{sessionStorage.removeItem(key)}catch{ /* no-op: storage disabled */ }
}

/** Once-verified authenticated user is the only signal that can mount finance RPC pages. */
export function useFinanceSession():FinanceSessionState {
  const runtime=createFinanceBrowserRuntime();
  const [state,setState]=useState<FinanceSessionState>(runtime?{status:"restoring"}:{status:"unconfigured"});
  const ticket=useRef(0);
  useEffect(()=>{
    if(!runtime){setState({status:"unconfigured"});return;}
    let active=true;let generation=0;
    const beginVerify=async (hint:boolean)=>{
      const current=++generation;
      if(!hint){
        invalidateFinanceInitialization();
        if(active)setState({status:"signed-out"});
        return;
      }
      // Network failure is not equivalent to an absent account/session.
      if(active)setState({status:"restoring"});
      try{
        const {data,error}=await runtime.client.auth.getUser();
        if(!active||current!==generation)return;
        if(error){setState({status:"error"});return;}
        if(!data.user){invalidateFinanceInitialization();setState({status:"signed-out"});return;}
        setState({status:"ready",user:data.user});
      }catch{
        if(active&&current===generation)setState({status:"error"});
      }
    };
    // Supabase warns against awaiting requests inside onAuthStateChange;
    // defer to next microtask so its internal auth lock cannot deadlock.
    const {data:sub}=runtime.client.auth.onAuthStateChange((event,session)=>{
      if(event==="SIGNED_OUT"){
        generation++;
        invalidateFinanceInitialization();
        if(active)setState({status:"signed-out"});
        return;
      }
      if(event==="SIGNED_IN"||event==="INITIAL_SESSION"||event==="TOKEN_REFRESHED"||event==="USER_UPDATED"){
        const version=++ticket.current;
        Promise.resolve().then(()=>{if(active&&ticket.current===version)void beginVerify(Boolean(session));});
      }
    });
    void runtime.client.auth.getSession().then(({data,error})=>{
      if(!active)return;
      if(error){setState({status:"error"});return;}
      void beginVerify(Boolean(data.session));
    }).catch(()=>{if(active)setState({status:"error"});});
    return()=>{active=false;generation++;sub.subscription.unsubscribe();};
  },[runtime]);
  return state;
}
