
create schema if not exists finance;
create schema if not exists finance_private;

comment on schema finance is 'THIEPN Finance product-owned financial domain.';
comment on schema finance_private is 'Private Finance helper functions; never expose through Data API.';

revoke all on schema finance from public, anon;
revoke all on schema finance_private from public, anon, authenticated;
grant usage on schema finance to authenticated, service_role;

insert into core.apps (id, name, origin, namespace, backend_level, owner, enabled)
values ('finance', 'Finance', 'https://finance.thiepn.dev', 'finance', '5', 'private-core', true)
on conflict (id) do update
set name = excluded.name,
    origin = excluded.origin,
    namespace = excluded.namespace,
    backend_level = excluded.backend_level,
    owner = excluded.owner,
    enabled = excluded.enabled,
    updated_at = now();

create type finance.account_kind as enum (
  'checking','savings','cash','credit_card','paypal','prepaid','gift_card','investment','loan','other'
);
create type finance.transaction_type as enum (
  'expense','income','transfer','refund','reimbursement','adjustment','opening_balance'
);
create type finance.transaction_status as enum ('draft','posted','void');
create type finance.entry_kind as enum ('account','category','system');
create type finance.category_kind as enum ('expense','income','both');
create type finance.necessity as enum ('essential','flexible','discretionary','unclassified');
create type finance.source_type as enum ('manual','receipt','import','bank_sync','recurring','system');
create type finance.receipt_processing_status as enum (
  'captured','preprocessing','extracting','normalizing','classifying',
  'review_required','confirmed','processing_failed','incomplete'
);
create type finance.receipt_match_status as enum (
  'unmatched','suggested_match','matched','partially_matched','multi_payment_matched'
);
create type finance.match_candidate_status as enum ('suggested','confirmed','rejected');
create type finance.rule_source as enum ('user','learned','merchant','global','ai');
create type finance.goal_status as enum ('active','completed','paused','cancelled');
create type finance.import_status as enum ('pending','processing','review_required','completed','failed','cancelled');
create type finance.import_record_status as enum ('pending','imported','duplicate','ignored','failed');
create type finance.ai_run_status as enum ('pending','running','succeeded','failed','cancelled');
create type finance.attachment_kind as enum ('receipt_image','invoice','statement','other');
create type finance.budget_period_kind as enum ('weekly','monthly','quarterly','yearly','custom');
create type finance.recurring_status as enum ('active','paused','ended');

create table finance.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  reporting_currency text not null default 'EUR' check (reporting_currency ~ '^[A-Z]{3}$'),
  locale text not null default 'de-DE' check (char_length(locale) between 2 and 35),
  time_zone text not null default 'Europe/Berlin' check (char_length(time_zone) between 1 and 80),
  week_starts_on smallint not null default 1 check (week_starts_on between 0 and 6),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table finance.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  kind finance.account_kind not null,
  currency_code text not null default 'EUR' check (currency_code ~ '^[A-Z]{3}$'),
  institution_name text,
  account_last4 text check (account_last4 is null or account_last4 ~ '^[A-Za-z0-9]{1,8}$'),
  include_in_net_worth boolean not null default true,
  is_archived boolean not null default false,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table finance.merchants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  normalized_name text not null check (char_length(normalized_name) between 1 and 200),
  merchant_group text,
  default_category_id uuid,
  website text,
  is_archived boolean not null default false,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table finance.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  parent_id uuid,
  name text not null check (char_length(name) between 1 and 100),
  kind finance.category_kind not null default 'expense',
  necessity_default finance.necessity not null default 'unclassified',
  system_key text,
  icon_key text,
  sort_order integer not null default 0,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  constraint categories_parent_fk
    foreign key (parent_id, user_id) references finance.categories(id, user_id) on delete restrict,
  constraint categories_not_self_parent check (parent_id is null or parent_id <> id)
);

alter table finance.merchants
  add constraint merchants_default_category_fk
  foreign key (default_category_id, user_id)
  references finance.categories(id, user_id) on delete set null;

create table finance.products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 240),
  brand text,
  family_name text,
  product_type text,
  barcode text,
  size_value numeric(18,6) check (size_value is null or size_value >= 0),
  size_unit text,
  default_category_id uuid,
  default_necessity finance.necessity not null default 'unclassified',
  is_archived boolean not null default false,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  constraint products_default_category_fk
    foreign key (default_category_id, user_id)
    references finance.categories(id, user_id) on delete set null
);

