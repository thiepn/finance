import { useEffect, useState, type FormEvent } from "react";
import { createFinanceBrowserRuntime } from "../integrations/supabase-client.js";
import { Badge, Button, Surface } from "../ui/components/Primitives.js";
import "./settings-page.css";

export function FinanceSettingsPage() {
  const runtime = createFinanceBrowserRuntime();
  const [email, setEmail] = useState("");
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!runtime) { setReady(true); return; }
    let mounted = true;
    void runtime.client.auth.getUser().then(({ data }) => {
      if (mounted) { setSignedInEmail(data.user?.email ?? null); setReady(true); }
    }).catch(e => { if (mounted) { setError(e instanceof Error ? e.message : String(e)); setReady(true); } });
    const { data: subscription } = runtime.client.auth.onAuthStateChange((_event, session) => {
      if (mounted) setSignedInEmail(session?.user.email ?? null);
    });
    return () => { mounted = false; subscription.subscription.unsubscribe(); };
  }, [runtime]);
  async function loginGoogle() {
    if (!runtime || busy) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      const { error: authError } = await runtime.client.auth.signInWithOAuth({
        provider: "google", options: { redirectTo: window.location.origin + "/#overview" },
      });
      if (authError) throw authError;
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  async function emailLink(event: FormEvent) {
    event.preventDefault();
    if (!runtime || busy || !email.trim()) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      const { error: authError } = await runtime.client.auth.signInWithOtp({
        email: email.trim(), options: { emailRedirectTo: window.location.origin + "/#overview" },
      });
      if (authError) throw authError;
      setNotice("Check your email for the sign-in link. No password is required.");
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  async function logout() {
    if (!runtime || busy) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      const { error: authError } = await runtime.client.auth.signOut();
      if (authError) throw authError;
      setSignedInEmail(null);
      setNotice("Signed out. Device-local receipt drafts have not been deleted.");
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  return <div className="f-settings-page">
    <div className="f-page-heading"><div><h1>Settings</h1><p>Account access, financial-data boundaries, and product information.</p></div></div>
    <Surface>
      <div className="f-section-heading"><h2>Finance session</h2>
        <Badge tone={signedInEmail ? "positive" : "neutral"}>{signedInEmail ? "Signed in" : "Not signed in"}</Badge></div>
      {!runtime ? <p>Finance backend environment variables are not configured.</p>
      : !ready ? <p>Checking account session…</p>
      : signedInEmail ? <><p>Authenticated as <strong>{signedInEmail}</strong>.</p>
        <Button disabled={busy} onClick={() => void logout()} variant="secondary">Sign out</Button></>
      : <div className="f-settings-auth">
          <p>Sign in to access your private ledger and receipt storage. Finance does not display sample balances as real data.</p>
          <Button disabled={busy} onClick={() => void loginGoogle()} variant="primary">Continue with Google</Button>
          <form onSubmit={emailLink}>
            <label>Email sign-in link<input aria-label="Email address" required type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" /></label>
            <Button disabled={busy || !email.trim()} type="submit" variant="secondary">Email a sign-in link</Button>
          </form>
        </div>}
      {notice ? <p role="status">{notice}</p> : null}
      {error ? <p role="alert" className="f-settings-error">{error}</p> : null}
    </Surface>
    <Surface><h2>Financial integrity</h2>
      <p>Posted ledger entries determine balances and spending. Receipts are supporting evidence and do not create duplicate expenses. Ask Finance calculations are deterministic even when a language model interprets your question.</p>
      <p>Private receipts are stored in your Finance storage area. Unsynchronized capture drafts remain on this device until you finalize or discard them.</p>
    </Surface>
    <Surface><h2>Release and financial evidence</h2>
      <p>Inspect account-scoped data consistency, independent witness requirements and strictly separate default-denied staging, release and postrelease decisions. This cannot authorize deployment.</p>
      <p><a href="/settings/release">Open acceptance & release review →</a></p>
    </Surface>
    <Surface><h2>Support & policies</h2>
      <div className="f-settings-links">
        <a href="/support">Support</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a>
      </div>
    </Surface>
  </div>;
}
