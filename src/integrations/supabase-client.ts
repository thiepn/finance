import {
  createClient,
  type PostgrestError,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { AskFinanceEngine } from "../ask/ask-finance-engine.js";
import { SupabaseFinanceActivityService } from "../services/supabase-activity.js";
import { SupabaseFinanceOverviewService } from "../services/supabase-overview.js";
import { SupabaseFinanceAnalyticsService } from "../services/supabase-analytics.js";
import { SupabaseFinanceSpendingExplorerService } from "../services/supabase-spending-explorer.js";
import { SupabaseFinanceProductIntelligenceService } from "../services/supabase-product-intelligence.js";
import { SupabaseFinanceRecurringService } from "../services/supabase-recurring.js";
import { SupabaseFinancePlanningService } from "../services/supabase-planning.js";
import { SupabaseFinanceWealthService } from "../services/supabase-wealth.js";
import { SupabaseFinanceImportService } from "../services/supabase-imports.js";
import { SupabaseFinanceReceiptMatchingService } from "../services/supabase-receipt-matching.js";
import { SupabaseFinanceLedgerService, type SupabaseRpcClient } from "../services/supabase-ledger.js";

export interface FinanceBrowserRuntime {
  client: SupabaseClient;
  rpcClient: SupabaseRpcClient;
  ledger: SupabaseFinanceLedgerService;
  activity: SupabaseFinanceActivityService;
  overview: SupabaseFinanceOverviewService;
  analytics: SupabaseFinanceAnalyticsService;
  spendingExplorer: SupabaseFinanceSpendingExplorerService;
  productIntelligence: SupabaseFinanceProductIntelligenceService;
  recurring: SupabaseFinanceRecurringService;
  planning: SupabaseFinancePlanningService;
  wealth: SupabaseFinanceWealthService;
  imports: SupabaseFinanceImportService;
  receiptMatching: SupabaseFinanceReceiptMatchingService;
  askFinance: AskFinanceEngine;
  ensureInitialized(): Promise<void>;
}

let runtime: FinanceBrowserRuntime | null | undefined;
let initializePromise: Promise<void> | null = null;

function rpcError(error: PostgrestError | null) {
  return error
    ? {
        message: error.message,
        code: error.code,
        details: error.details,
      }
    : null;
}

function rpcAdapter(client: SupabaseClient): SupabaseRpcClient {
  return {
    async rpc<T>(
      functionName: string,
      args?: Record<string, unknown>,
    ): Promise<{
      data: T | null;
      error: { message: string; code?: string; details?: string | null } | null;
    }> {
      const result = await client.rpc(
        functionName,
        (args ?? {}) as never,
      );

      return {
        data: result.data as T | null,
        error: rpcError(result.error),
      };
    },
  };
}

export function createFinanceBrowserRuntime():
  | FinanceBrowserRuntime
  | null {
  if (runtime !== undefined) return runtime;

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const publishableKey =
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !publishableKey) {
    runtime = null;
    return runtime;
  }

  const client = createClient(supabaseUrl, publishableKey, {
    db: { schema: "public" },
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  const rpcClient = rpcAdapter(client);

  const ensureInitialized = async () => {
    if (!initializePromise) {
      initializePromise = (async () => {
        const result = await rpcClient.rpc("finance_initialize");
        if (result.error) {
          initializePromise = null;
          throw new Error(
            `Finance initialization failed: ${result.error.message}`,
          );
        }
      })();
    }
    await initializePromise;
  };

  const ledger = new SupabaseFinanceLedgerService(rpcClient);
  const activity = new SupabaseFinanceActivityService(rpcClient);
  const overview = new SupabaseFinanceOverviewService(
    rpcClient,
    ensureInitialized,
  );
  const analytics = new SupabaseFinanceAnalyticsService(
    rpcClient,
    ensureInitialized,
  );
  const spendingExplorer = new SupabaseFinanceSpendingExplorerService(
    rpcClient,
    ensureInitialized,
  );
  const productIntelligence = new SupabaseFinanceProductIntelligenceService(
    rpcClient,
    ensureInitialized,
  );
  const recurring = new SupabaseFinanceRecurringService(
    rpcClient,
    ensureInitialized,
  );
  const planning = new SupabaseFinancePlanningService(
    rpcClient,
    ensureInitialized,
  );
  const wealth = new SupabaseFinanceWealthService(
    rpcClient,
    ensureInitialized,
  );
  const imports = new SupabaseFinanceImportService(
    rpcClient,
    client,
    ensureInitialized,
  );
  const receiptMatching = new SupabaseFinanceReceiptMatchingService(
    rpcClient,
    ensureInitialized,
  );
  const askFinance = new AskFinanceEngine({
    activity,
    overview,
    spendingExplorer,
    productIntelligence,
    recurring,
    planning,
    wealth,
    receiptMatching,
  });

  runtime = {
    client,
    rpcClient,
    ledger,
    activity,
    overview,
    analytics,
    spendingExplorer,
    productIntelligence,
    recurring,
    planning,
    wealth,
    imports,
    receiptMatching,
    askFinance,
    ensureInitialized,
  };

  return runtime;
}

export function resetFinanceBrowserRuntimeForTests(): void {
  runtime = undefined;
  initializePromise = null;
}
