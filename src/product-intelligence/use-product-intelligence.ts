import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  ProductAnalytics,
  ProductAnalyticsRange,
  ProductCatalog,
} from "../domain/product-intelligence.js";
import { createFinanceBrowserRuntime } from "../integrations/supabase-client.js";

export type ProductIntelligenceLoadState =
  | "idle"
  | "loading"
  | "ready"
  | "unconfigured"
  | "unauthenticated"
  | "error";

export interface ProductCatalogLoader {
  state: ProductIntelligenceLoadState;
  catalog: ProductCatalog | null;
  error: string | null;
  refresh(): Promise<void>;
}

export function useProductCatalog(
  query: string,
): ProductCatalogLoader {
  const runtime = useMemo(createFinanceBrowserRuntime, []);
  const [state, setState] =
    useState<ProductIntelligenceLoadState>(
      runtime ? "loading" : "unconfigured",
    );
  const [catalog, setCatalog] =
    useState<ProductCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    if (!runtime) {
      setState("unconfigured");
      setCatalog(null);
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
      setCatalog(null);
      setError(session.error.message);
      return;
    }

    if (!session.data.session) {
      setState("unauthenticated");
      setCatalog(null);
      return;
    }

    try {
      const next = await runtime.productIntelligence.getCatalog({
        query: query.trim() || null,
        limit: 150,
      });
      if (id !== requestId.current) return;
      setCatalog(next);
      setState("ready");
    } catch (cause) {
      if (id !== requestId.current) return;
      setCatalog(null);
      setState("error");
      setError(
        cause instanceof Error
          ? cause.message
          : "Product catalog could not be loaded.",
      );
    }
  }, [query, runtime]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { state, catalog, error, refresh };
}

export interface ProductAnalyticsLoader {
  state: ProductIntelligenceLoadState;
  analytics: ProductAnalytics | null;
  error: string | null;
  refresh(): Promise<void>;
}

export function useProductAnalytics(
  productId: string | null,
  range: ProductAnalyticsRange,
): ProductAnalyticsLoader {
  const runtime = useMemo(createFinanceBrowserRuntime, []);
  const [state, setState] =
    useState<ProductIntelligenceLoadState>(
      productId
        ? runtime
          ? "loading"
          : "unconfigured"
        : "idle",
    );
  const [analytics, setAnalytics] =
    useState<ProductAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    if (!productId) {
      setState("idle");
      setAnalytics(null);
      setError(null);
      return;
    }

    if (!runtime) {
      setState("unconfigured");
      setAnalytics(null);
      setError(null);
      return;
    }

    const id = ++requestId.current;
    setState("loading");
    setError(null);

    try {
      const next =
        await runtime.productIntelligence.getProductAnalytics({
          productId,
          range,
        });
      if (id !== requestId.current) return;
      setAnalytics(next);
      setState("ready");
    } catch (cause) {
      if (id !== requestId.current) return;
      setAnalytics(null);
      setState("error");
      setError(
        cause instanceof Error
          ? cause.message
          : "Product analytics could not be loaded.",
      );
    }
  }, [productId, range, runtime]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { state, analytics, error, refresh };
}
