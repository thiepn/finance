
create or replace view finance.activity_transactions
with (security_invoker=true)
as
select
  t.id,
  t.user_id,
  'transaction'::text as entity_kind,
  t.occurred_at as occurred_at,
  t.id as transaction_id,
  null::uuid as receipt_id,
  t.type::text as transaction_type,
  t.status::text as status,
  t.source::text as source,
  t.merchant_id,
  m.name as merchant_name,
  coalesce(t.description,m.name,t.type::text) as title,
  t.description,
  t.note,
  t.reporting_currency as currency_code,
  coalesce(amounts.display_amount_minor,0)::bigint as amount_minor,
  (t.status='posted') as financial_effect,
  (coalesce(receipts.receipt_count,0)>0) as has_receipt,
  coalesce(receipts.receipt_statuses,'{}'::text[]) as receipt_statuses,
  coalesce(accounts.account_ids,'{}'::uuid[]) as account_ids,
  coalesce(accounts.account_names,'{}'::text[]) as account_names,
  coalesce(accounts.accounts,'[]'::jsonb) as accounts,
  coalesce(categories.category_ids,'{}'::uuid[]) as category_ids,
  coalesce(categories.category_names,'{}'::text[]) as category_names,
  coalesce(categories.necessities,'{}'::text[]) as necessities,
  coalesce(categories.categories,'[]'::jsonb) as categories,
  coalesce(products.product_ids,'{}'::uuid[]) as product_ids,
  coalesce(products.product_names,'{}'::text[]) as product_names,
  coalesce(tags.tag_ids,'{}'::uuid[]) as tag_ids,
  coalesce(tags.tag_names,'{}'::text[]) as tag_names,
  coalesce(receipts.receipt_ids,'{}'::uuid[]) as receipt_ids,
  coalesce(receipts.receipt_count,0)::integer as receipt_count,
  coalesce(products.item_count,0)::integer as item_count,
  lower(concat_ws(' ',
    t.description,
    t.note,
    m.name,
    array_to_string(accounts.account_names,' '),
    array_to_string(categories.category_names,' '),
    array_to_string(products.product_names,' '),
    array_to_string(tags.tag_names,' ')
  )) as search_text,
  t.created_at,
  t.updated_at
from finance.transactions t
left join finance.merchants m
  on m.id=t.merchant_id and m.user_id=t.user_id
