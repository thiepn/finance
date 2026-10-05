import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  AccountKind,
  CreateAccountInput,
  UUID,
} from "../domain/finance.js";
import type {
  AccountWealthHistory,
  NetWorthDashboard,
  RecordBalanceObservationInput,
  WealthRangeMonths,
} from "../domain/wealth.js";
import { createFinanceBrowserRuntime } from "../integrations/supabase-client.js";

export type WealthLoadState =
  | "loading"
  | "ready"
  | "unconfigured"
  | "unauthenticated"
  | "error";

export interface CreateWealthAccountInput {
  name: string;
  kind: AccountKind;
  currencyCode: string;
  institutionName?: string | null;
  includeInNetWorth?: boolean;
  openingBalanceMinor?: number;
}

export interface WealthWorkspace {
  state: WealthLoadState;
  dashboard: NetWorthDashboard | null;
  error: string | null;
  actionError: string | null;
  busyKey: string | null;
  accountHistory: AccountWealthHistory | null;
  historyLoadingId: UUID | null;
  refresh(): Promise<void>;
  createAccount(input: CreateWealthAccountInput): Promise<void>;
  archiveAccount(accountId: UUID): Promise<void>;
  restoreAccount(accountId: UUID): Promise<void>;
  recordObservation(input: RecordBalanceObservationInput): Promise<void>;
  setInclusion(accountId: UUID, include: boolean): Promise<void>;
  loadAccountHistory(accountId: UUID): Promise<void>;
  clearAccountHistory(): void;
}

export function useWealthWorkspace(
  rangeMonths: WealthRangeMonths,
): WealthWorkspace {
  const runtime = useMemo(createFinanceBrowserRuntime, []);
  const [state, setState] = useState<WealthLoadState>(
    runtime ? "loading" : "unconfigured",
  );
  const [dashboard, setDashboard] =
    useState<NetWorthDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [accountHistory, setAccountHistory] =
    useState<AccountWealthHistory | null>(null);
  const [historyLoadingId, setHistoryLoadingId] =
    useState<UUID | null>(null);
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

    const session = await runtime.client.auth.getSession();
    if (id !== requestId.current) return;

    if (session.error) {
      setState("error");
      setDashboard(null);
      setError(session.error.message);
      return;
    }

    if (!session.data.session) {
      setState("unauthenticated");
      setDashboard(null);
      return;
    }

    try {
      await runtime.ensureInitialized();
      const next = await runtime.wealth.getDashboard(rangeMonths);
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
          : "Net worth data could not be loaded.",
      );
    }
  }, [rangeMonths, runtime]);

  useEffect(() => {
    setAccountHistory(null);
    void refresh();
  }, [refresh]);

  const runAction = useCallback(
    async (key: string, action: () => Promise<void>) => {
      setBusyKey(key);
      setActionError(null);
      try {
        await action();
        await refresh();
      } catch (cause) {
        setActionError(
          cause instanceof Error
            ? cause.message
            : "Wealth action failed.",
        );
      } finally {
        setBusyKey(null);
      }
    },
    [refresh],
  );

  const createAccount = useCallback(
    async (input: CreateWealthAccountInput) => {
      if (!runtime) return;
      await runAction("account:new", async () => {
        await runtime.ensureInitialized();
        const payload: CreateAccountInput = {
          name: input.name,
          kind: input.kind,
          currencyCode: input.currencyCode,
          includeInNetWorth: input.includeInNetWorth ?? true,
          openingBalanceMinor: input.openingBalanceMinor ?? 0,
          ...(input.institutionName
            ? { institutionName: input.institutionName }
            : {}),
        };
        await runtime.ledger.createAccount(payload);
      });
    },
    [runAction, runtime],
  );

  const archiveAccount = useCallback(
    async (accountId: UUID) => {
      if (!runtime) return;
      await runAction(`account:${accountId}`, async () => {
        await runtime.ensureInitialized();
        await runtime.ledger.archiveAccount(accountId);
      });
    },
    [runAction, runtime],
  );

  const restoreAccount = useCallback(
    async (accountId: UUID) => {
      if (!runtime) return;
      await runAction(`account:${accountId}`, async () => {
        await runtime.ensureInitialized();
        await runtime.ledger.restoreAccount(accountId);
      });
    },
    [runAction, runtime],
  );

  const recordObservation = useCallback(
    async (input: RecordBalanceObservationInput) => {
      if (!runtime) return;
      await runAction(`observation:${input.accountId}`, async () => {
        await runtime.wealth.recordBalanceObservation(input);
      });
    },
    [runAction, runtime],
  );

  const setInclusion = useCallback(
    async (accountId: UUID, include: boolean) => {
      if (!runtime) return;
      await runAction(`inclusion:${accountId}`, async () => {
        await runtime.wealth.setNetWorthInclusion(
          accountId,
          include,
        );
      });
    },
    [runAction, runtime],
  );

  const loadAccountHistory = useCallback(
    async (accountId: UUID) => {
      if (!runtime) return;
      setHistoryLoadingId(accountId);
      setActionError(null);
      try {
        const history = await runtime.wealth.getAccountHistory(
          accountId,
          rangeMonths,
        );
        setAccountHistory(history);
      } catch (cause) {
        setActionError(
          cause instanceof Error
            ? cause.message
            : "Account history could not be loaded.",
        );
      } finally {
        setHistoryLoadingId(null);
      }
    },
    [rangeMonths, runtime],
  );

  const clearAccountHistory = useCallback(() => {
    setAccountHistory(null);
  }, []);

  return {
    state,
    dashboard,
    error,
    actionError,
    busyKey,
    accountHistory,
    historyLoadingId,
    refresh,
    createAccount,
    archiveAccount,
    restoreAccount,
    recordObservation,
    setInclusion,
    loadAccountHistory,
    clearAccountHistory,
  };
}
