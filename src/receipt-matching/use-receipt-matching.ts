import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  ReceiptMatchDashboard,
  ReceiptMatchWorkspace,
} from "../domain/receipt-matching.js";
import type { UUID } from "../domain/finance.js";
import { createFinanceBrowserRuntime } from "../integrations/supabase-client.js";

export type ReceiptMatchingLoadState =
  | "loading"
  | "ready"
  | "unconfigured"
  | "unauthenticated"
  | "error";

export interface ReceiptMatchingWorkspaceState {
  state: ReceiptMatchingLoadState;
  dashboard: ReceiptMatchDashboard | null;
  workspace: ReceiptMatchWorkspace | null;
  selectedReceiptId: UUID | null;
  error: string | null;
  actionError: string | null;
  busyKey: string | null;
  refresh(): Promise<void>;
  refreshQueue(autoConfirm?: boolean): Promise<void>;
  openReceipt(receiptId: UUID): Promise<void>;
  refreshReceipt(autoConfirm?: boolean): Promise<void>;
  confirmMatch(
    matchId: UUID,
    matchedAmountMinor?: number | null,
  ): Promise<void>;
  rejectMatch(matchId: UUID, note?: string | null): Promise<void>;
  unconfirmMatch(matchId: UUID, note?: string | null): Promise<void>;
  clearSelection(): void;
}

export function useReceiptMatchingWorkspace():
  ReceiptMatchingWorkspaceState {
  const runtime = useMemo(createFinanceBrowserRuntime, []);
  const [state, setState] = useState<ReceiptMatchingLoadState>(
    runtime ? "loading" : "unconfigured",
  );
  const [dashboard, setDashboard] =
    useState<ReceiptMatchDashboard | null>(null);
  const [workspace, setWorkspace] =
    useState<ReceiptMatchWorkspace | null>(null);
  const [selectedReceiptId, setSelectedReceiptId] =
    useState<UUID | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    if (!runtime) {
      setState("unconfigured");
      setDashboard(null);
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
      return;
    }

    if (!session.data.session) {
      setState("unauthenticated");
      setDashboard(null);
      return;
    }

    try {
      const next = await runtime.receiptMatching.getDashboard(80);
      if (id !== requestId.current) return;
      setDashboard(next);
      setState("ready");
    } catch (cause) {
      if (id !== requestId.current) return;
      setState("error");
      setError(
        cause instanceof Error
          ? cause.message
          : "Receipt matching could not be loaded.",
      );
    }
  }, [runtime]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const runAction = useCallback(
    async (key: string, action: () => Promise<void>) => {
      setBusyKey(key);
      setActionError(null);
      try {
        await action();
      } catch (cause) {
        setActionError(
          cause instanceof Error
            ? cause.message
            : "Receipt matching action failed.",
        );
      } finally {
        setBusyKey(null);
      }
    },
    [],
  );

  const reloadSelected = useCallback(async () => {
    if (!runtime || !selectedReceiptId) return;
    setWorkspace(
      await runtime.receiptMatching.getWorkspace(selectedReceiptId),
    );
  }, [runtime, selectedReceiptId]);

  const openReceipt = useCallback(
    async (receiptId: UUID) => {
      if (!runtime) return;
      setSelectedReceiptId(receiptId);
      await runAction(`open:${receiptId}`, async () => {
        setWorkspace(
          await runtime.receiptMatching.getWorkspace(receiptId),
        );
      });
    },
    [runAction, runtime],
  );

  const refreshQueue = useCallback(
    async (autoConfirm = true) => {
      if (!runtime) return;
      await runAction("queue:refresh", async () => {
        await runtime.receiptMatching.refreshQueue(100, autoConfirm);
        setDashboard(await runtime.receiptMatching.getDashboard(80));
        if (selectedReceiptId) {
          setWorkspace(
            await runtime.receiptMatching.getWorkspace(
              selectedReceiptId,
            ),
          );
        }
      });
    },
    [runAction, runtime, selectedReceiptId],
  );

  const refreshReceipt = useCallback(
    async (autoConfirm = true) => {
      if (!runtime || !selectedReceiptId) return;
      await runAction(`receipt:${selectedReceiptId}:refresh`, async () => {
        await runtime.receiptMatching.refreshReceipt(
          selectedReceiptId,
          autoConfirm,
        );
        await reloadSelected();
        setDashboard(await runtime.receiptMatching.getDashboard(80));
      });
    },
    [reloadSelected, runAction, runtime, selectedReceiptId],
  );

  const confirmMatch = useCallback(
    async (matchId: UUID, matchedAmountMinor?: number | null) => {
      if (!runtime) return;
      await runAction(`match:${matchId}`, async () => {
        await runtime.receiptMatching.confirm({
          matchId,
          matchedAmountMinor: matchedAmountMinor ?? null,
        });
        await reloadSelected();
        setDashboard(await runtime.receiptMatching.getDashboard(80));
      });
    },
    [reloadSelected, runAction, runtime],
  );

  const rejectMatch = useCallback(
    async (matchId: UUID, note: string | null = null) => {
      if (!runtime) return;
      await runAction(`match:${matchId}`, async () => {
        await runtime.receiptMatching.reject(matchId, note);
        await reloadSelected();
        setDashboard(await runtime.receiptMatching.getDashboard(80));
      });
    },
    [reloadSelected, runAction, runtime],
  );

  const unconfirmMatch = useCallback(
    async (matchId: UUID, note: string | null = null) => {
      if (!runtime) return;
      await runAction(`match:${matchId}`, async () => {
        await runtime.receiptMatching.unconfirm(matchId, note);
        await reloadSelected();
        setDashboard(await runtime.receiptMatching.getDashboard(80));
      });
    },
    [reloadSelected, runAction, runtime],
  );

  const clearSelection = useCallback(() => {
    setSelectedReceiptId(null);
    setWorkspace(null);
  }, []);

  return {
    state,
    dashboard,
    workspace,
    selectedReceiptId,
    error,
    actionError,
    busyKey,
    refresh,
    refreshQueue,
    openReceipt,
    refreshReceipt,
    confirmMatch,
    rejectMatch,
    unconfirmMatch,
    clearSelection,
  };
}
