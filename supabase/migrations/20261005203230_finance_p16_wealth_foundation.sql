
do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid=t.typnamespace
    where n.nspname='finance'
      and t.typname='balance_observation_source'
  ) then
    create type finance.balance_observation_source
      as enum ('manual','statement','import','market');
  end if;
end $$;

create table if not exists finance.account_balance_observations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null,
  observed_at timestamptz not null,
  balance_minor bigint not null,
  currency_code text not null,
  reporting_balance_minor bigint not null,
  reporting_currency text not null,
  exchange_rate numeric,
  source finance.balance_observation_source not null default 'manual',
  note text,
  created_at timestamptz not null default now(),
  unique(id,user_id),
  unique(user_id,account_id,observed_at),
  constraint account_balance_observations_account_fk
    foreign key(account_id,user_id)
    references finance.accounts(id,user_id)
    on delete cascade,
  constraint account_balance_observations_currency_check
    check(currency_code ~ '^[A-Z]{3}$'),
  constraint account_balance_observations_reporting_currency_check
    check(reporting_currency ~ '^[A-Z]{3}$'),
  constraint account_balance_observations_exchange_rate_check
    check(exchange_rate is null or exchange_rate>0),
  constraint account_balance_observations_note_check
    check(note is null or char_length(note)<=1000)
);

alter table finance.account_balance_observations enable row level security;

drop policy if exists account_balance_observations_select_own
  on finance.account_balance_observations;
create policy account_balance_observations_select_own
  on finance.account_balance_observations
  for select to authenticated
  using (
    (select auth.uid()) is not null
    and (select auth.uid())=user_id
  );

drop policy if exists account_balance_observations_insert_own
  on finance.account_balance_observations;
create policy account_balance_observations_insert_own
  on finance.account_balance_observations
  for insert to authenticated
  with check (
    (select auth.uid()) is not null
    and (select auth.uid())=user_id
  );

drop policy if exists account_balance_observations_update_own
  on finance.account_balance_observations;
create policy account_balance_observations_update_own
  on finance.account_balance_observations
  for update to authenticated
  using (
    (select auth.uid()) is not null
    and (select auth.uid())=user_id
  )
  with check (
    (select auth.uid()) is not null
    and (select auth.uid())=user_id
  );

drop policy if exists account_balance_observations_delete_own
  on finance.account_balance_observations;
create policy account_balance_observations_delete_own
  on finance.account_balance_observations
  for delete to authenticated
  using (
    (select auth.uid()) is not null
    and (select auth.uid())=user_id
  );

drop trigger if exists account_balance_observations_audit_change
  on finance.account_balance_observations;
create trigger account_balance_observations_audit_change
after insert or update or delete
on finance.account_balance_observations
for each row
execute function finance_private.audit_row_change();

create index if not exists account_balance_observations_user_account_time_idx
  on finance.account_balance_observations(
    user_id,account_id,observed_at desc
  );

create index if not exists account_balance_observations_account_fk_idx
  on finance.account_balance_observations(account_id,user_id);

grant select,insert,update,delete
  on finance.account_balance_observations
  to authenticated,service_role;
