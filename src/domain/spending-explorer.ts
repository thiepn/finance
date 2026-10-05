import type { OverviewPeriodKind } from "./overview.js";
import type { UUID } from "./finance.js";

export type ExplorerNecessity =
  | "essential"
  | "flexible"
  | "discretionary"
  | "unclassified";

export interface ExplorerBreadcrumbItem {
  categoryId: UUID;
  name: string;
}

export interface ExplorerScope {
  categoryId: UUID | null;
  merchantId: UUID | null;
  necessity: ExplorerNecessity | null;
  categoryName: string | null;
  merchantName: string | null;
  breadcrumb: readonly ExplorerBreadcrumbItem[];
}

export interface ExplorerPeriod {
  start: string;
  end: string;
  compareStart: string;
  compareEnd: string;
}

export interface ExplorerProfile {
  currencyCode: string;
  locale: string;
  timeZone: string;
}

export interface ExplorerPeriodSummary {
  grossSpendMinor: number;
  recoveriesMinor: number;
  netSpendMinor: number;
  transactionCount: number;
}

export interface ExplorerSummary {
  current: ExplorerPeriodSummary;
  comparison: ExplorerPeriodSummary;
  deltaMinor: number;
  deltaRatio: number | null;
  itemizedEvidenceMinor: number;
  itemizedCoverageRatio: number | null;
}

export interface ExplorerSeriesPoint {
  bucketIndex: number;
  bucketStart: string;
  bucketEnd: string;
  netSpendMinor: number;
  grossSpendMinor: number;
  recoveriesMinor: number;
  transactionCount: number;
}

export interface ExplorerCategoryRow {
  categoryId: UUID;
  name: string;
  currentMinor: number;
  previousMinor: number;
  deltaMinor: number;
  deltaRatio: number | null;
  share: number | null;
  transactionCount: number;
  hasChildren: boolean;
}

export interface ExplorerMerchantRow {
  merchantId: UUID | null;
  name: string;
  currentMinor: number;
  previousMinor: number;
  deltaMinor: number;
  deltaRatio: number | null;
  share: number | null;
  transactionCount: number;
}

export interface ExplorerNecessityRow {
  necessity: ExplorerNecessity;
  label: string;
  currentMinor: number;
  previousMinor: number;
  deltaMinor: number;
  deltaRatio: number | null;
  share: number | null;
}

export interface ExplorerProductRow {
  productId: UUID;
  name: string;
  brand: string | null;
  familyId: UUID | null;
  familyName: string | null;
  productType: string | null;
  currentItemizedMinor: number;
  previousItemizedMinor: number;
  deltaMinor: number;
  deltaRatio: number | null;
  purchaseCount: number;
  quantity: number;
  shareOfItemized: number | null;
}

export interface SpendingExplorer {
  periodKind: OverviewPeriodKind;
  anchorDate: string;
  profile: ExplorerProfile;
  period: ExplorerPeriod;
  bucketKind: "day" | "week" | "month" | "quarter" | "year";
  scope: ExplorerScope;
  summary: ExplorerSummary;
  series: {
    current: readonly ExplorerSeriesPoint[];
    comparison: readonly ExplorerSeriesPoint[];
  };
  children: readonly ExplorerCategoryRow[];
  directCategoryMinor: number | null;
  merchants: readonly ExplorerMerchantRow[];
  necessities: readonly ExplorerNecessityRow[];
  products: readonly ExplorerProductRow[];
}

export interface SpendingExplorerRequest {
  periodKind?: OverviewPeriodKind;
  anchorDate?: string | null;
  categoryId?: UUID | null;
  merchantId?: UUID | null;
  necessity?: ExplorerNecessity | null;
  limit?: number;
}

export interface ProductEvidenceProduct {
  productId: UUID;
  name: string;
  brand: string | null;
  familyId: UUID | null;
  familyName: string | null;
  productType: string | null;
  sizeValue: number | null;
  sizeUnit: string | null;
}

export interface ProductPurchaseEvidenceRow {
  receiptItemId: UUID;
  receiptId: UUID;
  occurredAt: string;
  transactionIds: readonly UUID[];
  merchantId: UUID | null;
  merchantName: string;
  quantity: number;
  unitPriceMinor: number | null;
  effectiveTotalMinor: number;
  discountMinor: number;
  depositMinor: number;
  categoryId: UUID | null;
  categoryName: string | null;
  necessity: ExplorerNecessity;
}

export interface ProductPurchaseEvidence {
  product: ProductEvidenceProduct;
  period: {
    start: string;
    end: string;
  };
  purchases: readonly ProductPurchaseEvidenceRow[];
}

export interface ProductPurchaseEvidenceRequest {
  productId: UUID;
  periodStart: string;
  periodEnd: string;
  merchantId?: UUID | null;
  limit?: number;
}
