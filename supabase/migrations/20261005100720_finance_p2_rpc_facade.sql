
create or replace function public.finance_initialize()
returns void
language sql
security invoker
set search_path = ''
as $$
  select finance.initialize_user();
$$;

create or replace function public.finance_create_account(
  p_name text,
  p_kind finance.account_kind,
  p_currency_code text default 'EUR',
  p_include_in_net_worth boolean default true,
  p_institution_name text default null,
  p_opening_balance_minor bigint default 0
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select finance.create_account(
    p_name, p_kind, p_currency_code, p_include_in_net_worth,
    p_institution_name, p_opening_balance_minor
  );
$$;

create or replace function public.finance_archive_account(p_account_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  select finance.archive_account(p_account_id);
$$;

create or replace function public.finance_restore_account(p_account_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  select finance.restore_account(p_account_id);
$$;

create or replace function public.finance_create_expense(
  p_account_id uuid,
  p_amount_minor bigint,
  p_allocations jsonb,
  p_occurred_at timestamptz default now(),
  p_merchant_id uuid default null,
  p_description text default null,
  p_note text default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select finance.create_expense(
    p_account_id, p_amount_minor, p_allocations, p_occurred_at,
    p_merchant_id, p_description, p_note
  );
$$;

create or replace function public.finance_create_income(
  p_account_id uuid,
  p_amount_minor bigint,
  p_allocations jsonb,
  p_occurred_at timestamptz default now(),
  p_merchant_id uuid default null,
  p_description text default null,
  p_note text default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select finance.create_income(
    p_account_id, p_amount_minor, p_allocations, p_occurred_at,
    p_merchant_id, p_description, p_note
  );
$$;

create or replace function public.finance_create_transfer(
  p_from_account_id uuid,
  p_to_account_id uuid,
  p_amount_minor bigint,
  p_occurred_at timestamptz default now(),
  p_note text default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select finance.create_transfer(
    p_from_account_id, p_to_account_id, p_amount_minor, p_occurred_at, p_note
  );
$$;

create or replace function public.finance_create_refund(
  p_original_transaction_id uuid,
  p_account_id uuid,
  p_amount_minor bigint,
  p_allocations jsonb default null,
  p_occurred_at timestamptz default now(),
  p_note text default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select finance.create_refund(
    p_original_transaction_id, p_account_id, p_amount_minor,
    p_allocations, p_occurred_at, p_note
  );
$$;

create or replace function public.finance_create_reimbursement(
  p_original_transaction_id uuid,
  p_account_id uuid,
  p_amount_minor bigint,
  p_allocations jsonb,
  p_occurred_at timestamptz default now(),
  p_note text default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select finance.create_reimbursement(
    p_original_transaction_id, p_account_id, p_amount_minor,
    p_allocations, p_occurred_at, p_note
  );
$$;

create or replace function public.finance_void_transaction(
  p_transaction_id uuid,
  p_reason text
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select finance.void_transaction(p_transaction_id, p_reason);
$$;

create or replace function public.finance_get_account_balances()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'account_id', ab.account_id,
        'name', ab.name,
        'kind', ab.kind,
        'currency_code', ab.currency_code,
        'balance_minor', ab.balance_minor,
        'last_activity_at', ab.last_activity_at
      )
      order by ab.name
    ),
    '[]'::jsonb
  )
  from finance.account_balances ab;
$$;

create or replace function public.finance_get_transactions(
  p_limit integer default 100,
  p_before timestamptz default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit,100), 500));
begin
  return (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', x.id,
          'type', x.type,
          'status', x.status,
          'occurred_at', x.occurred_at,
          'merchant_id', x.merchant_id,
          'description', x.description,
          'note', x.note,
          'source', x.source,
          'reporting_currency', x.reporting_currency,
          'related_transaction_id', x.related_transaction_id,
          'relation_kind', x.relation_kind,
          'display_amount_minor', x.display_amount_minor,
          'entry_count', x.entry_count,
          'posted_at', x.posted_at,
          'voided_at', x.voided_at,
          'void_reason', x.void_reason
        )
        order by x.occurred_at desc, x.id desc
      ),
      '[]'::jsonb
    )
    from (
      select *
      from finance.transaction_summary ts
      where p_before is null or ts.occurred_at < p_before
      order by ts.occurred_at desc, ts.id desc
      limit v_limit
    ) x
  );
end;
$$;

do $$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname in (
        'finance_initialize',
        'finance_create_account',
        'finance_archive_account',
        'finance_restore_account',
        'finance_create_expense',
        'finance_create_income',
        'finance_create_transfer',
        'finance_create_refund',
        'finance_create_reimbursement',
        'finance_void_transaction',
        'finance_get_account_balances',
        'finance_get_transactions'
      )
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
