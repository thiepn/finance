# P21 — Subscription-Independent Finance AI

## Objective

Ask Finance must be useful without ChatGPT Pro and must remain usable even when no model call is available.

P21 makes `finance.thiepn.dev` the primary conversational Finance surface and treats ChatGPT/MCP as an optional secondary interface.

## Architecture

```text
Finance browser
  -> existing THIEPN Account session
  -> THIEPN Core /v1/finance/ai/interpret
  -> signed internal request as appId=finance
  -> thiepn/ai finance.interpretQuestion
  -> GPT-6 Luna
  -> typed P19 intent/period only
  -> AskFinanceEngine.run(...)
  -> deterministic Finance read models
```

The language model never receives balances, transactions, receipts, product history, account UUIDs, bearer tokens, or database credentials.

## Authority boundary

Luna may interpret:

- user wording;
- supported Finance intent;
- week/month/quarter/year period;
- top-spending dimension;
- explicit necessity scope.

Luna may not:

- calculate money;
- answer from invented records;
- resolve database IDs;
- read Finance tables;
- move money;
- mutate Finance state.

Merchant, category, and product names remain resolved against the authoritative Finance catalog from the original user question.

## Failure behavior

AI is an enhancement, not a dependency.

If the Core AI bridge is unavailable, the app secret is missing, Luna times out, a usage limit is reached, or the returned structure is invalid, Ask Finance automatically retries with the existing deterministic P19 parser.

Therefore:

```text
ChatGPT subscription required: no
ChatGPT Pro required: no
OpenAI model required for basic Ask Finance: no
Finance deterministic calculations authoritative: yes
```

## Production activation

Code requires:

- `VITE_THIEPN_CORE_GATEWAY_URL` in Finance;
- `finance` added to `THIEPN_AI_APP_SECRETS_JSON` in the AI service;
- matching `THIEPN_AI_FINANCE_SECRET` in the Core Worker;
- production Core CORS allowing `https://finance.thiepn.dev`.

The two HMAC secret values must be identical and must be independent from the Languages secret.

## Exit criteria

P21 is complete when:

1. AI, Core, and Finance CI pass.
2. Production secrets/configuration are active.
3. A signed-in Finance browser successfully answers a question that the old keyword parser cannot understand.
4. The same browser still answers a supported deterministic question when the AI path is deliberately unavailable.
5. No Finance records or Account identity appear in AI request payloads.
