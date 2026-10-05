
create type finance.receipt_review_event_type as enum (
  'review_started',
  'header_accepted',
  'header_corrected',
  'item_accepted',
  'item_corrected',
  'item_excluded',
  'item_restored',
  'product_skipped',
  'reason_waived',
  'receipt_confirmed'
);

alter table finance.receipts
  add column review_started_at timestamptz,
  add column header_reviewed_at timestamptz,
  add column last_reviewed_at timestamptz,
  add column review_revision bigint not null default 0 check(review_revision>=0),
  add column review_waivers jsonb not null default '{}'::jsonb
    check(jsonb_typeof(review_waivers)='object');

alter table finance.receipt_items
  add column is_excluded boolean not null default false,
  add column reviewed_at timestamptz,
  add column review_note text;

alter table finance.product_prices
  add column is_active boolean not null default true;

create index receipt_items_review_queue_idx
  on finance.receipt_items(user_id,receipt_id,line_index)
  where not is_excluded
    and (
      review_required
      or normalization_status in ('pending','review_required')
    );

create index product_prices_active_product_date_idx
  on finance.product_prices(user_id,product_id,observed_at desc)
  where is_active;

create table finance.receipt_review_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  receipt_id uuid not null,
  receipt_item_id uuid,
  event_type finance.receipt_review_event_type not null,
  field_name text,
  before_value jsonb,
  after_value jsonb,
  reason text,
  metadata jsonb not null default '{}'::jsonb
    check(jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default now(),
  unique(id,user_id),
  constraint receipt_review_events_receipt_fk
    foreign key(receipt_id,user_id)
    references finance.receipts(id,user_id)
    on delete cascade,
  constraint receipt_review_events_item_fk
    foreign key(receipt_item_id,user_id)
    references finance.receipt_items(id,user_id)
    on delete set null (receipt_item_id)
);

create index receipt_review_events_user_idx
  on finance.receipt_review_events(user_id);
create index receipt_review_events_receipt_idx
  on finance.receipt_review_events(user_id,receipt_id,created_at desc);
create index receipt_review_events_item_fk_idx
  on finance.receipt_review_events(receipt_item_id,user_id)
  where receipt_item_id is not null;

alter table finance.receipt_review_events enable row level security;
revoke all on finance.receipt_review_events from anon,authenticated;
grant select,insert on finance.receipt_review_events to authenticated;
grant select,insert,update,delete on finance.receipt_review_events to service_role;

create policy receipt_review_events_select_own
on finance.receipt_review_events for select to authenticated
using ((select auth.uid()) is not null and (select auth.uid())=user_id);

create policy receipt_review_events_insert_own
on finance.receipt_review_events for insert to authenticated
with check ((select auth.uid()) is not null and (select auth.uid())=user_id);

create trigger receipt_review_events_audit_change
after insert or update or delete on finance.receipt_review_events
for each row execute function finance_private.audit_row_change();
