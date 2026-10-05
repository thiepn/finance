import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ProductPurchaseEvidence,
  ProductPurchaseEvidenceRequest,
  SpendingExplorer,
  SpendingExplorerRequest,
} from "../domain/spending-explorer.js";
import { createFinanceBrowserRuntime } from "../integrations/supabase-client.js";

export type ExplorerLoadState =
  | "loading"
  | "ready"
  | "unconfigured"
  | "unauthenticated"
  | "error";

export interface ExplorerLoader {
  state: ExplorerLoadState;
  explorer: SpendingExplorer | null;
  error: string | null;
  refresh(): Promise<void>;
}

export function useSpendingExplorer(
  request: SpendingExplorerRequest,
): ExplorerLoader {
  const runtime = useMemo(createFinanceBrowserRuntime, []);
  const [state, setState] = useState<ExplorerLoadState>(
    runtime ? "loading" : "unconfigured",
  );
  const [explorer, setExplorer] = useState<SpendingExplorer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    if (!runtime) {
      setState("unconfigured");
      setExplorer(null);
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
      setExplorer(null);
      setError(session.error.message);
      return;
    }

    if (!session.data.session) {
      setState("unauthenticated");
      setExplorer(null);
      return;
    }

    try {
      const next = await runtime.spendingExplorer.getExplorer(request);
      if (id !== requestId.current) return;
      setExplorer(next);
      setState("ready");
    } catch (cause) {
      if (id !== requestId.current) return;
      setExplorer(null);
      setState("error");
      setError(
        cause instanceof Error
          ? cause.message
          : "Spending Explorer could not be loaded.",
      );
    }
  }, [request, runtime]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { state, explorer, error, refresh };
}

export interface ProductEvidenceLoader {
  state: "idle" | "loading" | "ready" | "error";
  evidence: ProductPurchaseEvidence | null;
  error: string | null;
}

export function useProductPurchaseEvidence(
  request: ProductPurchaseEvidenceRequest | null,
): ProductEvidenceLoader {
  const runtime = useMemo(createFinanceBrowserRuntime, []);
  const [state, setState] =
    useState<ProductEvidenceLoader["state"]>("idle");
  const [evidence, setEvidence] =
    useState<ProductPurchaseEvidence | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    if (!request || !runtime) {
      setState("idle");
      setEvidence(null);
      setError(null);
      return;
    }

    const id = ++requestId.current;
    setState("loading");
    setEvidence(null);
    setError(null);

    void runtime.spendingExplorer
      .getProductEvidence(request)
      .then((next) => {
        if (id !== requestId.current) return;
        setEvidence(next);
        setState("ready");
      })
      .catch((cause: unknown) => {
        if (id !== requestId.current) return;
        setError(
          cause instanceof Error
            ? cause.message
            : "Product evidence could not be loaded.",
        );
        setState("error");
      });
  }, [request, runtime]);

  return { state, evidence, error };
}
