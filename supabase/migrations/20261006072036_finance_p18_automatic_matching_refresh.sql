CREATE OR REPLACE FUNCTION finance_private.rebuild_receipt_allocations_after_item_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid;
  v_receipt_id uuid;
  v_tx record;
begin
  v_user_id:=case when tg_op='DELETE' then old.user_id else new.user_id end;
  v_receipt_id:=case when tg_op='DELETE' then old.receipt_id else new.receipt_id end;

  if auth.uid() is null or v_user_id<>auth.uid() then
    return case when tg_op='DELETE' then old else new end;
  end if;

  for v_tx in
    select distinct rtm.transaction_id
    from finance.receipt_transaction_matches rtm
    where rtm.user_id=v_user_id
      and rtm.receipt_id=v_receipt_id
      and rtm.status='confirmed'
  loop
    perform finance.rebuild_transaction_receipt_allocations(
      v_tx.transaction_id
    );
  end loop;

  return case when tg_op='DELETE' then old else new end;
end;
$function$;

CREATE OR REPLACE FUNCTION finance_private.refresh_receipt_matches_after_receipt_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null or new.user_id<>auth.uid() then
    return new;
  end if;

  if new.processing_status='confirmed'
     and new.total_minor is not null
     and new.total_minor>0
     and (
       tg_op='INSERT'
       or old.processing_status is distinct from new.processing_status
       or old.total_minor is distinct from new.total_minor
       or old.purchased_at is distinct from new.purchased_at
       or old.merchant_id is distinct from new.merchant_id
       or old.merchant_raw_name is distinct from new.merchant_raw_name
       or old.currency_code is distinct from new.currency_code
     ) then
    perform finance.refresh_receipt_match_candidates(
      new.id,true
    );
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION finance_private.refresh_receipt_matches_after_transaction_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_receipt record;
begin
  if auth.uid() is null or new.user_id<>auth.uid() then
    return new;
  end if;

  if new.status='posted'
     and new.type='expense'
     and (
       tg_op='INSERT'
       or old.status is distinct from new.status
       or old.merchant_id is distinct from new.merchant_id
       or old.description is distinct from new.description
       or old.metadata is distinct from new.metadata
     ) then
    for v_receipt in
      select r.id
      from finance.receipts r
      where r.user_id=new.user_id
        and r.processing_status='confirmed'
        and r.total_minor is not null
        and r.total_minor>0
        and r.match_status in (
          'unmatched','suggested_match','partially_matched'
        )
        and coalesce(
          r.purchased_at,
          r.capture_finalized_at,
          r.created_at
        ) between new.occurred_at-interval '7 days'
              and new.occurred_at+interval '7 days'
    loop
      perform finance.refresh_receipt_match_candidates(
        v_receipt.id,true
      );
    end loop;
  end if;

  return new;
end;
$function$;

revoke all on function finance_private.rebuild_receipt_allocations_after_item_change() from public,anon;

revoke all on function finance_private.refresh_receipt_matches_after_receipt_change() from public,anon;

revoke all on function finance_private.refresh_receipt_matches_after_transaction_change() from public,anon;

drop trigger if exists receipts_p18_match_refresh on finance.receipts;
create trigger receipts_p18_match_refresh
after insert or update on finance.receipts
for each row
execute function finance_private.refresh_receipt_matches_after_receipt_change();

drop trigger if exists transactions_p18_match_refresh on finance.transactions;
create trigger transactions_p18_match_refresh
after insert or update on finance.transactions
for each row
execute function finance_private.refresh_receipt_matches_after_transaction_change();

drop trigger if exists receipt_items_p18_allocation_refresh on finance.receipt_items;
create trigger receipt_items_p18_allocation_refresh
after insert or update or delete on finance.receipt_items
for each row
execute function finance_private.rebuild_receipt_allocations_after_item_change();
