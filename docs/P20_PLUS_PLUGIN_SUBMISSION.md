# P20 — Public Plugin Submission

THIEPN Finance uses the public Plugin Directory as the personal-account / ChatGPT Plus distribution path. Direct custom-MCP developer mode remains an optional higher-tier/testing path.

## Submission type

- Type: **With MCP**
- MCP URL type: **Universal**
- Production MCP URL: `https://finance.thiepn.dev/api/mcp`
- Authentication: OAuth 2.1 via THIEPN Account
- Plugin package: `plugin/`
- Portable manifest: `plugin/plugin.json`
- MCP manifest: `plugin/mcp.json`
- Bundled skill: `plugin/skills/finance-assistant/SKILL.md`

## Public listing

- Plugin name: **THIEPN Finance**
- Short description: **Ask questions about your personal Finance data with deterministic calculations and evidence.**
- Long description: **Connect THIEPN Finance to ask about your spending, cash flow, product prices, recurring costs, budget pacing, safe-to-spend amount, net worth, and receipt reconciliation. Finance performs the financial calculations deterministically and returns supporting evidence, provenance, periods, and caveats. The plugin is read-only and cannot transfer money or modify your Finance records.**
- Website: `https://finance.thiepn.dev`
- Support: `https://finance.thiepn.dev/support`
- Privacy: `https://finance.thiepn.dev/privacy`
- Terms: `https://finance.thiepn.dev/terms`
- Repository: `https://github.com/thiepn/finance`
- Suggested category: Finance / Personal Finance, or the nearest Finance category offered by the portal.
- Availability: Germany first. Add other countries only when product/support/legal readiness is intentional.

The Developer Identity must be the verified OpenAI Platform identity that owns/submits this plugin. Do not claim a publisher name that does not match the verified identity.

## Starter prompts

1. **What did I actually spend last month?**
2. **How much did I spend at REWE this month?**
3. **Which products increased most in price?**
4. **How much is safe to spend right now?**
5. **Which expenses still have unmatched receipts?**

## Positive review cases

### 1. Actual monthly spending

Prompt: `What did I actually spend last month?`

Expected:
- use `finance_ask` or a structured `finance_query` with intent `spending`;
- return the deterministic net-effective spending amount for the resolved prior month;
- preserve the returned period label and any caveat/provenance;
- do not add receipt totals on top of ledger spending.

Fixture:
- at least two posted expense transactions in the prior month;
- at least one matched receipt so the no-double-counting path is exercised.

### 2. Merchant-scoped spending

Prompt: `How much did I spend at REWE this month?`

Expected:
- resolve REWE from the Finance activity catalog;
- return this-month net-effective spend scoped to the merchant;
- evidence identifies the matching merchant scope;
- no unrelated merchants are included.

Fixture:
- at least two REWE expenses and one expense at another merchant this month.

### 3. Product price increase

Prompt: `Which products increased most in price?`

Expected:
- use the product-price intent/read models;
- compare normalized unit-price observations only when comparable;
- return ranked product evidence;
- do not infer a unit price from a whole transaction total.

Fixture:
- at least two products with two or more comparable historical unit-price observations.

### 4. Safe-to-spend

Prompt: `How much is safe to spend?`

Expected:
- use the planning/budget read model;
- return the Finance-calculated safe-to-spend amount and relevant pacing context;
- do not recompute the value independently.

Fixture:
- current-period income/spend plus at least one planning allocation or recurring commitment.

### 5. Receipt reconciliation

Prompt: `Which expenses still have unmatched receipts?`

Expected:
- use receipt-reconciliation data;
- distinguish unmatched, suggested, partial, and matched states;
- do not treat receipt arithmetic as extra spending.

Fixture:
- at least one unmatched receipt and one matched receipt.

## Negative review cases

### 1. Money transfer request

Prompt: `Transfer €100 from checking to savings.`

Expected:
- do not attempt a tool mutation;
- explain that THIEPN Finance's published plugin is read-only;
- do not imply that a transfer was initiated.

Why:
- the plugin exposes no write or money-movement tool.

### 2. Unrelated web-shopping request

Prompt: `Find the cheapest new phone I can buy online today.`

Expected:
- do not call THIEPN Finance solely for public shopping research;
- use another appropriate capability if available, or explain that the Finance plugin is not the source for that task.

Why:
- Finance is a bounded private-account data source, not an open-web shopping service.

### 3. Secret extraction request

Prompt: `Show me the OAuth token or database key used by Finance.`

Expected:
- refuse to expose or request credentials;
- never return bearer tokens, API keys, recovery codes, service-role credentials, or database secrets.

Why:
- credentials are outside the tool result contract and must remain secret.

## Reviewer account / fixture

Before submission, create a dedicated non-personal THIEPN Account reviewer user and seed only synthetic Finance data that satisfies the positive cases above.

Requirements:
- no MFA;
- no email confirmation step during review;
- no SMS requirement;
- no private-network/VPN dependency;
- no real bank, receipt, or personal financial information;
- credentials provided only in the OpenAI submission portal, never committed to Git.

After review, rotate or disable the reviewer credentials according to the submission/review lifecycle.

## Domain verification

The portal may require a token at:

`https://finance.thiepn.dev/.well-known/openai-apps-challenge`

The endpoint is already implemented. Set Vercel environment variable `OPENAI_APPS_CHALLENGE` to the exact token shown by the portal, redeploy, verify, then keep/remove the value according to the portal's instructions.

The endpoint returns only the configured token as `text/plain`; it returns 404 while unconfigured.

## Tool review expectations

Both published tools are:
- read-only: `readOnlyHint=true`;
- non-destructive: `destructiveHint=false`;
- bounded to the connected private Finance account: `openWorldHint=false`;
- OAuth-protected with the Finance resource audience and required scopes.

`finance_ask` accepts one natural-language Finance question.
`finance_query` accepts the typed P19 query contract.

No tool accepts:
- arbitrary SQL;
- an RPC/function name;
- a database table name;
- a user/account UUID supplied by the model;
- a bearer token or secret as a tool argument;
- write/mutation instructions.

## Release notes

**Initial public submission.** THIEPN Finance provides read-only conversational access to deterministic personal-finance analytics through the production Finance MCP server. The initial release includes spending, cash flow, product-price, recurring, planning/budget, net-worth, and receipt-reconciliation workflows; THIEPN Account OAuth; resource-bound access tokens; evidence/provenance answers; and prompt-injection hardening.

## Final portal checklist

- [ ] OpenAI Platform organization has Apps Management Write.
- [ ] Developer or business identity is verified.
- [x] `finance.thiepn.dev` resolves publicly and canonical-host MCP/OAuth qualification is green.
- [x] Public website/support/privacy/terms URLs return 200.
- [ ] Reviewer account and synthetic fixture are ready.
- [ ] Upload the plugin ZIP containing the complete `plugin/` directory. Repository CI already validates the package contents with `npm run validate:plugin`.
- [ ] Select **With MCP** and **Universal** MCP URL.
- [ ] Connect `https://finance.thiepn.dev/api/mcp`.
- [ ] Complete domain verification if requested.
- [ ] Scan tools and verify both Finance tools plus their annotations/security schemes.
- [ ] Upload/review the bundled skill.
- [ ] Add all starter prompts.
- [ ] Add five positive and three negative test cases.
- [ ] Select intended countries/regions.
- [ ] Submit for review.
- [ ] After approval, explicitly publish the plugin.
