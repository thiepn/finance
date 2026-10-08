import { useState, type FormEvent } from "react";
import { createFinanceBrowserRuntime } from "../integrations/supabase-client.js";
import { FinanceButton, FinancialState, SignalCurrentScope } from "../ui/v2/SignalCurrent.js";
import { storeReturnIntent, type FinanceSessionState } from "./useFinanceSession.js";
import { safePrivatePath } from "./finance-router.js";

interface Props {
  state:FinanceSessionState["status"];
  next?:string|null;
  onRetry:()=>void;
}
export function FinanceAuthPage({state,next,onRetry}:Props){
 const runtime=createFinanceBrowserRuntime();
 const [email,setEmail]=useState("");
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState("");
 const [error,setError]=useState("");
 const safeNext=safePrivatePath(next);
 const theme=(()=>{try{return localStorage.getItem("thiepn.finance.theme")==="light"?"light":"dark"}catch{return"dark"}})();
 async function loginGoogle(){
   if(!runtime||busy)return;
   setBusy(true);setError("");setNotice("");
   if(safeNext)storeReturnIntent(safeNext);
   try{
     // Keep the already-deployed OAuth redirect allowlist valid. P27 also
     // accepts /auth/callback once it is explicitly allowlisted in Core.
     const {error:authError}=await runtime.client.auth.signInWithOAuth({
       provider:"google",options:{redirectTo:window.location.origin+"/#overview"}
     });
     if(authError)throw authError;
   }catch{setError("Google sign-in could not start. Try again or use an email link.");}
   finally{setBusy(false);}
 }
 async function loginEmail(event:FormEvent<HTMLFormElement>){
   event.preventDefault();
   if(!runtime||busy||!email.trim())return;
   setBusy(true);setError("");setNotice("");
   if(safeNext)storeReturnIntent(safeNext);
   try{
     const {error:authError}=await runtime.client.auth.signInWithOtp({
       email:email.trim(),options:{emailRedirectTo:window.location.origin+"/#overview"}
     });
     if(authError)throw authError;
     setNotice("Check your email for the sign-in link. This page can stay open.");
   }catch{setError("The sign-in email could not be sent. Check the address and try again.");}
   finally{setBusy(false);}
 }
 return <SignalCurrentScope theme={theme} className="sc-auth">
   <header className="sc-auth__header"><strong>THIEPN <span>FINANCE</span></strong><a href="/privacy">Privacy</a></header>
   <main className="sc-auth__main">
     <div className="sc-auth__identity"><span className="sc-eyebrow">PRIVATE FINANCIAL WORKSPACE</span><h1>Sign in</h1>
       <p>Access your transactions, accounts, budgets and private receipt evidence.</p>
       {safeNext?<p className="sc-auth__return">Your previous destination will be restored after sign-in.</p>:null}</div>
     {state==="restoring"?<FinancialState kind="loading" title="Restoring your session" description="Checking your account access securely."/>:
      state==="unconfigured"?<FinancialState kind="error" title="Finance is not configured" description="The Finance backend connection is missing. No private information has been loaded."/>:
      state==="error"?<FinancialState kind="offline" title="Could not verify the session" description="Authentication is temporarily unavailable. We have not loaded any private financial data." primaryAction={{label:"Retry",onClick:onRetry}}/>:
      !runtime?<FinancialState kind="error" title="Finance unavailable" description="The Finance backend is not configured."/>:
      <div className="sc-auth__form">
        <FinanceButton disabled={busy} onClick={()=>void loginGoogle()}>Continue with Google</FinanceButton>
        <div className="sc-auth__divider">or use an email sign-in link</div>
        <form onSubmit={e=>void loginEmail(e)}>
          <label htmlFor="finance-auth-email">Email address</label>
          <input id="finance-auth-email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}
            type="email" placeholder="you@example.com" required/>
          <FinanceButton disabled={busy||!email.trim()} variant="secondary" type="submit">Send sign-in link</FinanceButton>
        </form>
        {notice?<p role="status">{notice}</p>:null}
        {error?<p role="alert" className="sc-auth__error">{error}</p>:null}
        <p className="sc-auth__disclaimer">Your account is verified before Finance loads any private ledger or receipt data. Existing local receipt drafts remain on this device.</p>
      </div>}
   </main>
   <footer className="sc-auth__footer"><a href="/support">Support</a><a href="/terms">Terms</a><a href="/privacy">Privacy</a></footer>
 </SignalCurrentScope>;
}
