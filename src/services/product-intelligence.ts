import type { RuleSource } from "../domain/classification.js";
import type { Necessity, UUID } from "../domain/finance.js";
import type {
  CreateProductInput,
  ProductAliasResolution,
  ProductAssignmentResult,
  ProductCandidate,
  ProductDetail,
  ProductFamily,
  ProductNormalizationQueueItem,
  ProductSummary,
  ProductAnalytics,
  ProductAnalyticsRequest,
  ProductCatalog,
  ProductCatalogRequest,
} from "../domain/product-intelligence.js";

export interface UpsertProductFamilyInput {
  name: string;
  brand?: string | null;
  productType?: string | null;
  defaultCategoryId?: UUID | null;
  defaultNecessity?: Necessity;
  metadata?: Record<string, unknown>;
}

export interface FinanceProductIntelligenceService {
  upsertFamily(input: UpsertProductFamilyInput): Promise<UUID>;
  upsertProduct(input: CreateProductInput): Promise<UUID>;

  addAlias(input: {
    productId: UUID;
    rawAlias: string;
    merchantId?: UUID | null;
    source?: RuleSource;
    confidence?: number | null;
    confirm?: boolean;
  }): Promise<UUID>;

  resolveAlias(
    rawName: string,
    merchantId?: UUID | null,
  ): Promise<ProductAliasResolution>;

  normalizeItemByAlias(
    receiptItemId: UUID,
    normalizationVersion?: string,
  ): Promise<ProductAssignmentResult | ProductAliasResolution>;

  normalizeReceiptByAlias(
    receiptId: UUID,
    normalizationVersion?: string,
  ): Promise<{
    receiptId: UUID;
    matchedCount: number;
    reviewCount: number;
    queue: readonly ProductNormalizationQueueItem[];
  }>;

  createAndAssignCandidate(
    receiptItemId: UUID,
    candidate: ProductCandidate,
    options?: {
      normalizationVersion?: string;
      userConfirmed?: boolean;
    },
  ): Promise<ProductAssignmentResult>;

  correctItemProduct(
    receiptItemId: UUID,
    productId: UUID,
    learnMerchantAlias?: boolean,
    normalizationVersion?: string,
  ): Promise<ProductAssignmentResult>;

  getQueue(
    receiptId?: UUID | null,
    limit?: number,
  ): Promise<readonly ProductNormalizationQueueItem[]>;

  getProducts(): Promise<readonly ProductSummary[]>;
  getFamilies(): Promise<readonly ProductFamily[]>;
  getProductDetail(productId: UUID): Promise<ProductDetail>;

  getCatalog(request?: ProductCatalogRequest): Promise<ProductCatalog>;
  getProductAnalytics(
    request: ProductAnalyticsRequest,
  ): Promise<ProductAnalytics>;
}
