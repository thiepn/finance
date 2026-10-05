import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AnalyticsTimeSeries,
  AnalyticsTimeSeriesRequest,
} from "../domain/analytics.js";
import { createFinanceBrowserRuntime } from "../integrations/supabase-client.js";

export type AnalyticsLoadState =
  | "idle"
  | "loading"
  | "ready"
  | "unconfigured"
  | "error";

export interface AnalyticsTimeSeriesLoader {
  state: AnalyticsLoadState;
  series: AnalyticsTimeSeries | null;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useAnalyticsTimeSeries(
  request: AnalyticsTimeSeriesRequest | null,
): AnalyticsTimeSeriesLoader {
  const runtime = useMemo(createFinanceBrowserRuntime, []);
  const [state, setState] = useState<AnalyticsLoadState>(
    request ? (runtime ? "loading" : "unconfigured") : "idle",
  );
  const [series, setSeries] = useState<AnalyticsTimeSeries | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    if (!request) {
      setState("idle");
      setSeries(null);
      setError(null);
      return;
    }

    if (!runtime) {
      setState("unconfigured");
      setSeries(null);
      setError(null);
      return;
    }

    const id = ++requestId.current;
    setState("loading");
    setError(null);

    try {
      const next = await runtime.analytics.getTimeSeries(request);
      if (id !== requestId.current) return;
      setSeries(next);
      setState("ready");
    } catch (cause) {
      if (id !== requestId.current) return;
      setSeries(null);
      setState("error");
      setError(
        cause instanceof Error
          ? cause.message
          : "Finance analytics could not be loaded.",
      );
    }
  }, [request, runtime]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { state, series, error, refresh };
}
