
do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid=t.typnamespace
    where n.nspname='finance' and t.typname='goal_kind'
  ) then
    create type finance.goal_kind as enum ('savings','sinking_fund');
  end if;

  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid=t.typnamespace
    where n.nspname='finance' and t.typname='goal_movement_kind'
  ) then
    create type finance.goal_movement_kind
      as enum ('opening','contribution','withdrawal');
  end if;
end $$;

alter table finance.goals
  add column if not exists kind finance.goal_kind not null default 'savings',
  add column if not exists planned_contribution_minor bigint,
  add column if not exists note text;

alter table finance.goal_contributions
  add column if not exists movement_kind finance.goal_movement_kind
    not null default 'contribution';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='goals_planned_contribution_minor_check'
      and conrelid='finance.goals'::regclass
  ) then
    alter table finance.goals
      add constraint goals_planned_contribution_minor_check
      check (
        planned_contribution_minor is null
        or planned_contribution_minor>=0
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname='goals_note_check'
      and conrelid='finance.goals'::regclass
  ) then
    alter table finance.goals
      add constraint goals_note_check
      check (note is null or char_length(note)<=1000);
  end if;
end $$;

create unique index if not exists budgets_one_active_per_user_uq
  on finance.budgets(user_id)
  where is_active;

create unique index if not exists budget_periods_budget_dates_uq
  on finance.budget_periods(budget_id,starts_on,ends_on);

create index if not exists goals_user_kind_status_idx
  on finance.goals(user_id,kind,status,target_date);

create index if not exists goal_contributions_user_goal_date_idx
  on finance.goal_contributions(user_id,goal_id,occurred_at);
