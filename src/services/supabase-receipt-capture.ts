import type { UUID } from "../domain/finance.js";
import type {
  ReceiptCapture,
  ReceiptCaptureMethod,
  ReceiptCaptureStart,
  ReceiptMimeType,
  ReceiptPage,
} from "../domain/receipt-capture.js";
import type {
  FinanceReceiptCaptureService,
  UploadReceiptPageInput,
} from "./receipt-capture.js";
import type { SupabaseRpcClient } from "./supabase-ledger.js";

type StorageError = { message: string };

export interface SupabaseStorageBucketClient {
  upload(
    path: string,
    file: Blob,
    options?: {
      cacheControl?: string;
      contentType?: string;
      upsert?: boolean;
    },
  ): Promise<{ data: { path: string } | null; error: StorageError | null }>;

  remove(
    paths: readonly string[],
  ): Promise<{ data: unknown | null; error: StorageError | null }>;

  createSignedUrl(
    path: string,
    expiresIn: number,
  ): Promise<{
    data: { signedUrl: string } | null;
    error: StorageError | null;
  }>;
}

export interface SupabaseReceiptClient extends SupabaseRpcClient {
  storage: {
    from(bucket: string): SupabaseStorageBucketClient;
  };
}

const BUCKET = "finance-receipts";

function extensionFor(mimeType: ReceiptMimeType): string {
  switch (mimeType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/heic":
      return "heic";
    case "image/heif":
      return "heif";
    case "application/pdf":
      return "pdf";
  }
}

function storagePath(
  userId: UUID,
  receiptId: UUID,
  clientPageId: UUID,
  mimeType: ReceiptMimeType,
): string {
  return `${userId}/${receiptId}/${clientPageId}.${extensionFor(mimeType)}`;
}

function rpcError(
  result: { error: { message: string } | null },
  operation: string,
): void {
  if (result.error) {
    throw new Error(`Finance ${operation}: ${result.error.message}`);
  }
}

function parsePage(raw: Record<string, unknown>): ReceiptPage {
  return {
    id: String(raw.id),
    clientPageId: String(raw.client_page_id),
    pageIndex: Number(raw.page_index),
    storagePath: String(raw.storage_path),
    mimeType: String(raw.mime_type) as ReceiptMimeType,
    byteSize: Number(raw.byte_size),
    widthPx: raw.width_px === null ? null : Number(raw.width_px),
    heightPx: raw.height_px === null ? null : Number(raw.height_px),
    sha256: raw.sha256 === null ? null : String(raw.sha256),
    capturedAt: raw.captured_at === null ? null : String(raw.captured_at),
    captureMethod: String(raw.capture_method) as ReceiptCaptureMethod,
    status: String(raw.status) as ReceiptPage["status"],
    errorText: raw.error_text === null ? null : String(raw.error_text),
    metadata:
      raw.metadata && typeof raw.metadata === "object"
        ? (raw.metadata as Record<string, unknown>)
        : {},
    createdAt: String(raw.created_at),
    updatedAt: String(raw.updated_at),
  };
}

function parseCapture(raw: Record<string, unknown>): ReceiptCapture {
  return {
    id: String(raw.id),
    clientCaptureId: String(raw.client_capture_id),
    captureMethod: String(raw.capture_method) as ReceiptCaptureMethod,
    captureStatus: String(raw.capture_status) as ReceiptCapture["captureStatus"],
    processingStatus: String(raw.processing_status) as ReceiptCapture["processingStatus"],
    captureDeviceId:
      raw.capture_device_id === null ? null : String(raw.capture_device_id),
    captureStartedAt: String(raw.capture_started_at),
    captureFinalizedAt:
      raw.capture_finalized_at === null ? null : String(raw.capture_finalized_at),
    captureCancelledAt:
      raw.capture_cancelled_at === null ? null : String(raw.capture_cancelled_at),
    captureMetadata:
      raw.capture_metadata && typeof raw.capture_metadata === "object"
        ? (raw.capture_metadata as Record<string, unknown>)
        : {},
    merchantId: raw.merchant_id === null ? null : String(raw.merchant_id),
    purchasedAt: raw.purchased_at === null ? null : String(raw.purchased_at),
    currencyCode: String(raw.currency_code),
    totalMinor: raw.total_minor === null ? null : Number(raw.total_minor),
    bucket: BUCKET,
    pages: Array.isArray(raw.pages)
      ? (raw.pages as Record<string, unknown>[]).map(parsePage)
      : [],
  };
}

