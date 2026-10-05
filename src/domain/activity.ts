import type {
  AccountKind,
  CategoryKind,
  Necessity,
  TransactionStatus,
  TransactionType,
  UUID,
} from "./finance.js";

export type ActivityEntityKind = "transaction" | "receipt";
export type ActivitySource =
  | "manual"
  | "receipt"
  | "import"
  | "bank_sync"
  | "recurring"
  | "system";

export type ReceiptActivityStatus =
  | "captured"
  | "preprocessing"
  | "extracting"
  | "normalizing"
  | "classifying"
  | "review_required"
  | "confirmed"
  | "processing_failed"
  | "incomplete";

export interface ActivityAccountRef {
  id: UUID;
  name: string;
  kind: AccountKind;
  currencyCode: string;
  signedAmountMinor: number;
  reportingAmountMinor: number;
}

export interface ActivityCategoryRef {
  id: UUID;
  name: string;
  signedAmountMinor: number;
  reportingAmountMinor: number;
  necessity: Necessity | null;
  memo: string | null;
}

export interface ActivityItem {
  id: UUID;
  entityKind: ActivityEntityKind;
  occurredAt: string;
  transactionId: UUID | null;
  receiptId: UUID | null;
  transactionType: TransactionType | null;
  status: string;
  source: ActivitySource;
  merchantId: UUID | null;
  merchantName: string | null;
  title: string;
  description: string | null;
  note: string | null;
  currencyCode: string;
  amountMinor: number | null;
  financialEffect: boolean;
  hasReceipt: boolean;
  receiptStatuses: readonly ReceiptActivityStatus[];
  accounts: readonly ActivityAccountRef[];
  categories: readonly ActivityCategoryRef[];
  productIds: readonly UUID[];
  productNames: readonly string[];
  tagIds: readonly UUID[];
  tagNames: readonly string[];
  receiptIds: readonly UUID[];
  receiptCount: number;
  itemCount: number;
}

export interface ActivityCursor {
  occurredAt: string;
  entityKind: ActivityEntityKind;
  id: UUID;
}

export interface ActivitySearchFilters {
  q?: string;
  from?: string;
  to?: string;
  amountMinMinor?: number;
  amountMaxMinor?: number;
  accountIds?: readonly UUID[];
  merchantIds?: readonly UUID[];
  categoryIds?: readonly UUID[];
  productIds?: readonly UUID[];
  tagIds?: readonly UUID[];
  entityKinds?: readonly ActivityEntityKind[];
  transactionTypes?: readonly TransactionType[];
  transactionStatuses?: readonly TransactionStatus[];
  sources?: readonly ActivitySource[];
  necessities?: readonly Necessity[];
  receiptStatuses?: readonly ReceiptActivityStatus[];
  hasReceipt?: boolean;
  financialEffect?: boolean;
  includeUnconfirmedReceipts?: boolean;
  merchantName?: string;
  accountName?: string;
  categoryName?: string;
  productName?: string;
  tagName?: string;
}

export interface ActivitySearchPage {
  items: readonly ActivityItem[];
  nextCursor: ActivityCursor | null;
  hasMore: boolean;
}

export interface ActivityFilterAccount {
  id: UUID;
  name: string;
  kind: AccountKind;
  currencyCode: string;
  isArchived: boolean;
}

export interface ActivityFilterMerchant {
  id: UUID;
  name: string;
  merchantGroup: string | null;
}

export interface ActivityFilterCategory {
  id: UUID;
  parentId: UUID | null;
  name: string;
  kind: CategoryKind;
  necessityDefault: Necessity;
  systemKey: string | null;
}

export interface ActivityFilterTag {
  id: UUID;
  name: string;
}

export interface ActivityFilterProduct {
  id: UUID;
  name: string;
  brand: string | null;
  familyId: UUID | null;
  familyName: string | null;
  sizeValue: number | null;
  sizeUnit: string | null;
  lastSeenAt: string | null;
}

export interface ActivityFilterCatalog {
  accounts: readonly ActivityFilterAccount[];
  merchants: readonly ActivityFilterMerchant[];
  categories: readonly ActivityFilterCategory[];
  tags: readonly ActivityFilterTag[];
  products: readonly ActivityFilterProduct[];
}

export interface TransactionActivityDetail {
  entityKind: "transaction";
  activity: ActivityItem & Record<string, unknown>;
  ledgerEntries: readonly Record<string, unknown>[];
  tags: readonly ActivityFilterTag[];
  receiptMatches: readonly Record<string, unknown>[];
  relatedTransaction: Record<string, unknown> | null;
}

export interface ReceiptActivityDetail {
  entityKind: "receipt";
  receipt: Record<string, unknown>;
  transactionMatches: readonly Record<string, unknown>[];
}

export type ActivityDetail =
  | TransactionActivityDetail
  | ReceiptActivityDetail;