left join lateral (
  select coalesce(
    -sum(le.reporting_amount_minor) filter(
      where le.entry_kind='account' and le.reporting_amount_minor<0
    ),
    sum(le.reporting_amount_minor) filter(
      where le.entry_kind='account' and le.reporting_amount_minor>0
    ),
    0
  )::bigint as display_amount_minor
  from finance.ledger_entries le
  where le.transaction_id=t.id and le.user_id=t.user_id
) amounts on true
left join lateral (
  select
    coalesce(array_agg(a.id order by a.name,a.id),'{}'::uuid[]) as account_ids,
    coalesce(array_agg(a.name order by a.name,a.id),'{}'::text[]) as account_names,
    coalesce(jsonb_agg(jsonb_build_object(
      'id',a.id,
      'name',a.name,
      'kind',a.kind,
      'currency_code',a.currency_code,
      'signed_amount_minor',le.signed_amount_minor,
      'reporting_amount_minor',le.reporting_amount_minor
    ) order by a.name,a.id),'[]'::jsonb) as accounts
  from finance.ledger_entries le
  join finance.accounts a
    on a.id=le.account_id and a.user_id=le.user_id
  where le.transaction_id=t.id and le.user_id=t.user_id
    and le.entry_kind='account'
) accounts on true
left join lateral (
  select
    coalesce(array_agg(c.id order by c.name,c.id),'{}'::uuid[]) as category_ids,
    coalesce(array_agg(c.name order by c.name,c.id),'{}'::text[]) as category_names,
    coalesce(array_agg(distinct le.necessity::text)
      filter(where le.necessity is not null),'{}'::text[]) as necessities,
    coalesce(jsonb_agg(jsonb_build_object(
      'id',c.id,
      'name',c.name,
      'signed_amount_minor',le.signed_amount_minor,
      'reporting_amount_minor',le.reporting_amount_minor,
      'necessity',le.necessity,
      'memo',le.memo
    ) order by c.name,c.id),'[]'::jsonb) as categories
  from finance.ledger_entries le
  join finance.categories c
    on c.id=le.category_id and c.user_id=le.user_id
  where le.transaction_id=t.id and le.user_id=t.user_id
    and le.entry_kind='category'
) categories on true
left join lateral (
  select
    coalesce(array_agg(tg.id order by tg.name,tg.id),'{}'::uuid[]) as tag_ids,
    coalesce(array_agg(tg.name order by tg.name,tg.id),'{}'::text[]) as tag_names
  from finance.transaction_tags tt
  join finance.tags tg
    on tg.id=tt.tag_id and tg.user_id=tt.user_id
  where tt.transaction_id=t.id and tt.user_id=t.user_id
) tags on true
left join lateral (
  select
    coalesce(array_agg(r.id order by r.purchased_at,r.id),'{}'::uuid[]) as receipt_ids,
    coalesce(array_agg(distinct r.processing_status::text),'{}'::text[]) as receipt_statuses,
    count(*)::integer as receipt_count
  from finance.receipt_transaction_matches rtm
  join finance.receipts r
    on r.id=rtm.receipt_id and r.user_id=rtm.user_id
  where rtm.transaction_id=t.id and rtm.user_id=t.user_id
    and rtm.status='confirmed'
) receipts on true
left join lateral (
  select
    coalesce(array_agg(distinct p.id)
      filter(where p.id is not null),'{}'::uuid[]) as product_ids,
    coalesce(array_agg(distinct p.name)
      filter(where p.name is not null),'{}'::text[]) as product_names,
    count(ri.id) filter(where not ri.is_excluded)::integer as item_count
  from finance.receipt_transaction_matches rtm
  join finance.receipt_items ri
    on ri.receipt_id=rtm.receipt_id and ri.user_id=rtm.user_id
  left join finance.products p
    on p.id=ri.product_id and p.user_id=ri.user_id
  where rtm.transaction_id=t.id and rtm.user_id=t.user_id
    and rtm.status='confirmed'
    and not ri.is_excluded
) products on true;

create or replace view finance.activity_receipts
with (security_invoker=true)
as
select
  r.id,
  r.user_id,
  'receipt'::text as entity_kind,
  coalesce(r.purchased_at,r.capture_finalized_at,r.created_at) as occurred_at,
  null::uuid as transaction_id,
  r.id as receipt_id,
  null::text as transaction_type,
  r.processing_status::text as status,
  'receipt'::text as source,
  r.merchant_id,
  coalesce(m.name,r.merchant_raw_name) as merchant_name,
  coalesce(m.name,r.merchant_raw_name,'Receipt') as title,
  r.receipt_number as description,
  null::text as note,
  r.currency_code,
  r.total_minor as amount_minor,
  (r.processing_status='confirmed') as financial_effect,
  true as has_receipt,
  array[r.processing_status::text] as receipt_statuses,
  '{}'::uuid[] as account_ids,
  '{}'::text[] as account_names,
  '[]'::jsonb as accounts,
  coalesce(items.category_ids,'{}'::uuid[]) as category_ids,
  coalesce(items.category_names,'{}'::text[]) as category_names,
  coalesce(items.necessities,'{}'::text[]) as necessities,
  coalesce(items.categories,'[]'::jsonb) as categories,
  coalesce(items.product_ids,'{}'::uuid[]) as product_ids,
  coalesce(items.product_names,'{}'::text[]) as product_names,
  coalesce(items.tag_ids,'{}'::uuid[]) as tag_ids,
  coalesce(items.tag_names,'{}'::text[]) as tag_names,
  array[r.id]::uuid[] as receipt_ids,
  1::integer as receipt_count,
  coalesce(items.item_count,0)::integer as item_count,
  lower(concat_ws(' ',
    m.name,
    r.merchant_raw_name,
    r.receipt_number,
    r.payment_method_raw,
    array_to_string(items.category_names,' '),
    array_to_string(items.product_names,' '),
    array_to_string(items.raw_item_names,' '),
    array_to_string(items.tag_names,' ')
  )) as search_text,
  r.created_at,
  r.updated_at
