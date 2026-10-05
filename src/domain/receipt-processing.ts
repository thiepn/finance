import type { UUID } from "./finance.js";
import type {
  ReceiptCapture,
  ReceiptMimeType,
  ReceiptPage,
} from "./receipt-capture.js";

export type ReceiptLineKind =
  | "item"
  | "discount"
  | "deposit"
  | "deposit_return"
  | "return"
  | "fee"
  | "subtotal"
  | "tax"
  | "total"
  | "payment"
  | "informational"
  | "unknown";

export type ReceiptReconciliationStatus =
  | "not_run"
  | "exact"
  | "within_tolerance"
  | "mismatch"
  | "insufficient_data";

export type ReceiptPipelineMode = "local" | "hybrid" | "cloud";

export interface ReceiptOcrPage {
  pageId: UUID;
  pageIndex: number;
  rawText: string;
  confidence: number | null;
  blocks?: unknown;
  metadata: Record<string, unknown>;
}

export interface ExtractedReceiptHeader {
  merchantName?: string;
  merchantAddress?: string;
  purchasedAt?: string;
  currencyCode?: string;
  subtotalMinor?: number;
  taxMinor?: number;
  discountMinor?: number;
  depositMinor?: number;
  totalMinor?: number;
  receiptNumber?: string;
  paymentMethod?: string;
  locale?: string;
  confidence?: number;
}

export interface ExtractedReceiptLine {
  pageId: UUID;
  lineIndex: number;
  pageLineIndex: number;
  rawText: string;
  normalizedText?: string;
  kind: ReceiptLineKind;
  amountMinor?: number;
  quantity?: number;
  unitPriceMinor?: number;
  confidence?: number;
  bbox?: unknown;
  metadata: Record<string, unknown>;
}

export interface ExtractedReceiptItem {
  lineIndex: number;
  sourceLineIndex: number;
  rawName: string;
  normalizedName?: string;
  quantity: number;
  unitPriceMinor?: number;
  lineTotalMinor: number;
  discountMinor: number;
  depositMinor: number;
  effectiveTotalMinor: number;
  confidence?: number;
  reviewRequired: boolean;
  metadata: Record<string, unknown>;
}

export interface StructuredReceiptExtraction {
  header: ExtractedReceiptHeader;
  pages: readonly ReceiptOcrPage[];
  lines: readonly ExtractedReceiptLine[];
  items: readonly ExtractedReceiptItem[];
}

export interface ReceiptProcessingRunStart {
  runId: UUID;
  receiptId: UUID;
}

export interface ReceiptProcessingSummary {
  receiptId: UUID;
  processingStatus: string;
  currentProcessingRunId: UUID | null;
  merchantId: UUID | null;
  merchantRawName: string | null;
  merchantAddressRaw: string | null;
  purchasedAt: string | null;
  receiptNumber: string | null;
  paymentMethodRaw: string | null;
  locale: string | null;
  currencyCode: string;
  subtotalMinor: number | null;
  taxMinor: number | null;
  discountMinor: number;
  depositMinor: number;
  totalMinor: number | null;
  overallConfidence: number | null;
  reconciliationStatus: ReceiptReconciliationStatus;
  reconciliationDeltaMinor: number | null;
  reviewReasons: readonly string[];
}

export interface ReceiptProcessingResult {
  summary: ReceiptProcessingSummary;
  run: Record<string, unknown> | null;
  pages: readonly Record<string, unknown>[];
  lines: readonly Record<string, unknown>[];
  items: readonly Record<string, unknown>[];
}

export interface ReceiptOcrProvider {
  readonly providerId: string;
  readonly modelId: string;
  supports(mimeType: ReceiptMimeType): boolean;
  recognize(page: ReceiptPage, image: Blob): Promise<ReceiptOcrPage>;
  close(): Promise<void>;
}

export interface ReceiptStructuredParser {
  readonly parserId: string;
  readonly parserVersion: string;
  parse(capture: ReceiptCapture, pages: readonly ReceiptOcrPage[]): StructuredReceiptExtraction;
}

export interface ReceiptMultimodalExtractor {
  readonly providerId: string;
  readonly modelId: string;
  supports(mimeType: ReceiptMimeType): boolean;
  extract(
    capture: ReceiptCapture,
    pages: readonly { page: ReceiptPage; blob: Blob }[],
  ): Promise<StructuredReceiptExtraction>;
}
