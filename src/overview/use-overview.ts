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

    const sessionResult = await runtime.client.auth.getSession();
    if (id !== requestId.current) return;

    if (sessionResult.error) {
      setState("error");
      setDashboard(null);
      setError(sessionResult.error.message);
      return;
    }

    if (!sessionResult.data.session) {
      setState("unauthenticated");
      setDashboard(null);
      return;
    }

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

  useEffect(() => {
    if (!runtime) return undefined;

    const {
      data: { subscription },
    } = runtime.client.auth.onAuthStateChange(() => {
      void refresh();
    });

    return () => subscription.unsubscribe();
  }, [refresh, runtime]);

  return {
    state,
    dashboard,
    error,
    refresh,
  };
}
