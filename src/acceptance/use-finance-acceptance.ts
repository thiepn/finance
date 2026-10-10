import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import {createFinanceBrowserRuntime} from "../integrations/supabase-client.js";
import {SupabaseFinanceOverviewService} from "../services/supabase-overview.js";
import {SupabaseFinanceWealthService} from "../services/supabase-wealth.js";
import {SupabaseFinanceRecurringService} from "../services/supabase-recurring.js";
import {SupabaseFinancePlanningService} from "../services/supabase-planning.js";
import {SupabaseFinanceImportService} from "../services/supabase-imports.js";
import {domains,type AcceptanceSnapshot,type DomainKey} from "./finance-acceptance-model.js";
export const emptyAcceptance=():AcceptanceSnapshot=>({
 overview:{state:"pending"},wealth:{state:"pending"},recurring:{state:"pending"},planning:{state:"pending"},imports:{state:"pending"}
});
export interface AcceptanceWorkspace {
 state:"idle"|"loading"|"ready"|"unauthenticated"|"unconfigured"|"error";
 snapshot:AcceptanceSnapshot;error:string|null;lastCheckedAt:string|null;
 run():Promise<void>;clear():void;
}
export function useFinanceAcceptance():AcceptanceWorkspace {
 const runtime=useMemo(createFinanceBrowserRuntime,[]);
 const [state,setState]=useState<AcceptanceWorkspace["state"]>(runtime?"idle":"unconfigured");
 const [snapshot,setSnapshot]=useState<AcceptanceSnapshot>(emptyAcceptance);
 const [error,setError]=useState<string|null>(null);
 const [lastCheckedAt,setLastCheckedAt]=useState<string|null>(null);
 const generation=useRef(0);
 const clear=useCallback(()=>{++generation.current;setSnapshot(emptyAcceptance());setLastCheckedAt(null);setError(null);setState(runtime?"idle":"unconfigured")},[runtime]);
 useEffect(()=>{
  if(!runtime)return;
  // A previous owner's sampled financial evidence must never survive sign-out
  // or account replacement in a reused browser runtime.
  const {data}=runtime.client.auth.onAuthStateChange((event)=>{
   if(event==="SIGNED_OUT"||event==="SIGNED_IN"||event==="USER_UPDATED")clear();
  });
  return()=>{++generation.current;data.subscription.unsubscribe()};
 },[runtime,clear]);
 const run=useCallback(async()=>{
  if(!runtime){setState("unconfigured");return}
  const generationId=++generation.current;setSnapshot(emptyAcceptance());setError(null);setState("loading");
  try{
   const {data,error:authError}=await runtime.client.auth.getUser();
   if(generationId!==generation.current)return;
   if(authError)throw new Error("Identity verification failed: "+authError.message);
   if(!data.user){setState("unauthenticated");return}
   const ownerId=data.user.id;
   // Five preexisting RLS-scoped dashboard RPCs. Deliberately omit
   // runtime.ensureInitialized (which may mutate account/bootstrap state).
   const apis={
    overview:new SupabaseFinanceOverviewService(runtime.rpcClient),
    wealth:new SupabaseFinanceWealthService(runtime.rpcClient),
    recurring:new SupabaseFinanceRecurringService(runtime.rpcClient),
    planning:new SupabaseFinancePlanningService(runtime.rpcClient),
    imports:new SupabaseFinanceImportService(runtime.rpcClient,runtime.client)
   };
   const results=await Promise.allSettled([
    apis.overview.getDashboard(),apis.wealth.getDashboard(12),apis.recurring.getDashboard(),
    apis.planning.getDashboard(),apis.imports.getDashboard()
   ] as const);
   if(generationId!==generation.current)return;
   const latest=await runtime.client.auth.getUser();
   if(generationId!==generation.current)return;
   if(latest.error||latest.data.user?.id!==ownerId){clear();setState("unauthenticated");return}
   // Keep typed results local to this mounted component. No report is uploaded,
   // stored, or shared; never log private row values.
   const next={
    overview:results[0].status==="fulfilled"?{state:"success" as const,value:results[0].value}:{state:"error" as const,reason:"Overview source failed. Retry read-only checks."},
    wealth:results[1].status==="fulfilled"?{state:"success" as const,value:results[1].value}:{state:"error" as const,reason:"Wealth source failed. Retry read-only checks."},
    recurring:results[2].status==="fulfilled"?{state:"success" as const,value:results[2].value}:{state:"error" as const,reason:"Recurring source failed. Retry read-only checks."},
    planning:results[3].status==="fulfilled"?{state:"success" as const,value:results[3].value}:{state:"error" as const,reason:"Planning source failed. Retry read-only checks."},
    imports:results[4].status==="fulfilled"?{state:"success" as const,value:results[4].value}:{state:"error" as const,reason:"Import source failed. Retry read-only checks."}
   } satisfies AcceptanceSnapshot;
   setSnapshot(next);setLastCheckedAt(new Date().toISOString());setState("ready");
  }catch{
   if(generationId!==generation.current)return;
   setSnapshot(emptyAcceptance());setState("error");
   setError("Unable to verify a consistent Finance account session. No data was modified.");
  }
 },[runtime,clear]);
 return {state,snapshot,error,lastCheckedAt,run,clear};
}
