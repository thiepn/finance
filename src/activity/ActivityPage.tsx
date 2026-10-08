import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ActivityDetail, ActivityFilterCatalog, ActivityItem, ActivitySearchFilters, ActivitySearchPage } from "../domain/activity.js";
import { ActivityController } from "./activity-controller.js";
import { createFinanceBrowserRuntime } from "../integrations/supabase-client.js";
import { formatMoneyMinor } from "../ui/format/money.js";
import { Badge, Button, Surface } from "../ui/components/Primitives.js";
import "./activity-page.css";
import { TransactionComposer } from "./TransactionComposer.js";

const batchSize = 30;
function hashSearch() {
  if(typeof window==="undefined")return "";
  const query=window.location.pathname==="/activity"
    ? window.location.search : window.location.hash.split("?",2)[1]??"";
  return new URLSearchParams(query).get("q")??"";
}
function monetary(item: ActivityItem) {
  return item.amountMinor === null
    ? "Receipt evidence"
    : formatMoneyMinor(item.amountMinor, item.currencyCode, { locale: "de-DE" });
}
function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(date);
}
function Detail({ detail }: { detail: ActivityDetail }) {
  if (detail.entityKind === "transaction") {
    const transaction = detail.activity;
    return (
      <div className="f-activity-detail__content">
        <h3>{transaction.title}</h3>
        <p>{dateLabel(transaction.occurredAt)} · {transaction.status} · {transaction.source}</p>
        <strong>{monetary(transaction)}</strong>
        {transaction.description ? <p>{transaction.description}</p> : null}
        {transaction.note ? <p>{transaction.note}</p> : null}
        <h4>Accounts</h4>
        {transaction.accounts.length ? transaction.accounts.map((account) =>
          <p key={account.id}>{account.name}: {formatMoneyMinor(account.signedAmountMinor, account.currencyCode, { locale: "de-DE" })}</p>
        ) : <p>No account breakdown available.</p>}
        <h4>Categories</h4>
        {transaction.categories.length ? transaction.categories.map((category) =>
          <p key={category.id}>{category.name}: {formatMoneyMinor(category.reportingAmountMinor, transaction.currencyCode, { locale: "de-DE" })}</p>
        ) : <p>Unclassified</p>}
        {transaction.productNames.length ? <><h4>Receipt products</h4><p>{transaction.productNames.join(", ")}</p></> : null}
        <p>{detail.receiptMatches.length} linked receipt match(es); {detail.tags.map(t => t.name).join(", ") || "no tags"}</p>
      </div>
    );
  }
  const receipt = detail.receipt;
  return (
    <div className="f-activity-detail__content">
      <h3>Receipt</h3>
      <p>Capture status: {String(receipt.capture_status ?? receipt.processing_status ?? "unknown")}</p>
      <p>Merchant: {String(receipt.merchant_name ?? "Not recognized")}</p>
      <p>{detail.transactionMatches.length} linked transaction match(es)</p>
      <p>Receipt evidence is separate from the posted ledger and is not counted as additional spending.</p>
    </div>
  );
}
export function ActivityPage() {
  const runtime = createFinanceBrowserRuntime();
  const [queryDraft, setQueryDraft] = useState(hashSearch);
  const [showComposer, setShowComposer] = useState(false);
  const [query, setQuery] = useState(hashSearch);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [merchantId, setMerchantId] = useState("");
  const [entityKind, setEntityKind] = useState("");
  const [catalog, setCatalog] = useState<ActivityFilterCatalog | null>(null);
  const [page, setPage] = useState<ActivitySearchPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [moreLoading, setMoreLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ActivityItem | null>(null);
  const [detail, setDetail] = useState<ActivityDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  useEffect(() => {
    const updateSearchFromHash = () => {
      if (window.location.pathname!=="/activity" && !window.location.hash.startsWith("#activity")) return;
      const next = hashSearch();
      setQueryDraft(next); setQuery(next);
    };
    window.addEventListener("hashchange", updateSearchFromHash);
    window.addEventListener("popstate", updateSearchFromHash);
    window.addEventListener("finance:navigate", updateSearchFromHash);
    return () => {window.removeEventListener("hashchange", updateSearchFromHash);
      window.removeEventListener("popstate", updateSearchFromHash);
      window.removeEventListener("finance:navigate", updateSearchFromHash);};
  }, []);
  const requestId = useRef(0);
  const detailRequestId = useRef(0);
  const controller = runtime ? new ActivityController(runtime.activity) : null;
  const filters: ActivitySearchFilters = {
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(merchantId ? { merchantIds: [merchantId] } : {}),
    ...(entityKind === "receipt" || entityKind === "transaction" ? { entityKinds: [entityKind] } : {}),
  };
  useEffect(() => {
    if (!runtime) return;
    let active = true;
    void runtime.activity.getFilterCatalog().then(value => {
      if (active) setCatalog(value);
    }).catch(() => { /* Optional filters do not block ledger access. */ });
    return () => { active = false; };
  }, [runtime]);
  useEffect(() => {
    if (!controller) return;
    const id = ++requestId.current;
    setLoading(true);
    setPage(null);
    setSelected(null);
    setDetail(null);
    setError(null);
    void controller.search({ query, filters, limit: batchSize }).then(result => {
      if (id === requestId.current) setPage(result);
    }).catch(reason => {
      if (id === requestId.current) setError(reason instanceof Error ? reason.message : String(reason));
    }).finally(() => { if (id === requestId.current) setLoading(false); });
    return () => { requestId.current++; };
  }, [runtime, query, from, to, merchantId, entityKind, refreshTick]);
  async function loadMore() {
    if (!controller || !page?.nextCursor || moreLoading) return;
    const id = requestId.current;
    setMoreLoading(true);
    try {
      const result = await controller.search({ query, filters, limit: batchSize, cursor: page.nextCursor });
      if (id === requestId.current) setPage({ ...result, items: [...page.items, ...result.items] });
    } catch (reason) {
      if (id === requestId.current) setError(reason instanceof Error ? reason.message : String(reason));
    } finally { if (id === requestId.current) setMoreLoading(false); }
  }
  async function choose(item: ActivityItem) {
    if (!controller) return;
    setSelected(item);
    setDetail(null);
    setDetailError(null);
    const id = ++detailRequestId.current;
    try {
      const result = await controller.getDetail(item.entityKind, item.id);
      if (id === detailRequestId.current) setDetail(result);
    } catch (reason) {
      if (id === detailRequestId.current) setDetailError(reason instanceof Error ? reason.message : String(reason));
    }
  }
  function submit(e: FormEvent) {
    e.preventDefault();const next=queryDraft.trim();setQuery(next);
    if(window.location.pathname==="/activity"){
      const params=new URLSearchParams(window.location.search);
      if(next)params.set("q",next);else params.delete("q");
      const search=params.toString();
      window.history.replaceState(null,"","/activity"+(search?"?"+search:""));
    }
  }
  return (
    <div className="f-activity-page">
      <div className="f-page-heading">
        <div>
          <h1>Activity</h1>
          <p>Search posted transactions and receipt evidence in one deduplicated timeline.</p>
        </div>
        <div className="f-activity-toolbar-actions"><Button onClick={() => setShowComposer(v => !v)} variant="primary">{showComposer ? "Hide entry" : "Add transaction"}</Button><Button onClick={() => setRefreshTick(n => n + 1)} variant="secondary">Refresh</Button></div>
      </div>
      {showComposer ? <TransactionComposer onClose={() => setShowComposer(false)} onCreated={() => { setShowComposer(false); setRefreshTick(n => n + 1); }} /> : null}
      <Surface>
        <form className="f-activity-filters" onSubmit={submit}>
          <label>Search <input aria-label="Search Finance activity" placeholder="Merchant, product, category, notes…" value={queryDraft} onChange={e => setQueryDraft(e.target.value)} /></label>
          <label>From <input aria-label="Activity start date" type="date" value={from} max={to || undefined} onChange={e => setFrom(e.target.value)} /></label>
          <label>To <input aria-label="Activity end date" type="date" value={to} min={from || undefined} onChange={e => setTo(e.target.value)} /></label>
          <label>Type <select value={entityKind} onChange={e => setEntityKind(e.target.value)}>
            <option value="">All</option><option value="transaction">Transactions</option><option value="receipt">Receipts</option>
          </select></label>
          {catalog?.merchants.length ? <label>Merchant <select value={merchantId} onChange={e => setMerchantId(e.target.value)}>
            <option value="">All merchants</option>{catalog.merchants.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select></label> : null}
          <Button type="submit" variant="primary">Search</Button>
        </form>
      </Surface>
      <Surface className="f-activity-preview">
        <div className="f-section-heading f-section-heading--activity"><h2>Transactions and receipts</h2>
          <Badge tone="neutral">{page?.items.length ?? 0} shown</Badge>
        </div>
        {error ? <p role="alert" className="f-activity-state">{error}</p> : null}
        {!runtime ? <p className="f-activity-state">Finance backend is not configured.</p>
        : loading ? <p className="f-activity-state">Loading activity…</p>
        : page && page.items.length === 0 ? <p className="f-activity-state">No activity matches these filters.</p> : null}
        {page && page.items.length ? <div className="f-activity-table">
          <div className="f-activity-table__head"><span>Date</span><span>Description</span><span>Account</span><span>Amount</span></div>
          {page.items.map(item => <button key={item.entityKind + ":" + item.id} className="f-activity-table__row f-activity-row" type="button"
            aria-pressed={selected?.id === item.id && selected?.entityKind === item.entityKind} onClick={() => void choose(item)}>
            <span className="f-activity-table__merchant"><span className="f-merchant-avatar">{item.entityKind === "receipt" ? "R" : "€"}</span><span><strong>{dateLabel(item.occurredAt)}</strong><small>{item.source} · {item.status}</small></span></span>
            <span className="f-activity-table__detail">{item.merchantName ?? item.title}{item.categories[0] ? " · " + item.categories[0].name : ""}{item.hasReceipt ? " · receipt" : ""}</span>
            <span className="f-activity-table__account">{item.accounts.map(a => a.name).join(", ") || "—"}</span>
            <strong className="f-activity-table__amount">{monetary(item)}</strong>
          </button>)}
        </div> : null}
        {page?.hasMore ? <div className="f-activity-more"><Button disabled={moreLoading} onClick={() => void loadMore()} variant="secondary">{moreLoading ? "Loading…" : "Load more"}</Button></div> : null}
      </Surface>
      {selected ? <Surface className="f-activity-detail">
        <div className="f-section-heading"><h2>Entry details</h2><Button onClick={() => { detailRequestId.current++; setSelected(null); setDetail(null); }} variant="ghost">Close</Button></div>
        {detailError ? <p role="alert">{detailError}</p> : detail ? <Detail detail={detail} /> : <p>Loading details…</p>}
      </Surface> : null}
    </div>
  );
}
