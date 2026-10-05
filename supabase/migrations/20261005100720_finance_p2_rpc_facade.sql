-- Narrow authenticated RPC facade for the private Finance schema.

CREATE OR REPLACE FUNCTION public.finance_archive_account(p_account_id uuid)
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select finance.archive_account(p_account_id);
$function$


CREATE OR REPLACE FUNCTION public.finance_create_account(p_name text, p_kind finance.account_kind, p_currency_code text DEFAULT 'EUR'::text, p_include_in_net_worth boolean DEFAULT true, p_institution_name text DEFAULT NULL::text, p_opening_balance_minor bigint DEFAULT 0)
 RETURNS uuid
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select finance.create_account(
    p_name, p_kind, p_currency_code, p_include_in_net_worth,
    p_institution_name, p_opening_balance_minor
  );
$function$


CREATE OR REPLACE FUNCTION public.finance_create_expense(p_account_id uuid, p_amount_minor bigint, p_allocations jsonb, p_occurred_at timestamp with time zone DEFAULT now(), p_merchant_id uuid DEFAULT NULL::uuid, p_description text DEFAULT NULL::text, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select finance.create_expense(
    p_account_id, p_amount_minor, p_allocations, p_occurred_at,
    p_merchant_id, p_description, p_note
  );
$function$


CREATE OR REPLACE FUNCTION public.finance_create_income(p_account_id uuid, p_amount_minor bigint, p_allocations jsonb, p_occurred_at timestamp with time zone DEFAULT now(), p_merchant_id uuid DEFAULT NULL::uuid, p_description text DEFAULT NULL::text, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select finance.create_income(
    p_account_id, p_amount_minor, p_allocations, p_occurred_at,
    p_merchant_id, p_description, p_note
  );
$function$


CREATE OR REPLACE FUNCTION public.finance_create_refund(p_original_transaction_id uuid, p_account_id uuid, p_amount_minor bigint, p_allocations jsonb DEFAULT NULL::jsonb, p_occurred_at timestamp with time zone DEFAULT now(), p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select finance.create_refund(
    p_original_transaction_id, p_account_id, p_amount_minor,
    p_allocations, p_occurred_at, p_note
  );
$function$


CREATE OR REPLACE FUNCTION public.finance_create_reimbursement(p_original_transaction_id uuid, p_account_id uuid, p_amount_minor bigint, p_allocations jsonb, p_occurred_at timestamp with time zone DEFAULT now(), p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select finance.create_reimbursement(
    p_original_transaction_id, p_account_id, p_amount_minor,
    p_allocations, p_occurred_at, p_note
  );
$function$


CREATE OR REPLACE FUNCTION public.finance_create_transfer(p_from_account_id uuid, p_to_account_id uuid, p_amount_minor bigint, p_occurred_at timestamp with time zone DEFAULT now(), p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select finance.create_transfer(
    p_from_account_id, p_to_account_id, p_amount_minor, p_occurred_at, p_note
  );
$function$


CREATE OR REPLACE FUNCTION public.finance_get_account_balances()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
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
$function$


CREATE OR REPLACE FUNCTION public.finance_get_transactions(p_limit integer DEFAULT 100, p_before timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
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
$function$


CREATE OR REPLACE FUNCTION public.finance_initialize()
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select finance.initialize_user();
$function$


CREATE OR REPLACE FUNCTION public.finance_restore_account(p_account_id uuid)
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select finance.restore_account(p_account_id);
$function$


CREATE OR REPLACE FUNCTION public.finance_void_transaction(p_transaction_id uuid, p_reason text)
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select finance.void_transaction(p_transaction_id, p_reason);
$function$


do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname in (
        'finance_initialize','finance_create_account','finance_archive_account','finance_restore_account',
        'finance_create_expense','finance_create_income','finance_create_transfer','finance_create_refund',
        'finance_create_reimbursement','finance_void_transaction','finance_get_account_balances',
        'finance_get_transactions'
      )
  loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
