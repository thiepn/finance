import type { Necessity, UUID } from "./finance.js";

export type CategoryKind = "expense" | "income" | "both";
export type ClassificationScope =
  | "transaction"
  | "receipt_item"
  | "product"
  | "merchant";

export type RuleSource = "user" | "learned" | "merchant" | "global" | "ai";
export type TagEntityType =
  | "transaction"
  | "merchant"
  | "product"
  | "receipt_item";

export interface CategoryNode {
  id: UUID;
  parentId: UUID | null;
  name: string;
  kind: CategoryKind;
  necessityDefault: Necessity;
  systemKey: string | null;
  iconKey: string | null;
  sortOrder: number;
  isArchived: boolean;
  depth: number;
  idPath: readonly UUID[];
  namePath: readonly string[];
}

export interface MerchantSummary {
  id: UUID;
  name: string;
  normalizedName: string;
  merchantGroup: string | null;
  defaultCategoryId: UUID | null;
  defaultNecessity: Necessity;
  website: string | null;
  isArchived: boolean;
  purchaseCount: number;
  netSpendMinor: number;
  lastActivityAt: string | null;
  aliases: readonly {
    id: UUID;
    rawName: string;
    source: RuleSource;
    confidence: number | null;
    timesConfirmed: number;
  }[];
  tagIds: readonly UUID[];
}

export interface FinanceTag {
  id: UUID;
  name: string;
  normalizedName: string;
  createdAt: string;
}

export interface ClassificationCondition {
  merchant_id?: UUID;
  merchant_group?: string;
  merchant_name_contains?: string;
  description_contains?: string;
  raw_name_contains?: string;
  normalized_name_contains?: string;
  product_id?: UUID;
  transaction_type?: string;
  min_amount_minor?: number;
  max_amount_minor?: number;
  tag_id?: UUID;
}

export interface ClassificationAction {
  merchant_id?: UUID;
  category_id?: UUID;
  necessity?: Necessity;
  tag_ids?: readonly UUID[];
}

export interface ClassificationRule {
  id: UUID;
  name: string;
  priority: number;
  enabled: boolean;
  source: RuleSource;
  scope: ClassificationScope | "all";
  condition: ClassificationCondition;
  action: ClassificationAction;
  stopProcessing: boolean;
  matchCount: number;
  lastMatchedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ClassificationContext {
  merchant_id?: UUID;
  merchant_name?: string;
  merchant_group?: string;
  description?: string;
  raw_name?: string;
  normalized_name?: string;
  product_id?: UUID;
  transaction_type?: string;
  amount_minor?: number;
  tag_ids?: readonly UUID[];
}

export interface ClassificationResolution extends ClassificationAction {
  matched_rule_ids: readonly UUID[];
  context: ClassificationContext;
}

export interface CreateCategoryInput {
  name: string;
  parentId?: UUID | null;
  kind?: CategoryKind;
  necessityDefault?: Necessity;
  iconKey?: string | null;
  sortOrder?: number;
}

export interface UpsertMerchantInput {
  name: string;
  merchantGroup?: string | null;
  defaultCategoryId?: UUID | null;
  defaultNecessity?: Necessity;
  website?: string | null;
}

export interface CreateClassificationRuleInput {
  name: string;
  scope: ClassificationScope | "all";
  condition: ClassificationCondition;
  action: ClassificationAction;
  priority?: number;
  stopProcessing?: boolean;
}
