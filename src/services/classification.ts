import type { UUID } from "../domain/finance.js";
import type {
  CategoryNode,
  ClassificationContext,
  ClassificationResolution,
  ClassificationRule,
  ClassificationScope,
  CreateCategoryInput,
  CreateClassificationRuleInput,
  FinanceTag,
  MerchantSummary,
  TagEntityType,
  UpsertMerchantInput,
} from "../domain/classification.js";

export interface FinanceClassificationService {
  getCategories(): Promise<readonly CategoryNode[]>;
  createCategory(input: CreateCategoryInput): Promise<UUID>;
  archiveCategory(categoryId: UUID, recursive?: boolean): Promise<void>;
  restoreCategory(categoryId: UUID): Promise<void>;

  getMerchants(): Promise<readonly MerchantSummary[]>;
  upsertMerchant(input: UpsertMerchantInput): Promise<UUID>;
  addMerchantAlias(merchantId: UUID, rawName: string): Promise<UUID>;
  resolveMerchant(rawName: string): Promise<UUID | null>;

  getTags(): Promise<readonly FinanceTag[]>;
  createTag(name: string): Promise<UUID>;
  assignTag(entityType: TagEntityType, entityId: UUID, tagId: UUID): Promise<void>;
  unassignTag(entityType: TagEntityType, entityId: UUID, tagId: UUID): Promise<void>;

  getRules(): Promise<readonly ClassificationRule[]>;
  createRule(input: CreateClassificationRuleInput): Promise<UUID>;
  deleteRule(ruleId: UUID): Promise<void>;
  resolve(
    scope: ClassificationScope,
    context: ClassificationContext,
  ): Promise<ClassificationResolution>;
}
