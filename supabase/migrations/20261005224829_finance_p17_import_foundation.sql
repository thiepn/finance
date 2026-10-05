
do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid=t.typnamespace
    where n.nspname='finance' and t.typname='import_format'
  ) then
    create type finance.import_format as enum ('csv','camt053','ofx','qfx');
  end if;

  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid=t.typnamespace
    where n.nspname='finance' and t.typname='import_record_decision'
  ) then
    create type finance.import_record_decision
      as enum ('review','import','ignore','duplicate');
  end if;

  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid=t.typnamespace
    where n.nspname='finance' and t.typname='import_duplicate_reason'
  ) then
    create type finance.import_duplicate_reason
      as enum ('source_id','fingerprint','within_file','existing_transaction');
  end if;
end $$;

alter table finance.imports
  add column if not exists format finance.import_format,
  add column if not exists client_import_id uuid,
  add column if not exists file_sha256 text,
  add column if not exists storage_path text,
  add column if not exists mime_type text,
  add column if not exists file_size bigint,
  add column if not exists account_identifier text,
  add column if not exists statement_currency text,
  add column if not exists statement_from date,
  add column if not exists statement_to date,
  add column if not exists closing_balance_minor bigint,
  add column if not exists closing_balance_at timestamptz,
  add column if not exists mapping jsonb not null default '{}'::jsonb,
  add column if not exists detected_metadata jsonb not null default '{}'::jsonb,
  add column if not exists previewed_at timestamptz,
  add column if not exists committed_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conrelid='finance.imports'::regclass
      and conname='imports_file_sha256_check'
  ) then
    alter table finance.imports add constraint imports_file_sha256_check
      check(file_sha256 is null or file_sha256 ~ '^[0-9a-f]{64}$');
  end if;
  if not exists (
    select 1 from pg_constraint where conrelid='finance.imports'::regclass
      and conname='imports_file_size_check'
  ) then
    alter table finance.imports add constraint imports_file_size_check
      check(file_size is null or (file_size>=0 and file_size<=20971520));
  end if;
  if not exists (
    select 1 from pg_constraint where conrelid='finance.imports'::regclass
      and conname='imports_statement_currency_check'
  ) then
    alter table finance.imports add constraint imports_statement_currency_check
      check(statement_currency is null or statement_currency ~ '^[A-Z]{3}$');
  end if;
  if not exists (
    select 1 from pg_constraint where conrelid='finance.imports'::regclass
      and conname='imports_mapping_check'
  ) then
    alter table finance.imports add constraint imports_mapping_check
      check(jsonb_typeof(mapping)='object');
  end if;
  if not exists (
    select 1 from pg_constraint where conrelid='finance.imports'::regclass
      and conname='imports_detected_metadata_check'
  ) then
    alter table finance.imports add constraint imports_detected_metadata_check
      check(jsonb_typeof(detected_metadata)='object');
  end if;
  if not exists (
    select 1 from pg_constraint where conrelid='finance.imports'::regclass
      and conname='imports_statement_dates_check'
  ) then
    alter table finance.imports add constraint imports_statement_dates_check
      check(statement_from is null or statement_to is null or statement_to>=statement_from);
  end if;
end $$;

create unique index if not exists imports_user_client_import_uq
  on finance.imports(user_id,client_import_id)
  where client_import_id is not null;
create index if not exists imports_user_format_created_idx
  on finance.imports(user_id,format,created_at desc);

alter table finance.import_records
  add column if not exists external_id text,
  add column if not exists booked_at timestamptz,
  add column if not exists value_date date,
  add column if not exists amount_minor bigint,
  add column if not exists reporting_amount_minor bigint,
  add column if not exists exchange_rate numeric,
  add column if not exists currency_code text,
  add column if not exists description text,
  add column if not exists counterparty_name text,
  add column if not exists counterparty_iban text,
  add column if not exists reference text,
  add column if not exists normalized_payload jsonb not null default '{}'::jsonb,
  add column if not exists fingerprint text,
  add column if not exists decision finance.import_record_decision not null default 'review',
  add column if not exists duplicate_reason finance.import_duplicate_reason,
  add column if not exists duplicate_transaction_id uuid,
  add column if not exists duplicate_record_id uuid,
  add column if not exists proposed_type finance.transaction_type,
  add column if not exists category_id uuid,
  add column if not exists necessity finance.necessity,
  add column if not exists transfer_account_id uuid,
  add column if not exists merchant_id uuid,
  add column if not exists classification_result jsonb not null default '{}'::jsonb;

