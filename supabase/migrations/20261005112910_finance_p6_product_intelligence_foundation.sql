
create type finance.product_normalization_status as enum (
  'pending','matched','created','review_required','corrected','skipped'
);

create table finance.product_families (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 240),
  normalized_name text not null check (char_length(normalized_name) between 1 and 240),
  brand text,
  normalized_brand text,
  product_type text,
  default_category_id uuid,
  default_necessity finance.necessity not null default 'unclassified',
  is_archived boolean not null default false,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,user_id),
  constraint product_families_category_fk
    foreign key(default_category_id,user_id)
    references finance.categories(id,user_id)
    on delete set null (default_category_id)
);

create unique index product_families_user_identity_uq
  on finance.product_families(
    user_id,
    normalized_name,
    coalesce(normalized_brand,'')
  )
  where not is_archived;

create index product_families_user_idx on finance.product_families(user_id);
create index product_families_category_fk_idx
  on finance.product_families(default_category_id,user_id)
  where default_category_id is not null;

alter table finance.products
  add column normalized_name text,
  add column normalized_brand text,
  add column family_id uuid,
  add column variant_name text,
  add column source finance.rule_source not null default 'learned',
  add column confidence numeric(5,4)
    check(confidence is null or (confidence>=0 and confidence<=1)),
  add column first_seen_at timestamptz,
  add column last_seen_at timestamptz;

update finance.products
set normalized_name=lower(regexp_replace(btrim(name),'[^[:alnum:]]+',' ','g')),
    normalized_brand=case
      when brand is null then null
      else lower(regexp_replace(btrim(brand),'[^[:alnum:]]+',' ','g'))
    end
where normalized_name is null;

alter table finance.products
  alter column normalized_name set not null;

alter table finance.products
  add constraint products_family_fk
  foreign key(family_id,user_id)
  references finance.product_families(id,user_id)
  on delete set null (family_id);

create index products_family_fk_idx
  on finance.products(family_id,user_id)
  where family_id is not null;

create unique index products_user_normalized_name_uq
  on finance.products(user_id,normalized_name)
  where not is_archived;

create unique index products_user_barcode_uq
  on finance.products(user_id,barcode)
  where barcode is not null and not is_archived;

alter table finance.product_aliases
  add column is_active boolean not null default true,
  add column use_count bigint not null default 0 check(use_count>=0),
  add column last_used_at timestamptz;

create unique index product_aliases_global_identity_uq
  on finance.product_aliases(user_id,normalized_alias)
  where merchant_id is null and is_active;

create unique index product_aliases_merchant_identity_uq
  on finance.product_aliases(user_id,merchant_id,normalized_alias)
  where merchant_id is not null and is_active;

alter table finance.receipt_items
  add column normalization_status finance.product_normalization_status not null default 'pending',
  add column normalization_source finance.rule_source,
  add column normalization_confidence numeric(5,4)
    check(normalization_confidence is null or (normalization_confidence>=0 and normalization_confidence<=1)),
  add column normalization_version text,
  add column normalization_review_required boolean not null default false,
  add column normalized_at timestamptz,
  add column user_corrected boolean not null default false;

create index receipt_items_normalization_queue_idx
  on finance.receipt_items(user_id,normalization_status,receipt_id)
  where normalization_status in ('pending','review_required');

create unique index product_prices_receipt_item_uq
  on finance.product_prices(user_id,receipt_item_id)
  where receipt_item_id is not null;

create table finance.product_normalization_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  receipt_item_id uuid not null,
  previous_product_id uuid,
  product_id uuid,
  alias_id uuid,
  source finance.rule_source not null,
  status finance.product_normalization_status not null,
  confidence numeric(5,4)
    check(confidence is null or (confidence>=0 and confidence<=1)),
  normalization_version text,
  user_corrected boolean not null default false,
  metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default now(),
  unique(id,user_id),
  constraint product_normalization_events_item_fk
    foreign key(receipt_item_id,user_id)
    references finance.receipt_items(id,user_id)
    on delete cascade,
  constraint product_normalization_events_previous_product_fk
    foreign key(previous_product_id,user_id)
    references finance.products(id,user_id)
    on delete set null (previous_product_id),
  constraint product_normalization_events_product_fk
    foreign key(product_id,user_id)
    references finance.products(id,user_id)
    on delete set null (product_id),
  constraint product_normalization_events_alias_fk
    foreign key(alias_id,user_id)
    references finance.product_aliases(id,user_id)
    on delete set null (alias_id)
);

