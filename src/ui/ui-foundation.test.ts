import {
  formatMoneyMinor,
  formatPercent,
  moneyTone,
} from "./format/money.js";
import {
  nextFinanceTheme,
  resolveFinanceTheme,
} from "./theme/theme.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const eur = formatMoneyMinor(1250, "EUR", { locale: "de-DE" });
assert(eur.includes("12,50"), "EUR minor-unit formatting failed");
assert(eur.includes("€"), "EUR currency marker missing");

const signed = formatMoneyMinor(32140, "EUR", {
  locale: "de-DE",
  showSign: true,
});
assert(signed.includes("+"), "positive sign display failed");

const negative = formatMoneyMinor(-3872, "EUR", { locale: "de-DE" });
assert(negative.includes("-"), "negative money formatting failed");

assert(moneyTone(1) === "positive", "positive tone failed");
assert(moneyTone(-1) === "negative", "negative tone failed");
assert(moneyTone(0) === "neutral", "neutral tone failed");

const percent = formatPercent(-0.082, "de-DE", 1);
assert(percent.includes("8,2"), "percent formatting failed");
assert(percent.includes("-"), "negative percent sign failed");

assert(resolveFinanceTheme("system", true) === "dark", "system dark theme failed");
assert(resolveFinanceTheme("system", false) === "light", "system light theme failed");
assert(resolveFinanceTheme("light", true) === "light", "explicit light theme failed");
assert(nextFinanceTheme("dark") === "light", "dark toggle failed");
assert(nextFinanceTheme("light") === "dark", "light toggle failed");

console.log("Finance UI foundation fixtures passed");
