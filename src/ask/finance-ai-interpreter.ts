import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AskFinanceDimension,
  AskFinanceIntent,
  AskFinanceParseResult,
  AskFinanceQuery,
} from "../domain/ask-finance.js";

interface CoreFailure {
  ok: false;
  error: {
    code: string;
    message: string;
    requestId: string;
  };
}

interface CoreSuccess {
  ok: true;
  data: {
    capability: "finance.interpretQuestion";
    version: number;
    model: "gpt-6-luna";
    data: unknown;
  };
  meta: { requestId: string };
}

const intents = new Set<AskFinanceIntent>([
  "spending",
  "top_spending",
  "cash_flow",
  "product_prices",
  "recurring",
  "budget",
  "net_worth",
  "receipt_reconciliation",
]);

const dimensions = new Set<AskFinanceDimension>([
  "category",
  "merchant",
  "necessity",
  "product",
]);

const necessities = new Set([
  "essential",
  "flexible",
  "discretionary",
  "unclassified",
] as const);

const periodKinds = new Set(["week", "month", "quarter", "year"] as const);

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function localDate(date: Date): string {
  return [
    date.getFullYear().toString().padStart(4, "0"),
    (date.getMonth() + 1).toString().padStart(2, "0"),
    date.getDate().toString().padStart(2, "0"),
  ].join("-");
}

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const timestamp = Date.parse(`${value}T12:00:00Z`);
  return (
    Number.isFinite(timestamp) &&
    new Date(timestamp).toISOString().slice(0, 10) === value
  );
}

export function normalizeCoreGatewayUrl(value: string): string | null {
  try {
    const url = new URL(value);
    const localDevelopment =
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.protocol !== "https:" && !localDevelopment) return null;
    if (url.username || url.password || url.search || url.hash) return null;
    if (url.pathname !== "/" && url.pathname !== "") return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function parseFinanceAiInterpretation(
  question: string,
  value: unknown,
): AskFinanceParseResult {
  const raw = record(value);
  if (!raw || (raw.status !== "parsed" && raw.status !== "unsupported")) {
    throw new Error("Finance AI returned an invalid interpretation.");
  }

  if (raw.status === "unsupported") {
    const reason =
      typeof raw.reason === "string" && raw.reason.trim()
        ? raw.reason.trim()
        : "Finance AI could not map that question to a supported query.";
    return { query: null, reason };
  }

  const intent = raw.intent;
  const period = record(raw.period);
  if (
    typeof intent !== "string" ||
    !intents.has(intent as AskFinanceIntent) ||
    !period
  ) {
    throw new Error("Finance AI returned an invalid executable query.");
  }

  const kind = period.kind;
  const anchorDate = period.anchorDate;
  const label = period.label;
  if (
    typeof kind !== "string" ||
    !periodKinds.has(kind as "week" | "month" | "quarter" | "year") ||
    !validDate(anchorDate) ||
    typeof label !== "string" ||
    !label.trim() ||
    label.length > 80
  ) {
    throw new Error("Finance AI returned an invalid period.");
  }

  const query: AskFinanceQuery = {
    intent: intent as AskFinanceIntent,
    question,
    period: {
      kind: kind as "week" | "month" | "quarter" | "year",
      anchorDate,
      label: label.trim(),
    },
    limit: 8,
  };

  if (raw.dimension !== null && raw.dimension !== undefined) {
    if (
      typeof raw.dimension !== "string" ||
      !dimensions.has(raw.dimension as AskFinanceDimension)
    ) {
      throw new Error("Finance AI returned an invalid dimension.");
    }
    query.dimension = raw.dimension as AskFinanceDimension;
  }

  if (raw.necessity !== null && raw.necessity !== undefined) {
    if (
      typeof raw.necessity !== "string" ||
      !necessities.has(raw.necessity as (typeof necessities extends Set<infer T> ? T : never))
    ) {
      throw new Error("Finance AI returned an invalid necessity.");
    }
    query.necessity = raw.necessity as NonNullable<AskFinanceQuery["necessity"]>;
  }

  if (query.intent === "top_spending" && !query.dimension) {
    query.dimension = "category";
  }

  return { query, reason: null };
}

export type FinanceQuestionInterpreter = (
  question: string,
  now: Date,
) => Promise<AskFinanceParseResult>;

export function createFinanceAiInterpreter(
  client: SupabaseClient,
  coreGatewayUrl: string | undefined,
): FinanceQuestionInterpreter | null {
  const baseUrl = coreGatewayUrl ? normalizeCoreGatewayUrl(coreGatewayUrl) : null;
  if (!baseUrl) return null;

  return async (question: string, now: Date): Promise<AskFinanceParseResult> => {
    const session = await client.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) throw new Error("Finance session is unavailable.");

    const response = await fetch(`${baseUrl}/v1/finance/ai/interpret`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: {
          question,
          today: localDate(now),
        },
      }),
      redirect: "error",
      signal: AbortSignal.timeout(12_000),
    });

    const payload = (await response.json().catch(() => null)) as
      | CoreSuccess
      | CoreFailure
      | null;

    if (!response.ok || !payload || payload.ok !== true) {
      const failure = payload && payload.ok === false ? payload.error : null;
      throw new Error(
        failure?.code ?? `Finance AI unavailable (HTTP ${response.status}).`,
      );
    }

    if (
      payload.data.capability !== "finance.interpretQuestion" ||
      payload.data.model !== "gpt-6-luna"
    ) {
      throw new Error("Finance AI returned mismatched response metadata.");
    }

    return parseFinanceAiInterpretation(question, payload.data.data);
  };
}
