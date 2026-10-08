import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const base = new URL("../", import.meta.url);
const doc = JSON.parse(readFileSync(new URL("../design/p24/route-contract.json", import.meta.url), "utf8"));
const expectedLegacy = [
  "overview", "activity", "scan", "accounts", "receipts", "insights",
  "categories", "merchants", "products", "recurring", "budget", "goals",
  "net-worth", "ask", "imports", "rules", "settings"
];
const sectionIds = new Set(doc.primary.map(item => item.id));
const pathSet = new Set();
const idSet = new Set();
for (const route of doc.routes) {
  assert(route.id && route.path && route.section, "Each route needs id/path/section");
  assert(route.path.startsWith("/"), "Routes must use root-relative paths: " + route.id);
  assert(!pathSet.has(route.path), "Duplicate canonical path: " + route.path);
  assert(!idSet.has(route.id), "Duplicate route id: " + route.id);
  pathSet.add(route.path);
  idSet.add(route.id);
  assert(route.access === "private" || route.access === "public", "Invalid access mode");
  assert(sectionIds.has(route.section) || ["settings", "auth"].includes(route.section), "Unknown route parent: " + route.id);
  assert(!route.path.startsWith("/api/") && !route.path.startsWith("/.well-known/"), "Do not shadow server routes");
}
assert.equal(doc.implementationStatus, "design-contract-only");
assert.equal(doc.primary.length, 6, "Desktop primary navigation must have six top-level tasks");
assert.deepEqual(doc.desktopPrimary, doc.primary.map(item => item.id));
for (const item of doc.primary) {
  assert(pathSet.has(item.path), "Top-level entry must resolve: " + item.path);
}
assert.equal(doc.mobileTabs.length, 5, "Mobile bottom nav must fit five destinations");
for (const tab of doc.mobileTabs) {
  assert(pathSet.has(tab.path), "Mobile destination unresolved: " + tab.path);
  assert(tab.label && tab.id, "Mobile tab missing label");
}
assert.equal(doc.mobileTabs.filter(tab => tab.action).length, 1, "Exactly one mobile primary capture action");
for (const item of doc.mobileMoreMenu) {
  assert(pathSet.has(item.path), "Mobile More destination unresolved: " + item.path);
}
const aliases = doc.routes.filter(route => route.legacyHash);
assert.equal(aliases.length, expectedLegacy.length, "Every old hash route must migrate");
assert.deepEqual(aliases.map(route => route.legacyHash).sort(), [...expectedLegacy].sort(), "Missing or duplicate old hash aliases");
assert(doc.routes.find(route => route.id === "auth-callback")?.access === "public");
assert(doc.routes.find(route => route.id === "sign-in")?.access === "public");
assert(doc.routes.find(route => route.id === "home")?.access === "private");
for (const [routePath, params] of Object.entries(doc.queryContracts)) {
  assert(pathSet.has(routePath), "Orphan query contract: " + routePath);
  assert.equal(params.length, new Set(params).size, "Duplicate query keys on " + routePath);
}
for (const entry of doc.legacyQueryMigrations) {
  assert(entry.from.startsWith("#") && entry.to.startsWith("/"), "Invalid legacy redirect");
  const path = entry.to.split(/[?#]/)[0];
  assert(pathSet.has(path) || doc.routes.some(route => {
    if (!route.path.includes(":")) return false;
    const prefix = route.path.split("/:")[0] + "/";
    return path.startsWith(prefix) && path.length > prefix.length;
  }), "Legacy query migration target does not resolve: " + entry.to);
}
assert(doc.nonAppPublicPaths.every(path => path.startsWith("/")));
const fn = new URL("../design/p24/journey-contract.json", import.meta.url);
const journeys = JSON.parse(readFileSync(fn, "utf8"));
assert(journeys.journeys.length >= 8, "Critical user journeys missing");
const journeyIds = new Set();
for (const journey of journeys.journeys) {
  assert(!journeyIds.has(journey.id), "Duplicate journey id: " + journey.id);
  journeyIds.add(journey.id);
  assert(journey.steps.length >= 3, "Journey too shallow: " + journey.id);
  assert(journey.recovery && journey.success && journey.phaseOwner, "Journey needs recovery, outcome and owner");
  for (const step of journey.steps) {
    const target = step.routeId;
    if (target) assert(idSet.has(target), "Journey references missing route: " + target);
  }
}
console.log("P24 navigation and journey contracts valid: " +
  doc.primary.length + " primary, " + doc.mobileTabs.length +
  " mobile tabs, " + doc.routes.length + " canonical routes, " +
  aliases.length + " legacy aliases, " + journeys.journeys.length + " journeys.");
