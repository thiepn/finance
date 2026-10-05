
alter table finance.recurring_patterns
  add column if not exists cadence text,
  add column if not exists cadence_interval smallint not null default 1,
  add column if not exists anchor_at timestamptz,
  add column if not exists source finance.rule_source not null default 'user',
  add column if not exists confidence numeric(5,4),
  add column if not exists match_description text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='recurring_patterns_cadence_check'
      and conrelid='finance.recurring_patterns'::regclass
  ) then
    alter table finance.recurring_patterns
      add constraint recurring_patterns_cadence_check
      check (cadence is null or cadence in ('daily','weekly','monthly','yearly'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname='recurring_patterns_cadence_interval_check'
      and conrelid='finance.recurring_patterns'::regclass
  ) then
    alter table finance.recurring_patterns
      add constraint recurring_patterns_cadence_interval_check
      check (cadence_interval between 1 and 52);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname='recurring_patterns_confidence_check'
      and conrelid='finance.recurring_patterns'::regclass
  ) then
    alter table finance.recurring_patterns
      add constraint recurring_patterns_confidence_check
      check (confidence is null or confidence between 0 and 1);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname='recurring_patterns_match_description_check'
      and conrelid='finance.recurring_patterns'::regclass
  ) then
    alter table finance.recurring_patterns
      add constraint recurring_patterns_match_description_check
      check (match_description is null or char_length(match_description) between 1 and 300);
  end if;
end $$;

update finance.recurring_patterns
set cadence = case
    when upper(rrule) like '%FREQ=DAILY%' then 'daily'
    when upper(rrule) like '%FREQ=WEEKLY%' then 'weekly'
    when upper(rrule) like '%FREQ=MONTHLY%' then 'monthly'
    when upper(rrule) like '%FREQ=YEARLY%' then 'yearly'
    else cadence
  end,
  cadence_interval = coalesce(
    nullif(substring(upper(rrule) from 'INTERVAL=([0-9]+)'),'')::smallint,
    cadence_interval,
    1
  )
where cadence is null;

create table if not exists finance.recurring_transaction_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  recurring_pattern_id uuid not null,
  transaction_id uuid not null,
  expected_at timestamptz,
  matched_amount_minor bigint not null check (matched_amount_minor >= 0),
  amount_delta_minor bigint,
  timing_delta_days numeric(10,3),
  match_source finance.rule_source not null default 'learned',
  confidence numeric(5,4) check (confidence is null or confidence between 0 and 1),
  created_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, recurring_pattern_id, transaction_id),
  unique (user_id, transaction_id),
  constraint recurring_links_pattern_fk
    foreign key (recurring_pattern_id, user_id)
    references finance.recurring_patterns(id, user_id)
    on delete cascade,
  constraint recurring_links_transaction_fk
    foreign key (transaction_id, user_id)
    references finance.transactions(id, user_id)
    on delete cascade
);

alter table finance.recurring_transaction_links enable row level security;

drop policy if exists recurring_links_select_own on finance.recurring_transaction_links;
create policy recurring_links_select_own
on finance.recurring_transaction_links
for select
to authenticated
using ((select auth.uid()) is not null and (select auth.uid())=user_id);

drop policy if exists recurring_links_insert_own on finance.recurring_transaction_links;
create policy recurring_links_insert_own
on finance.recurring_transaction_links
for insert
to authenticated
with check ((select auth.uid()) is not null and (select auth.uid())=user_id);

drop policy if exists recurring_links_update_own on finance.recurring_transaction_links;
create policy recurring_links_update_own
on finance.recurring_transaction_links
for update
to authenticated
using ((select auth.uid()) is not null and (select auth.uid())=user_id)
with check ((select auth.uid()) is not null and (select auth.uid())=user_id);

drop policy if exists recurring_links_delete_own on finance.recurring_transaction_links;
create policy recurring_links_delete_own
on finance.recurring_transaction_links
for delete
to authenticated
using ((select auth.uid()) is not null and (select auth.uid())=user_id);

create index if not exists recurring_links_pattern_date_idx
  on finance.recurring_transaction_links(
    user_id,recurring_pattern_id,created_at desc
  );
create index if not exists recurring_links_transaction_idx
  on finance.recurring_transaction_links(user_id,transaction_id);
create index if not exists recurring_links_pattern_fk_idx
  on finance.recurring_transaction_links(recurring_pattern_id,user_id);
create index if not exists recurring_links_transaction_fk_idx
  on finance.recurring_transaction_links(transaction_id,user_id);
create index if not exists recurring_patterns_user_cadence_idx
  on finance.recurring_patterns(user_id,status,cadence,next_expected_at);
create unique index if not exists subscriptions_user_pattern_uq
  on finance.subscriptions(user_id,recurring_pattern_id)
  where recurring_pattern_id is not null;

revoke all on finance.recurring_transaction_links from anon;
grant select,insert,update,delete
  on finance.recurring_transaction_links to authenticated,service_role;
