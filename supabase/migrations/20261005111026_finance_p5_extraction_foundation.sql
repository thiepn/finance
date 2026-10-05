
create type finance.receipt_line_kind as enum (
  'item','discount','deposit','deposit_return','return','fee',
  'subtotal','tax','total','payment','informational','unknown'
);

create type finance.receipt_reconciliation_status as enum (
  'not_run','exact','within_tolerance','mismatch','insufficient_data'
);

create type finance.receipt_pipeline_mode as enum (
  'local','hybrid','cloud'
);

create table finance.receipt_processing_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  receipt_id uuid not null,
  mode finance.receipt_pipeline_mode not null default 'local',
  pipeline_version text not null check (char_length(pipeline_version) between 1 and 120),
  ocr_provider text,
  ocr_model text,
  parser_provider text not null default 'deterministic',
  parser_version text not null check (char_length(parser_version) between 1 and 120),
  status finance.ai_run_status not null default 'pending',
  input_digest text,
  is_current boolean not null default false,
  confidence numeric(5,4) check (confidence is null or (confidence>=0 and confidence<=1)),
  duration_ms integer check (duration_ms is null or duration_ms>=0),
  error_text text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,user_id),
  constraint receipt_processing_runs_receipt_fk
    foreign key(receipt_id,user_id)
    references finance.receipts(id,user_id)
    on delete cascade
);

create unique index receipt_processing_runs_current_uq
  on finance.receipt_processing_runs(user_id,receipt_id)
  where is_current;

create index receipt_processing_runs_receipt_fk_idx
  on finance.receipt_processing_runs(receipt_id,user_id);

create table finance.receipt_page_extractions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  receipt_id uuid not null,
  page_id uuid not null,
  run_id uuid not null,
  page_index integer not null check(page_index>=0),
  raw_text text not null default '',
  confidence numeric(5,4) check (confidence is null or (confidence>=0 and confidence<=1)),
  blocks jsonb,
  metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default now(),
  unique(id,user_id),
  unique(run_id,page_id),
  constraint receipt_page_extractions_receipt_fk
    foreign key(receipt_id,user_id)
    references finance.receipts(id,user_id)
    on delete cascade,
  constraint receipt_page_extractions_page_fk
    foreign key(page_id,user_id)
    references finance.receipt_pages(id,user_id)
    on delete cascade,
  constraint receipt_page_extractions_run_fk
    foreign key(run_id,user_id)
    references finance.receipt_processing_runs(id,user_id)
    on delete cascade
);

create index receipt_page_extractions_receipt_fk_idx
  on finance.receipt_page_extractions(receipt_id,user_id);
create index receipt_page_extractions_page_fk_idx
  on finance.receipt_page_extractions(page_id,user_id);
create index receipt_page_extractions_run_fk_idx
  on finance.receipt_page_extractions(run_id,user_id);

create table finance.receipt_lines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  receipt_id uuid not null,
  page_id uuid,
  run_id uuid not null,
  line_index integer not null check(line_index>=0),
  page_line_index integer check(page_line_index is null or page_line_index>=0),
  raw_text text not null check(char_length(raw_text) between 1 and 2000),
  normalized_text text,
  kind finance.receipt_line_kind not null default 'unknown',
  amount_minor bigint,
  quantity numeric,
  unit_price_minor bigint,
  confidence numeric(5,4) check(confidence is null or (confidence>=0 and confidence<=1)),
  bbox jsonb,
  metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default now(),
  unique(id,user_id),
  unique(run_id,line_index),
  constraint receipt_lines_receipt_fk
    foreign key(receipt_id,user_id)
    references finance.receipts(id,user_id)
    on delete cascade,
  constraint receipt_lines_page_fk
    foreign key(page_id,user_id)
    references finance.receipt_pages(id,user_id)
    on delete set null (page_id),
  constraint receipt_lines_run_fk
    foreign key(run_id,user_id)
    references finance.receipt_processing_runs(id,user_id)
    on delete cascade
);

create index receipt_lines_receipt_fk_idx on finance.receipt_lines(receipt_id,user_id);
create index receipt_lines_page_fk_idx on finance.receipt_lines(page_id,user_id);
create index receipt_lines_run_fk_idx on finance.receipt_lines(run_id,user_id);
create index receipt_lines_kind_idx on finance.receipt_lines(user_id,receipt_id,kind);

alter table finance.receipts
  add column merchant_raw_name text,
  add column merchant_address_raw text,
  add column receipt_number text,
  add column payment_method_raw text,
  add column locale text,
  add column current_processing_run_id uuid,
  add column reconciliation_status finance.receipt_reconciliation_status not null default 'not_run',
  add column reconciliation_delta_minor bigint,
  add column review_reasons jsonb not null default '[]'::jsonb
    check(jsonb_typeof(review_reasons)='array');

alter table finance.receipts
  add constraint receipts_current_processing_run_fk
  foreign key(current_processing_run_id,user_id)
  references finance.receipt_processing_runs(id,user_id)
  on delete set null (current_processing_run_id);

