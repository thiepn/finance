import type { ReceiptCapture } from "../domain/receipt-capture.js";
import type {
  ExtractedReceiptHeader,
  ExtractedReceiptItem,
  ExtractedReceiptLine,
  ReceiptLineKind,
  ReceiptOcrPage,
  ReceiptStructuredParser,
  StructuredReceiptExtraction,
} from "../domain/receipt-processing.js";

interface FlatLine {
  pageId: string;
  pageIndex: number;
  pageLineIndex: number;
  globalIndex: number;
  rawText: string;
  normalizedText: string;
  confidence: number;
}

interface MoneyMatch {
  minor: number;
  token: string;
  index: number;
}

const TOTAL_RE = /\b(summe|gesamt|total|zu\s*zahlen|endbetrag|zahlbetrag)\b/i;
const SUBTOTAL_RE = /\b(zwischensumme|subtotal|warenwert)\b/i;
const DISCOUNT_RE = /\b(rabatt|coupon|gutschein|ersparnis|aktion|discount)\b/i;
const DEPOSIT_RETURN_RE = /\b(pfand).*(rück|retour|zurück|gutschrift)|\b(leergut)\b/i;
const DEPOSIT_RE = /\bpfand\b/i;
const RETURN_RE = /\b(retour|storno|rückgabe|erstattung)\b/i;
const FEE_RE = /\b(gebühr|fee)\b/i;
const TAX_RE = /\b(mwst|ust|mehrwertsteuer|vat)\b/i;
const PAYMENT_RE =
  /\b(girocard|ec[- ]?karte|debit|kreditkarte|visa|mastercard|amex|kontaktlos|karte|bar|cash)\b/i;
