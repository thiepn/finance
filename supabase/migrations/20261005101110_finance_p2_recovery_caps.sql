
create or replace function finance.create_refund(
  p_original_transaction_id uuid,
  p_account_id uuid,
  p_amount_minor bigint,
  p_allocations jsonb default null,
  p_occurred_at timestamptz default now(),
  p_note text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_original finance.transactions%rowtype;
  v_account_currency text;
  v_total bigint;
  v_tx_id uuid := gen_random_uuid();
  v_item jsonb;
  v_category_id uuid;
  v_amount bigint;
  v_original_amount bigint;
  v_existing_recovery bigint;
  v_original_category bigint;
  v_recovered_category bigint;
begin
  if v_user_id is null then
    raise exception using errcode='42501', message='authentication required';
  end if;
  if p_amount_minor <= 0 then
    raise exception using errcode='23514', message='refund amount must be positive';
  end if;

  select * into v_original
  from finance.transactions
  where id = p_original_transaction_id
    and user_id = v_user_id
    and status = 'posted';

  if not found or v_original.type not in ('expense','adjustment') then
    raise exception using errcode='23514', message='refund must reference a posted expense or adjustment';
  end if;

  select currency_code into v_account_currency
  from finance.accounts
  where id = p_account_id and user_id = v_user_id and not is_archived;
  if not found then
    raise exception using errcode='P0002', message='refund account not found';
  end if;

  if v_account_currency <> v_original.reporting_currency then
    raise exception using errcode='0A000', message='P2 refund convenience flow requires reporting-currency account';
  end if;

  select coalesce(sum(reporting_amount_minor),0)::bigint
  into v_original_amount
  from finance.ledger_entries
  where transaction_id = v_original.id
    and user_id = v_user_id
    and entry_kind = 'category'
    and reporting_amount_minor > 0;

  select coalesce(-sum(le.reporting_amount_minor),0)::bigint
  into v_existing_recovery
  from finance.transactions rt
  join finance.ledger_entries le
    on le.transaction_id = rt.id and le.user_id = rt.user_id
  where rt.user_id = v_user_id
    and rt.related_transaction_id = v_original.id
    and rt.status = 'posted'
    and rt.type in ('refund','reimbursement')
    and le.entry_kind = 'category'
    and le.reporting_amount_minor < 0;

  if p_amount_minor > (v_original_amount - v_existing_recovery) then
    raise exception using
      errcode='23514',
      message='refund exceeds unrecovered amount of original transaction';
  end if;

  if p_allocations is null then
    if p_amount_minor <> (v_original_amount - v_existing_recovery) then
      raise exception using
        errcode='23514',
        message='refund without explicit allocations must refund the entire remaining recoverable amount';
    end if;
  else
    if jsonb_typeof(p_allocations) <> 'array' or jsonb_array_length(p_allocations)=0 then
      raise exception using errcode='23514', message='refund allocations must be a non-empty array';
    end if;

    select coalesce(sum((x->>'amount_minor')::bigint),0)
    into v_total
    from jsonb_array_elements(p_allocations) x;

    if v_total <> p_amount_minor then
      raise exception using errcode='23514', message='refund allocations do not equal refund amount';
    end if;

    for v_item in select * from jsonb_array_elements(p_allocations)
    loop
      v_category_id := (v_item->>'category_id')::uuid;
      v_amount := (v_item->>'amount_minor')::bigint;

      if v_amount <= 0 then
        raise exception using errcode='23514', message='refund allocation must be positive';
      end if;

      select coalesce(sum(reporting_amount_minor),0)::bigint
      into v_original_category
      from finance.ledger_entries
      where transaction_id = v_original.id
        and user_id = v_user_id
        and entry_kind = 'category'
        and category_id = v_category_id
        and reporting_amount_minor > 0;

      if v_original_category <= 0 then
        raise exception using
          errcode='23514',
          message='refund allocation category was not part of original expense';
      end if;

      select coalesce(-sum(le.reporting_amount_minor),0)::bigint
      into v_recovered_category
      from finance.transactions rt
      join finance.ledger_entries le
        on le.transaction_id = rt.id and le.user_id = rt.user_id
      where rt.user_id = v_user_id
        and rt.related_transaction_id = v_original.id
        and rt.status = 'posted'
        and rt.type in ('refund','reimbursement')
        and le.entry_kind = 'category'
        and le.category_id = v_category_id
        and le.reporting_amount_minor < 0;

      if v_amount > (v_original_category - v_recovered_category) then
        raise exception using
          errcode='23514',
          message='refund allocation exceeds unrecovered amount in original category';
      end if;
    end loop;
  end if;

  insert into finance.transactions (
    id, user_id, type, status, occurred_at, merchant_id, description, note,
    source, reporting_currency, related_transaction_id, relation_kind
  ) values (
    v_tx_id, v_user_id, 'refund', 'draft', p_occurred_at, v_original.merchant_id,
    'Refund', nullif(btrim(p_note), ''), 'manual', v_original.reporting_currency,
    v_original.id, 'refund_of'
  );

  insert into finance.ledger_entries (
    user_id, transaction_id, entry_kind, account_id,
    signed_amount_minor, currency_code, reporting_amount_minor
  ) values (
    v_user_id, v_tx_id, 'account', p_account_id,
    p_amount_minor, v_account_currency, p_amount_minor
  );

  if p_allocations is null then
    insert into finance.ledger_entries (
      user_id, transaction_id, entry_kind, category_id,
      signed_amount_minor, currency_code, reporting_amount_minor, memo
    )
    with original as (
      select category_id, sum(reporting_amount_minor)::bigint as original_minor
      from finance.ledger_entries
      where transaction_id = v_original.id
        and user_id = v_user_id
        and entry_kind = 'category'
        and reporting_amount_minor > 0
      group by category_id
    ),
    recovered as (
      select le.category_id, (-sum(le.reporting_amount_minor))::bigint as recovered_minor
      from finance.transactions rt
      join finance.ledger_entries le
        on le.transaction_id = rt.id and le.user_id = rt.user_id
      where rt.user_id = v_user_id
        and rt.related_transaction_id = v_original.id
        and rt.status = 'posted'
        and rt.type in ('refund','reimbursement')
        and le.entry_kind = 'category'
        and le.reporting_amount_minor < 0
      group by le.category_id
    )
    select
      v_user_id, v_tx_id, 'category', o.category_id,
      -(o.original_minor - coalesce(r.recovered_minor,0)),
      v_original.reporting_currency,
      -(o.original_minor - coalesce(r.recovered_minor,0)),
      'Refund of remaining amount for ' || v_original.id::text
    from original o
    left join recovered r using (category_id)
    where o.original_minor - coalesce(r.recovered_minor,0) > 0;
  else
    for v_item in select * from jsonb_array_elements(p_allocations)
    loop
      v_category_id := (v_item->>'category_id')::uuid;
      v_amount := (v_item->>'amount_minor')::bigint;

      insert into finance.ledger_entries (
        user_id, transaction_id, entry_kind, category_id,
        signed_amount_minor, currency_code, reporting_amount_minor
      ) values (
        v_user_id, v_tx_id, 'category', v_category_id,
        -v_amount, v_original.reporting_currency, -v_amount
      );
    end loop;
  end if;

  update finance.transactions
  set status='posted', posted_at=now()
  where id=v_tx_id and user_id=v_user_id;

  return v_tx_id;
end;
$$;

create or replace function finance.create_reimbursement(
  p_original_transaction_id uuid,
  p_account_id uuid,
  p_amount_minor bigint,
  p_allocations jsonb,
  p_occurred_at timestamptz default now(),
  p_note text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_original finance.transactions%rowtype;
  v_account_currency text;
  v_total bigint;
  v_tx_id uuid := gen_random_uuid();
  v_item jsonb;
  v_category_id uuid;
  v_amount bigint;
  v_original_amount bigint;
  v_existing_recovery bigint;
  v_original_category bigint;
  v_recovered_category bigint;
begin
  if v_user_id is null then
    raise exception using errcode='42501', message='authentication required';
  end if;
  if p_amount_minor <= 0 then
    raise exception using errcode='23514', message='reimbursement amount must be positive';
  end if;
  if jsonb_typeof(p_allocations) <> 'array' or jsonb_array_length(p_allocations)=0 then
    raise exception using errcode='23514', message='reimbursement requires explicit category allocations';
  end if;

  select * into v_original
  from finance.transactions
  where id=p_original_transaction_id
    and user_id=v_user_id
    and status='posted';

  if not found or v_original.type <> 'expense' then
    raise exception using errcode='23514', message='reimbursement must reference a posted expense';
  end if;

  select currency_code into v_account_currency
  from finance.accounts
  where id=p_account_id and user_id=v_user_id and not is_archived;
  if not found then
    raise exception using errcode='P0002', message='reimbursement account not found';
  end if;

  if v_account_currency <> v_original.reporting_currency then
    raise exception using errcode='0A000', message='P2 reimbursement convenience flow requires reporting-currency account';
  end if;

  select coalesce(sum(reporting_amount_minor),0)::bigint
  into v_original_amount
  from finance.ledger_entries
  where transaction_id=v_original.id
    and user_id=v_user_id
    and entry_kind='category'
    and reporting_amount_minor > 0;

  select coalesce(-sum(le.reporting_amount_minor),0)::bigint
  into v_existing_recovery
  from finance.transactions rt
  join finance.ledger_entries le
    on le.transaction_id=rt.id and le.user_id=rt.user_id
  where rt.user_id=v_user_id
    and rt.related_transaction_id=v_original.id
    and rt.status='posted'
    and rt.type in ('refund','reimbursement')
    and le.entry_kind='category'
    and le.reporting_amount_minor < 0;

  if p_amount_minor > (v_original_amount - v_existing_recovery) then
    raise exception using
      errcode='23514',
      message='reimbursement exceeds unrecovered amount of original expense';
  end if;

  select coalesce(sum((x->>'amount_minor')::bigint),0)
  into v_total
  from jsonb_array_elements(p_allocations) x;

  if v_total <> p_amount_minor then
    raise exception using errcode='23514', message='reimbursement allocations do not equal amount';
  end if;

  for v_item in select * from jsonb_array_elements(p_allocations)
  loop
    v_category_id := (v_item->>'category_id')::uuid;
    v_amount := (v_item->>'amount_minor')::bigint;

    if v_amount <= 0 then
      raise exception using errcode='23514', message='reimbursement allocation must be positive';
    end if;

    select coalesce(sum(reporting_amount_minor),0)::bigint
    into v_original_category
    from finance.ledger_entries
    where transaction_id=v_original.id
      and user_id=v_user_id
      and entry_kind='category'
      and category_id=v_category_id
      and reporting_amount_minor > 0;

    if v_original_category <= 0 then
      raise exception using
        errcode='23514',
        message='reimbursement category was not part of original expense';
    end if;

    select coalesce(-sum(le.reporting_amount_minor),0)::bigint
    into v_recovered_category
    from finance.transactions rt
    join finance.ledger_entries le
      on le.transaction_id=rt.id and le.user_id=rt.user_id
    where rt.user_id=v_user_id
      and rt.related_transaction_id=v_original.id
      and rt.status='posted'
      and rt.type in ('refund','reimbursement')
      and le.entry_kind='category'
      and le.category_id=v_category_id
      and le.reporting_amount_minor < 0;

    if v_amount > (v_original_category - v_recovered_category) then
      raise exception using
        errcode='23514',
        message='reimbursement allocation exceeds unrecovered amount in original category';
    end if;
  end loop;

  insert into finance.transactions (
    id,user_id,type,status,occurred_at,merchant_id,description,note,source,
    reporting_currency,related_transaction_id,relation_kind
  ) values (
    v_tx_id,v_user_id,'reimbursement','draft',p_occurred_at,v_original.merchant_id,
    'Reimbursement',nullif(btrim(p_note),''),'manual',
    v_original.reporting_currency,v_original.id,'reimbursement_of'
  );

  insert into finance.ledger_entries (
    user_id,transaction_id,entry_kind,account_id,
    signed_amount_minor,currency_code,reporting_amount_minor
  ) values (
    v_user_id,v_tx_id,'account',p_account_id,
    p_amount_minor,v_account_currency,p_amount_minor
  );

  for v_item in select * from jsonb_array_elements(p_allocations)
  loop
    v_category_id := (v_item->>'category_id')::uuid;
    v_amount := (v_item->>'amount_minor')::bigint;

    insert into finance.ledger_entries (
      user_id,transaction_id,entry_kind,category_id,
      signed_amount_minor,currency_code,reporting_amount_minor
    ) values (
      v_user_id,v_tx_id,'category',v_category_id,
      -v_amount,v_original.reporting_currency,-v_amount
    );
  end loop;

  update finance.transactions
  set status='posted', posted_at=now()
  where id=v_tx_id and user_id=v_user_id;

  return v_tx_id;
end;
$$;