create index product_normalization_events_user_idx
  on finance.product_normalization_events(user_id);
create index product_normalization_events_item_fk_idx
  on finance.product_normalization_events(receipt_item_id,user_id);
create index product_normalization_events_product_fk_idx
  on finance.product_normalization_events(product_id,user_id)
  where product_id is not null;
create index product_normalization_events_alias_fk_idx
  on finance.product_normalization_events(alias_id,user_id)
  where alias_id is not null;
create index product_normalization_events_previous_product_fk_idx
  on finance.product_normalization_events(previous_product_id,user_id)
  where previous_product_id is not null;

alter table finance.product_families enable row level security;
alter table finance.product_normalization_events enable row level security;

revoke all on finance.product_families from anon,authenticated;
revoke all on finance.product_normalization_events from anon,authenticated;

grant select,insert,update on finance.product_families to authenticated;
grant select,insert on finance.product_normalization_events to authenticated;

grant select,insert,update,delete on finance.product_families to service_role;
grant select,insert,update,delete on finance.product_normalization_events to service_role;

create policy product_families_select_own
on finance.product_families for select to authenticated
using ((select auth.uid()) is not null and (select auth.uid())=user_id);

create policy product_families_insert_own
on finance.product_families for insert to authenticated
with check ((select auth.uid()) is not null and (select auth.uid())=user_id);

create policy product_families_update_own
on finance.product_families for update to authenticated
using ((select auth.uid()) is not null and (select auth.uid())=user_id)
with check ((select auth.uid()) is not null and (select auth.uid())=user_id);

create policy product_normalization_events_select_own
on finance.product_normalization_events for select to authenticated
using ((select auth.uid()) is not null and (select auth.uid())=user_id);

create policy product_normalization_events_insert_own
on finance.product_normalization_events for insert to authenticated
with check ((select auth.uid()) is not null and (select auth.uid())=user_id);

create trigger product_families_touch_updated_at
before update on finance.product_families
for each row execute function finance_private.touch_updated_at();

create trigger product_families_audit_change
after insert or update or delete on finance.product_families
for each row execute function finance_private.audit_row_change();

create trigger product_normalization_events_audit_change
after insert or update or delete on finance.product_normalization_events
for each row execute function finance_private.audit_row_change();

create or replace view finance.product_intelligence_summary
with (security_invoker=true)
as
select
  p.id,
  p.user_id,
  p.name,
  p.normalized_name,
  p.brand,
  p.normalized_brand,
  p.family_id,
  pf.name as family_name,
  p.variant_name,
  p.product_type,
  p.barcode,
  p.size_value,
  p.size_unit,
  p.default_category_id,
  p.default_necessity,
  p.source,
  p.confidence,
  p.is_archived,
  count(distinct ri.id)::bigint as purchase_count,
  coalesce(sum(ri.effective_total_minor),0)::bigint as total_spend_minor,
  coalesce(sum(ri.quantity),0)::numeric as total_quantity,
  min(r.purchased_at) as first_purchase_at,
  max(r.purchased_at) as last_purchase_at,
  min(pp.effective_unit_price_minor) as min_unit_price_minor,
  max(pp.effective_unit_price_minor) as max_unit_price_minor,
  avg(pp.effective_unit_price_minor)::numeric as avg_unit_price_minor
from finance.products p
left join finance.product_families pf
  on pf.id=p.family_id and pf.user_id=p.user_id
left join finance.receipt_items ri
  on ri.product_id=p.id and ri.user_id=p.user_id
left join finance.receipts r
  on r.id=ri.receipt_id and r.user_id=ri.user_id
left join finance.product_prices pp
  on pp.product_id=p.id and pp.user_id=p.user_id
group by p.id,pf.id;

revoke all on finance.product_intelligence_summary from anon,authenticated;
grant select on finance.product_intelligence_summary to authenticated,service_role;
