import { AskFinanceEngine } from "../src/ask/ask-finance-engine.js";
import { SupabaseFinanceActivityService } from "../src/services/supabase-activity.js";
import { SupabaseFinanceOverviewService } from "../src/services/supabase-overview.js";
import { SupabaseFinancePlanningService } from "../src/services/supabase-planning.js";
import { SupabaseFinanceProductIntelligenceService } from "../src/services/supabase-product-intelligence.js";
import { SupabaseFinanceReceiptMatchingService } from "../src/services/supabase-receipt-matching.js";
import { SupabaseFinanceRecurringService } from "../src/services/supabase-recurring.js";
import { SupabaseFinanceSpendingExplorerService } from "../src/services/supabase-spending-explorer.js";
import { SupabaseFinanceWealthService } from "../src/services/supabase-wealth.js";
import type { SupabaseRpcClient } from "../src/services/supabase-ledger.js";

interface CoreSuccess<T> {
  ok: true;
  data: T;
  meta: { requestId: string };
}

interface CoreFailure {
  ok: false;
  error: {
    code: string;
    message: string;
    requestId: string;
  };
}

type CoreEnvelope<T> = CoreSuccess<T> | CoreFailure;

type CoreFinanceOperation =
  | "activity_filter_catalog"
  | "spending_explorer"
  | "product_purchase_evidence"
  | "overview"
  | "product_catalog"
  | "product_intelligence"
  | "recurring"
  | "planning"
  | "wealth"
  | "receipt_match_dashboard";

interface CoreReadModelRequest {
  operation: CoreFinanceOperation;
  params: Record<string, unknown>;
}

function env(name: string): string {
  const value = (
    globalThis as {
      process?: { env?: Record<string, string | undefined> };
    }
  ).process?.env?.[name]?.trim();

  if (!value) throw new Error(`Missing server environment variable ${name}`);
  return value;
}

function nullable(value: unknown): unknown {
  return value === undefined ? null : value;
}

function rpcRequest(
  functionName: string,
  args: Record<string, unknown>,
): CoreReadModelRequest | null {
  switch (functionName) {
    case "finance_get_activity_filter_catalog":
      return {
        operation: "activity_filter_catalog",
        params: {
          productQuery: nullable(args.p_product_query),
          productLimit: args.p_product_limit ?? 100,
        },
      };
    case "finance_get_spending_explorer_period":
      return {
        operation: "spending_explorer",
        params: {
          periodKind: args.p_period_kind ?? "month",
          anchorDate: nullable(args.p_anchor_date),
          categoryId: nullable(args.p_category_id),
          merchantId: nullable(args.p_merchant_id),
          necessity: nullable(args.p_necessity),
          limit: args.p_limit ?? 8,
        },
      };
    case "finance_get_product_purchase_evidence":
      return {
        operation: "product_purchase_evidence",
        params: {
          productId: args.p_product_id,
          periodStart: args.p_period_start,
          periodEnd: args.p_period_end,
          merchantId: nullable(args.p_merchant_id),
          limit: args.p_limit ?? 30,
        },
      };
    case "finance_get_overview_dashboard_period":
      return {
        operation: "overview",
        params: {
          periodKind: args.p_period_kind ?? "month",
          anchorDate: nullable(args.p_anchor_date),
          asOf: nullable(args.p_as_of),
          recentLimit: args.p_recent_limit ?? 8,
        },
      };
    case "finance_get_product_catalog":
      return {
        operation: "product_catalog",
        params: {
          query: nullable(args.p_query),
          limit: args.p_limit ?? 50,
        },
      };
    case "finance_get_product_intelligence":
      return {
        operation: "product_intelligence",
        params: {
          productId: args.p_product_id,
          range: args.p_range ?? "3m",
          anchorDate: nullable(args.p_anchor_date),
        },
      };
    case "finance_get_recurring_dashboard":
      return {
        operation: "recurring",
        params: {
          anchorDate: nullable(args.p_anchor_date),
          horizonDays: args.p_horizon_days ?? 45,
        },
      };
    case "finance_get_planning_dashboard":
      return {
        operation: "planning",
        params: {
          anchorDate: nullable(args.p_anchor_date),
        },
      };
    case "finance_get_net_worth_dashboard":
      return {
        operation: "wealth",
        params: {
          anchorDate: nullable(args.p_anchor_date),
          months: args.p_months ?? 12,
        },
      };
    case "finance_get_receipt_match_dashboard":
      return {
        operation: "receipt_match_dashboard",
        params: {
          limit: args.p_limit ?? 60,
        },
      };
    default:
      return null;
  }
}

class CoreGatewayFinanceRpcClient implements SupabaseRpcClient {
  constructor(
    private readonly gatewayUrl: string,
    private readonly bearerToken: string,
  ) {}

  async rpc<T>(
    functionName: string,
    args: Record<string, unknown> = {},
  ): Promise<{
    data: T | null;
    error: { message: string; code?: string; details?: string | null } | null;
  }> {
    const request = rpcRequest(functionName, args);
    if (!request) {
      return {
        data: null,
        error: {
          message: `Finance MCP attempted non-allowlisted RPC ${functionName}`,
          code: "FINANCE_MCP_RPC_BLOCKED",
        },
      };
    }

    try {
      const response = await fetch(
        new URL("/v1/finance/read-model", this.gatewayUrl),
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${this.bearerToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(request),
          redirect: "manual",
          signal: AbortSignal.timeout(10_000),
        },
      );

      const payload = (await response.json().catch(() => null)) as
        | CoreEnvelope<T>
        | null;

      if (!response.ok || !payload || payload.ok !== true) {
        const failure =
          payload && payload.ok === false ? payload.error : null;
        return {
          data: null,
          error: {
            message: failure?.message ?? "Finance Core Gateway unavailable",
            code: failure?.code ?? "FINANCE_CORE_GATEWAY_ERROR",
            details: failure?.requestId ?? null,
          },
        };
      }

      return { data: payload.data, error: null };
    } catch {
      return {
        data: null,
        error: {
          message: "Finance Core Gateway unavailable",
          code: "FINANCE_CORE_GATEWAY_UNAVAILABLE",
        },
      };
    }
  }
}

export function createMcpAskFinanceEngine(
  bearerToken: string,
): AskFinanceEngine {
  const client = new CoreGatewayFinanceRpcClient(
    env("THIEPN_CORE_GATEWAY_URL"),
    bearerToken,
  );

  return new AskFinanceEngine({
    activity: new SupabaseFinanceActivityService(client),
    overview: new SupabaseFinanceOverviewService(client),
    spendingExplorer: new SupabaseFinanceSpendingExplorerService(client),
    productIntelligence: new SupabaseFinanceProductIntelligenceService(client),
    recurring: new SupabaseFinanceRecurringService(client),
    planning: new SupabaseFinancePlanningService(client),
    wealth: new SupabaseFinanceWealthService(client),
    receiptMatching: new SupabaseFinanceReceiptMatchingService(client),
  });
}
