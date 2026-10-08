/**
 * Finance V2 presentation-only helpers.
 * All monetary calculations here are formatting/proportions, not ledger math.
 * Trust the domain ledger for actual posted totals.
 */
export function assertMinorUnits(amountMinor: number): void {
  if (!Number.isSafeInteger(amountMinor)) throw new RangeError("Money must use safe integer minor units");
}

const exponentCache = new Map<string, number>();
export function currencyMinorDigits(currency: string): number {
  const iso = currency.toUpperCase();
  let digits = exponentCache.get(iso);
  if (digits === undefined) {
    const nf = new Intl.NumberFormat("en", { style: "currency", currency: iso });
    digits = nf.resolvedOptions().maximumFractionDigits;
    exponentCache.set(iso, digits);
  }
  return digits;
}

export function formatSignalMoney(
  amountMinor: number,
  currency = "EUR",
  locale = "de-DE",
  sign: "auto" | "always" | "exceptZero" = "auto",
): string {
  assertMinorUnits(amountMinor);
  const digits = currencyMinorDigits(currency);
  const divisor = 10 ** digits;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency.toUpperCase(),
    currencyDisplay: "symbol",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    signDisplay: sign,
  }).format(amountMinor / divisor);
}

export function boundedPercent(numerator: number, denominator: number): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) {
    throw new RangeError("Progress values must be finite");
  }
  if (denominator <= 0) return 0;
  return Math.max(0, Math.min(100, (numerator / denominator) * 100));
}

export type MoneySource = "posted" | "planned" | "forecast" | "receipt" | "pending" | "valuation";
export const moneySourceLabels: Readonly<Record<MoneySource, string>> = {
  posted: "Posted ledger",
  planned: "Budget / plan",
  forecast: "Forecast estimate",
  receipt: "Receipt evidence, not a ledger posting",
  pending: "Pending review",
  valuation: "Asset valuation, not available cash",
};
