import type { UUID } from "../domain/finance.js";
import type {
  LocalReceiptCaptureDraft,
  LocalReceiptPage,
  ReceiptCaptureMethod,
} from "../domain/receipt-capture.js";
import type { FinanceReceiptCaptureService } from "../services/receipt-capture.js";
import { prepareReceiptBlob } from "./browser-image.js";
import type { ReceiptCaptureDraftStore } from "./indexeddb-draft-store.js";

function nowIso(): string {
  return new Date().toISOString();
}

export class ReceiptCaptureController {
  constructor(
    private readonly service: FinanceReceiptCaptureService,
    private readonly store: ReceiptCaptureDraftStore,
    private readonly userId: UUID,
    private readonly deviceId: string | null,
  ) {}

  async create(method: ReceiptCaptureMethod): Promise<LocalReceiptCaptureDraft> {
    const stamp = nowIso();
    const draft: LocalReceiptCaptureDraft = {
      clientCaptureId: crypto.randomUUID(),
      receiptId: null,
      userId: this.userId,
      deviceId: this.deviceId,
      method,
      state: "capturing",
      pages: [],
      createdAt: stamp,
      updatedAt: stamp,
      errorText: null,
    };
    await this.store.put(draft);
    return draft;
  }

  async addPage(
    draft: LocalReceiptCaptureDraft,
    input: Blob,
    method: ReceiptCaptureMethod = draft.method,
  ): Promise<LocalReceiptCaptureDraft> {
    const prepared = await prepareReceiptBlob(input);
    const page: LocalReceiptPage = {
      clientPageId: crypto.randomUUID(),
      serverPageId: null,
      pageIndex: draft.pages.filter((item) => item.state !== "pending-delete").length,
      blob: prepared.blob,
      mimeType: prepared.mimeType,
      byteSize: prepared.byteSize,
      widthPx: prepared.widthPx,
      heightPx: prepared.heightPx,
      sha256: prepared.sha256,
      capturedAt: nowIso(),
      captureMethod: method,
      storagePath: null,
      state: "local",
      errorText: null,
    };

    const next: LocalReceiptCaptureDraft = {
      ...draft,
      pages: [...draft.pages, page],
      updatedAt: nowIso(),
      errorText: null,
    };
    await this.store.put(next);
    return next;
  }

  async reorder(
    draft: LocalReceiptCaptureDraft,
    clientPageIds: readonly UUID[],
  ): Promise<LocalReceiptCaptureDraft> {
    const livePages = draft.pages.filter((page) => page.state !== "pending-delete");
    if (clientPageIds.length !== livePages.length) {
      throw new RangeError("New page order must include every live page");
    }

    const byId = new Map(livePages.map((page) => [page.clientPageId, page]));
    const ordered = clientPageIds.map((id, index) => {
      const page = byId.get(id);
      if (!page) throw new RangeError("New page order contains an unknown page");
      byId.delete(id);
      return { ...page, pageIndex: index };
    });
    if (byId.size) throw new RangeError("New page order omitted a page");

    const deleted = draft.pages.filter((page) => page.state === "pending-delete");
    const next = {
      ...draft,
      pages: [...ordered, ...deleted],
      updatedAt: nowIso(),
    };
    await this.store.put(next);
    return next;
  }

  async removePage(
    draft: LocalReceiptCaptureDraft,
    clientPageId: UUID,
  ): Promise<LocalReceiptCaptureDraft> {
    const page = draft.pages.find((candidate) => candidate.clientPageId === clientPageId);
    if (!page) throw new RangeError("Receipt page not found");

    const nextPages = draft.pages
      .map((candidate) =>
        candidate.clientPageId === clientPageId
          ? { ...candidate, state: "pending-delete" as const }
          : candidate,
      )
      .filter((candidate) => candidate.state !== "pending-delete" || candidate.serverPageId);

    const normalized = nextPages.map((candidate, index) =>
      candidate.state === "pending-delete"
        ? candidate
        : { ...candidate, pageIndex: nextPages.slice(0, index).filter((p) => p.state !== "pending-delete").length },
    );

    const next = { ...draft, pages: normalized, updatedAt: nowIso() };
    await this.store.put(next);
    return next;
  }