drop index if exists finance.import_records_source_hash_uq;
create index if not exists import_records_user_source_hash_idx
  on finance.import_records(user_id,source_hash)
  where source_hash is not null;
create index if not exists import_records_user_fingerprint_idx
  on finance.import_records(user_id,fingerprint)
  where fingerprint is not null;
create index if not exists import_records_import_decision_idx
  on finance.import_records(import_id,decision,row_number);
create index if not exists import_records_duplicate_transaction_idx
  on finance.import_records(duplicate_transaction_id,user_id)
  where duplicate_transaction_id is not null;
create index if not exists import_records_duplicate_record_idx
  on finance.import_records(duplicate_record_id,user_id)
  where duplicate_record_id is not null;
create index if not exists import_records_category_fk_idx
  on finance.import_records(category_id,user_id)
  where category_id is not null;
create index if not exists import_records_merchant_fk_idx
  on finance.import_records(merchant_id,user_id)
  where merchant_id is not null;
create index if not exists import_records_transfer_account_fk_idx
  on finance.import_records(transfer_account_id,user_id)
  where transfer_account_id is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conrelid='finance.import_records'::regclass
      and conname='import_records_currency_code_check'
  ) then
    alter table finance.import_records add constraint import_records_currency_code_check
      check(currency_code is null or currency_code ~ '^[A-Z]{3}$');
  end if;
  if not exists (
    select 1 from pg_constraint where conrelid='finance.import_records'::regclass
      and conname='import_records_normalized_payload_check'
  ) then
    alter table finance.import_records add constraint import_records_normalized_payload_check
      check(jsonb_typeof(normalized_payload)='object');
  end if;
  if not exists (
    select 1 from pg_constraint where conrelid='finance.import_records'::regclass
      and conname='import_records_classification_result_check'
  ) then
    alter table finance.import_records add constraint import_records_classification_result_check
      check(jsonb_typeof(classification_result)='object');
  end if;
  if not exists (
    select 1 from pg_constraint where conrelid='finance.import_records'::regclass
      and conname='import_records_exchange_rate_check'
  ) then
    alter table finance.import_records add constraint import_records_exchange_rate_check
      check(exchange_rate is null or exchange_rate>0);
  end if;
  if not exists (
    select 1 from pg_constraint where conrelid='finance.import_records'::regclass
      and conname='import_records_proposed_type_check'
  ) then
    alter table finance.import_records add constraint import_records_proposed_type_check
      check(proposed_type is null or proposed_type in ('expense','income','transfer'));
  end if;
  if not exists (
    select 1 from pg_constraint where conrelid='finance.import_records'::regclass
      and conname='import_records_duplicate_transaction_fk'
  ) then
    alter table finance.import_records add constraint import_records_duplicate_transaction_fk
      foreign key(duplicate_transaction_id,user_id)
      references finance.transactions(id,user_id)
      on delete set null (duplicate_transaction_id);
  end if;
  if not exists (
    select 1 from pg_constraint where conrelid='finance.import_records'::regclass
      and conname='import_records_duplicate_record_fk'
  ) then
    alter table finance.import_records add constraint import_records_duplicate_record_fk
      foreign key(duplicate_record_id,user_id)
      references finance.import_records(id,user_id)
      on delete set null (duplicate_record_id);
  end if;
  if not exists (
    select 1 from pg_constraint where conrelid='finance.import_records'::regclass
      and conname='import_records_category_fk'
  ) then
    alter table finance.import_records add constraint import_records_category_fk
      foreign key(category_id,user_id)
      references finance.categories(id,user_id)
      on delete restrict;
  end if;
  if not exists (
    select 1 from pg_constraint where conrelid='finance.import_records'::regclass
      and conname='import_records_transfer_account_fk'
  ) then
    alter table finance.import_records add constraint import_records_transfer_account_fk
      foreign key(transfer_account_id,user_id)
      references finance.accounts(id,user_id)
      on delete restrict;
  end if;
  if not exists (
    select 1 from pg_constraint where conrelid='finance.import_records'::regclass
      and conname='import_records_merchant_fk'
  ) then
    alter table finance.import_records add constraint import_records_merchant_fk
      foreign key(merchant_id,user_id)
      references finance.merchants(id,user_id)
      on delete set null (merchant_id);
  end if;
