import type {
  ActivityAccountRef,
  ActivityCategoryRef,
  ActivityCursor,
  ActivityDetail,
  ActivityEntityKind,
  ActivityFilterCatalog,
  ActivityFilterCategory,
  ActivityFilterProduct,
  ActivityItem,
  ActivitySearchFilters,
  ActivitySearchPage,
  ReceiptActivityDetail,
  ReceiptActivityStatus,
  TransactionActivityDetail,
} from "../domain/activity.js";
import type {
  AccountKind,
  CategoryKind,
  Necessity,
  TransactionStatus,
  TransactionType,
  UUID,
} from "../domain/finance.js";
import type { FinanceActivityService } from "./activity.js";
import type { SupabaseRpcClient } from "./supabase-ledger.js";

function rpcError(
  result: { error: { message: string } | null },
  operation: string,
): void {
  if (result.error) {
    throw new Error(`Finance ${operation}: ${result.error.message}`);
  }
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function nullableNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

function parseAccount(value: unknown): ActivityAccountRef {
  const raw = record(value, "activity account");
  return {
    id: String(raw.id),
    name: String(raw.name),
    kind: String(raw.kind) as AccountKind,
    currencyCode: String(raw.currency_code),
    signedAmountMinor: Number(raw.signed_amount_minor),
    reportingAmountMinor: Number(raw.reporting_amount_minor),
  };
}

function parseCategory(value: unknown): ActivityCategoryRef {
  const raw = record(value, "activity category");
  return {
    id: String(raw.id),
    name: String(raw.name),
    signedAmountMinor: Number(raw.signed_amount_minor),
    reportingAmountMinor: Number(raw.reporting_amount_minor),
    necessity:
      raw.necessity === null || raw.necessity === undefined
        ? null
        : (String(raw.necessity) as Necessity),
    memo: nullableString(raw.memo),
  };
}

function parseActivityItem(raw: Record<string, unknown>): ActivityItem {
  return {
    id: String(raw.id),
    entityKind: String(raw.entity_kind) as ActivityEntityKind,
    occurredAt: String(raw.occurred_at),
    transactionId: nullableString(raw.transaction_id),
    receiptId: nullableString(raw.receipt_id),
    transactionType:
      raw.transaction_type === null || raw.transaction_type === undefined
        ? null
        : (String(raw.transaction_type) as TransactionType),
    status: String(raw.status),
    source: String(raw.source) as ActivityItem["source"],
    merchantId: nullableString(raw.merchant_id),
    merchantName: nullableString(raw.merchant_name),
    title: String(raw.title),
    description: nullableString(raw.description),
    note: nullableString(raw.note),
    currencyCode: String(raw.currency_code),
    amountMinor: nullableNumber(raw.amount_minor),
    financialEffect: Boolean(raw.financial_effect),
    hasReceipt: Boolean(raw.has_receipt),
    receiptStatuses: Array.isArray(raw.receipt_statuses)
      ? (raw.receipt_statuses.map(String) as ReceiptActivityStatus[])
      : [],
    accounts: Array.isArray(raw.accounts)
      ? raw.accounts.map(parseAccount)
      : [],
    categories: Array.isArray(raw.categories)
      ? raw.categories.map(parseCategory)
      : [],
    productIds: Array.isArray(raw.product_ids)
      ? raw.product_ids.map(String)
      : [],
    productNames: Array.isArray(raw.product_names)
      ? raw.product_names.map(String)
      : [],
    tagIds: Array.isArray(raw.tag_ids)
      ? raw.tag_ids.map(String)
      : [],
    tagNames: Array.isArray(raw.tag_names)
      ? raw.tag_names.map(String)
      : [],
    receiptIds: Array.isArray(raw.receipt_ids)
      ? raw.receipt_ids.map(String)
      : [],
    receiptCount: Number(raw.receipt_count ?? 0),
    itemCount: Number(raw.item_count ?? 0),
  };
}

function filtersPayload(
  filters: ActivitySearchFilters,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  if (filters.q !== undefined) payload.q = filters.q;
  if (filters.from !== undefined) payload.from = filters.from;
  if (filters.to !== undefined) payload.to = filters.to;
  if (filters.amountMinMinor !== undefined) {
    payload.amount_min_minor = filters.amountMinMinor;
  }
  if (filters.amountMaxMinor !== undefined) {
    payload.amount_max_minor = filters.amountMaxMinor;
  }
  if (filters.accountIds !== undefined) payload.account_ids = filters.accountIds;
  if (filters.merchantIds !== undefined) payload.merchant_ids = filters.merchantIds;
  if (filters.categoryIds !== undefined) payload.category_ids = filters.categoryIds;
  if (filters.productIds !== undefined) payload.product_ids = filters.productIds;
  if (filters.tagIds !== undefined) payload.tag_ids = filters.tagIds;
  if (filters.entityKinds !== undefined) payload.entity_kinds = filters.entityKinds;
  if (filters.transactionTypes !== undefined) {
    payload.transaction_types = filters.transactionTypes;
  }
  if (filters.transactionStatuses !== undefined) {
    payload.transaction_statuses = filters.transactionStatuses;
  }
  if (filters.sources !== undefined) payload.sources = filters.sources;
  if (filters.necessities !== undefined) payload.necessities = filters.necessities;
  if (filters.receiptStatuses !== undefined) {
    payload.receipt_statuses = filters.receiptStatuses;
  }
  if (filters.hasReceipt !== undefined) payload.has_receipt = filters.hasReceipt;
  if (filters.financialEffect !== undefined) {
    payload.financial_effect = filters.financialEffect;
  }
  if (filters.includeUnconfirmedReceipts !== undefined) {
    payload.include_unconfirmed_receipts = filters.includeUnconfirmedReceipts;
  }
  if (filters.merchantName !== undefined) payload.merchant_name = filters.merchantName;
  if (filters.accountName !== undefined) payload.account_name = filters.accountName;
  if (filters.categoryName !== undefined) payload.category_name = filters.categoryName;
  if (filters.productName !== undefined) payload.product_name = filters.productName;
  if (filters.tagName !== undefined) payload.tag_name = filters.tagName;

  return payload;
}

function cursorPayload(
  cursor: ActivityCursor | null | undefined,
): Record<string, unknown> | null {
  if (!cursor) return null;
  return {
    occurred_at: cursor.occurredAt,
    entity_kind: cursor.entityKind,
    id: cursor.id,
  };
}

function parseCursor(value: unknown): ActivityCursor | null {
  if (value === null || value === undefined) return null;
  const raw = record(value, "activity cursor");
  return {
    occurredAt: String(raw.occurred_at),
    entityKind: String(raw.entity_kind) as ActivityEntityKind,
    id: String(raw.id),
  };
}

function parseFilterCategory(value: unknown): ActivityFilterCategory {
  const raw = record(value, "activity filter category");
  return {
    id: String(raw.id),
    parentId: nullableString(raw.parent_id),
    name: String(raw.name),
    kind: String(raw.kind) as CategoryKind,
    necessityDefault: String(raw.necessity_default) as Necessity,
    systemKey: nullableString(raw.system_key),
  };
}

function parseFilterProduct(value: unknown): ActivityFilterProduct {
  const raw = record(value, "activity filter product");
  return {
    id: String(raw.id),
    name: String(raw.name),
    brand: nullableString(raw.brand),
    familyId: nullableString(raw.family_id),
    familyName: nullableString(raw.family_name),
    sizeValue: nullableNumber(raw.size_value),
    sizeUnit: nullableString(raw.size_unit),
    lastSeenAt: nullableString(raw.last_seen_at),
  };
}

export class SupabaseFinanceActivityService implements FinanceActivityService {
  constructor(private readonly client: SupabaseRpcClient) {}

  async search(
    filters: ActivitySearchFilters = {},
    limit = 50,
    cursor: ActivityCursor | null = null,
  ): Promise<ActivitySearchPage> {
    const result = await this.client.rpc<Record<string, unknown>>(
      "finance_search_activity",
      {
        p_filters: filtersPayload(filters),
        p_limit: limit,
        p_cursor: cursorPayload(cursor),
      },
    );
    rpcError(result, "searchActivity");
    if (!result.data) throw new Error("Activity search returned no data");

    return {
      items: Array.isArray(result.data.items)
        ? result.data.items.map((value) =>
            parseActivityItem(record(value, "activity item")),
          )
        : [],
      nextCursor: parseCursor(result.data.next_cursor),
      hasMore: Boolean(result.data.has_more),
    };
  }

  async getDetail(
    entityKind: ActivityEntityKind,
    entityId: UUID,
  ): Promise<ActivityDetail> {
    const result = await this.client.rpc<Record<string, unknown>>(
      "finance_get_activity_detail",
      {
        p_entity_kind: entityKind,
        p_entity_id: entityId,
      },
    );
    rpcError(result, "getActivityDetail");
    if (!result.data) throw new Error("Activity detail returned no data");

    if (result.data.entity_kind === "transaction") {
      const rawActivity = record(result.data.activity, "transaction activity");
      const detail: TransactionActivityDetail = {
        entityKind: "transaction",
        activity: parseActivityItem(rawActivity),
        ledgerEntries: Array.isArray(result.data.ledger_entries)
          ? (result.data.ledger_entries as Record<string, unknown>[])
          : [],
        tags: Array.isArray(result.data.tags)
          ? result.data.tags.map((value) => {
              const raw = record(value, "activity tag");
              return { id: String(raw.id), name: String(raw.name) };
            })
          : [],
        receiptMatches: Array.isArray(result.data.receipt_matches)
          ? (result.data.receipt_matches as Record<string, unknown>[])
          : [],
        relatedTransaction:
          result.data.related_transaction &&
          typeof result.data.related_transaction === "object"
            ? (result.data.related_transaction as Record<string, unknown>)
            : null,
      };
      return detail;
    }

    if (result.data.entity_kind === "receipt") {
      const detail: ReceiptActivityDetail = {
        entityKind: "receipt",
        receipt: record(result.data.receipt, "receipt activity detail"),
        transactionMatches: Array.isArray(result.data.transaction_matches)
          ? (result.data.transaction_matches as Record<string, unknown>[])
          : [],
      };
      return detail;
    }

    throw new TypeError("Activity detail returned an unknown entity kind");
  }

  async getFilterCatalog(
    productQuery: string | null = null,
    productLimit = 50,
  ): Promise<ActivityFilterCatalog> {
    const result = await this.client.rpc<Record<string, unknown>>(
      "finance_get_activity_filter_catalog",
      {
        p_product_query: productQuery,
        p_product_limit: productLimit,
      },
    );
    rpcError(result, "getActivityFilterCatalog");
    if (!result.data) throw new Error("Activity filter catalog returned no data");

    return {
      accounts: Array.isArray(result.data.accounts)
        ? result.data.accounts.map((value) => {
            const raw = record(value, "filter account");
            return {
              id: String(raw.id),
              name: String(raw.name),
              kind: String(raw.kind) as AccountKind,
              currencyCode: String(raw.currency_code),
              isArchived: Boolean(raw.is_archived),
            };
          })
        : [],
      merchants: Array.isArray(result.data.merchants)
        ? result.data.merchants.map((value) => {
            const raw = record(value, "filter merchant");
            return {
              id: String(raw.id),
              name: String(raw.name),
              merchantGroup: nullableString(raw.merchant_group),
            };
          })
        : [],
      categories: Array.isArray(result.data.categories)
        ? result.data.categories.map(parseFilterCategory)
        : [],
      tags: Array.isArray(result.data.tags)
        ? result.data.tags.map((value) => {
            const raw = record(value, "filter tag");
            return { id: String(raw.id), name: String(raw.name) };
          })
        : [],
      products: Array.isArray(result.data.products)
        ? result.data.products.map(parseFilterProduct)
        : [],
    };
  }
}
