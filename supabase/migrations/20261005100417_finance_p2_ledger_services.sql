
create type finance.transaction_relation_kind as enum (
  'refund_of','reimbursement_of','replacement_of','adjustment_for'
);

alter table finance.transactions
  add column related_transaction_id uuid,
  add column relation_kind finance.transaction_relation_kind,
  add column voided_at timestamptz,
  add column void_reason text;

alter table finance.transactions
  add constraint transactions_related_fk
  foreign key (related_transaction_id, user_id)
  references finance.transactions(id, user_id)
  on delete restrict;

alter table finance.transactions
  add constraint transactions_relation_pair_check
  check ((related_transaction_id is null) = (relation_kind is null));

alter table finance.transactions
  add constraint transactions_void_state_check
  check (
    (status = 'void' and voided_at is not null)
    or
    (status <> 'void' and voided_at is null)
  );

create index transactions_related_fk_idx
  on finance.transactions(related_transaction_id, user_id)
  where related_transaction_id is not null;

create or replace function finance_private.guard_posted_ledger_immutability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_status finance.transaction_status;
  v_new_status finance.transaction_status;
begin
  if tg_op in ('UPDATE','DELETE') then
    select status into v_old_status
    from finance.transactions
    where id = old.transaction_id and user_id = old.user_id;

    if v_old_status in ('posted','void') then
      raise exception using
        errcode = '55000',
        message = 'posted or void finance ledger entries are immutable';
    end if;
  end if;

  if tg_op in ('INSERT','UPDATE') then
    select status into v_new_status
    from finance.transactions
    where id = new.transaction_id and user_id = new.user_id;

    if v_new_status in ('posted','void') then
      raise exception using
        errcode = '55000',
        message = 'cannot add or modify entries on a posted or void finance transaction';
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function finance_private.guard_posted_ledger_immutability() from public, anon, authenticated;

create trigger ledger_entries_immutable_after_post
before insert or update or delete on finance.ledger_entries
for each row execute function finance_private.guard_posted_ledger_immutability();

create or replace function finance_private.guard_transaction_state_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if old.status = 'void' and new.status <> 'void' then
    raise exception using errcode = '55000', message = 'void finance transactions cannot be reopened';
  end if;

  if old.status = 'posted' and new.status = 'draft' then
    raise exception using errcode = '55000', message = 'posted finance transactions cannot return to draft';
  end if;

  if old.status in ('posted','void') then
    if new.user_id is distinct from old.user_id
      or new.type is distinct from old.type
      or new.occurred_at is distinct from old.occurred_at
      or new.reporting_currency is distinct from old.reporting_currency
      or new.source is distinct from old.source
      or new.source_external_id is distinct from old.source_external_id
      or new.related_transaction_id is distinct from old.related_transaction_id
      or new.relation_kind is distinct from old.relation_kind then
      raise exception using
        errcode = '55000',
        message = 'financial fields of posted finance transactions are immutable';
    end if;
  end if;

  if old.status = 'posted' and new.status = 'void' then
    if new.voided_at is null or nullif(btrim(new.void_reason), '') is null then
      raise exception using
        errcode = '23514',
        message = 'voided finance transaction requires voided_at and void_reason';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function finance_private.guard_transaction_state_transition() from public, anon, authenticated;

create trigger transactions_state_transition_guard
before update on finance.transactions
for each row execute function finance_private.guard_transaction_state_transition();

