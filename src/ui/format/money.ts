export interface MoneyFormatOptions {
  locale?: string;
  showSign?: boolean;
  compact?: boolean;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
}

export function formatMoneyMinor(
  amountMinor: number,
  currencyCode = "EUR",
  options: MoneyFormatOptions = {},
): string {
  if (!Number.isSafeInteger(amountMinor)) {
    throw new RangeError("amountMinor must be a safe integer");
  }

  const locale = options.locale ?? "de-DE";
  const amountMajor = amountMinor / 100;

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currencyCode,
    signDisplay: options.showSign ? "exceptZero" : "auto",
    notation: options.compact ? "compact" : "standard",
    minimumFractionDigits: options.minimumFractionDigits,
    maximumFractionDigits: options.maximumFractionDigits ?? 2,
  }).format(amountMajor);
}

export function formatPercent(
  value: number,
  locale = "de-DE",
  fractionDigits = 1,
): string {
  if (!Number.isFinite(value)) {
    throw new RangeError("percentage value must be finite");
  }

  return new Intl.NumberFormat(locale, {
    style: "percent",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
    signDisplay: "exceptZero",
  }).format(value);
}

export function moneyTone(
  amountMinor: number,
): "positive" | "negative" | "neutral" {
  if (amountMinor > 0) return "positive";
  if (amountMinor < 0) return "negative";
  return "neutral";
}