create table finance.product_aliases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null,
  merchant_id uuid,
  raw_alias text not null check (char_length(raw_alias) between 1 and 300),
  normalized_alias text not null check (char_length(normalized_alias) between 1 and 300),
  source finance.rule_source not null default 'learned',
  confidence numeric(5,4) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  times_confirmed integer not null default 0 check (times_confirmed >= 0),
  last_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  constraint product_aliases_product_fk
    foreign key (product_id, user_id) references finance.products(id, user_id) on delete restrict,
  constraint product_aliases_merchant_fk
    foreign key (merchant_id, user_id) references finance.merchants(id, user_id) on delete restrict
);

create table finance.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type finance.transaction_type not null,
  status finance.transaction_status not null default 'draft',
  occurred_at timestamptz not null,
  merchant_id uuid,
  description text,
  note text,
  source finance.source_type not null default 'manual',
  source_external_id text,
  reporting_currency text not null default 'EUR' check (reporting_currency ~ '^[A-Z]{3}$'),
  posted_at timestamptz,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  constraint transactions_merchant_fk
    foreign key (merchant_id, user_id) references finance.merchants(id, user_id) on delete restrict,
  constraint transactions_posted_consistency
    check ((status = 'posted' and posted_at is not null) or status <> 'posted')
);

create table finance.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  transaction_id uuid not null,
  entry_kind finance.entry_kind not null,
  account_id uuid,
  category_id uuid,
  system_code text,
  signed_amount_minor bigint not null,
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  reporting_amount_minor bigint not null,
  exchange_rate numeric(30,12) check (exchange_rate is null or exchange_rate > 0),
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  constraint ledger_entries_transaction_fk
    foreign key (transaction_id, user_id) references finance.transactions(id, user_id) on delete cascade,
  constraint ledger_entries_account_fk
    foreign key (account_id, user_id) references finance.accounts(id, user_id) on delete restrict,
  constraint ledger_entries_category_fk
    foreign key (category_id, user_id) references finance.categories(id, user_id) on delete restrict,
  constraint ledger_entry_dimension_check check (
    (entry_kind = 'account' and account_id is not null and category_id is null and system_code is null)
    or
    (entry_kind = 'category' and account_id is null and category_id is not null and system_code is null)
    or
    (entry_kind = 'system' and account_id is null and category_id is null and system_code is not null)
  ),
  constraint ledger_entry_nonzero_check check (
    signed_amount_minor <> 0 or reporting_amount_minor <> 0
  )
);

create table finance.receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  merchant_id uuid,
  purchased_at timestamptz,
  currency_code text not null default 'EUR' check (currency_code ~ '^[A-Z]{3}$'),
  subtotal_minor bigint check (subtotal_minor is null or subtotal_minor >= 0),
  tax_minor bigint check (tax_minor is null or tax_minor >= 0),
  discount_minor bigint not null default 0 check (discount_minor >= 0),
  deposit_minor bigint not null default 0 check (deposit_minor >= 0),
  total_minor bigint not null check (total_minor >= 0),
  processing_status finance.receipt_processing_status not null default 'captured',
  match_status finance.receipt_match_status not null default 'unmatched',
  image_path text,
  raw_ocr text,
  overall_confidence numeric(5,4) check (overall_confidence is null or (overall_confidence >= 0 and overall_confidence <= 1)),
  image_fingerprint text,
  semantic_fingerprint text,
  confirmed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  constraint receipts_merchant_fk
    foreign key (merchant_id, user_id) references finance.merchants(id, user_id) on delete restrict
);

create table finance.receipt_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  receipt_id uuid not null,
  line_index integer not null check (line_index >= 0),
  raw_name text not null check (char_length(raw_name) between 1 and 500),
  normalized_name text,
  product_id uuid,
  category_id uuid,
  necessity finance.necessity not null default 'unclassified',
  quantity numeric(18,6) not null default 1 check (quantity > 0),
  unit_price_minor bigint,
  line_total_minor bigint not null,
  discount_minor bigint not null default 0 check (discount_minor >= 0),
  deposit_minor bigint not null default 0 check (deposit_minor >= 0),
  effective_total_minor bigint not null,
  confidence numeric(5,4) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  review_required boolean not null default false,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (receipt_id, line_index),
  constraint receipt_items_receipt_fk
    foreign key (receipt_id, user_id) references finance.receipts(id, user_id) on delete cascade,
  constraint receipt_items_product_fk
    foreign key (product_id, user_id) references finance.products(id, user_id) on delete restrict,
  constraint receipt_items_category_fk
    foreign key (category_id, user_id) references finance.categories(id, user_id) on delete restrict
);