create index receipts_current_processing_run_fk_idx
  on finance.receipts(current_processing_run_id,user_id)
  where current_processing_run_id is not null;

alter table finance.receipt_items
  add column source_line_id uuid,
  add column processing_run_id uuid,
  add column source_page_id uuid;

alter table finance.receipt_items
  add constraint receipt_items_source_line_fk
  foreign key(source_line_id,user_id)
  references finance.receipt_lines(id,user_id)
  on delete set null (source_line_id);

alter table finance.receipt_items
  add constraint receipt_items_processing_run_fk
  foreign key(processing_run_id,user_id)
  references finance.receipt_processing_runs(id,user_id)
  on delete set null (processing_run_id);

alter table finance.receipt_items
  add constraint receipt_items_source_page_fk
  foreign key(source_page_id,user_id)
  references finance.receipt_pages(id,user_id)
  on delete set null (source_page_id);

create index receipt_items_source_line_fk_idx
  on finance.receipt_items(source_line_id,user_id)
  where source_line_id is not null;
create index receipt_items_processing_run_fk_idx
  on finance.receipt_items(processing_run_id,user_id)
  where processing_run_id is not null;
create index receipt_items_source_page_fk_idx
  on finance.receipt_items(source_page_id,user_id)
  where source_page_id is not null;

-- RLS + grants for new P5 tables.
do $$
declare t text;
begin
  foreach t in array array[
    'receipt_processing_runs','receipt_page_extractions','receipt_lines'
  ]
  loop
    execute format('alter table finance.%I enable row level security',t);
    execute format('revoke all on finance.%I from anon,authenticated',t);
    execute format('grant select,insert,update,delete on finance.%I to authenticated',t);
    execute format('grant select,insert,update,delete on finance.%I to service_role',t);

    execute format(
      'create policy %I on finance.%I for select to authenticated using ((select auth.uid()) is not null and (select auth.uid())=user_id)',
      t||'_select_own',t
    );
    execute format(
      'create policy %I on finance.%I for insert to authenticated with check ((select auth.uid()) is not null and (select auth.uid())=user_id)',
      t||'_insert_own',t
    );
    execute format(
      'create policy %I on finance.%I for update to authenticated using ((select auth.uid()) is not null and (select auth.uid())=user_id) with check ((select auth.uid()) is not null and (select auth.uid())=user_id)',
      t||'_update_own',t
    );
    execute format(
      'create policy %I on finance.%I for delete to authenticated using ((select auth.uid()) is not null and (select auth.uid())=user_id)',
      t||'_delete_own',t
    );
  end loop;
end $$;

create trigger receipt_processing_runs_touch_updated_at
before update on finance.receipt_processing_runs
for each row execute function finance_private.touch_updated_at();

create trigger receipt_processing_runs_audit_change
after insert or update or delete on finance.receipt_processing_runs
for each row execute function finance_private.audit_row_change();

create trigger receipt_page_extractions_audit_change
after insert or update or delete on finance.receipt_page_extractions
for each row execute function finance_private.audit_row_change();

create trigger receipt_lines_audit_change
after insert or update or delete on finance.receipt_lines
for each row execute function finance_private.audit_row_change();

create or replace view finance.receipt_processing_summary
with (security_invoker=true)
as
select
  r.id as receipt_id,
  r.user_id,
  r.processing_status,
  r.current_processing_run_id,
  pr.mode,
  pr.pipeline_version,
  pr.ocr_provider,
  pr.ocr_model,
  pr.parser_provider,
  pr.parser_version,
  pr.status as run_status,
  pr.confidence as run_confidence,
  r.merchant_raw_name,
  r.merchant_id,
  r.purchased_at,
  r.receipt_number,
  r.payment_method_raw,
  r.currency_code,
  r.subtotal_minor,
  r.tax_minor,
  r.discount_minor,
  r.deposit_minor,
  r.total_minor,
  r.reconciliation_status,
  r.reconciliation_delta_minor,
  r.overall_confidence,
  r.review_reasons,
  count(distinct pe.id)::integer as extracted_page_count,
  count(distinct rl.id)::integer as raw_line_count,
  count(distinct ri.id)::integer as item_count,
  count(distinct ri.id) filter(where ri.review_required)::integer as review_item_count
from finance.receipts r
left join finance.receipt_processing_runs pr
  on pr.id=r.current_processing_run_id and pr.user_id=r.user_id
left join finance.receipt_page_extractions pe
  on pe.run_id=pr.id and pe.user_id=pr.user_id
left join finance.receipt_lines rl
  on rl.run_id=pr.id and rl.user_id=pr.user_id
left join finance.receipt_items ri
  on ri.processing_run_id=pr.id and ri.user_id=pr.user_id
group by r.id,pr.id;

revoke all on finance.receipt_processing_summary from anon,authenticated;
grant select on finance.receipt_processing_summary to authenticated,service_role;