const DATE_RE = /\b(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})\b/;
const TIME_RE = /\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/;
const RECEIPT_NO_RE =
  /\b(?:bon|beleg|receipt|kassenbon)\s*(?:nr\.?|nummer|no\.?|#)?\s*[:.]?\s*([a-z0-9][a-z0-9\/-]{2,})\b/i;
const ADDRESS_RE =
  /\b(straße|str\.|strasse|weg|platz|allee|gasse|ring|ufer|chaussee)\b.*\d/i;
const PHONE_RE = /\b(tel\.?|telefon|fon|fax|www\.|https?:|@)\b/i;

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function parseDecimal(value: string): number | null {
  const normalized = value.trim().replace(/\s/g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function moneyTokenToMinor(token: string): number | null {
  let value = token
    .replace(/[€$]/g, "")
    .replace(/EUR/gi, "")
    .replace(/\s/g, "")
    .replace(/[A-Z*]+$/i, "");

  const negative =
    value.startsWith("-") ||
    value.startsWith("−") ||
    /^\(.*\)$/.test(value);

  value = value.replace(/[()−+]/g, "");

  if (value.includes(",") && value.includes(".")) {
    const comma = value.lastIndexOf(",");
    const dot = value.lastIndexOf(".");
    if (comma > dot) {
      value = value.replace(/\./g, "").replace(",", ".");
    } else {
      value = value.replace(/,/g, "");
    }
  } else if (value.includes(",")) {
    value = value.replace(/\./g, "").replace(",", ".");
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed * 100) * (negative ? -1 : 1);
}

function findMoneyMatches(text: string): MoneyMatch[] {
  const regex =
    /(?:[-−+]?\s*(?:\d{1,3}(?:\.\d{3})+|\d+)[,.]\d{2}|\((?:\d{1,3}(?:\.\d{3})+|\d+)[,.]\d{2}\))\s*(?:€|EUR)?/gi;
  const matches: MoneyMatch[] = [];

  for (const match of text.matchAll(regex)) {
    const token = match[0];
    const minor = moneyTokenToMinor(token);
    if (minor !== null && match.index !== undefined) {
      matches.push({ minor, token, index: match.index });
    }
  }

  return matches;
}

function lastMoney(text: string): MoneyMatch | null {
  const matches = findMoneyMatches(text);
  return matches.at(-1) ?? null;
}

function classifyLine(text: string, money: MoneyMatch | null): ReceiptLineKind {
  if (TOTAL_RE.test(text)) return "total";
  if (SUBTOTAL_RE.test(text)) return "subtotal";
  if (TAX_RE.test(text)) return "tax";
  if (PAYMENT_RE.test(text) && !money) return "payment";
  if (DEPOSIT_RETURN_RE.test(text)) return "deposit_return";
  if (DEPOSIT_RE.test(text)) return "deposit";
  if (DISCOUNT_RE.test(text)) return "discount";
  if (RETURN_RE.test(text)) return "return";
  if (FEE_RE.test(text)) return "fee";
  if (PAYMENT_RE.test(text) && money) return "payment";
  if (money && /[\p{L}]/u.test(text)) return "item";
  return "informational";
}

function itemNameFromLine(text: string, money: MoneyMatch | null): string {
  let name = text;
  if (money) {
    name = `${text.slice(0, money.index)} ${text.slice(
      money.index + money.token.length,
    )}`;
  }

  const quantityExpression =
    /\b\d+(?:[,.]\d+)?\s*(?:x|\*)\s*[-−+]?\d+[,.]\d{2}\b/i;
  name = name.replace(quantityExpression, " ");
  name = name.replace(/\b\d+[,.]\d{3}\s*kg\b/gi, " ");
  name = name.replace(/[€*]+/g, " ");
  return normalizeWhitespace(name).replace(/^[-:]+|[-:]+$/g, "").trim();
}

function quantityAndUnitPrice(
  text: string,
): { quantity?: number; unitPriceMinor?: number } {
  const simple = text.match(
    /\b(\d+(?:[,.]\d+)?)\s*(?:x|\*)\s*([-−+]?\d+[,.]\d{2})\b/i,
  );
  if (simple) {
    const quantity = parseDecimal(simple[1] ?? "");
    const unitPriceMinor = moneyTokenToMinor(simple[2] ?? "");
    return {
      ...(quantity !== null ? { quantity } : {}),
      ...(unitPriceMinor !== null ? { unitPriceMinor } : {}),
    };
  }

  const weighted = text.match(
    /\b(\d+[,.]\d{3})\s*kg\b.*?([-−+]?\d+[,.]\d{2})\s*(?:€?\s*\/\s*kg|je\s*kg)?/i,
  );
  if (weighted) {
    const quantity = parseDecimal(weighted[1] ?? "");
    const unitPriceMinor = moneyTokenToMinor(weighted[2] ?? "");
    return {
      ...(quantity !== null ? { quantity } : {}),
      ...(unitPriceMinor !== null ? { unitPriceMinor } : {}),
    };
  }

  return {};
}

function detectMerchant(lines: readonly FlatLine[]): string | undefined {
  const candidates = lines.slice(0, 10).filter((line) => {
    const text = line.normalizedText;
    return (
      text.length >= 2 &&
      text.length <= 100 &&
      /[\p{L}]/u.test(text) &&
      !DATE_RE.test(text) &&
      !TIME_RE.test(text) &&
      !ADDRESS_RE.test(text) &&
      !PHONE_RE.test(text) &&
      !TOTAL_RE.test(text) &&
      !PAYMENT_RE.test(text) &&
      !RECEIPT_NO_RE.test(text)
    );
  });

  const scored = candidates
    .map((line) => {
      const uppercaseLetters = [...line.normalizedText].filter(
        (char) => /[A-ZÄÖÜ]/.test(char),
      ).length;
      const letters = [...line.normalizedText].filter((char) =>
        /[\p{L}]/u.test(char),
      ).length;
      const upperRatio = letters ? uppercaseLetters / letters : 0;
      const companyBonus = /markt|market|aldi|lidl|rewe|edeka|dm|rossmann|kaufland/i.test(
        line.normalizedText,
      )
        ? 1
        : 0;
      return {
        text: line.normalizedText,
        score:
          companyBonus * 10 +
          upperRatio * 3 +
          Math.max(0, 10 - line.pageLineIndex) / 10,
      };
    })
    .sort((a, b) => b.score - a.score);

  return scored[0]?.text;
}

function detectAddress(lines: readonly FlatLine[]): string | undefined {
  const index = lines.findIndex((line) => ADDRESS_RE.test(line.normalizedText));
  if (index < 0) return undefined;

  const first = lines[index]?.normalizedText;
  const next = lines[index + 1]?.normalizedText;
  if (!first) return undefined;

  if (next && /\b\d{5}\b/.test(next)) {
    return `${first}, ${next}`;
  }
  return first;
}

function detectPurchasedAt(lines: readonly FlatLine[]): string | undefined {
  for (const line of lines) {
    const date = line.normalizedText.match(DATE_RE);
    if (!date) continue;

    const time =
      line.normalizedText.match(TIME_RE) ??
      lines
        .slice(line.globalIndex, line.globalIndex + 3)
        .map((candidate) => candidate.normalizedText.match(TIME_RE))
        .find((candidate) => candidate);

    const day = Number(date[1]);
    const month = Number(date[2]);
    let year = Number(date[3]);
    if (year < 100) year += year >= 70 ? 1900 : 2000;

    const hour = Number(time?.[1] ?? 12);
    const minute = Number(time?.[2] ?? 0);
    const local = new Date(year, month - 1, day, hour, minute, 0, 0);

    if (!Number.isNaN(local.getTime())) {
      return local.toISOString();
    }
  }
  return undefined;
}

function detectReceiptNumber(lines: readonly FlatLine[]): string | undefined {
  for (const line of lines) {
    const match = line.normalizedText.match(RECEIPT_NO_RE);
    if (match?.[1]) return match[1];
  }
  return undefined;
}

function detectPaymentMethod(lines: readonly FlatLine[]): string | undefined {
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const text = lines[i]?.normalizedText ?? "";
    const match = text.match(PAYMENT_RE);
    if (match?.[1]) return match[1].toUpperCase();
  }
  return undefined;
}

function bestHeaderAmount(
  lines: readonly ExtractedReceiptLine[],
  kind: ReceiptLineKind,
): number | undefined {
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (line?.kind === kind && line.amountMinor !== undefined) {
      return line.amountMinor;
    }
  }
  return undefined;
}

function average(values: readonly (number | null | undefined)[]): number | null {
  const present = values.filter(
    (value): value is number => value !== null && value !== undefined,
  );
  if (!present.length) return null;
  return present.reduce((sum, value) => sum + value, 0) / present.length;
}

export class GermanReceiptParser implements ReceiptStructuredParser {
  readonly parserId = "deterministic-de-receipt";
  readonly parserVersion = "1.0.0";

  parse(
    capture: ReceiptCapture,
    pages: readonly ReceiptOcrPage[],
  ): StructuredReceiptExtraction {
    const flat: FlatLine[] = [];
    let globalIndex = 0;

    for (const page of [...pages].sort((a, b) => a.pageIndex - b.pageIndex)) {
      const rawLines = page.rawText.split(/\r?\n/);
      rawLines.forEach((raw, pageLineIndex) => {
        const normalizedText = normalizeWhitespace(raw);
        if (!normalizedText) return;

        flat.push({
          pageId: page.pageId,
          pageIndex: page.pageIndex,
          pageLineIndex,
          globalIndex,
          rawText: raw.trim(),
          normalizedText,
          confidence: page.confidence ?? 0.72,
        });
        globalIndex += 1;
      });
    }

    const lines: ExtractedReceiptLine[] = flat.map((line) => {
      const money = lastMoney(line.normalizedText);
      const kind = classifyLine(line.normalizedText, money);
      const quantityInfo = quantityAndUnitPrice(line.normalizedText);

      return {
        pageId: line.pageId,
        lineIndex: line.globalIndex,
        pageLineIndex: line.pageLineIndex,
        rawText: line.rawText,
        normalizedText: itemNameFromLine(line.normalizedText, money),
        kind,
        ...(money ? { amountMinor: money.minor } : {}),
        ...quantityInfo,
        confidence: clamp(line.confidence),
        metadata: { page_index: line.pageIndex },
      };
    });

    const items: ExtractedReceiptItem[] = [];
    for (const line of lines) {
      if (
        !["item", "deposit", "deposit_return", "return", "fee"].includes(
          line.kind,
        ) ||
        line.amountMinor === undefined
      ) {
        continue;
      }

      const rawName =
        line.normalizedText && line.normalizedText.length >= 1
          ? line.normalizedText
          : line.rawText;

      const confidence = clamp(
        (line.confidence ?? 0.72) +
          (rawName.length >= 3 ? 0.04 : -0.15) +
          (line.amountMinor !== 0 ? 0.02 : -0.05),
      );

      items.push({
        lineIndex: line.lineIndex,
        sourceLineIndex: line.lineIndex,
        rawName,
        quantity: line.quantity ?? 1,
        ...(line.unitPriceMinor !== undefined
          ? { unitPriceMinor: line.unitPriceMinor }
          : {}),
        lineTotalMinor: line.amountMinor,
        discountMinor: 0,
        depositMinor: line.kind === "deposit" ? Math.max(0, line.amountMinor) : 0,
        effectiveTotalMinor: line.amountMinor,
        confidence,
        reviewRequired: confidence < 0.82 || rawName.length < 2,
        metadata: { line_kind: line.kind },
      });
    }

    const totalMinor = bestHeaderAmount(lines, "total");
    const subtotalMinor = bestHeaderAmount(lines, "subtotal");

    const taxValues = lines
      .filter((line) => line.kind === "tax" && line.amountMinor !== undefined)
      .map((line) => line.amountMinor as number);
    const taxMinor = taxValues.length
      ? taxValues.reduce((sum, value) => sum + Math.abs(value), 0)
      : undefined;

    const discountMinor = lines
      .filter(
        (line) => line.kind === "discount" && line.amountMinor !== undefined,
      )
      .reduce((sum, line) => sum + Math.abs(line.amountMinor ?? 0), 0);

    const depositMinor = lines
      .filter(
        (line) => line.kind === "deposit" && line.amountMinor !== undefined,
      )
      .reduce((sum, line) => sum + Math.max(0, line.amountMinor ?? 0), 0);

    const merchantName = detectMerchant(flat);
    const merchantAddress = detectAddress(flat);
    const purchasedAt = detectPurchasedAt(flat);
    const receiptNumber = detectReceiptNumber(flat);
    const paymentMethod = detectPaymentMethod(flat);

    const pageConfidence = average(pages.map((page) => page.confidence));
    const detectedFields = [
      merchantName,
      purchasedAt,
      totalMinor !== undefined ? "total" : undefined,
      items.length ? "items" : undefined,
    ].filter(Boolean).length;

    const headerConfidence = clamp(
      (pageConfidence ?? 0.72) * 0.7 + (detectedFields / 4) * 0.3,
    );

    const header: ExtractedReceiptHeader = {
      ...(merchantName ? { merchantName } : {}),
      ...(merchantAddress ? { merchantAddress } : {}),
      ...(purchasedAt ? { purchasedAt } : {}),
      currencyCode: "EUR",
      ...(subtotalMinor !== undefined ? { subtotalMinor } : {}),
      ...(taxMinor !== undefined ? { taxMinor } : {}),
      discountMinor,
      depositMinor,
      ...(totalMinor !== undefined ? { totalMinor } : {}),
      ...(receiptNumber ? { receiptNumber } : {}),
      ...(paymentMethod ? { paymentMethod } : {}),
      locale: "de-DE",
      confidence: headerConfidence,
    };

    return {
      header,
      pages,
      lines,
      items,
    };
  }
}
