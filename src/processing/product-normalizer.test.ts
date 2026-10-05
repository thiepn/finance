import { DeterministicProductNormalizer } from "./product-normalizer.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const normalizer = new DeterministicProductNormalizer();

const candy = normalizer.normalize({
  rawName: "MMS PNUT 250G",
  merchantName: "REWE",
});

assert(candy.brand === "M&M's", `brand parse failed: ${JSON.stringify(candy)}`);
assert(candy.familyName === "M&M's Peanut", `family parse failed: ${JSON.stringify(candy)}`);
assert(candy.name === "M&M's Peanut 250 g", `name parse failed: ${JSON.stringify(candy)}`);
assert(candy.sizeValue === 250, "size value parse failed");
assert(candy.sizeUnit === "g", "size unit parse failed");
assert(
  candy.confidence >= 0.92,
  `branded sized product should auto-create, got ${candy.confidence}`,
);

const cola = normalizer.normalize({
  rawName: "COCA COLA ZERO 6X330ML",
  merchantName: "REWE",
});

assert(cola.brand === "Coca-Cola", `cola brand failed: ${JSON.stringify(cola)}`);
assert(cola.sizeValue === 1980, `pack total size failed: ${JSON.stringify(cola)}`);
assert(cola.sizeUnit === "ml", "pack unit failed");
assert(cola.metadata.pack_count === 6, "pack count metadata failed");

const milk = normalizer.normalize({
  rawName: "MILCH 1L",
  merchantName: "REWE",
});

assert(milk.sizeValue === 1000, "milk liter normalization failed");
assert(milk.sizeUnit === "ml", "milk unit normalization failed");
assert(
  milk.confidence < 0.92,
  `generic first-time item should require review, got ${milk.confidence}`,
);

console.log("Deterministic product normalizer fixtures passed");
