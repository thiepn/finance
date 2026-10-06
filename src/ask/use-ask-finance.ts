import { useCallback, useMemo, useState } from "react";
import type { AskFinanceAnswer } from "../domain/ask-finance.js";
import { createFinanceBrowserRuntime } from "../integrations/supabase-client.js";

export function useAskFinance() {
  const runtime = useMemo(createFinanceBrowserRuntime, []);
  const [answer, setAnswer] = useState<AskFinanceAnswer | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ask = useCallback(
    async (question: string) => {
      if (!runtime) {
        setError(
          "Finance is not connected. Configure the Supabase runtime before using Ask Finance.",
        );
        return null;
      }

      setLoading(true);
      setError(null);
      try {
        const next = await runtime.askFinance.ask(question);
        setAnswer(next);
        return next;
      } catch (cause) {
        const message =
          cause instanceof Error ? cause.message : "Ask Finance failed.";
        setError(message);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [runtime],
  );

  return {
    answer,
    loading,
    error,
    connected: runtime !== null,
    ask,
    clearAnswer: () => setAnswer(null),
  };
}