create or replace function finance.create_account(
  p_name text,
  p_kind finance.account_kind,
  p_currency_code text default 'EUR',
  p_include_in_net_worth boolean default true,
  p_institution_name text default null,
  p_opening_balance_minor bigint default 0
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_account_id uuid := gen_random_uuid();
  v_reporting_currency text;
  v_tx_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if nullif(btrim(p_name), '') is null then
    raise exception using errcode = '23514', message = 'account name is required';
  end if;
  if p_currency_code !~ '^[A-Z]{3}$' then
    raise exception using errcode = '23514', message = 'invalid account currency';
  end if;

  select reporting_currency into v_reporting_currency
  from finance.profiles
  where user_id = v_user_id;

  if v_reporting_currency is null then
    perform finance.initialize_user();
    select reporting_currency into v_reporting_currency
    from finance.profiles where user_id = v_user_id;
  end if;

  insert into finance.accounts (
    id, user_id, name, kind, currency_code, institution_name, include_in_net_worth
  ) values (
    v_account_id, v_user_id, btrim(p_name), p_kind, p_currency_code,
    nullif(btrim(p_institution_name), ''), p_include_in_net_worth
  );

  if p_opening_balance_minor <> 0 then
    if p_currency_code <> v_reporting_currency then
      raise exception using
        errcode = '0A000',
        message = 'foreign-currency opening balances require explicit FX and are not supported by the P2 convenience API';
    end if;

    v_tx_id := gen_random_uuid();
    insert into finance.transactions (
      id, user_id, type, status, occurred_at, description, source,
      reporting_currency
    ) values (
      v_tx_id, v_user_id, 'opening_balance', 'draft', now(),
      'Opening balance for ' || btrim(p_name), 'system', v_reporting_currency
    );

    insert into finance.ledger_entries (
      user_id, transaction_id, entry_kind, account_id,
      signed_amount_minor, currency_code, reporting_amount_minor, memo
    ) values (
      v_user_id, v_tx_id, 'account', v_account_id,
      p_opening_balance_minor, p_currency_code, p_opening_balance_minor,
      'Opening balance'
    );

    insert into finance.ledger_entries (
      user_id, transaction_id, entry_kind, system_code,
      signed_amount_minor, currency_code, reporting_amount_minor, memo
    ) values (
      v_user_id, v_tx_id, 'system', 'opening_balance_equity',
      -p_opening_balance_minor, v_reporting_currency, -p_opening_balance_minor,
      'Opening balance offset'
    );

    update finance.transactions
    set status = 'posted', posted_at = now()
    where id = v_tx_id and user_id = v_user_id;
  end if;

  return v_account_id;
end;
$$;

revoke all on function finance.create_account(text, finance.account_kind, text, boolean, text, bigint) from public, anon;
grant execute on function finance.create_account(text, finance.account_kind, text, boolean, text, bigint) to authenticated, service_role;

create or replace function finance.archive_account(p_account_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  update finance.accounts
  set is_archived = true
  where id = p_account_id and user_id = v_user_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'finance account not found';
  end if;
end;
$$;

revoke all on function finance.archive_account(uuid) from public, anon;
grant execute on function finance.archive_account(uuid) to authenticated, service_role;

create or replace function finance.restore_account(p_account_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  update finance.accounts
  set is_archived = false
  where id = p_account_id and user_id = v_user_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'finance account not found';
  end if;
end;
$$;

revoke all on function finance.restore_account(uuid) from public, anon;
grant execute on function finance.restore_account(uuid) to authenticated, service_role;

create or replace function finance.create_expense(
  p_account_id uuid,
  p_amount_minor bigint,
  p_allocations jsonb,
  p_occurred_at timestamptz default now(),
  p_merchant_id uuid default null,
  p_description text default null,
  p_note text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_account_currency text;
  v_reporting_currency text;
  v_sum bigint;
  v_tx_id uuid := gen_random_uuid();
  v_item jsonb;
  v_category_id uuid;
  v_amount bigint;
  v_kind finance.category_kind;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if p_amount_minor <= 0 then
    raise exception using errcode = '23514', message = 'expense amount must be positive';
  end if;
  if jsonb_typeof(p_allocations) <> 'array' or jsonb_array_length(p_allocations) = 0 then
    raise exception using errcode = '23514', message = 'expense requires at least one category allocation';
  end if;

  select currency_code into v_account_currency
  from finance.accounts
  where id = p_account_id and user_id = v_user_id and not is_archived;
  if not found then
    raise exception using errcode = 'P0002', message = 'active finance account not found';
  end if;

  select reporting_currency into v_reporting_currency
  from finance.profiles where user_id = v_user_id;
  if v_reporting_currency is null then
    perform finance.initialize_user();
    select reporting_currency into v_reporting_currency from finance.profiles where user_id = v_user_id;
  end if;

  if v_account_currency <> v_reporting_currency then
    raise exception using
      errcode = '0A000',
      message = 'foreign-currency expense convenience flow requires explicit FX and is deferred beyond P2';
  end if;

  if p_merchant_id is not null and not exists (
    select 1 from finance.merchants where id = p_merchant_id and user_id = v_user_id
  ) then
    raise exception using errcode = '23503', message = 'merchant does not belong to current user';
  end if;

  select coalesce(sum((x->>'amount_minor')::bigint), 0)
    into v_sum
  from jsonb_array_elements(p_allocations) x;

  if v_sum <> p_amount_minor then
    raise exception using
      errcode = '23514',
      message = format('expense allocations sum to %s but amount is %s', v_sum, p_amount_minor);
  end if;

  insert into finance.transactions (
    id, user_id, type, status, occurred_at, merchant_id, description, note,
    source, reporting_currency
  ) values (
    v_tx_id, v_user_id, 'expense', 'draft', p_occurred_at, p_merchant_id,
    nullif(btrim(p_description), ''), nullif(btrim(p_note), ''),
    'manual', v_reporting_currency
  );

  insert into finance.ledger_entries (
    user_id, transaction_id, entry_kind, account_id,
    signed_amount_minor, currency_code, reporting_amount_minor
  ) values (
    v_user_id, v_tx_id, 'account', p_account_id,
    -p_amount_minor, v_account_currency, -p_amount_minor
  );

  for v_item in select * from jsonb_array_elements(p_allocations)
  loop
    v_category_id := (v_item->>'category_id')::uuid;
    v_amount := (v_item->>'amount_minor')::bigint;

    if v_amount <= 0 then
      raise exception using errcode = '23514', message = 'category allocation must be positive';
    end if;

    select kind into v_kind
    from finance.categories
    where id = v_category_id and user_id = v_user_id and not is_archived;

    if not found or v_kind not in ('expense','both') then
      raise exception using errcode = '23514', message = 'expense allocation uses invalid category';
    end if;

    insert into finance.ledger_entries (
      user_id, transaction_id, entry_kind, category_id,
      signed_amount_minor, currency_code, reporting_amount_minor,
      memo
    ) values (
      v_user_id, v_tx_id, 'category', v_category_id,
      v_amount, v_reporting_currency, v_amount,
      nullif(btrim(v_item->>'memo'), '')
    );
  end loop;

  update finance.transactions
  set status = 'posted', posted_at = now()
  where id = v_tx_id and user_id = v_user_id;

  return v_tx_id;
end;
$$;

revoke all on function finance.create_expense(uuid, bigint, jsonb, timestamptz, uuid, text, text) from public, anon;
grant execute on function finance.create_expense(uuid, bigint, jsonb, timestamptz, uuid, text, text) to authenticated, service_role;

create or replace function finance.create_income(
  p_account_id uuid,
  p_amount_minor bigint,
  p_allocations jsonb,
  p_occurred_at timestamptz default now(),
  p_merchant_id uuid default null,
  p_description text default null,
  p_note text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_account_currency text;
  v_reporting_currency text;
  v_sum bigint;
  v_tx_id uuid := gen_random_uuid();
  v_item jsonb;
  v_category_id uuid;
  v_amount bigint;
  v_kind finance.category_kind;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if p_amount_minor <= 0 then
    raise exception using errcode = '23514', message = 'income amount must be positive';
  end if;
  if jsonb_typeof(p_allocations) <> 'array' or jsonb_array_length(p_allocations) = 0 then
    raise exception using errcode = '23514', message = 'income requires at least one category allocation';
  end if;

  select currency_code into v_account_currency
  from finance.accounts
  where id = p_account_id and user_id = v_user_id and not is_archived;
  if not found then
    raise exception using errcode = 'P0002', message = 'active finance account not found';
  end if;

  select reporting_currency into v_reporting_currency
  from finance.profiles where user_id = v_user_id;
  if v_reporting_currency is null then
    perform finance.initialize_user();
    select reporting_currency into v_reporting_currency from finance.profiles where user_id = v_user_id;
  end if;

  if v_account_currency <> v_reporting_currency then
    raise exception using errcode = '0A000', message = 'foreign-currency income convenience flow is deferred beyond P2';
  end if;

  if p_merchant_id is not null and not exists (
    select 1 from finance.merchants where id = p_merchant_id and user_id = v_user_id
  ) then
    raise exception using errcode = '23503', message = 'merchant does not belong to current user';
  end if;

  select coalesce(sum((x->>'amount_minor')::bigint), 0)
    into v_sum
  from jsonb_array_elements(p_allocations) x;

  if v_sum <> p_amount_minor then
    raise exception using errcode = '23514', message = 'income allocations do not equal amount';
  end if;

  insert into finance.transactions (
    id, user_id, type, status, occurred_at, merchant_id, description, note,
    source, reporting_currency
  ) values (
    v_tx_id, v_user_id, 'income', 'draft', p_occurred_at, p_merchant_id,
    nullif(btrim(p_description), ''), nullif(btrim(p_note), ''),
    'manual', v_reporting_currency
  );

  insert into finance.ledger_entries (
    user_id, transaction_id, entry_kind, account_id,
    signed_amount_minor, currency_code, reporting_amount_minor
  ) values (
    v_user_id, v_tx_id, 'account', p_account_id,
    p_amount_minor, v_account_currency, p_amount_minor
  );

  for v_item in select * from jsonb_array_elements(p_allocations)
  loop
    v_category_id := (v_item->>'category_id')::uuid;
    v_amount := (v_item->>'amount_minor')::bigint;

    if v_amount <= 0 then
      raise exception using errcode = '23514', message = 'category allocation must be positive';
    end if;

    select kind into v_kind
    from finance.categories
    where id = v_category_id and user_id = v_user_id and not is_archived;

    if not found or v_kind not in ('income','both') then
      raise exception using errcode = '23514', message = 'income allocation uses invalid category';
    end if;

    insert into finance.ledger_entries (
      user_id, transaction_id, entry_kind, category_id,
      signed_amount_minor, currency_code, reporting_amount_minor,
      memo
    ) values (
      v_user_id, v_tx_id, 'category', v_category_id,
      -v_amount, v_reporting_currency, -v_amount,
      nullif(btrim(v_item->>'memo'), '')
    );
  end loop;

  update finance.transactions
  set status = 'posted', posted_at = now()
  where id = v_tx_id and user_id = v_user_id;

  return v_tx_id;
end;
$$;

revoke all on function finance.create_income(uuid, bigint, jsonb, timestamptz, uuid, text, text) from public, anon;
grant execute on function finance.create_income(uuid, bigint, jsonb, timestamptz, uuid, text, text) to authenticated, service_role;

create or replace function finance.create_transfer(
  p_from_account_id uuid,
  p_to_account_id uuid,
  p_amount_minor bigint,
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
  v_from_currency text;
  v_to_currency text;
  v_reporting_currency text;
  v_tx_id uuid := gen_random_uuid();
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;
  if p_from_account_id = p_to_account_id then
    raise exception using errcode = '23514', message = 'transfer accounts must differ';
  end if;
  if p_amount_minor <= 0 then
    raise exception using errcode = '23514', message = 'transfer amount must be positive';
  end if;

  select currency_code into v_from_currency
  from finance.accounts
  where id = p_from_account_id and user_id = v_user_id and not is_archived;
  if not found then raise exception using errcode='P0002', message='source account not found'; end if;

  select currency_code into v_to_currency
  from finance.accounts
  where id = p_to_account_id and user_id = v_user_id and not is_archived;
  if not found then raise exception using errcode='P0002', message='destination account not found'; end if;

  select reporting_currency into v_reporting_currency
  from finance.profiles where user_id = v_user_id;

  if v_from_currency <> v_to_currency or v_from_currency <> v_reporting_currency then
    raise exception using
      errcode = '0A000',
      message = 'P2 transfer convenience flow supports same-currency reporting-currency transfers only';
  end if;

  insert into finance.transactions (
    id, user_id, type, status, occurred_at, description, note, source, reporting_currency
  ) values (
    v_tx_id, v_user_id, 'transfer', 'draft', p_occurred_at,
    'Transfer', nullif(btrim(p_note), ''), 'manual', v_reporting_currency
  );

  insert into finance.ledger_entries (
    user_id, transaction_id, entry_kind, account_id,
    signed_amount_minor, currency_code, reporting_amount_minor
  ) values
    (v_user_id, v_tx_id, 'account', p_from_account_id, -p_amount_minor, v_from_currency, -p_amount_minor),
    (v_user_id, v_tx_id, 'account', p_to_account_id, p_amount_minor, v_to_currency, p_amount_minor);

  update finance.transactions
  set status = 'posted', posted_at = now()
  where id = v_tx_id and user_id = v_user_id;

  return v_tx_id;
end;
$$;

revoke all on function finance.create_transfer(uuid, uuid, bigint, timestamptz, text) from public, anon;
grant execute on function finance.create_transfer(uuid, uuid, bigint, timestamptz, text) to authenticated, service_role;

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
begin
  if v_user_id is null then
    raise exception using errcode='42501', message='authentication required';
  end if;
  if p_amount_minor <= 0 then
    raise exception using errcode='23514', message='refund amount must be positive';
  end if;

  select * into v_original
  from finance.transactions
  where id = p_original_transaction_id and user_id = v_user_id and status = 'posted';

  if not found or v_original.type not in ('expense','adjustment') then
    raise exception using errcode='23514', message='refund must reference a posted expense or adjustment';
  end if;

  select currency_code into v_account_currency
  from finance.accounts
  where id = p_account_id and user_id = v_user_id and not is_archived;
  if not found then raise exception using errcode='P0002', message='refund account not found'; end if;

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

  if p_amount_minor > v_original_amount then
    raise exception using errcode='23514', message='refund exceeds original categorized expense amount';
  end if;

  if p_allocations is null then
    if p_amount_minor <> v_original_amount then
      raise exception using
        errcode='23514',
        message='partial refunds require explicit category allocations';
    end if;
  else
    if jsonb_typeof(p_allocations) <> 'array' or jsonb_array_length(p_allocations)=0 then
      raise exception using errcode='23514', message='refund allocations must be a non-empty array';
    end if;
    select coalesce(sum((x->>'amount_minor')::bigint),0) into v_total
    from jsonb_array_elements(p_allocations) x;
    if v_total <> p_amount_minor then
      raise exception using errcode='23514', message='refund allocations do not equal refund amount';
    end if;
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
    select
      v_user_id, v_tx_id, 'category', category_id,
      -reporting_amount_minor, v_original.reporting_currency, -reporting_amount_minor,
      'Refund of ' || v_original.id::text
    from finance.ledger_entries
    where transaction_id = v_original.id
      and user_id = v_user_id
      and entry_kind = 'category'
      and reporting_amount_minor > 0;
  else
    for v_item in select * from jsonb_array_elements(p_allocations)
    loop
      v_category_id := (v_item->>'category_id')::uuid;
      v_amount := (v_item->>'amount_minor')::bigint;
      if v_amount <= 0 then
        raise exception using errcode='23514', message='refund allocation must be positive';
      end if;
      if not exists (
        select 1 from finance.categories
        where id = v_category_id and user_id = v_user_id and not is_archived
      ) then
        raise exception using errcode='23503', message='refund category not found';
      end if;

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

revoke all on function finance.create_refund(uuid, uuid, bigint, jsonb, timestamptz, text) from public, anon;
grant execute on function finance.create_refund(uuid, uuid, bigint, jsonb, timestamptz, text) to authenticated, service_role;

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
  where id=p_original_transaction_id and user_id=v_user_id and status='posted';

  if not found or v_original.type <> 'expense' then
    raise exception using errcode='23514', message='reimbursement must reference a posted expense';
  end if;

  select currency_code into v_account_currency
  from finance.accounts
  where id=p_account_id and user_id=v_user_id and not is_archived;
  if not found then raise exception using errcode='P0002', message='reimbursement account not found'; end if;

  if v_account_currency <> v_original.reporting_currency then
    raise exception using errcode='0A000', message='P2 reimbursement convenience flow requires reporting-currency account';
  end if;

  select coalesce(sum((x->>'amount_minor')::bigint),0) into v_total
  from jsonb_array_elements(p_allocations) x;
  if v_total <> p_amount_minor then
    raise exception using errcode='23514', message='reimbursement allocations do not equal amount';
  end if;

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
    if v_amount <= 0 then
      raise exception using errcode='23514', message='reimbursement allocation must be positive';
    end if;

    if not exists (
      select 1 from finance.categories
      where id=v_category_id and user_id=v_user_id and not is_archived
    ) then
      raise exception using errcode='23503', message='reimbursement category not found';
    end if;

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

revoke all on function finance.create_reimbursement(uuid, uuid, bigint, jsonb, timestamptz, text) from public, anon;
grant execute on function finance.create_reimbursement(uuid, uuid, bigint, jsonb, timestamptz, text) to authenticated, service_role;

create or replace function finance.void_transaction(
  p_transaction_id uuid,
  p_reason text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception using errcode='42501', message='authentication required';
  end if;
  if nullif(btrim(p_reason),'') is null then
    raise exception using errcode='23514', message='void reason is required';
  end if;

  update finance.transactions
  set status='void',
      voided_at=now(),
      void_reason=btrim(p_reason)
  where id=p_transaction_id
    and user_id=v_user_id
    and status='posted';

  if not found then
    raise exception using errcode='P0002', message='posted finance transaction not found';
  end if;
end;
$$;

revoke all on function finance.void_transaction(uuid, text) from public, anon;
grant execute on function finance.void_transaction(uuid, text) to authenticated, service_role;

create view finance.transaction_summary
with (security_invoker = true)
as
select
  t.id,
  t.user_id,
  t.type,
  t.status,
  t.occurred_at,
  t.merchant_id,
  t.description,
  t.note,
  t.source,
  t.reporting_currency,
  t.related_transaction_id,
  t.relation_kind,
  t.posted_at,
  t.voided_at,
  t.void_reason,
  coalesce(
    -sum(le.reporting_amount_minor) filter (where le.entry_kind='account' and le.reporting_amount_minor < 0),
    sum(le.reporting_amount_minor) filter (where le.entry_kind='account' and le.reporting_amount_minor > 0),
    0
  )::bigint as display_amount_minor,
  count(le.id)::integer as entry_count,
  t.created_at,
  t.updated_at
from finance.transactions t
left join finance.ledger_entries le
  on le.transaction_id=t.id and le.user_id=t.user_id
group by t.id;

revoke all on finance.transaction_summary from anon, authenticated;
grant select on finance.transaction_summary to authenticated, service_role;

-- Posted financial history is modified through service functions, not direct table mutation.
revoke insert, update on finance.ledger_entries from authenticated;
revoke insert on finance.transactions from authenticated;
grant update (merchant_id, description, note, metadata) on finance.transactions to authenticated;

-- Service functions need table writes under invoker privileges, so expose narrowly scoped column operations.
grant insert (
  id,user_id,type,status,occurred_at,merchant_id,description,note,source,
  source_external_id,reporting_currency,posted_at,metadata,
  related_transaction_id,relation_kind,voided_at,void_reason
) on finance.transactions to authenticated;
grant update (
  status,posted_at,merchant_id,description,note,metadata,voided_at,void_reason
) on finance.transactions to authenticated;
grant insert (
  id,user_id,transaction_id,entry_kind,account_id,category_id,system_code,
  signed_amount_minor,currency_code,reporting_amount_minor,exchange_rate,memo
) on finance.ledger_entries to authenticated;
