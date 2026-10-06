
alter table finance.receipt_transaction_matches
  add column if not exists candidate_rank integer,
  add column if not exists amount_delta_minor bigint,
  add column if not exists date_delta_days integer,
  add column if not exists amount_score numeric,
  add column if not exists date_score numeric,
  add column if not exists merchant_score numeric,
  add column if not exists currency_score numeric,
  add column if not exists score_version text,
  add column if not exists decision_source text,
  add column if not exists rejected_at timestamptz,
  add column if not exists decision_note text,
  add column if not exists last_scored_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='finance.receipt_transaction_matches'::regclass
      and conname='receipt_matches_candidate_rank_check'
  ) then
    alter table finance.receipt_transaction_matches
      add constraint receipt_matches_candidate_rank_check
      check(candidate_rank is null or candidate_rank>=1);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='finance.receipt_transaction_matches'::regclass
      and conname='receipt_matches_component_scores_check'
  ) then
    alter table finance.receipt_transaction_matches
      add constraint receipt_matches_component_scores_check
      check(
        (amount_score is null or amount_score between 0 and 1)
        and (date_score is null or date_score between 0 and 1)
        and (merchant_score is null or merchant_score between 0 and 1)
        and (currency_score is null or currency_score between 0 and 1)
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='finance.receipt_transaction_matches'::regclass
      and conname='receipt_matches_decision_source_check'
  ) then
    alter table finance.receipt_transaction_matches
      add constraint receipt_matches_decision_source_check
      check(
        decision_source is null
        or decision_source in ('deterministic','manual')
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='finance.receipt_transaction_matches'::regclass
      and conname='receipt_matches_decision_note_check'
  ) then
    alter table finance.receipt_transaction_matches
      add constraint receipt_matches_decision_note_check
      check(decision_note is null or char_length(decision_note)<=1000);
  end if;
end $$;

alter table finance.receipts
  add column if not exists match_covered_minor bigint not null default 0,
  add column if not exists match_remaining_minor bigint,
  add column if not exists match_updated_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='finance.receipts'::regclass
      and conname='receipts_match_covered_minor_check'
  ) then
    alter table finance.receipts
      add constraint receipts_match_covered_minor_check
      check(match_covered_minor>=0);
  end if;
end $$;

create table if not exists finance.receipt_match_allocations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  match_id uuid not null,
  receipt_id uuid not null,
  transaction_id uuid not null,
  category_id uuid,
  necessity finance.necessity not null default 'unclassified',
  source_currency_code text not null,
  source_amount_minor bigint not null,
  reporting_currency text not null,
  reporting_amount_minor bigint not null,
  created_at timestamptz not null default now(),
  unique(id,user_id),
  constraint receipt_match_allocations_match_fk
    foreign key(match_id,user_id)
    references finance.receipt_transaction_matches(id,user_id)
    on delete cascade,
  constraint receipt_match_allocations_receipt_fk
    foreign key(receipt_id,user_id)
    references finance.receipts(id,user_id)
    on delete cascade,
  constraint receipt_match_allocations_transaction_fk
    foreign key(transaction_id,user_id)
    references finance.transactions(id,user_id)
    on delete cascade,
  constraint receipt_match_allocations_category_fk
    foreign key(category_id,user_id)
    references finance.categories(id,user_id)
    on delete restrict,
  constraint receipt_match_allocations_source_currency_check
    check(source_currency_code ~ '^[A-Z]{3}$'),
  constraint receipt_match_allocations_reporting_currency_check
    check(reporting_currency ~ '^[A-Z]{3}$'),
  constraint receipt_match_allocations_source_amount_check
    check(source_amount_minor>=0),
  constraint receipt_match_allocations_reporting_amount_check
    check(reporting_amount_minor>=0)
);

alter table finance.receipt_match_allocations enable row level security;

drop policy if exists receipt_match_allocations_select_own
  on finance.receipt_match_allocations;
create policy receipt_match_allocations_select_own
  on finance.receipt_match_allocations
  for select to authenticated
  using(
    (select auth.uid()) is not null
    and (select auth.uid())=user_id
  );

drop policy if exists receipt_match_allocations_insert_own
  on finance.receipt_match_allocations;
create policy receipt_match_allocations_insert_own
  on finance.receipt_match_allocations
  for insert to authenticated
  with check(
    (select auth.uid()) is not null
    and (select auth.uid())=user_id
  );

drop policy if exists receipt_match_allocations_update_own
  on finance.receipt_match_allocations;
create policy receipt_match_allocations_update_own
  on finance.receipt_match_allocations
  for update to authenticated
  using(
    (select auth.uid()) is not null
    and (select auth.uid())=user_id
  )
  with check(
    (select auth.uid()) is not null
    and (select auth.uid())=user_id
  );

drop policy if exists receipt_match_allocations_delete_own
  on finance.receipt_match_allocations;
create policy receipt_match_allocations_delete_own
  on finance.receipt_match_allocations
  for delete to authenticated
  using(
    (select auth.uid()) is not null
    and (select auth.uid())=user_id
  );

drop trigger if exists receipt_match_allocations_audit_change
  on finance.receipt_match_allocations;
create trigger receipt_match_allocations_audit_change
after insert or update or delete on finance.receipt_match_allocations
for each row execute function finance_private.audit_row_change();

drop policy if exists receipt_transaction_matches_delete_own
  on finance.receipt_transaction_matches;
create policy receipt_transaction_matches_delete_own
  on finance.receipt_transaction_matches
  for delete to authenticated
  using(
    (select auth.uid()) is not null
    and (select auth.uid())=user_id
  );

create index if not exists receipt_match_allocations_transaction_idx
  on finance.receipt_match_allocations(user_id,transaction_id);

create index if not exists receipt_match_allocations_receipt_idx
  on finance.receipt_match_allocations(user_id,receipt_id);

create index if not exists receipt_match_allocations_match_fk_idx
  on finance.receipt_match_allocations(match_id,user_id);

create index if not exists receipt_match_allocations_category_fk_idx
  on finance.receipt_match_allocations(category_id,user_id)
  where category_id is not null;

create index if not exists receipt_match_allocations_receipt_fk_idx
  on finance.receipt_match_allocations(receipt_id,user_id);

create index if not exists receipt_match_allocations_transaction_fk_idx
  on finance.receipt_match_allocations(transaction_id,user_id);

create index if not exists receipt_matches_suggested_score_idx
  on finance.receipt_transaction_matches(
    user_id,receipt_id,status,confidence desc,candidate_rank
  );

grant select,insert,update,delete
  on finance.receipt_match_allocations
  to authenticated,service_role;

grant select,insert,update,delete
  on finance.receipt_transaction_matches
  to authenticated,service_role;
