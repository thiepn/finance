import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  RecurringDashboard,
  RecurringDetectionCandidate,
  RecurringDetectionResult,
  RecurringStatus,
} from "../domain/recurring.js";
import { createFinanceBrowserRuntime } from "../integrations/supabase-client.js";

export type RecurringLoadState =
  | "loading"
  | "ready"
  | "unconfigured"
  | "unauthenticated"
  | "error";

export interface RecurringWorkspace {
  state: RecurringLoadState;
  dashboard: RecurringDashboard | null;
  detection: RecurringDetectionResult | null;
  error: string | null;
  actionError: string | null;
  busyKey: string | null;
  refresh(): Promise<void>;
  confirmCandidate(
    candidate: RecurringDetectionCandidate,
    isSubscription: boolean,
  ): Promise<void>;
  setPatternStatus(
    patternId: string,
    status: RecurringStatus,
  ): Promise<void>;
}

export function useRecurringWorkspace(): RecurringWorkspace {
  const runtime = useMemo(createFinanceBrowserRuntime, []);
  const [state, setState] = useState<RecurringLoadState>(
    runtime ? "loading" : "unconfigured",
  );
  const [dashboard, setDashboard] =
    useState<RecurringDashboard | null>(null);
  const [detection, setDetection] =
    useState<RecurringDetectionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    if (!runtime) {
      setState("unconfigured");
      setDashboard(null);
      setDetection(null);
      return;
    }

    const id = ++requestId.current;
    setState("loading");
    setError(null);

    const session = await runtime.client.auth.getSession();
    if (id !== requestId.current) return;

    if (session.error) {
      setState("error");
      setError(session.error.message);
      setDashboard(null);
      setDetection(null);
      return;
    }

    if (!session.data.session) {
      setState("unauthenticated");
      setDashboard(null);
      setDetection(null);
      return;
    }

    try {
      await runtime.recurring.syncPatterns(
        null,
        new Date().toISOString(),
      );

      const [nextDashboard, nextDetection] = await Promise.all([
        runtime.recurring.getDashboard(null, 45),
        runtime.recurring.getDetectionCandidates(null, 18, 40),
      ]);

      if (id !== requestId.current) return;
      setDashboard(nextDashboard);
      setDetection(nextDetection);
      setState("ready");
    } catch (cause) {
      if (id !== requestId.current) return;
      setDashboard(null);
      setDetection(null);
      setState("error");
      setError(
        cause instanceof Error
          ? cause.message
          : "Recurring analytics could not be loaded.",
      );
    }
  }, [runtime]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const confirmCandidate = useCallback(
    async (
      candidate: RecurringDetectionCandidate,
      isSubscription: boolean,
    ) => {
      if (!runtime) return;
      const key = `candidate:${candidate.candidateId}`;
      setBusyKey(key);
      setActionError(null);
      try {
        await runtime.recurring.confirmCandidate(
          candidate,
          isSubscription,
        );
        await refresh();
      } catch (cause) {
        setActionError(
          cause instanceof Error
            ? cause.message
            : "Recurring candidate could not be confirmed.",
        );
      } finally {
        setBusyKey(null);
      }
    },
    [refresh, runtime],
  );

  const setPatternStatus = useCallback(
    async (patternId: string, status: RecurringStatus) => {
      if (!runtime) return;
      const key = `pattern:${patternId}`;
      setBusyKey(key);
      setActionError(null);
      try {
        await runtime.recurring.setStatus(patternId, status);
        await refresh();
      } catch (cause) {
        setActionError(
          cause instanceof Error
            ? cause.message
            : "Recurring status could not be updated.",
        );
      } finally {
        setBusyKey(null);
      }
    },
    [refresh, runtime],
  );

  return {
    state,
    dashboard,
    detection,
    error,
    actionError,
    busyKey,
    refresh,
    confirmCandidate,
    setPatternStatus,
  };
}
