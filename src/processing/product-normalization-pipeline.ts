import type { UUID } from "../domain/finance.js";
import type {
  ProductNormalizationReviewCandidate,
  ReceiptProductNormalizationOutcome,
} from "../domain/product-intelligence.js";
import type { FinanceProductIntelligenceService } from "../services/product-intelligence.js";
import { DeterministicProductNormalizer } from "./product-normalizer.js";

export interface ProductNormalizationPipelineOptions {
  autoCreateConfidence?: number;
  normalizationVersion?: string;
}

export class ProductNormalizationPipeline {
  private readonly autoCreateConfidence: number;
  private readonly normalizationVersion: string;

  constructor(
    private readonly service: FinanceProductIntelligenceService,
    private readonly normalizer = new DeterministicProductNormalizer(),
    options: ProductNormalizationPipelineOptions = {},
  ) {
    this.autoCreateConfidence = options.autoCreateConfidence ?? 0.92;
    this.normalizationVersion =
      options.normalizationVersion ?? this.normalizer.version;
  }

  async normalizeReceipt(
    receiptId: UUID,
  ): Promise<ReceiptProductNormalizationOutcome> {
    const aliasPass = await this.service.normalizeReceiptByAlias(
      receiptId,
      this.normalizationVersion,
    );

    let autoCreatedCount = 0;
    const reviewCandidates: ProductNormalizationReviewCandidate[] = [];

    for (const item of aliasPass.queue) {
      const candidate = this.normalizer.normalize({
        rawName: item.rawName,
        merchantName: item.merchantName,
      });

      if (candidate.confidence < this.autoCreateConfidence) {
        reviewCandidates.push({
          item,
          candidate,
          reason: "low_confidence",
        });
        continue;
      }

      try {
        await this.service.createAndAssignCandidate(
          item.receiptItemId,
          candidate,
          {
            normalizationVersion: this.normalizationVersion,
            userConfirmed: false,
          },
        );
        autoCreatedCount += 1;
      } catch (error) {
        reviewCandidates.push({
          item,
          candidate,
          reason: "auto_create_failed",
          errorText: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const remainingQueue = await this.service.getQueue(receiptId, 500);

    return {
      receiptId,
      aliasMatchedCount: aliasPass.matchedCount,
      autoCreatedCount,
      reviewCandidates,
      remainingQueue,
    };
  }
}
