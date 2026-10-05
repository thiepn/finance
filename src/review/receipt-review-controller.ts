import type { UUID } from "../domain/finance.js";
import type { ProductCandidate } from "../domain/product-intelligence.js";
import type {
  ReceiptHeaderReviewPatch,
  ReceiptItemReviewPatch,
  ReceiptReviewIssue,
  ReceiptReviewItem,
  ReceiptReviewSnapshot,
  ReceiptReviewViewModel,
} from "../domain/receipt-review.js";
import { DeterministicProductNormalizer } from "../processing/product-normalizer.js";
import type { FinanceReceiptCaptureService } from "../services/receipt-capture.js";
import type { FinanceReceiptReviewService } from "../services/receipt-review.js";

const ISSUE_PRIORITY: Readonly<Record<string, number>> = {
  total_missing: 10,
  purchase_time_missing: 20,
  merchant_missing: 30,
  merchant_unresolved: 31,
  items_missing: 40,
  arithmetic_mismatch: 50,
  reconciliation_insufficient: 51,
  item_review_required: 60,
  product_normalization_required: 70,
  low_confidence: 80,
};

export function choosePrimaryReceiptIssue(
  issues: readonly ReceiptReviewIssue[],
): ReceiptReviewIssue | null {
  return (
    [...issues].sort(
      (a, b) =>
        (ISSUE_PRIORITY[a.code] ?? 999) - (ISSUE_PRIORITY[b.code] ?? 999),
    )[0] ?? null
  );
}

export function receiptItemNeedsAttention(item: ReceiptReviewItem): boolean {
  if (item.isExcluded) return false;

  const needsOcrReview =
    item.ocrReviewRequired && item.reviewedAt === null;
  const needsProductReview =
    item.normalizationStatus === "pending" ||
    item.normalizationStatus === "review_required";

  return needsOcrReview || needsProductReview;
}

export interface ReceiptReviewControllerOptions {
  previewExpiresInSeconds?: number;
}

export class ReceiptReviewController {
  private readonly previewExpiresInSeconds: number;

  constructor(
    private readonly reviewService: FinanceReceiptReviewService,
    private readonly captureService: FinanceReceiptCaptureService,
    private readonly productNormalizer = new DeterministicProductNormalizer(),
    options: ReceiptReviewControllerOptions = {},
  ) {
    this.previewExpiresInSeconds = options.previewExpiresInSeconds ?? 600;
  }

  private async decorate(
    snapshot: ReceiptReviewSnapshot,
  ): Promise<ReceiptReviewViewModel> {
    const pages = await Promise.all(
      snapshot.pages.map(async (page) => ({
        ...page,
        previewUrl: await this.captureService.createPreviewUrl(
          page.storagePath,
          this.previewExpiresInSeconds,
        ),
      })),
    );

    const items = snapshot.items.map((item) => {
      const needsAttention = receiptItemNeedsAttention(item);
      const needsProductSuggestion =
        !item.isExcluded &&
        (item.normalizationStatus === "pending" ||
          item.normalizationStatus === "review_required");

      const suggestedProduct = needsProductSuggestion
        ? this.productNormalizer.normalize({
            rawName: item.rawName,
            merchantName:
              snapshot.receipt.merchantName ??
              snapshot.receipt.merchantRawName,
          })
        : null;

      return {
        ...item,
        needsAttention,
        suggestedProduct,
      };
    });

    return {
      ...snapshot,
      pages,
      items,
      primaryIssue: choosePrimaryReceiptIssue(snapshot.issues),
      attentionItemIds: items
        .filter((item) => item.needsAttention)
        .map((item) => item.id),
    };
  }

  async open(receiptId: UUID): Promise<ReceiptReviewViewModel> {
    return this.decorate(await this.reviewService.start(receiptId));
  }

  async refresh(receiptId: UUID): Promise<ReceiptReviewViewModel> {
    return this.decorate(await this.reviewService.get(receiptId));
  }

  async acceptHeader(
    receiptId: UUID,
    note?: string | null,
  ): Promise<ReceiptReviewViewModel> {
    return this.decorate(
      await this.reviewService.acceptHeader(receiptId, note),
    );
  }

  async updateHeader(
    receiptId: UUID,
    patch: ReceiptHeaderReviewPatch,
    note?: string | null,
  ): Promise<ReceiptReviewViewModel> {
    return this.decorate(
      await this.reviewService.updateHeader(receiptId, patch, note),
    );
  }

  async acceptItem(
    receiptItemId: UUID,
    note?: string | null,
  ): Promise<ReceiptReviewViewModel> {
    return this.decorate(
      await this.reviewService.acceptItem(receiptItemId, note),
    );
  }

  async updateItem(
    receiptItemId: UUID,
    patch: ReceiptItemReviewPatch,
    note?: string | null,
  ): Promise<ReceiptReviewViewModel> {
    return this.decorate(
      await this.reviewService.updateItem(receiptItemId, patch, note),
    );
  }

  async excludeItem(
    receiptItemId: UUID,
    note?: string | null,
  ): Promise<ReceiptReviewViewModel> {
    return this.decorate(
      await this.reviewService.setItemExcluded(
        receiptItemId,
        true,
        note,
      ),
    );
  }

  async restoreItem(
    receiptItemId: UUID,
    note?: string | null,
  ): Promise<ReceiptReviewViewModel> {
    return this.decorate(
      await this.reviewService.setItemExcluded(
        receiptItemId,
        false,
        note,
      ),
    );
  }

  async skipProduct(
    receiptItemId: UUID,
    note?: string | null,
  ): Promise<ReceiptReviewViewModel> {
    return this.decorate(
      await this.reviewService.skipProduct(receiptItemId, note),
    );
  }

  async chooseExistingProduct(
    receiptItemId: UUID,
    productId: UUID,
    note?: string | null,
  ): Promise<ReceiptReviewViewModel> {
    return this.decorate(
      await this.reviewService.assignProduct(receiptItemId, productId, {
        learnMerchantAlias: true,
        note: note ?? null,
      }),
    );
  }

  async acceptSuggestedProduct(
    receiptItemId: UUID,
    candidate: ProductCandidate,
    note?: string | null,
  ): Promise<ReceiptReviewViewModel> {
    return this.decorate(
      await this.reviewService.createProduct(
        receiptItemId,
        candidate,
        note,
      ),
    );
  }

  async waiveMismatch(
    receiptId: UUID,
    reason: "arithmetic_mismatch" | "reconciliation_insufficient",
    note: string,
  ): Promise<ReceiptReviewViewModel> {
    return this.decorate(
      await this.reviewService.waive(receiptId, reason, note),
    );
  }

  async confirm(receiptId: UUID): Promise<ReceiptReviewViewModel> {
    return this.decorate(await this.reviewService.confirm(receiptId));
  }
}
