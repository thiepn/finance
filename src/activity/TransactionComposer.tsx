import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { AccountBalance } from "../domain/finance.js";
import type { CategoryNode, MerchantSummary } from "../domain/classification.js";
import { createFinanceBrowserRuntime } from "../integrations/supabase-client.js";
import { SupabaseFinanceClassificationService } from "../services/supabase-classification.js";
import { Badge, Button, Surface } from "../ui/components/Primitives.js";
import "./transaction-composer.css";

export function amountToMinor(value: string): number | null {
  const raw = value.trim();
  if (!/^\d+(?:[,.]\d{1,2})?$/.test(raw)) return null;
  const [whole = "", fraction = ""] = raw.replace(",", ".").split(".");
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(minor) && minor > 0 ? minor : null;
}
export function TransactionComposer({ onCreated, onClose }: { onCreated: () => void; onClose: () => void }) {
  const runtime = createFinanceBrowserRuntime();
  const classification = useMemo(() => runtime ? new SupabaseFinanceClassificationService(runtime.rpcClient) : null, [runtime]);
  const [accounts, setAccounts] = useState<readonly AccountBalance[]>([]);
  const [categories, setCategories] = useState<readonly CategoryNode[]>([]);
  const [merchants, setMerchants] = useState<readonly MerchantSummary[]>([]);
  const [kind, setKind] = useState<"expense" | "income" | "transfer">("expense");
  const [accountId, setAccountId] = useState("");
  const [destinationId, setDestinationId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [merchantId, setMerchantId] = useState("");
  const [description, setDescription] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(() => {
    const d = new Date();
    return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
  });
  const [amount, setAmount] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!runtime || !classification) { setReady(true); return; }
    let active = true;
    void Promise.all([runtime.ledger.getAccountBalances(), classification.getCategories(), classification.getMerchants()])
      .then(([a, c, m]) => {
        if (active) { setAccounts(a); setCategories(c); setMerchants(m); }
      }).catch(e => { if (active) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, [runtime, classification]);
  const amountMinor = amountToMinor(amount);
  const currentAccount = accounts.find(a => a.accountId === accountId);
  const accountsForPosting = accounts.filter(a => a.currencyCode === "EUR");
  const allowedCategories = categories.filter(c => !c.isArchived && (c.kind === kind || c.kind === "both"));
  const destinationAllowed = accountsForPosting.filter(a => a.accountId !== accountId);
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(new Date(date + "T12:00:00").valueOf());
  const canSave = Boolean(runtime && currentAccount && currentAccount.currencyCode === "EUR" &&
    amountMinor && validDate && (kind === "transfer" ? destinationAllowed.some(a => a.accountId === destinationId)
      : allowedCategories.some(c => c.id === categoryId)));
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!runtime || !canSave || !amountMinor || busy) return;
    setBusy(true); setError(null);
    try {
      const occurredAt = new Date(date + "T12:00:00").toISOString();
      if (kind === "expense") {
        await runtime.ledger.createExpense({
          accountId, amountMinor, allocations: [{ categoryId, amountMinor }],
          occurredAt, ...(merchantId ? { merchantId } : {}),
          ...(description.trim() ? { description: description.trim() } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
        });
      } else if (kind === "income") {
        await runtime.ledger.createIncome({
          accountId, amountMinor, allocations: [{ categoryId, amountMinor }],
          occurredAt, ...(description.trim() ? { description: description.trim() } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
        });
      } else {
        await runtime.ledger.createTransfer({
          fromAccountId: accountId, toAccountId: destinationId, amountMinor,
          occurredAt, ...(note.trim() ? { note: note.trim() } : {}),
        });
      }
      onCreated();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally { setBusy(false); }
  }
  return <Surface className="f-transaction-composer">
    <div className="f-section-heading"><div><h2>New ledger entry</h2><p>Entries post to the balanced ledger. Transfers never count as spending or income.</p></div>
      <Button onClick={onClose} disabled={busy} variant="ghost">Close</Button></div>
    {!runtime ? <p role="alert">Finance backend is not configured.</p> :
    !ready ? <p>Loading accounts and categories…</p> :
    accountsForPosting.length === 0 ? <p>First create a EUR account from the Accounts page.</p> :
    <form className="f-transaction-form" onSubmit={e => void submit(e)}>
      <label>Transaction type<select value={kind} disabled={busy} onChange={e => { setKind(e.target.value as typeof kind); setCategoryId(""); }}>
        <option value="expense">Expense</option><option value="income">Income</option><option value="transfer">Transfer</option>
      </select></label>
      <label>Amount (EUR)<input autoComplete="off" required inputMode="decimal" placeholder="12,50" value={amount} onChange={e => setAmount(e.target.value)} /></label>
      <label>Date<input type="date" required value={date} onChange={e => setDate(e.target.value)} /></label>
      <label>{kind === "transfer" ? "From account" : "Account"}<select required value={accountId} onChange={e => { setAccountId(e.target.value); setDestinationId(""); }}>
        <option value="">Choose account</option>{accountsForPosting.map(a => <option key={a.accountId} value={a.accountId}>{a.name}</option>)}
      </select></label>
      {kind === "transfer" ? <label>To account<select required value={destinationId} onChange={e => setDestinationId(e.target.value)}>
        <option value="">Choose destination</option>{destinationAllowed.map(a => <option key={a.accountId} value={a.accountId}>{a.name}</option>)}
      </select></label> : <label>Category<select required value={categoryId} onChange={e => setCategoryId(e.target.value)}>
        <option value="">Choose category</option>{allowedCategories.map(c => <option key={c.id} value={c.id}>{c.namePath.join(" / ")}</option>)}
      </select></label>}
      {kind === "expense" ? <label>Merchant (optional)<select value={merchantId} onChange={e => setMerchantId(e.target.value)}>
        <option value="">Not selected</option>{merchants.filter(m => !m.isArchived).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
      </select></label> : null}
      {kind !== "transfer" ? <label>Description<input value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional description" maxLength={250} /></label> : null}
      <label>Note<input value={note} onChange={e => setNote(e.target.value)} maxLength={500} placeholder="Optional note" /></label>
      <div className="f-transaction-form__actions">
        <Badge tone="neutral">Posted entries are auditable</Badge>
        <Button disabled={!canSave || busy} type="submit" variant="primary">{busy ? "Posting…" : "Post " + kind}</Button>
      </div>
    </form>}
    {amount && amountMinor === null ? <p role="alert">Enter a positive EUR amount with at most two decimal places.</p> : null}
    {error ? <p role="alert">{error}</p> : null}
  </Surface>;
}
