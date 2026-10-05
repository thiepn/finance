import type { UUID } from "./finance.js";

export type ReceiptCaptureMethod = "camera" | "gallery" | "file" | "import";
export type ReceiptCaptureStatus = "draft" | "uploading" | "ready" | "cancelled";
export type ReceiptProcessingStatus =
  | "captured"
  | "preprocessing"
  | "extracting"
  | "normalizing"
  | "classifying"
  | "review_required"
  | "confirmed"
  | "processing_failed"
  | "incomplete";

export type ReceiptPageStatus = "uploaded" | "ready" | "failed";

export type ReceiptMimeType =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "image/heic"
  | "image/heif"
  | "application/pdf";

export interface ReceiptPage {
  id: UUID;
  clientPageId: UUID;
  pageIndex: number;
  storagePath: string;
  mimeType: ReceiptMimeType;
  byteSize: number;
  widthPx: number | null;
  heightPx: number | null;
  sha256: string | null;
  capturedAt: string | null;
  captureMethod: ReceiptCaptureMethod;
  status: ReceiptPageStatus;
  errorText: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ReceiptCapture {
  id: UUID;
  clientCaptureId: UUID;
  captureMethod: ReceiptCaptureMethod;
  captureStatus: ReceiptCaptureStatus;
  processingStatus: ReceiptProcessingStatus;
  captureDeviceId: string | null;
  captureStartedAt: string;
  captureFinalizedAt: string | null;
  captureCancelledAt: string | null;
  captureMetadata: Record<string, unknown>;
  merchantId: UUID | null;
  purchasedAt: string | null;
  currencyCode: string;
  totalMinor: number | null;
  bucket: "finance-receipts";
  pages: readonly ReceiptPage[];
}

export interface ReceiptCaptureStart {
  receiptId: UUID;
  clientCaptureId: UUID;
  captureStatus: ReceiptCaptureStatus;
  processingStatus: ReceiptProcessingStatus;
  bucket: "finance-receipts";
  storagePrefix: string;
}

export type LocalReceiptPageState =
  | "local"
  | "uploading"
  | "uploaded"
  | "pending-delete"
  | "failed";

export interface LocalReceiptPage {
  clientPageId: UUID;
  serverPageId: UUID | null;
  pageIndex: number;
  blob: Blob;
  mimeType: ReceiptMimeType;
  byteSize: number;
  widthPx: number | null;
  heightPx: number | null;
  sha256: string | null;
  capturedAt: string;
  captureMethod: ReceiptCaptureMethod;
  storagePath: string | null;
  state: LocalReceiptPageState;
  errorText: string | null;
}

export interface LocalReceiptCaptureDraft {
  clientCaptureId: UUID;
  receiptId: UUID | null;
  userId: UUID;
  deviceId: string | null;
  method: ReceiptCaptureMethod;
  state: "capturing" | "syncing" | "ready" | "cancelled" | "error";
  pages: LocalReceiptPage[];
  createdAt: string;
  updatedAt: string;
  errorText: string | null;
}

export interface PreparedReceiptImage {
  blob: Blob;
  mimeType: ReceiptMimeType;
  byteSize: number;
  widthPx: number | null;
  heightPx: number | null;
  sha256: string;
}