  async sync(draft: LocalReceiptCaptureDraft): Promise<LocalReceiptCaptureDraft> {
    let next: LocalReceiptCaptureDraft = {
      ...draft,
      state: "syncing",
      errorText: null,
      updatedAt: nowIso(),
    };
    await this.store.put(next);

    try {
      if (!next.receiptId) {
        const started = await this.service.start(
          next.clientCaptureId,
          next.method,
          next.deviceId,
          { offline_created_at: next.createdAt },
        );
        next = { ...next, receiptId: started.receiptId };
        await this.store.put(next);
      }

      const receiptId = next.receiptId;
      if (!receiptId) throw new Error("Receipt session did not return an id");

      const pages = [...next.pages];

      for (let i = 0; i < pages.length; i += 1) {
        const page = pages[i];
        if (!page) continue;

        if (page.state === "pending-delete") {
          if (page.serverPageId && page.storagePath) {
            await this.service.removePage(page.serverPageId, page.storagePath);
          }
          pages.splice(i, 1);
          i -= 1;
          continue;
        }

        if (page.serverPageId && page.storagePath) continue;

        pages[i] = { ...page, state: "uploading", errorText: null };
        next = { ...next, pages: [...pages], updatedAt: nowIso() };
        await this.store.put(next);

        try {
          const serverPageId = await this.service.uploadPage({
            userId: next.userId,
            receiptId,
            clientPageId: page.clientPageId,
            pageIndex: page.pageIndex,
            blob: page.blob,
            mimeType: page.mimeType,
            widthPx: page.widthPx,
            heightPx: page.heightPx,
            sha256: page.sha256,
            capturedAt: page.capturedAt,
            captureMethod: page.captureMethod,
          });

          const refreshed = await this.service.get(receiptId);
          const serverPage = refreshed.pages.find(
            (candidate) => candidate.id === serverPageId,
          );

          pages[i] = {
            ...page,
            serverPageId,
            storagePath: serverPage?.storagePath ?? page.storagePath,
            state: "uploaded",
            errorText: null,
          };
        } catch (error) {
          pages[i] = {
            ...page,
            state: "failed",
            errorText: error instanceof Error ? error.message : String(error),
          };
          throw error;
        }

        next = { ...next, pages: [...pages], updatedAt: nowIso() };
        await this.store.put(next);
      }

      const orderedServerIds = pages
        .filter((page) => page.state !== "pending-delete")
        .sort((a, b) => a.pageIndex - b.pageIndex)
        .map((page) => {
          if (!page.serverPageId) throw new Error("Page sync did not produce a server id");
          return page.serverPageId;
        });

      if (orderedServerIds.length) {
        await this.service.reorder(receiptId, orderedServerIds);
      }

      next = {
        ...next,
        pages,
        state: "capturing",
        errorText: null,
        updatedAt: nowIso(),
      };
      await this.store.put(next);
      return next;
    } catch (error) {
      next = {
        ...next,
        state: "error",
        errorText: error instanceof Error ? error.message : String(error),
        updatedAt: nowIso(),
      };
      await this.store.put(next);
      throw error;
    }
  }

  async finalize(draft: LocalReceiptCaptureDraft): Promise<void> {
    const synced = await this.sync(draft);
    if (!synced.receiptId) throw new Error("Receipt session is not synchronized");
    if (!synced.pages.length) throw new RangeError("Add at least one receipt page");

    await this.service.finalize(synced.receiptId);
    await this.store.delete(synced.clientCaptureId);
  }

  async cancel(draft: LocalReceiptCaptureDraft): Promise<void> {
    if (draft.receiptId) {
      await this.service.cancel(
        draft.receiptId,
        draft.pages
          .map((page) => page.storagePath)
          .filter((path): path is string => Boolean(path)),
      );
    }
    await this.store.delete(draft.clientCaptureId);
  }
}
