
do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='finance'
      and p.proname in (
        'recalculate_receipt_review',
        'get_receipt_review',
        'get_receipt_review_queue',
        'start_receipt_review',
        'accept_receipt_header',
        'update_receipt_header_review',
        'sync_receipt_item_price',
        'accept_receipt_item_review',
        'update_receipt_item_review',
        'set_receipt_item_excluded',
        'skip_receipt_item_product',
        'waive_receipt_review_reason',
        'confirm_receipt_review',
        'review_assign_product',
        'review_create_product_candidate'
      )
  loop
    execute format('revoke all on function %s from public,anon',f);
    execute format('grant execute on function %s to authenticated,service_role',f);
  end loop;
end $$;
