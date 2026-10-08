import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createFinanceBrowserRuntime } from "../integrations/supabase-client.js";
import { SupabaseFinanceClassificationService } from "../services/supabase-classification.js";
import type { CategoryNode, ClassificationRule, MerchantSummary } from "../domain/classification.js";
import { formatMoneyMinor } from "../ui/format/money.js";
import { Badge, Button, Surface } from "../ui/components/Primitives.js";
import "./classification-page.css";

function useClassification() {
  const runtime = createFinanceBrowserRuntime();
  const service = useMemo(() => runtime ? new SupabaseFinanceClassificationService(runtime.rpcClient) : null, [runtime]);
  return service;
}
export function MerchantsPage({ onNavigate }: { onNavigate: (key: string) => void }) {
  const service = useClassification();
  const [rows, setRows] = useState<readonly MerchantSummary[]>([]);
  const [filter, setFilter] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  async function refresh() {
    if (!service) return;
    setRows(await service.getMerchants());
  }
  useEffect(() => {
    let mounted = true;
    if (!service) { setLoading(false); return; }
    void service.getMerchants().then(data => { if (mounted) setRows(data); })
      .catch(e => { if (mounted) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [service]);
  const visible = rows.filter(row => (row.name + " " + (row.merchantGroup ?? "") + " " + row.aliases.map(a => a.rawName).join(" ")).toLowerCase().includes(filter.toLowerCase()));
  function add(e: FormEvent) {
    e.preventDefault();
    if (!service || !name.trim() || busy) return;
    setBusy(true); setError(null);
    void service.upsertMerchant({ name: name.trim() }).then(async () => {
      setName(""); await refresh();
    }).catch(e => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setBusy(false));
  }
  return <div className="f-classification-page">
    <div className="f-page-heading"><div><h1>Merchants</h1><p>Normalized merchant names, aliases, transaction counts, and net spending.</p></div>
      <Button onClick={() => onNavigate("insights")} variant="secondary">Spending explorer</Button></div>
    <Surface><div className="f-classification-toolbar"><label>Find merchant <input placeholder="Name or alias" value={filter} onChange={e => setFilter(e.target.value)} /></label>
      <form onSubmit={add}><label>New merchant <input value={name} placeholder="Merchant name" onChange={e => setName(e.target.value)} /></label>
      <Button disabled={!name.trim() || busy} type="submit" variant="primary">Add</Button></form></div></Surface>
    {error ? <p role="alert">{error}</p> : null}
    <Surface className="f-classification-list">
      <div className="f-section-heading"><h2>Merchant directory</h2><Badge tone="neutral">{visible.length} merchants</Badge></div>
      {loading ? <p>Loading merchants…</p> : !service ? <p>Finance backend is not configured.</p> : !visible.length ? <p>No merchants found.</p> :
      visible.map(merchant => <div className="f-classification-row" key={merchant.id}>
        <div><strong>{merchant.name}</strong><small>{merchant.merchantGroup ?? "Independent merchant"} · {merchant.purchaseCount} purchases · {merchant.aliases.length} aliases</small>
          {merchant.aliases.length ? <small>{merchant.aliases.map(a => a.rawName).join(", ")}</small> : null}</div>
        <strong>{formatMoneyMinor(merchant.netSpendMinor, "EUR", { locale: "de-DE" })}</strong>
      </div>)}
    </Surface>
  </div>;
}
export function RulesPage() {
  const service = useClassification();
  const [rules, setRules] = useState<readonly ClassificationRule[]>([]);
  const [categories, setCategories] = useState<readonly CategoryNode[]>([]);
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [field, setField] = useState<"description_contains" | "merchant_name_contains">("merchant_name_contains");
  const [categoryId, setCategoryId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  async function refresh() {
    if (!service) return;
    const [nextRules, nextCategories] = await Promise.all([service.getRules(), service.getCategories()]);
    setRules(nextRules); setCategories(nextCategories);
  }
  useEffect(() => {
    let mounted = true;
    if (!service) { setLoading(false); return; }
    void Promise.all([service.getRules(), service.getCategories()]).then(([r,c]) => { if (mounted) { setRules(r); setCategories(c); }})
    .catch(e => { if (mounted) setError(e instanceof Error ? e.message : String(e)); })
    .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [service]);
  async function act(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true); setError(null);
    try { await action(); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  function add(e: FormEvent) {
    e.preventDefault();
    if (!service || !name.trim() || !text.trim() || !categoryId) return;
    void act(async () => {
      await service.createRule({ name: name.trim(), scope: "transaction", condition: { [field]: text.trim() }, action: { category_id: categoryId }, priority: 1000 });
      setName(""); setText(""); setCategoryId("");
    });
  }
  function toggle(rule: ClassificationRule) {
    if (!service) return;
    void act(() => service.updateRule(rule.id, {
      name: rule.name, scope: rule.scope, condition: rule.condition,
      action: rule.action, priority: rule.priority, stopProcessing: rule.stopProcessing,
      enabled: !rule.enabled,
    }));
  }
  function remove(rule: ClassificationRule) {
    if (!service || !window.confirm("Delete classification rule \"" + rule.name + "\"?")) return;
    void act(() => service.deleteRule(rule.id));
  }
  return <div className="f-classification-page">
    <div className="f-page-heading"><div><h1>Classification rules</h1><p>Explicit rules classify transactions without changing posted financial history.</p></div></div>
    <Surface><h2>Create transaction rule</h2>
      <form className="f-classification-rule-form" onSubmit={add}>
        <label>Rule name<input required value={name} onChange={e => setName(e.target.value)} placeholder="Groceries at REWE" /></label>
        <label>Match field<select value={field} onChange={e => setField(e.target.value as typeof field)}><option value="merchant_name_contains">Merchant contains</option><option value="description_contains">Description contains</option></select></label>
        <label>Contains text<input required value={text} onChange={e => setText(e.target.value)} placeholder="REWE" /></label>
        <label>Set category<select required value={categoryId} onChange={e => setCategoryId(e.target.value)}>
          <option value="">Select category</option>{categories.filter(c => !c.isArchived && c.kind !== "income").map(c => <option key={c.id} value={c.id}>{c.namePath.join(" / ")}</option>)}
        </select></label>
        <Button disabled={busy || !name.trim() || !text.trim() || !categoryId} type="submit" variant="primary">Create rule</Button>
      </form>
    </Surface>
    {error ? <p role="alert">{error}</p> : null}
    <Surface className="f-classification-list"><div className="f-section-heading"><h2>Rules</h2><Badge tone="neutral">{rules.length}</Badge></div>
      {loading ? <p>Loading rules…</p> : !service ? <p>Finance backend is not configured.</p> : !rules.length ? <p>No rules yet.</p>
      : rules.map(rule => <div className="f-classification-row" key={rule.id}>
        <div><strong>{rule.name}</strong><small>{rule.scope} · priority {rule.priority} · {rule.matchCount} matches</small>
          <small>{Object.entries(rule.condition).map(([k,v]) => k + ": " + String(v)).join("; ")}</small></div>
        <div className="f-classification-row-actions"><Badge tone={rule.enabled ? "positive" : "neutral"}>{rule.enabled ? "Enabled" : "Paused"}</Badge>
          <Button disabled={busy} onClick={() => toggle(rule)} variant="secondary">{rule.enabled ? "Pause" : "Enable"}</Button>
          <Button disabled={busy} onClick={() => remove(rule)} variant="ghost">Delete</Button></div>
      </div>)}
    </Surface>
  </div>;
}
