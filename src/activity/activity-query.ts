import type {
  ActivityEntityKind,
  ActivitySearchFilters,
  ActivitySource,
  ReceiptActivityStatus,
} from "../domain/activity.js";
import type {
  Necessity,
  TransactionStatus,
  TransactionType,
} from "../domain/finance.js";

export interface ActivityQueryParseOptions {
  now?: Date;
  minorUnitScale?: number;
}

export interface ParsedActivityQuery {
  filters: ActivitySearchFilters;
  freeText: string;
  recognizedTokens: readonly string[];
}

const MONTHS = new Map<string, number>([
  ["january", 0], ["jan", 0], ["januar", 0],
  ["february", 1], ["feb", 1], ["februar", 1],
  ["march", 2], ["mar", 2], ["märz", 2], ["maerz", 2],
  ["april", 3], ["apr", 3],
  ["may", 4], ["mai", 4],
  ["june", 5], ["jun", 5], ["juni", 5],
  ["july", 6], ["jul", 6], ["juli", 6],
  ["august", 7], ["aug", 7],
  ["september", 8], ["sep", 8], ["sept", 8],
  ["october", 9], ["oct", 9], ["oktober", 9], ["okt", 9],
  ["november", 10], ["nov", 10],
  ["december", 11], ["dec", 11], ["dezember", 11], ["dez", 11],
]);

const TRANSACTION_TYPES = new Set<TransactionType>([
  "expense","income","transfer","refund","reimbursement","adjustment","opening_balance",
]);
const TRANSACTION_STATUSES = new Set<TransactionStatus>(["draft","posted","void"]);
const SOURCES = new Set<ActivitySource>([
  "manual","receipt","import","bank_sync","recurring","system",
]);
const NECESSITIES = new Set<Necessity>([
  "essential","flexible","discretionary","unclassified",
]);
const ENTITY_KINDS = new Set<ActivityEntityKind>(["transaction","receipt"]);
const RECEIPT_STATUSES = new Set<ReceiptActivityStatus>([
  "captured","preprocessing","extracting","normalizing","classifying",
  "review_required","confirmed","processing_failed","incomplete",
]);

function splitTokens(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i] ?? "";
    if (quote) {
      if (char === quote) {
        quote = null;
      } else if (char === "\\" && i + 1 < input.length) {
        i += 1;
        current += input[i] ?? "";
      } else {
        current += char;
      }
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (current) tokens.push(current);
  return tokens;
}

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function parseMajorAmount(value: string, scale: number): number | null {
  const cleaned = value
    .replace(/[€$£¥]/g, "")
    .replace(/\s/g, "")
    .replace(",", ".");

  if (!/^\d+(?:\.\d{1,4})?$/.test(cleaned)) return null;
  const major = Number(cleaned);
  if (!Number.isFinite(major) || major < 0) return null;
  const minor = Math.round(major * scale);
  return Number.isSafeInteger(minor) ? minor : null;
}

function applyAmount(
  raw: string,
  filters: ActivitySearchFilters,
  scale: number,
): boolean {
  const range = raw.match(/^(.+?)\.\.(.+)$/);
  if (range) {
    const min = parseMajorAmount(range[1] ?? "", scale);
    const max = parseMajorAmount(range[2] ?? "", scale);
    if (min === null || max === null || min > max) return false;
    filters.amountMinMinor = min;
    filters.amountMaxMinor = max;
    return true;
  }

  const match = raw.match(/^(>=|<=|>|<|=)?(.+)$/);
  if (!match) return false;

  const operator = match[1] ?? "=";
  const amount = parseMajorAmount(match[2] ?? "", scale);
  if (amount === null) return false;

  if (operator === ">" || operator === ">=") {
    filters.amountMinMinor = operator === ">" ? amount + 1 : amount;
  } else if (operator === "<" || operator === "<=") {
    filters.amountMaxMinor = operator === "<" ? Math.max(0, amount - 1) : amount;
  } else {
    filters.amountMinMinor = amount;
    filters.amountMaxMinor = amount;
  }

  return true;
}

function monthBounds(raw: string, now: Date): { from: string; to: string } | null {
  const numeric = raw.match(/^(\d{4})-(\d{1,2})$/);
  let year: number;
  let month: number;

  if (numeric) {
    year = Number(numeric[1]);
    month = Number(numeric[2]) - 1;
  } else {
    const named = MONTHS.get(raw.toLowerCase());
    if (named === undefined) return null;
    year = now.getFullYear();
    month = named;
  }

  if (!Number.isInteger(year) || month < 0 || month > 11) return null;

  const start = new Date(year, month, 1, 0, 0, 0, 0);
  const end = new Date(year, month + 1, 1, 0, 0, 0, 0);
  end.setMilliseconds(end.getMilliseconds() - 1);

  return { from: start.toISOString(), to: end.toISOString() };
}

