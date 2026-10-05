
create type finance.receipt_capture_method as enum (
  'camera','gallery','file','import'
);

create type finance.receipt_capture_status as enum (
  'draft','uploading','ready','cancelled'
);

create type finance.receipt_page_status as enum (
  'uploaded','ready','failed'
);

alter table finance.receipts
  alter column total_minor drop not null;

alter table finance.receipts
  add column capture_method finance.receipt_capture_method not null default 'camera',
  add column capture_status finance.receipt_capture_status not null default 'draft',
  add column client_capture_id uuid,
  add column capture_device_id text,
  add column capture_started_at timestamptz not null default now(),
  add column capture_finalized_at timestamptz,
  add column capture_cancelled_at timestamptz,
  add column capture_metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(capture_metadata)='object');

alter table finance.receipts
  add constraint receipts_confirmed_requires_total
  check (processing_status <> 'confirmed' or total_minor is not null);

alter table finance.receipts
  add constraint receipts_capture_status_times
  check (
    (capture_status='ready' and capture_finalized_at is not null and capture_cancelled_at is null)
    or
    (capture_status='cancelled' and capture_cancelled_at is not null)
    or
    (capture_status in ('draft','uploading') and capture_finalized_at is null and capture_cancelled_at is null)
  );

create unique index receipts_user_client_capture_uq
  on finance.receipts(user_id, client_capture_id)
  where client_capture_id is not null;

create table finance.receipt_pages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  receipt_id uuid not null,
  client_page_id uuid not null,
  page_index integer not null check (page_index >= 0),
  storage_path text not null check (char_length(storage_path) between 1 and 1200),
  mime_type text not null check (
    mime_type in (
      'image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf'
    )
  ),
  byte_size bigint not null check (byte_size > 0 and byte_size <= 20971520),
  width_px integer check (width_px is null or width_px > 0),
  height_px integer check (height_px is null or height_px > 0),
  sha256 text check (sha256 is null or sha256 ~ '^[A-Fa-f0-9]{64}$'),
  captured_at timestamptz,
  capture_method finance.receipt_capture_method not null default 'camera',
  status finance.receipt_page_status not null default 'uploaded',
  error_text text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, client_page_id),
  unique (storage_path),
  unique (receipt_id, page_index),
  constraint receipt_pages_receipt_fk
    foreign key (receipt_id, user_id)
    references finance.receipts(id, user_id)
    on delete cascade
);

create index receipt_pages_user_idx on finance.receipt_pages(user_id);
create index receipt_pages_receipt_fk_idx on finance.receipt_pages(receipt_id,user_id);
create index receipt_pages_receipt_order_idx on finance.receipt_pages(user_id,receipt_id,page_index);

create or replace function finance_private.validate_receipt_page_path()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_prefix text;
begin
  v_prefix := new.user_id::text || '/' || new.receipt_id::text || '/' || new.client_page_id::text;
  if new.storage_path not like v_prefix || '.%' then
    raise exception using
      errcode='23514',
      message='receipt page storage path does not match user/receipt/page identity';
  end if;
  return new;
end;
$$;

revoke all on function finance_private.validate_receipt_page_path()
  from public,anon,authenticated;

create trigger receipt_pages_path_guard
before insert or update of user_id,receipt_id,client_page_id,storage_path
on finance.receipt_pages
for each row execute function finance_private.validate_receipt_page_path();

create trigger receipt_pages_touch_updated_at
before update on finance.receipt_pages
for each row execute function finance_private.touch_updated_at();

create trigger receipt_pages_audit_change
after insert or update or delete on finance.receipt_pages
for each row execute function finance_private.audit_row_change();

alter table finance.receipt_pages enable row level security;
revoke all on finance.receipt_pages from anon,authenticated;
grant select,insert,update,delete on finance.receipt_pages to authenticated;
grant select,insert,update,delete on finance.receipt_pages to service_role;

