# Finance Supabase history

Finance is hosted in the shared **THIEPN Core** Supabase project under the private `finance` schema.

The repository mirrors the exact SQL stored in Supabase migration history.

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
13. `20261005105200_finance_p4_receipt_capture_foundation`
14. `20261005105308_finance_p4_receipt_capture_services`
15. `20261005105331_finance_p4_rpc_facade`
16. `20261005105813_finance_p4_page_order_hardening`
17. `20261005111026_finance_p5_extraction_foundation`
18. `20261005111215_finance_p5_extraction_services`
19. `20261005111233_finance_p5_rpc_facade`
20. `20261005111404_finance_p5_rerun_atomicity_hardening`
21. `20261005111455_finance_p5_receipt_item_projection_grant`
22. `20261005111534_finance_p5_submit_privilege_hardening`
23. `20261005112132_finance_p5_fk_index_hardening`
24. `20261005112910_finance_p6_product_intelligence_foundation`
25. `20261005113115_finance_p6_product_normalization_services`
26. `20261005113150_finance_p6_product_analytics_hardening`
27. `20261005113304_finance_p6_learning_and_rpc`
28. `20261005113958_finance_p6_created_status_hardening`
29. `20261005114040_finance_p6_created_event_append_only_fix`
30. `20261005115107_finance_p7_receipt_review_foundation`
31. `20261005115401_finance_p7_review_services`
32. `20261005115527_finance_p7_review_queries_and_product_integrity`
33. `20261005115549_finance_p7_review_rpc_facade`
34. `20261005115640_finance_p7_internal_execute_grants`
35. `20261005115721_finance_p7_page_status_fix`
36. `20261005120130_finance_p7_reprocessing_review_reset`
37. `20261005120351_finance_p7_review_event_fk_index_hardening`
38. `20261005120410_finance_p7_review_event_run_exposure`
39. `20261005121409_finance_p8_activity_foundation`
40. `20261005121649_finance_p8_activity_services`
41. `20261005121709_finance_p8_activity_rpc_facade`
42. `20261005132651_finance_p10_overview_dashboard`
43. `20261005132856_finance_p10_overview_period_rpc`
44. `20261005140121_finance_p11_analytics_read_models`
45. `20261005140219_finance_p11_analytics_bucket_boundaries`
46. `20261005144628_finance_p12_spending_explorer`
47. `20261005145648_finance_p12_refund_bucket_semantics`
48. `20261005153707_finance_p13_product_intelligence`
49. `20261005154839_finance_p13_same_merchant_price_change`
50. `20261005184330_finance_p14_recurring_foundation`
51. `20261005184405_finance_p14_recurring_intelligence`
52. `20261005185204_finance_p14_sync_null_hardening`
53. `20261005185626_finance_p14_category_context_hardening`
54. `20261005195625_finance_p15_planning_foundation`
55. `20261005195654_finance_p15_planning_services`
56. `20261005200404_finance_p15_planning_reference_data`
57. `20261005200445_finance_p15_period_boundary_fix`
58. `20261005200520_finance_p15_account_reference_fix`

Raw Finance tables remain outside the Data API. Browser-facing database access is provided through the narrow authenticated `public.finance_*` RPC facade. Receipt binaries use the private `finance-receipts` Storage bucket under Storage RLS.
