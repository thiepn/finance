import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { IndexedDbReceiptCaptureDraftStore } from "./indexeddb-draft-store.js";
import { ReceiptCaptureController } from "./receipt-capture-controller.js";
import type { LocalReceiptCaptureDraft, ReceiptCaptureMethod } from "../domain/receipt-capture.js";
import { createFinanceBrowserRuntime } from "../integrations/supabase-client.js";
import { SupabaseFinanceReceiptCaptureService, type SupabaseReceiptClient } from "../services/supabase-receipt-capture.js";
import { Badge, Button, Surface } from "../ui/components/Primitives.js";
import { ReceiptLocalPagePreview } from "./ReceiptLocalPagePreview.js";
import "./capture-page.css";

export function CapturePage({ onNavigate }: { onNavigate: (key: string) => void }) {
  const runtime = createFinanceBrowserRuntime();
  const store = useMemo(() => new IndexedDbReceiptCaptureDraftStore(), []);
  const [userId, setUserId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<readonly LocalReceiptCaptureDraft[]>([]);
  const [active, setActive] = useState<LocalReceiptCaptureDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [confirmDiscard,setConfirmDiscard]=useState(false);
  const controller = runtime && userId ? new ReceiptCaptureController(
    new SupabaseFinanceReceiptCaptureService({
      rpc: runtime.rpcClient.rpc.bind(runtime.rpcClient),
      storage: runtime.client.storage as unknown as SupabaseReceiptClient["storage"],
    }),
    store, userId, null,
  ) : null;
  useEffect(() => {
    let mounted = true;
    if (!runtime) return;
    void runtime.client.auth.getUser().then(async ({ data, error: authError }) => {
      if (!mounted) return;
      if (authError || !data.user) {
        setError("Sign in to THIEPN Finance before capturing receipts.");
        return;
      }
      setUserId(data.user.id);
      const rows = await store.list();
      if (mounted) setDrafts(rows.filter(row => row.userId === data.user.id));
    }).catch(reason => {
      if (mounted) setError("Receipt drafts could not be loaded. Try reopening Capture.");
    });
    return () => { mounted = false; };
  }, [runtime, store]);
  async function reload() {
    if (!userId) return;
    setDrafts((await store.list()).filter(row => row.userId === userId));
  }
  async function perform(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setSuccess(false);
    try { await action(); await reload(); }
    catch { setError("The receipt action could not be confirmed. Your local draft is retained when possible; verify its status before retrying."); }
    finally { setBusy(false); }
  }
  function begin(method: ReceiptCaptureMethod) {
    if (!controller) return;
    void perform(async () => { setActive(await controller.create(method)); });
  }
  function addFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length || !active || !controller) return;
    void perform(async () => {
      let next = active;
      for (const file of files) {
        next = await controller.addPage(next, file, active.method);
        setActive(next);
      }
    });
  }
  function removePage(id: string) {
    if (!active || !controller) return;
    void perform(async () => { setActive(await controller.removePage(active, id)); });
  }
  function movePage(id: string, offset: number) {
    if (!active || !controller) return;
    const rows = active.pages.filter(page => page.state !== "pending-delete");
    const from = rows.findIndex(row => row.clientPageId === id);
    const to = from + offset;
    if (from < 0 || to < 0 || to >= rows.length) return;
    const ids = rows.map(row => row.clientPageId);
    [ids[from], ids[to]] = [ids[to]!, ids[from]!];
    void perform(async () => { setActive(await controller.reorder(active, ids)); });
  }
  function finish() {
    if (!active || !controller) return;
    void perform(async () => {
      await controller.finalize(active);
      setActive(null);
      setSuccess(true);
    });
  }
  function discard() {
    if (!active || !controller) return;
    if(!confirmDiscard){setConfirmDiscard(true);return;}
    void perform(async () => { await controller.cancel(active); setActive(null);setConfirmDiscard(false); });
  }
  const rows = active?.pages.filter(page => page.state !== "pending-delete") ?? [];
  return (
    <div className="f-capture-page">
      <div className="f-page-heading"><div><h1>Scan receipt</h1>
        <p>Private multi-page receipt capture. Drafts stay on this device until synchronized.</p></div>
        <Button variant="secondary" onClick={() => onNavigate("receipts")}>Receipt review</Button>
      </div>
      {error ? <Surface><p role="alert" className="f-capture-error">{error}</p></Surface> : null}
      {success ? <Surface><Badge tone="positive">Captured</Badge><p>Receipt saved as private evidence. It did not post a transaction.</p><Button onClick={()=>onNavigate("receipts")} variant="primary">Open receipt inbox</Button></Surface> : null}
      {!runtime ? <Surface><p>Finance backend is not configured.</p></Surface>
      : !userId ? <Surface><p>A signed-in Finance account is required to upload private receipts.</p></Surface>
      : !active ? <>
          <Surface className="f-capture-start">
            <h2>New receipt</h2>
            <p>Photograph a paper receipt or select saved images and PDFs. Multiple pages are supported. Files remain in a device-local draft until you save.</p>
            <div className="f-capture-actions">
              <Button disabled={busy} onClick={() => begin("camera")} variant="primary">Use camera</Button>
              <Button disabled={busy} onClick={() => begin("file")} variant="secondary">Choose files</Button>
            </div>
          </Surface>
          <Surface>
            <h2>Saved drafts on this device</h2>
            {drafts.length ? drafts.map(draft =>
              <button className="f-capture-draft" type="button" key={draft.clientCaptureId}
                disabled={busy} onClick={() => setActive(draft)}>
                <strong>{draft.pages.length} page(s)</strong>
                <span>{new Date(draft.updatedAt).toLocaleString("de-DE")} · {draft.state}</span>
              </button>
            ) : <p>No local drafts.</p>}
          </Surface>
        </>
      : <>
          <Surface className="f-capture-upload">
            <div className="f-section-heading"><h2>Pages ({rows.length})</h2><Badge tone="neutral">{active.state}</Badge></div>
            <label className="f-capture-file-label">
              Add page
              <input aria-label="Add receipt pages" type="file" multiple accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
                capture={active.method === "camera" ? "environment" : undefined} onChange={addFiles} disabled={busy} />
            </label>
            <div className="f-capture-pages">
              {rows.map((page, i) => <div className="f-capture-page-row" key={page.clientPageId}>
                <div><ReceiptLocalPagePreview page={page}/><strong>Page {i + 1}</strong><span>{(page.byteSize / 1024).toFixed(0)} KB · {page.state}</span></div>
                <div className="f-capture-actions">
                  <Button disabled={busy || i === 0} onClick={() => movePage(page.clientPageId, -1)} variant="ghost">Up</Button>
                  <Button disabled={busy || i === rows.length - 1} onClick={() => movePage(page.clientPageId, 1)} variant="ghost">Down</Button>
                  <Button disabled={busy} onClick={() => removePage(page.clientPageId)} variant="ghost">Remove</Button>
                </div>
              </div>)}
              {!rows.length ? <p>Add at least one receipt page.</p> : null}
            </div>
            <div className="f-capture-actions">
              <Button disabled={busy || rows.length === 0} onClick={finish} variant="primary">{busy ? "Saving…" : "Save receipt"}</Button>
              <Button disabled={busy} onClick={discard} variant="secondary">{confirmDiscard?"Confirm discard":"Discard draft"}</Button>
              {confirmDiscard?<Button disabled={busy} onClick={()=>setConfirmDiscard(false)} variant="ghost">Keep draft</Button>:null}
            </div>
            <p>Uploading does not create a ledger expense. Match your receipt with its transaction in Receipts.</p>
          </Surface>
        </>}
    </div>
  );
}
