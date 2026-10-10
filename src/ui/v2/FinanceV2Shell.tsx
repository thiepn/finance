import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { Icon, type IconName } from "../icons/Icon.js";
import { FinanceButton, SignalCurrentScope } from "../v2/SignalCurrent.js";
import { type FinanceRouteId, financePathFor } from "../../app/finance-router.js";

const primary: readonly {id:FinanceRouteId;label:string;icon:IconName;section:string}[]=[
 {id:"home",label:"Home",icon:"overview",section:"home"},
 {id:"activity",label:"Activity",icon:"activity",section:"activity"},
 {id:"plan",label:"Plan",icon:"plan",section:"plan"},
 {id:"explore",label:"Explore",icon:"insights",section:"explore"},
 {id:"receipts",label:"Receipts",icon:"receipts",section:"receipts"},
 {id:"accounts",label:"Wealth",icon:"wallet",section:"wealth"}
];
const mobile=[primary[0]!,primary[1]!,{id:"capture" as FinanceRouteId,label:"Scan",icon:"scan" as IconName,section:"receipts"},primary[2]!,primary[3]!];
const more: readonly {id:FinanceRouteId;label:string}[]=[
 {id:"receipts",label:"Receipt inbox"},
 {id:"accounts",label:"Accounts & wealth"},
 {id:"imports",label:"Imports"},
 {id:"rules",label:"Classification rules"},
 {id:"ask",label:"Ask Finance"},
 {id:"settings",label:"Settings & account"},
 {id:"release-review",label:"Acceptance & release review"}
];
const secondary:Record<string,readonly {id:FinanceRouteId;label:string}[]>={
 activity:[{id:"activity",label:"Transactions"},{id:"activity-new",label:"New transaction"},{id:"imports",label:"Import"}],
 plan:[{id:"plan",label:"Budget"},{id:"goals",label:"Goals"},{id:"recurring",label:"Recurring"}],
 explore:[{id:"explore",label:"Spending"},{id:"categories",label:"Categories"},{id:"merchants",label:"Merchants"},{id:"products",label:"Products"}],
 receipts:[{id:"receipts",label:"Inbox"},{id:"capture",label:"Scan"}],
 wealth:[{id:"accounts",label:"Accounts"},{id:"net-worth",label:"Net worth"}]
};
function useTheme() {
 const [theme,setTheme]=useState<"dark"|"light">(()=>{
   try{return localStorage.getItem("thiepn.finance.theme")==="light"?"light":"dark"}catch{return"dark"}
 });
 const toggle=()=>{const next=theme==="dark"?"light":"dark";setTheme(next);try{localStorage.setItem("thiepn.finance.theme",next)}catch{/* disabled */}};
 return {theme,toggle};
}
export interface FinanceV2ShellProps {
 children:ReactNode;
 routeId:FinanceRouteId|"not-found";
 section:string;
 title:string;
 onNavigate:(target:string)=>void;
 onSignOut:()=>Promise<void>;
 email:string|null;
}
export function FinanceV2Shell({children,routeId,section,title,onNavigate,onSignOut,email}:FinanceV2ShellProps){
 const {theme,toggle}=useTheme();
 const [menuOpen,setMenuOpen]=useState(false);
 const [loggingOut,setLoggingOut]=useState(false);
 const [signOutError,setSignOutError]=useState(false);
 const menuRef=useRef<HTMLDivElement>(null);
 const mainRef=useRef<HTMLElement>(null);
 const previous=useRef<string|undefined>(undefined);
 useEffect(()=>{
   document.title=title+" · THIEPN Finance";
   // Do not steal focus on the initial page load or from a user editing a form.
   if(previous.current!==undefined&&previous.current!==routeId){
     mainRef.current?.focus({preventScroll:true});
   }
   previous.current=routeId;
   setMenuOpen(false);
 },[routeId,title]);
 useEffect(()=>{
   if(!menuOpen)return;
   function onPointer(event:PointerEvent){if(!menuRef.current?.contains(event.target as Node))setMenuOpen(false);}
   document.addEventListener("pointerdown",onPointer);
   return()=>document.removeEventListener("pointerdown",onPointer);
 },[menuOpen]);
 const go=(id:FinanceRouteId)=>{onNavigate(financePathFor(id));setMenuOpen(false);};
 const link=(id:FinanceRouteId,label:string,icon?:IconName,cls="")=>{
   const href=financePathFor(id);
   return <a key={id+label} className={cls} href={href}
    aria-current={routeId===id?"page":undefined}
    onClick={(event:MouseEvent<HTMLAnchorElement>)=>{
      if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
      event.preventDefault();go(id);
    }}>{icon?<Icon name={icon} size={18}/>:null}<span>{label}</span></a>;
 };
 const signOut=async()=>{setLoggingOut(true);setSignOutError(false);try{await onSignOut()}catch{setSignOutError(true);}finally{setLoggingOut(false);}};
 return <SignalCurrentScope theme={theme} className="sc-app">
   <a href="#finance-main" className="sc-skip" onClick={e=>{e.preventDefault();mainRef.current?.focus();}}>Skip to content</a>
   <aside className="sc-app-sidebar" aria-label="Finance workspace">
     <div className="sc-app-brand"><span className="sc-app-brand__mark" aria-hidden="true">▮▮</span><span><strong>THIEPN</strong><small>FINANCE</small></span></div>
     <nav className="sc-app-primary" aria-label="Primary desktop navigation">
       {primary.map(item=>link(item.id,item.label,item.icon, "sc-app-navitem"+(section===item.section?" is-active":"")))}
     </nav>
     {secondary[section]?<nav className="sc-app-secondary" aria-label="Current section">
       <span className="sc-eyebrow">IN THIS SECTION</span>
       {secondary[section].map(item=>link(item.id,item.label,undefined,"sc-app-sublink"))}
     </nav>:null}
     <div className="sc-app-sidebar-bottom">
       <button type="button" onClick={toggle} className="sc-app-option"><Icon name={theme==="dark"?"sun":"moon"}/>{theme==="dark"?"Light appearance":"Dark appearance"}</button>
       {link("settings","Settings","settings","sc-app-option")}
       <div className="sc-app-account"><span className="sc-app-account__avatar">F</span><span><strong>{email??"Finance account"}</strong><small>Private workspace</small></span></div>
     </div>
   </aside>
   <div className="sc-app-workspace">
     <header className="sc-app-header">
       <div className="sc-app-location"><strong>Finance</strong><span>/ {title}</span></div>
       <div className="sc-app-header-actions">
         <form className="sc-app-search" onSubmit={e=>{e.preventDefault();const data=new FormData(e.currentTarget);const q=String(data.get("q")??"").trim();if(q)onNavigate("/activity?q="+encodeURIComponent(q));}}>
           <Icon name="search" size={16}/><label className="sc-visually-hidden" htmlFor="finance-global-search">Search Activity</label>
           <input type="search" id="finance-global-search" name="q" placeholder="Search Activity"/>
         </form>
         <button className="sc-app-icon-button" aria-label={theme==="dark"?"Switch to light appearance":"Switch to dark appearance"} onClick={toggle} type="button"><Icon name={theme==="dark"?"sun":"moon"}/></button>
         <div className="sc-app-more" ref={menuRef} onKeyDown={e=>{if(e.key==="Escape"){setMenuOpen(false);(e.currentTarget.querySelector("button") as HTMLButtonElement)?.focus();}}}>
           <button type="button" className="sc-app-more-button" aria-controls="finance-more-list" aria-expanded={menuOpen} onClick={()=>setMenuOpen(v=>!v)} onKeyDown={e=>{if(e.key==="Escape")setMenuOpen(false)}}>More <span aria-hidden="true">⌄</span></button>
           {menuOpen?<div id="finance-more-list" className="sc-app-more-list">{more.map(item=>link(item.id,item.label,undefined,"sc-app-more-link"))}
             <button disabled={loggingOut} onClick={()=>void signOut()} type="button" className="sc-app-more-link">Sign out</button>
             {signOutError?<p role="alert" className="sc-app-more-error">Sign-out failed. Try again.</p>:null}</div>:null}
         </div>
       </div>
     </header>
     <main id="finance-main" className="sc-app-main" aria-label={title} ref={mainRef} tabIndex={-1}>{children}</main>
   </div>
   <nav className="sc-app-bottom-nav" aria-label="Primary mobile navigation">
     {mobile.map(item=>link(item.id,item.label,item.icon,"sc-app-tab"+(item.id==="capture"?" sc-app-tab--scan":"")+(section===item.section&&item.id!=="capture"?" is-active":"") ))}
   </nav>
 </SignalCurrentScope>;
}
