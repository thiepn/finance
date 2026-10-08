import { useEffect, useState } from "react";
import { createFinanceBrowserRuntime } from "../integrations/supabase-client.js";
import { SignalCurrentScope, FinanceButton, FinancialState } from "../ui/v2/SignalCurrent.js";
import { FinanceV2Shell } from "../ui/v2/FinanceV2Shell.js";
import { OverviewPage } from "../overview/OverviewPage.js";
import { ActivityPage } from "../activity/ActivityPage.js";
import { TransactionComposer } from "../activity/TransactionComposer.js";
import { CapturePage } from "../capture/CapturePage.js";
import { SpendingExplorerPage } from "../spending-explorer/SpendingExplorerPage.js";
import { MerchantsPage, RulesPage } from "./ClassificationPages.js";
import { ProductIntelligencePage } from "../product-intelligence/ProductIntelligencePage.js";
import { RecurringPage } from "../recurring/RecurringPage.js";
import { ReceiptMatchingPage } from "../receipt-matching/ReceiptMatchingPage.js";
import { PlanningPage } from "../planning/PlanningPage.js";
import { WealthPage } from "../wealth/WealthPage.js";
import { ImportPage } from "../imports/ImportPage.js";
import { AskFinancePage } from "../ask/AskFinancePage.js";
import { FinanceSettingsPage } from "./FinanceSettingsPage.js";
import { FinanceAuthPage } from "./FinanceAuthPage.js";
import {
  fromLegacyKey, resolveFinanceLocation, safePrivatePath,
  type RouteLocation,
} from "./finance-router.js";
import { clearReturnIntent, consumeReturnIntent, storeReturnIntent, useFinanceSession } from "./useFinanceSession.js";

