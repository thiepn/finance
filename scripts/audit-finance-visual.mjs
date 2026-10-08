#!/usr/bin/env node
/**
 * P23 Finance public-surface baseline.
 * Anonymous, fresh-browser screenshots only. Never inject credentials or use
 * a persistent browser profile. Authenticated financial content is NOT audited.
 *
 * Usage:
 *   npm install --no-save --no-package-lock playwright @axe-core/playwright
 *   npx playwright install chromium
 *   node scripts/audit-finance-visual.mjs
 */
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const base = process.env.FINANCE_AUDIT_ORIGIN || "https://finance.thiepn.dev";
const origin = new URL(base).origin;
const out = path.resolve(process.env.FINANCE_AUDIT_OUTPUT || "audit-artifacts");
const screenDir = path.join(out, "screenshots");
const routes = [
  "overview", "activity", "scan", "accounts", "receipts", "insights",
  "categories", "merchants", "products", "recurring", "budget", "goals",
  "net-worth", "ask", "imports", "rules", "settings"
];
const axeRoutes = new Set(["overview", "activity", "scan", "budget", "receipts", "insights"]);
const devices = [
  { name: "desktop", width: 1440, height: 900, isMobile: false, hasTouch: false },
  { name: "mobile", width: 390, height: 844, isMobile: true, hasTouch: true }
];
const all = [];
const failures = [];
await fs.mkdir(screenDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const device of devices) {
    for (const route of routes) {
      const context = await browser.newContext({
        viewport: { width: device.width, height: device.height },
        isMobile: device.isMobile, hasTouch: device.hasTouch,
        deviceScaleFactor: 1, colorScheme: "light", locale: "de-DE",
        reducedMotion: "reduce"
      });
      const page = await context.newPage();
      const pageErrors = [];
      page.on("pageerror", error => pageErrors.push(error.message.slice(0, 240)));
      const item = { device: device.name, route, url: origin + "/#" + route };
      try {
        // Fresh profile + no storage: this is an unauthenticated visual baseline.
        await page.goto(item.url, { waitUntil: "domcontentloaded", timeout: 30000 });
        await page.locator(".f-shell").waitFor({ state: "visible", timeout: 20000 });
        await page.waitForTimeout(1000);
        Object.assign(item, await page.evaluate(() => {
          const $ = selector => document.querySelector(selector);
          const el = $(".f-main");
          const h1 = el?.querySelector("h1");
          const title = h1?.textContent?.trim() || "";
          const doc = document.documentElement;
          const largeTargets = [...document.querySelectorAll("button, a, input, select, textarea")]
            .filter(node => {
              const box = node.getBoundingClientRect();
              const style = getComputedStyle(node);
              return box.width > 0 && box.height > 0 && style.visibility !== "hidden";
            });
          return {
            title: document.title,
            heading: title.slice(0, 115),
            mainExists: Boolean(el),
            mainVisible: Boolean(el && el.getBoundingClientRect().width),
            overflowX: Math.max(0, doc.scrollWidth - doc.clientWidth),
            scrollHeight: doc.scrollHeight,
            viewportWidth: doc.clientWidth,
            surfaceCount: document.querySelectorAll(".f-surface").length,
            visibleControls: largeTargets.length,
            undersizedControls: largeTargets.filter(node => {
              const box = node.getBoundingClientRect();
              return box.width < 24 || box.height < 24;
            }).length,
            pageHeaderPx: h1 ? Math.round(parseFloat(getComputedStyle(h1).fontSize)) : null,
            sidebarVisible: !!($(".f-sidebar") && getComputedStyle($(".f-sidebar")).display !== "none"),
            mobileNavVisible: !!($(".f-mobile-nav") && getComputedStyle($(".f-mobile-nav")).display !== "none"),
            unknownRoute: Boolean(el?.textContent?.includes("This page does not exist."))
          };
        }));
        // Full-page captures document loading/error/empty states honestly.
        item.screenshot = "screenshots/" + route + "-" + device.name + "-light.png";
        await page.screenshot({ path: path.join(out, item.screenshot), fullPage: true, animations: "disabled" });
        if (axeRoutes.has(route)) {
          try {
            const report = await new AxeBuilder({ page }).withTags([
              "wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"
            ]).analyze();
            item.axe = report.violations.map(v => ({
              id: v.id, impact: v.impact, count: v.nodes.length,
              targets: v.nodes.slice(0, 3).map(n => n.target.join(" "))
            }));
          } catch (error) {
            item.axeError = String(error).slice(0, 240);
          }
        }
        item.errors = pageErrors;
        if (item.overflowX > 1) failures.push(device.name + " " + route + ": " + item.overflowX + "px horizontal overflow");
        if (!item.mainVisible || item.unknownRoute) failures.push(device.name + " " + route + ": main content missing / unknown route");
        if (pageErrors.length) failures.push(device.name + " " + route + ": " + pageErrors.length + " uncaught page error(s)");
      } catch (error) {
        item.captureError = String(error).slice(0, 320);
        failures.push(device.name + " " + route + ": capture failed");
      }
      all.push(item);
      console.log(JSON.stringify({ device: device.name, route, overflowX: item.overflowX ?? null, controls: item.visibleControls ?? null, axe: item.axe?.length ?? null, error: item.captureError ?? null }));
      await context.close();
    }
  }
  // Both themes on the six highest-priority screens.
  for (const device of devices) {
    for (const route of axeRoutes) {
      const context = await browser.newContext({
        viewport: { width: device.width, height: device.height },
        isMobile: device.isMobile, hasTouch: device.hasTouch, colorScheme: "dark",
        deviceScaleFactor: 1, locale: "de-DE", reducedMotion: "reduce"
      });
      await context.addInitScript(() => localStorage.setItem("thiepn.finance.theme", "dark"));
      const page = await context.newPage();
      try {
        await page.goto(origin + "/#" + route, { waitUntil: "domcontentloaded", timeout: 30000 });
        await page.locator(".f-shell").waitFor({ state: "visible", timeout: 20000 });
        await page.waitForTimeout(750);
        await page.screenshot({
          path: path.join(screenDir, route + "-" + device.name + "-dark.png"),
          fullPage: true, animations: "disabled"
        });
      } catch (error) {
        failures.push("dark " + device.name + " " + route + ": " + String(error).slice(0, 160));
      }
      await context.close();
    }
  }
} finally {
  await browser.close();
}
const report = {
  timestamp: new Date().toISOString(), origin, authenticated: false,
  scope: "17 anonymous routes × desktop/mobile light; 6 key routes × desktop/mobile dark",
  viewportSizes: devices.map(({ name, width, height }) => ({ name, width, height })),
  observations: all, failures
};
await fs.writeFile(path.join(out, "report.json"), JSON.stringify(report, null, 2) + "\n");
const escape = s => String(s ?? "").replace(/[&<>"']/g, c => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[c]);
const html = `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Finance P23 public baseline</title><style>
body{font:14px system-ui;background:#f2f2f2;color:#151515;margin:0;padding:24px}h1{font-size:24px}p{max-width:920px}section{display:grid;grid-template-columns:repeat(auto-fit,minmax(330px,1fr));gap:16px}.card{background:white;padding:12px;border:1px solid #d6d6d6;border-radius:6px}.card img{width:100%;height:420px;object-fit:contain;object-position:top;background:#ddd}.muted{color:#555}pre{white-space:pre-wrap}
</style></head><body><h1>THIEPN Finance — P23 anonymous visual baseline</h1><p>These are anonymous public-screen screenshots, not authenticated financial workflows. Screenshot coverage cannot establish the visual quality of populated dashboards, bank imports, receipt reconciliation, or real-account access.</p><p>${escape(report.timestamp)} · ${all.length} light screenshots · ${failures.length} smoke findings.</p><section>${all.map(x=>`<div class="card"><h3>${escape(x.route)} · ${escape(x.device)}</h3><p class="muted">heading: ${escape(x.heading)} · overflow: ${escape(x.overflowX)}px · axe violations: ${escape(x.axe?.length ?? "not tested")}</p>${x.screenshot ? `<a href="${escape(x.screenshot)}"><img loading="lazy" src="${escape(x.screenshot)}" alt="Anonymous ${escape(x.route)} on ${escape(x.device)}"></a>` : "<p>Capture failed</p>"}</div>`).join("")}</section><h2>Failures</h2><pre>${escape(failures.join("\n") || "No smoke failures detected.")}</pre></body></html>`;
await fs.writeFile(path.join(out, "index.html"), html);
console.log("P23 CAPTURE SUMMARY: " + JSON.stringify({
  screens: all.length, succeeded: all.filter(x => !!x.screenshot).length,
  overflowCases: all.filter(x => x.overflowX > 1).length,
  routeErrors: all.filter(x => x.unknownRoute).length,
  axeViolations: all.reduce((sum, x) => sum + (x.axe?.length || 0), 0),
  failures: failures.length
}));
if (all.every(item => !item.screenshot)) process.exitCode = 1;