end $$;

create table if not exists finance.import_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  format finance.import_format not null,
  institution_key text,
  account_id uuid,
  header_signature text,
  mapping jsonb not null default '{}'::jsonb,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,user_id),
  constraint import_profiles_name_check check(char_length(name) between 1 and 120),
  constraint import_profiles_mapping_check check(jsonb_typeof(mapping)='object'),
  constraint import_profiles_account_fk
    foreign key(account_id,user_id)
    references finance.accounts(id,user_id)
    on delete set null (account_id)
);

alter table finance.import_profiles enable row level security;

drop policy if exists import_profiles_select_own on finance.import_profiles;
create policy import_profiles_select_own on finance.import_profiles
  for select to authenticated
  using((select auth.uid()) is not null and (select auth.uid())=user_id);

drop policy if exists import_profiles_insert_own on finance.import_profiles;
create policy import_profiles_insert_own on finance.import_profiles
  for insert to authenticated
  with check((select auth.uid()) is not null and (select auth.uid())=user_id);

drop policy if exists import_profiles_update_own on finance.import_profiles;
create policy import_profiles_update_own on finance.import_profiles
  for update to authenticated
  using((select auth.uid()) is not null and (select auth.uid())=user_id)
  with check((select auth.uid()) is not null and (select auth.uid())=user_id);

drop policy if exists import_profiles_delete_own on finance.import_profiles;
create policy import_profiles_delete_own on finance.import_profiles
  for delete to authenticated
  using((select auth.uid()) is not null and (select auth.uid())=user_id);

drop trigger if exists import_profiles_touch_updated_at on finance.import_profiles;
create trigger import_profiles_touch_updated_at
before update on finance.import_profiles
for each row execute function finance_private.touch_updated_at();

drop trigger if exists import_profiles_audit_change on finance.import_profiles;
create trigger import_profiles_audit_change
after insert or update or delete on finance.import_profiles
for each row execute function finance_private.audit_row_change();

create index if not exists import_profiles_user_format_idx
  on finance.import_profiles(user_id,format,institution_key);
create unique index if not exists import_profiles_one_default_uq
  on finance.import_profiles(user_id,format,coalesce(institution_key,''))
  where is_default;
create index if not exists import_profiles_account_fk_idx
  on finance.import_profiles(account_id,user_id)
  where account_id is not null;

grant select,insert,update,delete
  on finance.imports,finance.import_records,finance.import_profiles
  to authenticated,service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'finance-imports','finance-imports',false,20971520,
  array[
    'text/csv','text/plain','application/xml','text/xml',
    'application/x-ofx','application/vnd.intu.qfx','application/octet-stream'
  ]::text[]
)
on conflict(id) do update set
  public=false,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists finance_imports_select_own on storage.objects;
create policy finance_imports_select_own
on storage.objects for select to authenticated
using(
  bucket_id='finance-imports'
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and exists(
    select 1 from finance.imports i
    where i.user_id=(select auth.uid())
      and i.id::text=(storage.foldername(objects.name))[2]
  )
);

drop policy if exists finance_imports_insert_own on storage.objects;
create policy finance_imports_insert_own
on storage.objects for insert to authenticated
with check(
  bucket_id='finance-imports'
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and exists(
    select 1 from finance.imports i
    where i.user_id=(select auth.uid())
      and i.id::text=(storage.foldername(objects.name))[2]
      and i.status not in ('completed','cancelled')
  )
);

drop policy if exists finance_imports_update_own on storage.objects;
create policy finance_imports_update_own
on storage.objects for update to authenticated
using(
  bucket_id='finance-imports'
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and exists(
    select 1 from finance.imports i
    where i.user_id=(select auth.uid())
      and i.id::text=(storage.foldername(objects.name))[2]
      and i.status not in ('completed','cancelled')
  )
)
with check(
  bucket_id='finance-imports'
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and exists(
    select 1 from finance.imports i
    where i.user_id=(select auth.uid())
      and i.id::text=(storage.foldername(objects.name))[2]
      and i.status not in ('completed','cancelled')
  )
);

drop policy if exists finance_imports_delete_own on storage.objects;
create policy finance_imports_delete_own
on storage.objects for delete to authenticated
using(
  bucket_id='finance-imports'
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and exists(
    select 1 from finance.imports i
    where i.user_id=(select auth.uid())
      and i.id::text=(storage.foldername(objects.name))[2]
  )
);
