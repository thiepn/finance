# Finance Supabase history

Finance is hosted in the shared **THIEPN Core** Supabase project under the private `finance` schema.

The repository now mirrors the exact SQL stored in Supabase migration history.

## Live Finance migration history

1. `20261005094813_finance_p1_domain_foundation`
2. `20261005095015_finance_p1_security_invariants`
3. `20261005095121_finance_p1_fk_index_hardening`
4. `20261005100417_finance_p2_ledger_services`
5. `20261005100720_finance_p2_rpc_facade`
6. `20261005101110_finance_p2_recovery_caps`
7. `20261005103048_finance_p3_classification_foundation`
8. `20261005103230_finance_p3_classification_services`
9. `20261005103359_finance_p3_dimension_recovery_hardening`
10. `20261005103436_finance_p3_rpc_facade`
11. `20261005103521_finance_p3_ledger_necessity_grant_fix`
12. `20261005103559_finance_p3_tag_fk_index_hardening`

Raw Finance tables remain outside the Data API. Browser-facing access is provided through the narrow authenticated `public.finance_*` RPC facade.
