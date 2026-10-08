import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  OverviewDashboard,
  OverviewPeriodKind,
} from "../domain/overview.js";
import { createFinanceBrowserRuntime } from "../integrations/supabase-client.js";

export type OverviewLoadState =
  | "loading"
  | "ready"
  | "unauthenticated"
  | "unconfigured"
  | "error";

export interface OverviewLoader {
  state: OverviewLoadState;
  dashboard: OverviewDashboard | null;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useOverview(
  periodKind: OverviewPeriodKind,
): OverviewLoader {
  const runtime = useMemo(createFinanceBrowserRuntime, []);
  const [state, setState] = useState<OverviewLoadState>(
    runtime ? "loading" : "unconfigured",
  );
  const [dashboard, setDashboard] = useState<OverviewDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    if (!runtime) {
      setState("unconfigured");
      setDashboard(null);
      setError(null);
      return;
    }

    const id = ++requestId.current;
    setState("loading");
    setError(null);

    // P27's verified getUser boundary owns authentication. Home mounts only
    // inside that private route, so a second getSession adds latency and can
    // conflict with Supabase's auth event lock. Backend RPC/RLS remains the
    // authoritative permission check.
    try {
      const next = await runtime.overview.getDashboard({
        periodKind,
        asOf: new Date().toISOString(),
        recentLimit: 6,
      });

      if (id !== requestId.current) return;
      setDashboard(next);
      setState("ready");
    } catch (cause) {
      if (id !== requestId.current) return;
      setDashboard(null);
      setState("error");
      setError(
        cause instanceof Error
          ? cause.message
          : "Finance Overview could not be loaded.",
      );
    }
  }, [periodKind, runtime]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    state,
    dashboard,
    error,
    refresh,
  };
}
