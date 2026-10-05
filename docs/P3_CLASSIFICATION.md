# P3 — Categories, Classification & Merchant Intelligence

P3 adds the semantic layer above the balanced ledger.

## Split-level classification

Necessity is attached to each category ledger split:

- essential
- flexible
- discretionary
- unclassified

A single supermarket transaction can therefore contain multiple classifications.

## Categories

Categories are hierarchical and protected against cycles.

Supported operations:

- create
- rename / move
- archive
- recursive archive
- restore

System categories remain normal user-owned records with stable `system_key` identifiers.

## Merchants

Merchant intelligence supports:

- canonical merchant names
- merchant groups
- default category
- default necessity
- raw aliases such as `REWE MARKT 1234`
- purchase count
- net spend
- last activity
- tags

Aliases are normalized and resolve to one canonical merchant per user.

## Tags

Tags can be attached to:

- transactions
- merchants
- products
- receipt items

## Classification rules

Rules are deterministic and validated before storage.

Supported conditions include:

- merchant
- merchant group/name
- description contains
- raw/normalized receipt name contains
- product
- transaction type
- amount range
- existing tag

Supported actions include:

- merchant
- category
- necessity
- tags

Precedence:

1. user
2. learned
3. merchant
4. global
5. AI

Within a source, lower numerical priority wins.

The resolver returns structured data and matched-rule IDs. It does not silently mutate posted ledger history.

## Recovery semantics

Refunds and reimbursements preserve both category and necessity. Recovery is capped at the remaining amount for each category/necessity dimension.

## API boundary

The private `finance` schema remains outside the Data API. The frontend uses authenticated `public.finance_*` SECURITY INVOKER RPC functions.
