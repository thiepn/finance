import {
  createClient,
  type PostgrestError,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { SupabaseFinanceOverviewService } from "../services/supabase-overview.js";
import { SupabaseFinanceAnalyticsService } from "../services/supabase-analytics.js";
import type { SupabaseRpcClient } from "../services/supabase-ledger.js";

export interface FinanceBrowserRuntime {
  client: SupabaseClient;
  rpcClient: SupabaseRpcClient;
  overview: SupabaseFinanceOverviewService;
  analytics: SupabaseFinanceAnalyticsService;
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

  const overview = new SupabaseFinanceOverviewService(
    rpcClient,
    ensureInitialized,
  );
  const analytics = new SupabaseFinanceAnalyticsService(
    rpcClient,
    ensureInitialized,
  );

  runtime = {
    client,
    rpcClient,
    overview,
    analytics,
    ensureInitialized,
  };

  return runtime;
}

export function resetFinanceBrowserRuntimeForTests(): void {
  runtime = undefined;
  initializePromise = null;
}
