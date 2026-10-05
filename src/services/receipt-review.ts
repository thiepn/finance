import type { UUID } from "../domain/finance.js";
import type { ProductCandidate } from "../domain/product-intelligence.js";
import type {
  ReceiptHeaderReviewPatch,
  ReceiptItemReviewPatch,
  ReceiptReviewQueueEntry,
  ReceiptReviewSnapshot,
} from "../domain/receipt-review.js";

export interface FinanceReceiptReviewService {
  get(receiptId: UUID): Promise<ReceiptReviewSnapshot>;
  getQueue(limit?: number): Promise<readonly ReceiptReviewQueueEntry[]>;

  start(receiptId: UUID): Promise<ReceiptReviewSnapshot>;
  acceptHeader(receiptId: UUID, note?: string | null): Promise<ReceiptReviewSnapshot>;
  updateHeader(
    receiptId: UUID,
    patch: ReceiptHeaderReviewPatch,
    note?: string | null,
  ): Promise<ReceiptReviewSnapshot>;

  acceptItem(
    receiptItemId: UUID,
    note?: string | null,
  ): Promise<ReceiptReviewSnapshot>;
  updateItem(
    receiptItemId: UUID,
    patch: ReceiptItemReviewPatch,
    note?: string | null,
  ): Promise<ReceiptReviewSnapshot>;
  setItemExcluded(
    receiptItemId: UUID,
    excluded: boolean,
    note?: string | null,
  ): Promise<ReceiptReviewSnapshot>;
  skipProduct(
    receiptItemId: UUID,
    note?: string | null,
  ): Promise<ReceiptReviewSnapshot>;

  assignProduct(
    receiptItemId: UUID,
    productId: UUID,
    options?: {
      learnMerchantAlias?: boolean;
      note?: string | null;
    },
  ): Promise<ReceiptReviewSnapshot>;

  createProduct(
    receiptItemId: UUID,
    candidate: ProductCandidate,
    note?: string | null,
  ): Promise<ReceiptReviewSnapshot>;

  waive(
    receiptId: UUID,
    reason:
      | "arithmetic_mismatch"
      | "reconciliation_insufficient"
      | "low_confidence",
    note: string,
  ): Promise<ReceiptReviewSnapshot>;

  confirm(receiptId: UUID): Promise<ReceiptReviewSnapshot>;
}