create table finance.receipt_transaction_matches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  receipt_id uuid not null,
  transaction_id uuid not null,
  status finance.match_candidate_status not null default 'suggested',
  matched_amount_minor bigint not null check (matched_amount_minor >= 0),
  confidence numeric(5,4) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  reason jsonb not null default '{}'::jsonb check (jsonb_typeof(reason) = 'object'),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (receipt_id, transaction_id),
  unique (id, user_id),
  constraint receipt_matches_receipt_fk
    foreign key (receipt_id, user_id) references finance.receipts(id, user_id) on delete cascade,
  constraint receipt_matches_transaction_fk
    foreign key (transaction_id, user_id) references finance.transactions(id, user_id) on delete cascade
);

create table finance.product_prices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null,
  merchant_id uuid,
  receipt_item_id uuid,
  observed_at timestamptz not null,
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  list_unit_price_minor bigint,
  effective_unit_price_minor bigint not null,
  quantity numeric(18,6) not null default 1 check (quantity > 0),
  created_at timestamptz not null default now(),
  unique (id, user_id),
  constraint product_prices_product_fk
    foreign key (product_id, user_id) references finance.products(id, user_id) on delete cascade,
  constraint product_prices_merchant_fk
    foreign key (merchant_id, user_id) references finance.merchants(id, user_id) on delete restrict,
  constraint product_prices_receipt_item_fk
    foreign key (receipt_item_id, user_id) references finance.receipt_items(id, user_id) on delete set null
);

create table finance.classification_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  priority integer not null default 1000,
  enabled boolean not null default true,
  source finance.rule_source not null default 'user',
  scope text not null default 'all',
  condition jsonb not null check (jsonb_typeof(condition) = 'object'),
  action jsonb not null check (jsonb_typeof(action) = 'object'),
  match_count bigint not null default 0 check (match_count >= 0),
  last_matched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table finance.tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  normalized_name text not null check (char_length(normalized_name) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, normalized_name)
);

create table finance.transaction_tags (
  user_id uuid not null references auth.users(id) on delete cascade,
  transaction_id uuid not null,
  tag_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (transaction_id, tag_id),
  constraint transaction_tags_transaction_fk
    foreign key (transaction_id, user_id) references finance.transactions(id, user_id) on delete cascade,
  constraint transaction_tags_tag_fk
    foreign key (tag_id, user_id) references finance.tags(id, user_id) on delete cascade
);

create table finance.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  period_kind finance.budget_period_kind not null default 'monthly',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table finance.budget_periods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  budget_id uuid not null,
  starts_on date not null,
  ends_on date not null,
  planned_income_minor bigint,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  constraint budget_periods_budget_fk
    foreign key (budget_id, user_id) references finance.budgets(id, user_id) on delete cascade,
  constraint budget_period_dates_check check (ends_on >= starts_on)
);

create table finance.budget_allocations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  budget_period_id uuid not null,
  category_id uuid not null,
  planned_minor bigint not null check (planned_minor >= 0),
  rollover boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (budget_period_id, category_id),
  constraint budget_allocations_period_fk
    foreign key (budget_period_id, user_id) references finance.budget_periods(id, user_id) on delete cascade,
  constraint budget_allocations_category_fk
    foreign key (category_id, user_id) references finance.categories(id, user_id) on delete restrict
);

create table finance.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  target_minor bigint not null check (target_minor > 0),
  currency_code text not null default 'EUR' check (currency_code ~ '^[A-Z]{3}$'),
  target_date date,
  linked_account_id uuid,
  status finance.goal_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  constraint goals_account_fk
    foreign key (linked_account_id, user_id) references finance.accounts(id, user_id) on delete restrict
);

create table finance.goal_contributions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid not null,
  transaction_id uuid,
  amount_minor bigint not null check (amount_minor > 0),
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  occurred_at timestamptz not null,
  note text,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  constraint goal_contributions_goal_fk
    foreign key (goal_id, user_id) references finance.goals(id, user_id) on delete cascade,
  constraint goal_contributions_transaction_fk
    foreign key (transaction_id, user_id) references finance.transactions(id, user_id) on delete set null
);