from finance.receipts r
left join finance.merchants m
  on m.id=r.merchant_id and m.user_id=r.user_id
left join lateral (
  select
    coalesce(array_agg(distinct c.id)
      filter(where c.id is not null),'{}'::uuid[]) as category_ids,
    coalesce(array_agg(distinct c.name)
      filter(where c.name is not null),'{}'::text[]) as category_names,
    coalesce(array_agg(distinct ri.necessity::text),'{}'::text[]) as necessities,
    coalesce(
      jsonb_agg(distinct jsonb_build_object('id',c.id,'name',c.name,'necessity',ri.necessity))
        filter(where c.id is not null),
      '[]'::jsonb
    ) as categories,
    coalesce(array_agg(distinct p.id)
      filter(where p.id is not null),'{}'::uuid[]) as product_ids,
    coalesce(array_agg(distinct p.name)
      filter(where p.name is not null),'{}'::text[]) as product_names,
    coalesce(array_agg(distinct ri.raw_name),'{}'::text[]) as raw_item_names,
    coalesce(array_agg(distinct tg.id)
      filter(where tg.id is not null),'{}'::uuid[]) as tag_ids,
    coalesce(array_agg(distinct tg.name)
      filter(where tg.name is not null),'{}'::text[]) as tag_names,
    count(distinct ri.id)::integer as item_count
  from finance.receipt_items ri
  left join finance.categories c
    on c.id=ri.category_id and c.user_id=ri.user_id
  left join finance.products p
    on p.id=ri.product_id and p.user_id=ri.user_id
  left join finance.receipt_item_tags rit
    on rit.receipt_item_id=ri.id and rit.user_id=ri.user_id
  left join finance.tags tg
    on tg.id=rit.tag_id and tg.user_id=rit.user_id
  where ri.receipt_id=r.id and ri.user_id=r.user_id and not ri.is_excluded
) items on true
where not exists(
  select 1
  from finance.receipt_transaction_matches rtm
  where rtm.receipt_id=r.id and rtm.user_id=r.user_id
    and rtm.status='confirmed'
);

create index if not exists transactions_user_status_occurred_idx
  on finance.transactions(user_id,status,occurred_at desc);

create index if not exists transactions_user_source_occurred_idx
  on finance.transactions(user_id,source,occurred_at desc);

create index if not exists receipts_user_processing_date_idx
  on finance.receipts(
    user_id,processing_status,
    coalesce(purchased_at,capture_finalized_at,created_at) desc
  );

create index if not exists receipt_matches_user_status_tx_idx
  on finance.receipt_transaction_matches(user_id,status,transaction_id);

create index if not exists receipt_matches_user_status_receipt_idx
  on finance.receipt_transaction_matches(user_id,status,receipt_id);

create index if not exists ledger_entries_user_necessity_tx_idx
  on finance.ledger_entries(user_id,necessity,transaction_id)
  where necessity is not null;

create index if not exists receipt_items_user_necessity_receipt_idx
  on finance.receipt_items(user_id,necessity,receipt_id)
  where not is_excluded;

revoke all on finance.activity_transactions from anon,authenticated;
revoke all on finance.activity_receipts from anon,authenticated;
grant select on finance.activity_transactions to authenticated,service_role;
grant select on finance.activity_receipts to authenticated,service_role;