export class SupabaseFinanceReceiptCaptureService
  implements FinanceReceiptCaptureService
{
  constructor(private readonly client: SupabaseReceiptClient) {}

  async start(
    clientCaptureId: UUID,
    method: ReceiptCaptureMethod,
    deviceId: string | null = null,
    metadata: Record<string, unknown> = {},
  ): Promise<ReceiptCaptureStart> {
    const result = await this.client.rpc<Record<string, unknown>>(
      "finance_start_receipt_capture",
      {
        p_client_capture_id: clientCaptureId,
        p_method: method,
        p_device_id: deviceId,
        p_metadata: metadata,
      },
    );
    rpcError(result, "startReceiptCapture");
    if (!result.data) throw new Error("Finance receipt capture did not start");

    return {
      receiptId: String(result.data.receipt_id),
      clientCaptureId: String(result.data.client_capture_id),
      captureStatus: String(
        result.data.capture_status,
      ) as ReceiptCaptureStart["captureStatus"],
      processingStatus: String(
        result.data.processing_status,
      ) as ReceiptCaptureStart["processingStatus"],
      bucket: BUCKET,
      storagePrefix: String(result.data.storage_prefix),
    };
  }

  async get(receiptId: UUID): Promise<ReceiptCapture> {
    const result = await this.client.rpc<Record<string, unknown>>(
      "finance_get_receipt_capture",
      { p_receipt_id: receiptId },
    );
    rpcError(result, "getReceiptCapture");
    if (!result.data) throw new Error("Receipt capture not found");
    return parseCapture(result.data);
  }

  async getQueue(limit = 50): Promise<readonly Record<string, unknown>[]> {
    const result = await this.client.rpc<Record<string, unknown>[]>(
      "finance_get_receipt_capture_queue",
      { p_limit: limit },
    );
    rpcError(result, "getReceiptCaptureQueue");
    return result.data ?? [];
  }

  async uploadPage(input: UploadReceiptPageInput): Promise<UUID> {
    const path = storagePath(
      input.userId,
      input.receiptId,
      input.clientPageId,
      input.mimeType,
    );
    const bucket = this.client.storage.from(BUCKET);

    const upload = await bucket.upload(path, input.blob, {
      cacheControl: "3600",
      contentType: input.mimeType,
      upsert: true,
    });

    if (upload.error) {
      throw new Error(`Receipt upload failed: ${upload.error.message}`);
    }

    const registered = await this.client.rpc<UUID>(
      "finance_register_receipt_page",
      {
        p_receipt_id: input.receiptId,
        p_client_page_id: input.clientPageId,
        p_page_index: input.pageIndex,
        p_storage_path: path,
        p_mime_type: input.mimeType,
        p_byte_size: input.blob.size,
        p_width_px: input.widthPx ?? null,
        p_height_px: input.heightPx ?? null,
        p_sha256: input.sha256 ?? null,
        p_captured_at: input.capturedAt ?? null,
        p_capture_method: input.captureMethod,
        p_metadata: input.metadata ?? {},
      },
    );

    if (registered.error || !registered.data) {
      const cleanup = await bucket.remove([path]);
      const suffix = cleanup.error
        ? ` Storage cleanup also failed: ${cleanup.error.message}`
        : "";
      throw new Error(
        `Receipt page registration failed: ${registered.error?.message ?? "no page id"}.${suffix}`,
      );
    }

    return registered.data;
  }

  async reorder(receiptId: UUID, pageIds: readonly UUID[]): Promise<void> {
    const result = await this.client.rpc("finance_reorder_receipt_pages", {
      p_receipt_id: receiptId,
      p_page_ids: [...pageIds],
    });
    rpcError(result, "reorderReceiptPages");
  }

  async removePage(pageId: UUID, storagePathValue: string): Promise<void> {
    const bucket = this.client.storage.from(BUCKET);
    const removed = await bucket.remove([storagePathValue]);
    if (removed.error) {
      throw new Error(`Receipt file delete failed: ${removed.error.message}`);
    }

    const result = await this.client.rpc<string>(
      "finance_unregister_receipt_page",
      { p_page_id: pageId },
    );
    rpcError(result, "unregisterReceiptPage");
  }

  async finalize(receiptId: UUID): Promise<ReceiptCapture> {
    const result = await this.client.rpc<Record<string, unknown>>(
      "finance_finalize_receipt_capture",
      { p_receipt_id: receiptId },
    );
    rpcError(result, "finalizeReceiptCapture");
    if (!result.data) throw new Error("Receipt finalization returned no data");
    return parseCapture(result.data);
  }

  async cancel(
    receiptId: UUID,
    storagePaths: readonly string[],
  ): Promise<void> {
    if (storagePaths.length) {
      const removed = await this.client.storage.from(BUCKET).remove(storagePaths);
      if (removed.error) {
        throw new Error(
          `Receipt cancellation could not remove private files: ${removed.error.message}`,
        );
      }
    }

    const result = await this.client.rpc("finance_cancel_receipt_capture", {
      p_receipt_id: receiptId,
    });
    rpcError(result, "cancelReceiptCapture");
  }

  async createPreviewUrl(
    storagePathValue: string,
    expiresInSeconds = 300,
  ): Promise<string> {
    const result = await this.client.storage
      .from(BUCKET)
      .createSignedUrl(storagePathValue, expiresInSeconds);

    if (result.error || !result.data) {
      throw new Error(
        `Receipt preview URL failed: ${result.error?.message ?? "no signed URL"}`,
      );
    }
    return result.data.signedUrl;
  }
}