function currentRoute():RouteLocation {
 return resolveFinanceLocation(typeof window!=="undefined"?window.location.href:"/");
}
export function useFinanceRoute(){
 const [route,setRoute]=useState<RouteLocation>(currentRoute);
 useEffect(()=>{
   const update=()=>{
     const next=currentRoute();
     if(next.normalized&&next.id!=="not-found")history.replaceState(null,"",next.canonical);
     setRoute(next);
   };
   update();
   window.addEventListener("popstate",update);
   window.addEventListener("hashchange",update);
   window.addEventListener("finance:navigate",update);
   return()=>{
     window.removeEventListener("popstate",update);
     window.removeEventListener("hashchange",update);
     window.removeEventListener("finance:navigate",update);
   };
 },[]);
 const navigate=(target:string,replace=false)=>{
   const next=resolveFinanceLocation(target);
   if(next.id==="not-found")return;
   if(replace)history.replaceState(null,"",next.canonical);
   else history.pushState(null,"",next.canonical);
   window.dispatchEvent(new Event("finance:navigate"));
   if(!replace)window.scrollTo({top:0,behavior:"instant"});
 };
 return{route,navigate};
}
function IncompleteDetail({label,onBack}: {label:string;onBack:()=>void}){
 return <FinancialState kind="empty" title={label+" detail view"} description="This deep link is recognized and protected. The complete detail workspace is being migrated in a later Finance phase; no records have been changed." primaryAction={{label:"Open list",onClick:onBack}}/>;
}
function FinancePrivatePage({route,navigate}: {route:RouteLocation;navigate:(target:string,replace?:boolean)=>void}){
 const toLegacy=(key:string)=>navigate(fromLegacyKey(key));
 const productId=route.params.productId??null;
 switch(route.id){
   case "home":return <OverviewPage onNavigate={toLegacy}/>;
   case "activity":return <ActivityPage/>;
   case "activity-new":return <TransactionComposer onCreated={()=>navigate("/activity")} onClose={()=>navigate("/activity")}/>;
   case "activity-detail":return <IncompleteDetail label="Transaction" onBack={()=>navigate("/activity")}/>;
   case "capture":return <CapturePage onNavigate={toLegacy}/>;
   case "merchants":return <MerchantsPage onNavigate={toLegacy}/>;
   case "rules":return <RulesPage/>;
   case "settings":return <FinanceSettingsPage/>;
   case "explore":return <SpendingExplorerPage onNavigate={toLegacy} onOpenProduct={id=>navigate(id?"/explore/products/"+encodeURIComponent(id):"/explore/products")}/>;
   case "categories":return <SpendingExplorerPage initialCategoryMode onNavigate={toLegacy} onOpenProduct={id=>navigate(id?"/explore/products/"+encodeURIComponent(id):"/explore/products")}/>;
   case "products":
   case "product-detail":return <ProductIntelligencePage onNavigate={toLegacy}
     onProductChange={id=>navigate(id?"/explore/products/"+encodeURIComponent(id):"/explore/products")}
     selectedProductId={productId}/>;
   case "recurring":return <RecurringPage onNavigate={toLegacy}/>;
   case "receipts":return <ReceiptMatchingPage onNavigate={toLegacy}/>;
   case "receipt-detail":return <IncompleteDetail label="Receipt" onBack={()=>navigate("/receipts")}/>;
   case "accounts":return <WealthPage mode="accounts" onNavigate={toLegacy}/>;
   case "account-detail":return <IncompleteDetail label="Account" onBack={()=>navigate("/wealth/accounts")}/>;
   case "plan":return <PlanningPage mode="budget" onNavigate={toLegacy}/>;
   case "goals":return <PlanningPage mode="goals" onNavigate={toLegacy}/>;
   case "net-worth":return <WealthPage mode="net-worth" onNavigate={toLegacy}/>;
   case "imports":return <ImportPage onNavigate={toLegacy}/>;
   case "ask":return <AskFinancePage onNavigate={toLegacy}/>;
   default:return <FinancialState kind="empty" title="Page not found" description="This destination is not available." primaryAction={{label:"Home",onClick:()=>navigate("/")}}/>;
 }
}
export function FinanceApp(){
 const {route,navigate}=useFinanceRoute();
 const session=useFinanceSession();
 const runtime=createFinanceBrowserRuntime();
 useEffect(()=>{
   if(session.status==="signed-out"&&!route.isPublic&&route.id!=="not-found"){
     storeReturnIntent(route.canonical);
     navigate("/sign-in?next="+encodeURIComponent(route.canonical),true);
     return;
   }
   if(session.status==="ready"){
     const saved=consumeReturnIntent();
     // Strip callback codes, OAuth fragments and error details only after
     // Supabase finished validating the session and returning a real user.
     const locationHasAuthArtifacts=window.location.search.includes("code=")||
       window.location.search.includes("error=")||
       /#(?:access_token|refresh_token|error_description)=/.test(window.location.hash);
     if(locationHasAuthArtifacts){navigate(saved??"/",true);return;}
     if(saved&&saved!==route.canonical){
       navigate(saved,true);return;
     }
     if(route.id==="sign-in"||route.id==="auth-callback")navigate("/",true);
   }
 },[route.canonical,route.id,route.isPublic,session.status,navigate]);
 // Browser form activity query/search state survives canonical navigation and back.
 if(session.status==="restoring")return <FinanceAuthPage state="restoring" onRetry={()=>window.location.reload()}/>;
 if(session.status==="error")return <FinanceAuthPage state="error" onRetry={()=>window.location.reload()}/>;
 if(session.status==="unconfigured")return <FinanceAuthPage state="unconfigured" onRetry={()=>window.location.reload()}/>;
 if(session.status==="signed-out")return <FinanceAuthPage state="signed-out"
   next={route.id==="sign-in"?new URLSearchParams(route.search).get("next"):route.canonical}
   onRetry={()=>window.location.reload()}/>;
 if(route.id==="sign-in"||route.id==="auth-callback"){
   return <FinanceAuthPage state="restoring" onRetry={()=>window.location.reload()}/>;
 }
 if(route.id==="not-found")return <SignalCurrentScope theme="dark" className="sc-auth">
   <main className="sc-auth__main"><FinancialState kind="empty" title="Page not found" description="That Finance destination does not exist." primaryAction={{label:"Go to Home",onClick:()=>navigate("/")}}/></main></SignalCurrentScope>;
 return <FinanceV2Shell key={session.user.id} routeId={route.id} section={route.section}
   title={route.title} email={session.user.email??null} onNavigate={navigate}
   onSignOut={async()=>{if(!runtime)return;const {error}=await runtime.client.auth.signOut();if(error)throw new Error("Sign-out failed"); clearReturnIntent(); navigate("/sign-in",true);}}>
   <FinancePrivatePage route={route} navigate={navigate}/>
 </FinanceV2Shell>;
}