create table finance.recurring_patterns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  transaction_type finance.transaction_type not null,
  merchant_id uuid,
  category_id uuid,
  account_id uuid,
  expected_amount_minor bigint,
  currency_code text not null default 'EUR' check (currency_code ~ '^[A-Z]{3}$'),
  rrule text not null check (char_length(rrule) between 1 and 1000),
  next_expected_at timestamptz,
  tolerance_days smallint not null default 3 check (tolerance_days between 0 and 31),
  amount_tolerance_minor bigint not null default 0 check (amount_tolerance_minor >= 0),
  status finance.recurring_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  constraint recurring_merchant_fk
    foreign key (merchant_id, user_id) references finance.merchants(id, user_id) on delete restrict,
  constraint recurring_category_fk
    foreign key (category_id, user_id) references finance.categories(id, user_id) on delete restrict,
  constraint recurring_account_fk
    foreign key (account_id, user_id) references finance.accounts(id, user_id) on delete restrict
);

create table finance.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  recurring_pattern_id uuid,
  merchant_id uuid,
  name text not null check (char_length(name) between 1 and 160),
  amount_minor bigint not null check (amount_minor >= 0),
  currency_code text not null default 'EUR' check (currency_code ~ '^[A-Z]{3}$'),
  billing_frequency text not null check (char_length(billing_frequency) between 1 and 80),
  started_on date,
  cancelled_on date,
  next_charge_at timestamptz,
  status finance.recurring_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  constraint subscriptions_pattern_fk
    foreign key (recurring_pattern_id, user_id) references finance.recurring_patterns(id, user_id) on delete set null,
  constraint subscriptions_merchant_fk
    foreign key (merchant_id, user_id) references finance.merchants(id, user_id) on delete restrict,
  constraint subscriptions_dates_check check (cancelled_on is null or started_on is null or cancelled_on >= started_on)
);

create table finance.imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid,
  source text not null check (char_length(source) between 1 and 80),
  file_name text,
  status finance.import_status not null default 'pending',
  row_count integer not null default 0 check (row_count >= 0),
  imported_count integer not null default 0 check (imported_count >= 0),
  duplicate_count integer not null default 0 check (duplicate_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  started_at timestamptz,
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  constraint imports_account_fk
    foreign key (account_id, user_id) references finance.accounts(id, user_id) on delete restrict
);

create table finance.import_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  import_id uuid not null,
  row_number integer not null check (row_number >= 1),
  status finance.import_record_status not null default 'pending',
  source_hash text,
  raw_payload jsonb not null check (jsonb_typeof(raw_payload) = 'object'),
  transaction_id uuid,
  error_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (import_id, row_number),
  constraint import_records_import_fk
    foreign key (import_id, user_id) references finance.imports(id, user_id) on delete cascade,
  constraint import_records_transaction_fk
    foreign key (transaction_id, user_id) references finance.transactions(id, user_id) on delete set null
);

create table finance.attachments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind finance.attachment_kind not null,
  transaction_id uuid,
  receipt_id uuid,
  storage_path text not null check (char_length(storage_path) between 1 and 1000),
  mime_type text,
  byte_size bigint check (byte_size is null or byte_size >= 0),
  sha256 text,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  constraint attachments_transaction_fk
    foreign key (transaction_id, user_id) references finance.transactions(id, user_id) on delete cascade,
  constraint attachments_receipt_fk
    foreign key (receipt_id, user_id) references finance.receipts(id, user_id) on delete cascade,
  constraint attachments_owner_check check (
    (transaction_id is not null)::int + (receipt_id is not null)::int = 1
  )
);

create table finance.ai_processing_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  receipt_id uuid,
  task_type text not null check (char_length(task_type) between 1 and 120),
  provider text,
  model text,
  status finance.ai_run_status not null default 'pending',
  prompt_version text,
  input_digest text,
  output_payload jsonb,
  confidence numeric(5,4) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  cost_micros bigint check (cost_micros is null or cost_micros >= 0),
  error_text text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  constraint ai_runs_receipt_fk
    foreign key (receipt_id, user_id) references finance.receipts(id, user_id) on delete cascade
);