function parseBoolean(value: string): boolean | null {
  const normalized = value.toLowerCase();
  if (["true","yes","1","with"].includes(normalized)) return true;
  if (["false","no","0","without"].includes(normalized)) return false;
  return null;
}

export function parseActivityQuery(
  input: string,
  options: ActivityQueryParseOptions = {},
): ParsedActivityQuery {
  const filters: ActivitySearchFilters = {};
  const free: string[] = [];
  const recognized: string[] = [];
  const now = options.now ?? new Date();
  const scale = options.minorUnitScale ?? 100;

  for (const token of splitTokens(input.trim())) {
    const colon = token.indexOf(":");
    if (colon <= 0) {
      free.push(token);
      continue;
    }

    const key = token.slice(0, colon).toLowerCase();
    const rawValue = token.slice(colon + 1).trim();
    if (!rawValue) {
      free.push(token);
      continue;
    }

    let handled = true;

    switch (key) {
      case "merchant":
        filters.merchantName = rawValue;
        break;
      case "category":
        filters.categoryName = rawValue;
        break;
      case "product":
        filters.productName = rawValue;
        break;
      case "account":
        filters.accountName = rawValue;
        break;
      case "tag":
        filters.tagName = rawValue;
        break;
      case "amount":
        handled = applyAmount(rawValue, filters, scale);
        break;
      case "from":
      case "after": {
        const parsed = new Date(rawValue);
        handled = !Number.isNaN(parsed.getTime());
        if (handled) filters.from = parsed.toISOString();
        break;
      }
      case "to":
      case "before": {
        const parsed = new Date(rawValue);
        handled = !Number.isNaN(parsed.getTime());
        if (handled) filters.to = parsed.toISOString();
        break;
      }
      case "month": {
        const bounds = monthBounds(rawValue, now);
        handled = bounds !== null;
        if (bounds) {
          filters.from = bounds.from;
          filters.to = bounds.to;
        }
        break;
      }
      case "type": {
        const values = splitList(rawValue).filter(
          (value): value is TransactionType =>
            TRANSACTION_TYPES.has(value as TransactionType),
        );
        handled = values.length > 0;
        if (handled) filters.transactionTypes = values;
        break;
      }
      case "status": {
        const values = splitList(rawValue).filter(
          (value): value is TransactionStatus =>
            TRANSACTION_STATUSES.has(value as TransactionStatus),
        );
        handled = values.length > 0;
        if (handled) filters.transactionStatuses = values;
        break;
      }
      case "source": {
        const values = splitList(rawValue).filter(
          (value): value is ActivitySource =>
            SOURCES.has(value as ActivitySource),
        );
        handled = values.length > 0;
        if (handled) filters.sources = values;
        break;
      }
      case "necessity": {
        const values = splitList(rawValue).filter(
          (value): value is Necessity =>
            NECESSITIES.has(value as Necessity),
        );
        handled = values.length > 0;
        if (handled) filters.necessities = values;
        break;
      }
      case "kind": {
        const values = splitList(rawValue).filter(
          (value): value is ActivityEntityKind =>
            ENTITY_KINDS.has(value as ActivityEntityKind),
        );
        handled = values.length > 0;
        if (handled) filters.entityKinds = values;
        break;
      }
      case "receipt": {
        const bool = parseBoolean(rawValue);
        if (bool !== null) {
          filters.hasReceipt = bool;
        } else if (rawValue.toLowerCase() === "review") {
          filters.receiptStatuses = ["review_required"];
          filters.includeUnconfirmedReceipts = true;
        } else {
          const values = splitList(rawValue).filter(
            (value): value is ReceiptActivityStatus =>
              RECEIPT_STATUSES.has(value as ReceiptActivityStatus),
          );
          handled = values.length > 0;
          if (handled) {
            filters.receiptStatuses = values;
            filters.includeUnconfirmedReceipts = true;
          }
        }
        break;
      }
      default:
        handled = false;
    }

    if (handled) recognized.push(token);
    else free.push(token);
  }

  const freeText = free.join(" ").trim();
  if (freeText) filters.q = freeText;

  return {
    filters,
    freeText,
    recognizedTokens: recognized,
  };
}

export function mergeActivityFilters(
  parsed: ActivitySearchFilters,
  explicit: ActivitySearchFilters,
): ActivitySearchFilters {
  return { ...parsed, ...explicit };
}
