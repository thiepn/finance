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
import type { FinanceClassificationService } from "./classification.js";
import type { SupabaseRpcClient } from "./supabase-ledger.js";

type RpcResult<T> = { data: T | null; error: { message: string } | null };

function unwrap<T>(result: RpcResult<T>, operation: string): T {
  if (result.error) throw new Error(`Finance ${operation}: ${result.error.message}`);
  if (result.data === null) throw new Error(`Finance ${operation} returned no data`);
  return result.data;
}

export class SupabaseFinanceClassificationService
  implements FinanceClassificationService
{
  constructor(private readonly client: SupabaseRpcClient) {}

  async getCategories(): Promise<readonly CategoryNode[]> {
    const rows = unwrap(
      await this.client.rpc<Record<string, unknown>[]>("finance_get_categories"),
      "getCategories",
    );
    return rows.map((r) => ({
      id: String(r.id),
      parentId: r.parent_id === null ? null : String(r.parent_id),
      name: String(r.name),
      kind: String(r.kind) as CategoryNode["kind"],
      necessityDefault: String(r.necessity_default) as CategoryNode["necessityDefault"],
      systemKey: r.system_key === null ? null : String(r.system_key),
      iconKey: r.icon_key === null ? null : String(r.icon_key),
      sortOrder: Number(r.sort_order),
      isArchived: Boolean(r.is_archived),
      depth: Number(r.depth),
      idPath: Array.isArray(r.id_path) ? r.id_path.map(String) : [],
      namePath: Array.isArray(r.name_path) ? r.name_path.map(String) : [],
    }));
  }

  async createCategory(input: CreateCategoryInput): Promise<UUID> {
    return unwrap(
      await this.client.rpc<UUID>("finance_create_category", {
        p_name: input.name,
        p_parent_id: input.parentId ?? null,
        p_kind: input.kind ?? "expense",
        p_necessity_default: input.necessityDefault ?? "unclassified",
        p_icon_key: input.iconKey ?? null,
        p_sort_order: input.sortOrder ?? 0,
      }),
      "createCategory",
    );
  }

  async updateCategory(
    categoryId: UUID,
    input: Omit<CreateCategoryInput, "kind">,
  ): Promise<void> {
    const result = await this.client.rpc("finance_update_category", {
      p_category_id: categoryId,
      p_name: input.name,
      p_parent_id: input.parentId ?? null,
      p_necessity_default: input.necessityDefault ?? "unclassified",
      p_icon_key: input.iconKey ?? null,
      p_sort_order: input.sortOrder ?? 0,
    });
    if (result.error) throw new Error(result.error.message);
  }

  async archiveCategory(categoryId: UUID, recursive = false): Promise<void> {
    const result = await this.client.rpc("finance_archive_category", {
      p_category_id: categoryId,
      p_recursive: recursive,
    });
    if (result.error) throw new Error(result.error.message);
  }

  async restoreCategory(categoryId: UUID): Promise<void> {
    const result = await this.client.rpc("finance_restore_category", {
      p_category_id: categoryId,
    });
    if (result.error) throw new Error(result.error.message);
  }

  async getMerchants(): Promise<readonly MerchantSummary[]> {
    const rows = unwrap(
      await this.client.rpc<Record<string, unknown>[]>("finance_get_merchants"),
      "getMerchants",
    );

    return rows.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      normalizedName: String(r.normalized_name),
      merchantGroup: r.merchant_group === null ? null : String(r.merchant_group),
      defaultCategoryId:
        r.default_category_id === null ? null : String(r.default_category_id),
      defaultNecessity: String(r.default_necessity) as MerchantSummary["defaultNecessity"],
      website: r.website === null ? null : String(r.website),
      isArchived: Boolean(r.is_archived),
      purchaseCount: Number(r.purchase_count),
      netSpendMinor: Number(r.net_spend_minor),
      lastActivityAt:
        r.last_activity_at === null ? null : String(r.last_activity_at),
      aliases: Array.isArray(r.aliases)
        ? (r.aliases as Record<string, unknown>[]).map((alias) => ({
            id: String(alias.id),
            rawName: String(alias.raw_name),
            source: String(alias.source) as MerchantSummary["aliases"][number]["source"],
            confidence:
              alias.confidence === null ? null : Number(alias.confidence),
            timesConfirmed: Number(alias.times_confirmed),
          }))
        : [],
      tagIds: Array.isArray(r.tag_ids) ? r.tag_ids.map(String) : [],
    }));
  }

  async upsertMerchant(input: UpsertMerchantInput): Promise<UUID> {
    return unwrap(
      await this.client.rpc<UUID>("finance_upsert_merchant", {
        p_name: input.name,
        p_merchant_group: input.merchantGroup ?? null,
        p_default_category_id: input.defaultCategoryId ?? null,
        p_default_necessity: input.defaultNecessity ?? "unclassified",
        p_website: input.website ?? null,
      }),
      "upsertMerchant",
    );
  }

  async addMerchantAlias(merchantId: UUID, rawName: string): Promise<UUID> {
    return unwrap(
      await this.client.rpc<UUID>("finance_add_merchant_alias", {
        p_merchant_id: merchantId,
        p_raw_name: rawName,
      }),
      "addMerchantAlias",
    );
  }

  async resolveMerchant(rawName: string): Promise<UUID | null> {
    const result = await this.client.rpc<UUID | null>("finance_resolve_merchant", {
      p_raw_name: rawName,
    });
    if (result.error) throw new Error(result.error.message);
    return result.data;
  }

  async getTags(): Promise<readonly FinanceTag[]> {
    const rows = unwrap(
      await this.client.rpc<Record<string, unknown>[]>("finance_get_tags"),
      "getTags",
    );
    return rows.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      normalizedName: String(r.normalized_name),
      createdAt: String(r.created_at),
    }));
  }

  async createTag(name: string): Promise<UUID> {
    return unwrap(
      await this.client.rpc<UUID>("finance_create_tag", { p_name: name }),
      "createTag",
    );
  }

  async assignTag(
    entityType: TagEntityType,
    entityId: UUID,
    tagId: UUID,
  ): Promise<void> {
    const result = await this.client.rpc("finance_assign_tag", {
      p_entity_type: entityType,
      p_entity_id: entityId,
      p_tag_id: tagId,
    });
    if (result.error) throw new Error(result.error.message);
  }

  async unassignTag(
    entityType: TagEntityType,
    entityId: UUID,
    tagId: UUID,
  ): Promise<void> {
    const result = await this.client.rpc("finance_unassign_tag", {
      p_entity_type: entityType,
      p_entity_id: entityId,
      p_tag_id: tagId,
    });
    if (result.error) throw new Error(result.error.message);
  }

  async getRules(): Promise<readonly ClassificationRule[]> {
    const rows = unwrap(
      await this.client.rpc<Record<string, unknown>[]>(
        "finance_get_classification_rules",
      ),
      "getRules",
    );
    return rows.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      priority: Number(r.priority),
      enabled: Boolean(r.enabled),
      source: String(r.source) as ClassificationRule["source"],
      scope: String(r.scope) as ClassificationRule["scope"],
      condition: (r.condition ?? {}) as ClassificationRule["condition"],
      action: (r.action ?? {}) as ClassificationRule["action"],
      stopProcessing: Boolean(r.stop_processing),
      matchCount: Number(r.match_count),
      lastMatchedAt:
        r.last_matched_at === null ? null : String(r.last_matched_at),
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    }));
  }

  async createRule(input: CreateClassificationRuleInput): Promise<UUID> {
    return unwrap(
      await this.client.rpc<UUID>("finance_create_classification_rule", {
        p_name: input.name,
        p_scope: input.scope,
        p_condition: input.condition,
        p_action: input.action,
        p_priority: input.priority ?? 1000,
        p_stop_processing: input.stopProcessing ?? false,
      }),
      "createRule",
    );
  }

  async updateRule(
    ruleId: UUID,
    input: CreateClassificationRuleInput & { enabled: boolean },
  ): Promise<void> {
    const result = await this.client.rpc("finance_update_classification_rule", {
      p_rule_id: ruleId,
      p_name: input.name,
      p_scope: input.scope,
      p_condition: input.condition,
      p_action: input.action,
      p_priority: input.priority ?? 1000,
      p_enabled: input.enabled,
      p_stop_processing: input.stopProcessing ?? false,
    });
    if (result.error) throw new Error(result.error.message);
  }

  async deleteRule(ruleId: UUID): Promise<void> {
    const result = await this.client.rpc("finance_delete_classification_rule", {
      p_rule_id: ruleId,
    });
    if (result.error) throw new Error(result.error.message);
  }

  async resolve(
    scope: ClassificationScope,
    context: ClassificationContext,
  ): Promise<ClassificationResolution> {
    return unwrap(
      await this.client.rpc<ClassificationResolution>(
        "finance_resolve_classification",
        { p_scope: scope, p_context: context },
      ),
      "resolveClassification",
    );
  }
}
