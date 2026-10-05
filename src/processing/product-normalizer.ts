import type { ProductCandidate } from "../domain/product-intelligence.js";

export interface ProductNormalizationInput {
  rawName: string;
  merchantName?: string | null;
}

interface SizeMatch {
  value: number;
  unit: string;
  matchedText: string;
  packCount?: number;
  unitSizeValue?: number;
}

const BRAND_PATTERNS: readonly {
  pattern: RegExp;
  canonical: string;
  replacement?: string;
}[] = [
  { pattern: /\bm\s*&?\s*m'?s?\b|\bmms\b/i, canonical: "M&M's", replacement: "M&M's" },
  { pattern: /\bcoca[ -]?cola\b|\bcoke\b/i, canonical: "Coca-Cola", replacement: "Coca-Cola" },
  { pattern: /\bred\s*bull\b/i, canonical: "Red Bull", replacement: "Red Bull" },
  { pattern: /\bharibo\b/i, canonical: "Haribo", replacement: "Haribo" },
  { pattern: /\bmilka\b/i, canonical: "Milka", replacement: "Milka" },
  { pattern: /\bnutella\b/i, canonical: "Nutella", replacement: "Nutella" },
  { pattern: /\bkinder\b/i, canonical: "Kinder", replacement: "Kinder" },
  { pattern: /\boreo\b/i, canonical: "Oreo", replacement: "Oreo" },
  { pattern: /\bpringles\b/i, canonical: "Pringles", replacement: "Pringles" },
  { pattern: /\bpepsi\b/i, canonical: "Pepsi", replacement: "Pepsi" },
  { pattern: /\bnivea\b/i, canonical: "Nivea", replacement: "Nivea" },
  { pattern: /\bja!?\b/i, canonical: "ja!", replacement: "ja!" },
];

const TOKEN_EXPANSIONS = new Map<string, string>([
  ["PNUT", "Peanut"],
  ["PEAN", "Peanut"],
  ["CHOC", "Chocolate"],
  ["CHOCO", "Chocolate"],
  ["ORG", "Original"],
  ["VAN", "Vanilla"],
  ["STRWB", "Strawberry"],
]);

const PRODUCT_TYPE_PATTERNS: readonly [RegExp, string][] = [
  [/\b(chocolate|schokolade|peanut|erdnuss|riegel)\b/i, "Chocolate"],
  [/\b(milch|milk)\b/i, "Milk"],
  [/\b(wasser|water)\b/i, "Water"],
  [/\b(cola|limonade|soda|energy)\b/i, "Soft drink"],
  [/\b(chips|crisps|pringles)\b/i, "Chips"],
  [/\b(joghurt|yogurt)\b/i, "Yogurt"],
  [/\b(shampoo|duschgel|seife|soap)\b/i, "Personal care"],
];

function collapseSpaces(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function parseNumber(value: string): number | null {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function canonicalSize(value: number, unit: string): { value: number; unit: string } {
  const u = unit.toLowerCase();
  if (u === "kg") return { value: value * 1000, unit: "g" };
  if (u === "l") return { value: value * 1000, unit: "ml" };
  if (u === "cl") return { value: value * 10, unit: "ml" };
  if (["stk", "st", "pcs", "pc", "ct"].includes(u)) {
    return { value, unit: "count" };
  }
  return { value, unit: u };
}

function findSize(value: string): SizeMatch | null {
  const pack = value.match(
    /\b(\d{1,2})\s*[x×]\s*(\d+(?:[,.]\d+)?)\s*(kg|g|l|cl|ml|stk|st|pcs|pc|ct)\b/i,
  );
  if (pack) {
    const count = Number(pack[1]);
    const unitValue = parseNumber(pack[2] ?? "");
    const unit = pack[3] ?? "";
    if (Number.isFinite(count) && count > 0 && unitValue !== null) {
      const canonical = canonicalSize(unitValue, unit);
      return {
        value: canonical.value * count,
        unit: canonical.unit,
        matchedText: pack[0],
        packCount: count,
        unitSizeValue: canonical.value,
      };
    }
  }

  const simple = value.match(
    /\b(\d+(?:[,.]\d+)?)\s*(kg|g|l|cl|ml|stk|st|pcs|pc|ct)\b/i,
  );
  if (!simple) return null;

  const numeric = parseNumber(simple[1] ?? "");
  if (numeric === null) return null;
  const canonical = canonicalSize(numeric, simple[2] ?? "");
  return {
    value: canonical.value,
    unit: canonical.unit,
    matchedText: simple[0],
  };
}

function titleToken(token: string): string {
  const expansion = TOKEN_EXPANSIONS.get(token.toUpperCase());
  if (expansion) return expansion;

  if (/^[A-Z0-9&'!.-]{2,}$/.test(token)) {
    return token
      .toLowerCase()
      .replace(/^\p{L}/u, (char) => char.toUpperCase());
  }

  return token;
}

function formatSize(value: number, unit: string): string {
  const formatted = Number.isInteger(value)
    ? String(value)
    : String(Number(value.toFixed(3)));
  return `${formatted} ${unit}`;
}

function inferProductType(name: string): string | undefined {
  for (const [pattern, type] of PRODUCT_TYPE_PATTERNS) {
    if (pattern.test(name)) return type;
  }
  return undefined;
}

export class DeterministicProductNormalizer {
  readonly version = "deterministic-product-1";

  normalize(input: ProductNormalizationInput): ProductCandidate {
    const raw = collapseSpaces(
      input.rawName
        .normalize("NFKC")
        .replace(/[|_*]+/g, " ")
        .replace(/\s+-\s+/g, " "),
    );

    if (!raw) {
      return {
        name: "Unknown product",
        confidence: 0,
        metadata: { raw_name: input.rawName, reason: "empty" },
      };
    }

    const size = findSize(raw);
    let core = size
      ? collapseSpaces(raw.replace(size.matchedText, " "))
      : raw;

    let brand: string | undefined;
    for (const entry of BRAND_PATTERNS) {
      if (entry.pattern.test(core)) {
        brand = entry.canonical;
        core = collapseSpaces(core.replace(entry.pattern, entry.replacement ?? entry.canonical));
        break;
      }
    }

    const tokens = core
      .split(" ")
      .filter(Boolean)
      .map(titleToken);

    let familyName = collapseSpaces(tokens.join(" "));
    if (!familyName) familyName = raw;

    if (brand && !familyName.toLowerCase().includes(brand.toLowerCase())) {
      familyName = `${brand} ${familyName}`;
    }

    const productType = inferProductType(familyName);
    const name = size
      ? `${familyName} ${formatSize(size.value, size.unit)}`
      : familyName;

    let confidence = 0.72;
    if (brand) confidence += 0.12;
    if (size) confidence += 0.08;
    if (tokens.length >= 2) confidence += 0.05;
    if (productType) confidence += 0.02;

    const suspiciousNumericTokens = core
      .split(" ")
      .filter((token) => /^\d{4,}$/.test(token)).length;
    if (suspiciousNumericTokens) confidence -= 0.15;

    confidence = Math.max(0, Math.min(0.99, confidence));

    return {
      name,
      ...(brand ? { brand } : {}),
      familyName,
      ...(productType ? { productType } : {}),
      ...(size ? { sizeValue: size.value, sizeUnit: size.unit } : {}),
      confidence,
      metadata: {
        raw_name: input.rawName,
        ...(input.merchantName ? { merchant_name: input.merchantName } : {}),
        ...(size?.packCount ? { pack_count: size.packCount } : {}),
        ...(size?.unitSizeValue
          ? { pack_unit_size_value: size.unitSizeValue, pack_unit: size.unit }
          : {}),
        normalizer_version: this.version,
      },
    };
  }
}
