import type { UUID } from "../domain/finance.js";
import type {
  ReceiptCapture,
  ReceiptCaptureMethod,
  ReceiptCaptureStart,
  ReceiptMimeType,
} from "../domain/receipt-capture.js";

export interface RegisterReceiptPageInput {
  receiptId: UUID;
  clientPageId: UUID;
  pageIndex: number;
  storagePath: string;
  mimeType: ReceiptMimeType;
  byteSize: number;
  widthPx?: number | null;
  heightPx?: number | null;
  sha256?: string | null;
  capturedAt?: string | null;
  captureMethod: ReceiptCaptureMethod;
  metadata?: Record<string, unknown>;
}

export interface UploadReceiptPageInput {
  userId: UUID;
  receiptId: UUID;
  clientPageId: UUID;
  pageIndex: number;
  blob: Blob;
  mimeType: ReceiptMimeType;
  widthPx?: number | null;
  heightPx?: number | null;
  sha256?: string | null;
  capturedAt?: string | null;
  captureMethod: ReceiptCaptureMethod;
  metadata?: Record<string, unknown>;
}

export interface FinanceReceiptCaptureService {
  start(
    clientCaptureId: UUID,
    method: ReceiptCaptureMethod,
    deviceId?: string | null,
    metadata?: Record<string, unknown>,
  ): Promise<ReceiptCaptureStart>;

  get(receiptId: UUID): Promise<ReceiptCapture>;
  getQueue(limit?: number): Promise<readonly Record<string, unknown>[]>;

  uploadPage(input: UploadReceiptPageInput): Promise<UUID>;
  reorder(receiptId: UUID, pageIds: readonly UUID[]): Promise<void>;
  removePage(pageId: UUID, storagePath: string): Promise<void>;

  finalize(receiptId: UUID): Promise<ReceiptCapture>;
  cancel(receiptId: UUID, storagePaths: readonly string[]): Promise<void>;

  createPreviewUrl(storagePath: string, expiresInSeconds?: number): Promise<string>;
}