create policy receipt_pages_select_own
on finance.receipt_pages for select to authenticated
using ((select auth.uid()) is not null and (select auth.uid())=user_id);

create policy receipt_pages_insert_own
on finance.receipt_pages for insert to authenticated
with check ((select auth.uid()) is not null and (select auth.uid())=user_id);

create policy receipt_pages_update_own
on finance.receipt_pages for update to authenticated
using ((select auth.uid()) is not null and (select auth.uid())=user_id)
with check ((select auth.uid()) is not null and (select auth.uid())=user_id);

create policy receipt_pages_delete_own
on finance.receipt_pages for delete to authenticated
using ((select auth.uid()) is not null and (select auth.uid())=user_id);

insert into storage.buckets(
  id,name,public,file_size_limit,allowed_mime_types
)
values(
  'finance-receipts',
  'finance-receipts',
  false,
  20971520,
  array[
    'image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf'
  ]::text[]
)
on conflict(id) do update
set public=false,
    file_size_limit=excluded.file_size_limit,
    allowed_mime_types=excluded.allowed_mime_types,
    updated_at=now();

drop policy if exists finance_receipts_select_own on storage.objects;
drop policy if exists finance_receipts_insert_own on storage.objects;
drop policy if exists finance_receipts_update_own on storage.objects;
drop policy if exists finance_receipts_delete_own on storage.objects;

create policy finance_receipts_select_own
on storage.objects for select to authenticated
using (
  bucket_id='finance-receipts'
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and exists (
    select 1
    from finance.receipts r
    where r.user_id=(select auth.uid())
      and r.id::text=(storage.foldername(name))[2]
  )
);

create policy finance_receipts_insert_own
on storage.objects for insert to authenticated
with check (
  bucket_id='finance-receipts'
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and exists (
    select 1
    from finance.receipts r
    where r.user_id=(select auth.uid())
      and r.id::text=(storage.foldername(name))[2]
      and r.capture_status <> 'cancelled'
  )
);

create policy finance_receipts_update_own
on storage.objects for update to authenticated
using (
  bucket_id='finance-receipts'
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and exists (
    select 1
    from finance.receipts r
    where r.user_id=(select auth.uid())
      and r.id::text=(storage.foldername(name))[2]
      and r.capture_status <> 'cancelled'
  )
)
with check (
  bucket_id='finance-receipts'
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and exists (
    select 1
    from finance.receipts r
    where r.user_id=(select auth.uid())
      and r.id::text=(storage.foldername(name))[2]
      and r.capture_status <> 'cancelled'
  )
);

create policy finance_receipts_delete_own
on storage.objects for delete to authenticated
using (
  bucket_id='finance-receipts'
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and exists (
    select 1
    from finance.receipts r
    where r.user_id=(select auth.uid())
      and r.id::text=(storage.foldername(name))[2]
  )
);

create or replace view finance.receipt_capture_summary
with (security_invoker=true)
as
select
  r.id,
  r.user_id,
  r.capture_method,
  r.capture_status,
  r.processing_status,
  r.client_capture_id,
  r.capture_device_id,
  r.capture_started_at,
  r.capture_finalized_at,
  r.capture_cancelled_at,
  r.purchased_at,
  r.merchant_id,
  r.currency_code,
  r.total_minor,
  count(rp.id)::integer as page_count,
  count(rp.id) filter (where rp.status='failed')::integer as failed_page_count,
  coalesce(sum(rp.byte_size),0)::bigint as total_bytes,
  min(rp.created_at) as first_page_at,
  max(rp.created_at) as last_page_at,
  r.created_at,
  r.updated_at
from finance.receipts r
left join finance.receipt_pages rp
  on rp.receipt_id=r.id and rp.user_id=r.user_id
group by r.id;

revoke all on finance.receipt_capture_summary from anon,authenticated;
grant select on finance.receipt_capture_summary to authenticated,service_role;