create table finance.audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  table_name text not null,
  row_id text not null,
  operation text not null check (operation in ('INSERT','UPDATE','DELETE')),
  old_data jsonb,
  new_data jsonb,
  changed_at timestamptz not null default now(),
  txid bigint not null default txid_current(),
  request_id text
);

create table finance.category_templates (
  template_key text primary key,
  parent_key text references finance.category_templates(template_key) on delete restrict,
  name text not null,
  kind finance.category_kind not null,
  necessity_default finance.necessity not null default 'unclassified',
  sort_order integer not null default 0
);

create index accounts_user_idx on finance.accounts(user_id);
create index merchants_user_idx on finance.merchants(user_id);
create unique index merchants_user_normalized_name_uq on finance.merchants(user_id, normalized_name) where not is_archived;
create index categories_user_idx on finance.categories(user_id);
create index categories_parent_idx on finance.categories(user_id, parent_id);
create unique index categories_user_system_key_uq on finance.categories(user_id, system_key) where system_key is not null;
create index products_user_idx on finance.products(user_id);
create index products_user_family_idx on finance.products(user_id, family_name);
create index products_user_barcode_idx on finance.products(user_id, barcode) where barcode is not null;
create index product_aliases_user_idx on finance.product_aliases(user_id);
create index product_aliases_lookup_idx on finance.product_aliases(user_id, merchant_id, normalized_alias);
create index transactions_user_idx on finance.transactions(user_id);
create index transactions_user_occurred_idx on finance.transactions(user_id, occurred_at desc);
create index transactions_user_type_idx on finance.transactions(user_id, type, occurred_at desc);
create unique index transactions_source_external_uq
  on finance.transactions(user_id, source, source_external_id)
  where source_external_id is not null;
create index ledger_entries_user_idx on finance.ledger_entries(user_id);
create index ledger_entries_tx_idx on finance.ledger_entries(user_id, transaction_id);
create index ledger_entries_account_idx on finance.ledger_entries(user_id, account_id) where account_id is not null;
create index ledger_entries_category_idx on finance.ledger_entries(user_id, category_id) where category_id is not null;
create index receipts_user_idx on finance.receipts(user_id);
create index receipts_user_date_idx on finance.receipts(user_id, purchased_at desc);
create index receipts_fingerprint_idx on finance.receipts(user_id, image_fingerprint) where image_fingerprint is not null;
create index receipt_items_user_idx on finance.receipt_items(user_id);
create index receipt_items_receipt_idx on finance.receipt_items(user_id, receipt_id, line_index);
create index receipt_items_product_idx on finance.receipt_items(user_id, product_id) where product_id is not null;
create index receipt_items_category_idx on finance.receipt_items(user_id, category_id) where category_id is not null;
create index receipt_matches_user_idx on finance.receipt_transaction_matches(user_id);
create index receipt_matches_receipt_idx on finance.receipt_transaction_matches(user_id, receipt_id);
create index receipt_matches_tx_idx on finance.receipt_transaction_matches(user_id, transaction_id);
create index product_prices_user_product_date_idx on finance.product_prices(user_id, product_id, observed_at desc);
create index rules_user_priority_idx on finance.classification_rules(user_id, enabled, priority);
create index transaction_tags_user_idx on finance.transaction_tags(user_id);
create index budgets_user_idx on finance.budgets(user_id);
create index budget_periods_user_idx on finance.budget_periods(user_id, starts_on desc);
create index budget_allocations_user_idx on finance.budget_allocations(user_id);
create index goals_user_idx on finance.goals(user_id, status);
create index goal_contributions_user_idx on finance.goal_contributions(user_id, occurred_at desc);
create index recurring_user_idx on finance.recurring_patterns(user_id, status, next_expected_at);
create index subscriptions_user_idx on finance.subscriptions(user_id, status, next_charge_at);
create index imports_user_idx on finance.imports(user_id, created_at desc);
create index import_records_user_idx on finance.import_records(user_id, import_id);
create unique index import_records_source_hash_uq on finance.import_records(user_id, source_hash) where source_hash is not null;
create index attachments_user_idx on finance.attachments(user_id);
create index ai_runs_user_idx on finance.ai_processing_runs(user_id, created_at desc);
create index audit_log_user_date_idx on finance.audit_log(user_id, changed_at desc);
