
create or replace function finance.rule_condition_matches(
  p_condition jsonb,
  p_context jsonb
)
returns boolean
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_tags jsonb := coalesce(p_context->'tag_ids','[]'::jsonb);
  v_amount bigint;
begin
  if p_condition ? 'merchant_id'
     and coalesce(p_context->>'merchant_id','') <> p_condition->>'merchant_id' then return false; end if;
  if p_condition ? 'merchant_group'
     and lower(coalesce(p_context->>'merchant_group','')) <> lower(p_condition->>'merchant_group') then return false; end if;
  if p_condition ? 'merchant_name_contains'
     and position(lower(p_condition->>'merchant_name_contains') in lower(coalesce(p_context->>'merchant_name',''))) = 0 then return false; end if;
  if p_condition ? 'description_contains'
     and position(lower(p_condition->>'description_contains') in lower(coalesce(p_context->>'description',''))) = 0 then return false; end if;
  if p_condition ? 'raw_name_contains'
     and position(lower(p_condition->>'raw_name_contains') in lower(coalesce(p_context->>'raw_name',''))) = 0 then return false; end if;
  if p_condition ? 'normalized_name_contains'
     and position(lower(p_condition->>'normalized_name_contains') in lower(coalesce(p_context->>'normalized_name',''))) = 0 then return false; end if;
  if p_condition ? 'product_id'
     and coalesce(p_context->>'product_id','') <> p_condition->>'product_id' then return false; end if;
  if p_condition ? 'transaction_type'
     and coalesce(p_context->>'transaction_type','') <> p_condition->>'transaction_type' then return false; end if;
  if p_condition ? 'tag_id'
     and not (v_tags ? (p_condition->>'tag_id')) then return false; end if;

  if p_condition ? 'min_amount_minor' or p_condition ? 'max_amount_minor' then
    if not p_context ? 'amount_minor' then return false; end if;
    v_amount := (p_context->>'amount_minor')::bigint;
    if p_condition ? 'min_amount_minor'
       and v_amount < (p_condition->>'min_amount_minor')::bigint then return false; end if;
    if p_condition ? 'max_amount_minor'
       and v_amount > (p_condition->>'max_amount_minor')::bigint then return false; end if;
  end if;
  return true;
end;
$$;

revoke all on function finance.rule_condition_matches(jsonb,jsonb) from public, anon;
grant execute on function finance.rule_condition_matches(jsonb,jsonb) to authenticated, service_role;

create or replace function finance.resolve_classification(
  p_scope text,
  p_context jsonb
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_context jsonb := coalesce(p_context,'{}'::jsonb);
  v_result jsonb := '{}'::jsonb;
  v_matched jsonb := '[]'::jsonb;
  v_rule record;
  v_merchant_id uuid;
  v_product_id uuid;
  v_category_id uuid;
  v_tags jsonb := '[]'::jsonb;
  v_action_tags jsonb;
  v_text text;
begin
  if v_user_id is null then raise exception using errcode='42501', message='authentication required'; end if;
  if p_scope not in ('transaction','receipt_item','product','merchant') then
    raise exception using errcode='23514', message='unsupported classification scope';
  end if;

  if not (v_context ? 'merchant_id') and v_context ? 'merchant_name' then
    v_merchant_id := finance.resolve_merchant(v_context->>'merchant_name');
    if v_merchant_id is not null then
      v_context := v_context || jsonb_build_object('merchant_id',v_merchant_id);
    end if;
  elsif v_context ? 'merchant_id' then
    v_merchant_id := (v_context->>'merchant_id')::uuid;
  end if;

  if v_merchant_id is not null then
    select v_context || jsonb_build_object(
      'merchant_name',m.name,'merchant_group',m.merchant_group
    )
    into v_context
    from finance.merchants m
    where m.id=v_merchant_id and m.user_id=v_user_id and not m.is_archived;
  end if;

  for v_rule in
    select *
    from finance.classification_rules
    where user_id=v_user_id and enabled and scope in ('all',p_scope)
    order by
      case source
        when 'user' then 10
        when 'learned' then 20
        when 'merchant' then 30
        when 'global' then 40
        when 'ai' then 50
      end,
      priority asc, created_at asc, id asc
  loop
    if finance.rule_condition_matches(v_rule.condition,v_context) then
      v_matched := v_matched || jsonb_build_array(v_rule.id);

      if v_rule.action ? 'merchant_id' and not (v_result ? 'merchant_id') then
        v_result := v_result || jsonb_build_object('merchant_id',v_rule.action->>'merchant_id');
        v_merchant_id := (v_rule.action->>'merchant_id')::uuid;
      end if;
      if v_rule.action ? 'category_id' and not (v_result ? 'category_id') then
        v_result := v_result || jsonb_build_object('category_id',v_rule.action->>'category_id');
      end if;
      if v_rule.action ? 'necessity' and not (v_result ? 'necessity') then
        v_result := v_result || jsonb_build_object('necessity',v_rule.action->>'necessity');
      end if;
      if v_rule.action ? 'tag_ids' then
        v_action_tags := v_rule.action->'tag_ids';
        for v_text in select jsonb_array_elements_text(v_action_tags)
        loop
          if not (v_tags ? v_text) then v_tags := v_tags || jsonb_build_array(v_text); end if;
        end loop;
      end if;
      if v_rule.stop_processing then exit; end if;
    end if;
  end loop;

  if v_context ? 'product_id' then
    v_product_id := (v_context->>'product_id')::uuid;
    if not (v_result ? 'category_id') then
      select default_category_id into v_category_id
      from finance.products
      where id=v_product_id and user_id=v_user_id and not is_archived;
      if v_category_id is not null then
        v_result := v_result || jsonb_build_object('category_id',v_category_id);
      end if;
    end if;
    if not (v_result ? 'necessity') then
      select default_necessity::text into v_text
      from finance.products
      where id=v_product_id and user_id=v_user_id and not is_archived;
      if v_text is not null and v_text <> 'unclassified' then
        v_result := v_result || jsonb_build_object('necessity',v_text);
      end if;
    end if;
  end if;

  if v_merchant_id is null and v_result ? 'merchant_id' then
    v_merchant_id := (v_result->>'merchant_id')::uuid;
  end if;

  if v_merchant_id is not null then
    if not (v_result ? 'category_id') then
      select default_category_id into v_category_id
      from finance.merchants
      where id=v_merchant_id and user_id=v_user_id and not is_archived;
      if v_category_id is not null then
        v_result := v_result || jsonb_build_object('category_id',v_category_id);
      end if;
    end if;
    if not (v_result ? 'necessity') then
      select default_necessity::text into v_text
      from finance.merchants
      where id=v_merchant_id and user_id=v_user_id and not is_archived;
      if v_text is not null and v_text <> 'unclassified' then
        v_result := v_result || jsonb_build_object('necessity',v_text);
      end if;
    end if;
  end if;

  if v_result ? 'category_id' and not (v_result ? 'necessity') then
    select necessity_default::text into v_text
    from finance.categories
    where id=(v_result->>'category_id')::uuid and user_id=v_user_id;
    if v_text is not null then v_result := v_result || jsonb_build_object('necessity',v_text); end if;
  end if;

  if jsonb_array_length(v_tags)>0 then v_result := v_result || jsonb_build_object('tag_ids',v_tags); end if;

  return v_result || jsonb_build_object('matched_rule_ids',v_matched,'context',v_context);
end;
$$;

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
  v_necessity finance.necessity;
  v_original_amount bigint;
  v_existing_recovery bigint;
  v_dimension_count integer;
  v_dimension_remaining bigint;
begin
  if v_user_id is null then raise exception using errcode='42501', message='authentication required'; end if;
  if p_amount_minor<=0 then raise exception using errcode='23514', message='refund amount must be positive'; end if;

  select * into v_original
  from finance.transactions
  where id=p_original_transaction_id and user_id=v_user_id and status='posted';
  if not found or v_original.type not in ('expense','adjustment') then
    raise exception using errcode='23514', message='refund must reference a posted expense or adjustment';
  end if;

  select currency_code into v_account_currency
  from finance.accounts
  where id=p_account_id and user_id=v_user_id and not is_archived;
  if not found then raise exception using errcode='P0002', message='refund account not found'; end if;
  if v_account_currency<>v_original.reporting_currency then
    raise exception using errcode='0A000', message='refund convenience flow requires reporting-currency account';
  end if;

  select coalesce(sum(reporting_amount_minor),0)::bigint into v_original_amount
  from finance.ledger_entries
  where transaction_id=v_original.id and user_id=v_user_id
    and entry_kind='category' and reporting_amount_minor>0;

  select coalesce(-sum(le.reporting_amount_minor),0)::bigint into v_existing_recovery
  from finance.transactions rt
  join finance.ledger_entries le on le.transaction_id=rt.id and le.user_id=rt.user_id
  where rt.user_id=v_user_id and rt.related_transaction_id=v_original.id
    and rt.status='posted' and rt.type in ('refund','reimbursement')
    and le.entry_kind='category' and le.reporting_amount_minor<0;

  if p_amount_minor>(v_original_amount-v_existing_recovery) then
    raise exception using errcode='23514', message='refund exceeds unrecovered amount of original transaction';
  end if;

  if p_allocations is null then
    if p_amount_minor<>(v_original_amount-v_existing_recovery) then
      raise exception using errcode='23514',
        message='refund without explicit allocations must refund entire remaining recoverable amount';
    end if;
  else
    if jsonb_typeof(p_allocations)<>'array' or jsonb_array_length(p_allocations)=0 then
      raise exception using errcode='23514', message='refund allocations must be a non-empty array';
    end if;
    select coalesce(sum((x->>'amount_minor')::bigint),0) into v_total
    from jsonb_array_elements(p_allocations) x;
    if v_total<>p_amount_minor then raise exception using errcode='23514', message='refund allocations do not equal refund amount'; end if;

    for v_item in select * from jsonb_array_elements(p_allocations)
    loop
      v_category_id := (v_item->>'category_id')::uuid;
      v_amount := (v_item->>'amount_minor')::bigint;
      if v_amount<=0 then raise exception using errcode='23514', message='refund allocation must be positive'; end if;

      if v_item ? 'necessity' then
        v_necessity := (v_item->>'necessity')::finance.necessity;
      else
        with original as (
          select necessity,sum(reporting_amount_minor)::bigint original_minor
          from finance.ledger_entries
          where transaction_id=v_original.id and user_id=v_user_id
            and entry_kind='category' and category_id=v_category_id
            and reporting_amount_minor>0
          group by necessity
        ),
        recovered as (
          select le.necessity,(-sum(le.reporting_amount_minor))::bigint recovered_minor
          from finance.transactions rt
          join finance.ledger_entries le on le.transaction_id=rt.id and le.user_id=rt.user_id
          where rt.user_id=v_user_id and rt.related_transaction_id=v_original.id
            and rt.status='posted' and rt.type in ('refund','reimbursement')
            and le.entry_kind='category' and le.category_id=v_category_id
            and le.reporting_amount_minor<0
          group by le.necessity
        ),
        remain as (
          select o.necessity,o.original_minor-coalesce(r.recovered_minor,0) remaining
          from original o left join recovered r using(necessity)
          where o.original_minor-coalesce(r.recovered_minor,0)>0
        )
        select count(*)::int,min(necessity),coalesce(sum(remaining),0)::bigint
        into v_dimension_count,v_necessity,v_dimension_remaining
        from remain;

        if v_dimension_count<>1 then
          raise exception using errcode='23514',
            message='refund allocation necessity is ambiguous; specify necessity explicitly';
        end if;
      end if;

      with original as (
        select coalesce(sum(reporting_amount_minor),0)::bigint original_minor
        from finance.ledger_entries
        where transaction_id=v_original.id and user_id=v_user_id
          and entry_kind='category' and category_id=v_category_id
          and necessity=v_necessity and reporting_amount_minor>0
      ),
      recovered as (
        select coalesce(-sum(le.reporting_amount_minor),0)::bigint recovered_minor
        from finance.transactions rt
        join finance.ledger_entries le on le.transaction_id=rt.id and le.user_id=rt.user_id
        where rt.user_id=v_user_id and rt.related_transaction_id=v_original.id
          and rt.status='posted' and rt.type in ('refund','reimbursement')
          and le.entry_kind='category' and le.category_id=v_category_id
          and le.necessity=v_necessity and le.reporting_amount_minor<0
      )
      select o.original_minor-r.recovered_minor into v_dimension_remaining
      from original o cross join recovered r;

      if v_amount>coalesce(v_dimension_remaining,0) then
        raise exception using errcode='23514',
          message='refund allocation exceeds unrecovered category/necessity amount';
      end if;
    end loop;
  end if;

  insert into finance.transactions(
    id,user_id,type,status,occurred_at,merchant_id,description,note,source,
    reporting_currency,related_transaction_id,relation_kind
  ) values(
    v_tx_id,v_user_id,'refund','draft',p_occurred_at,v_original.merchant_id,
    'Refund',nullif(btrim(p_note),''),'manual',v_original.reporting_currency,
    v_original.id,'refund_of'
  );

  insert into finance.ledger_entries(
    user_id,transaction_id,entry_kind,account_id,signed_amount_minor,
    currency_code,reporting_amount_minor,necessity
  ) values(
    v_user_id,v_tx_id,'account',p_account_id,p_amount_minor,
    v_account_currency,p_amount_minor,null
  );

  if p_allocations is null then
    insert into finance.ledger_entries(
      user_id,transaction_id,entry_kind,category_id,signed_amount_minor,
      currency_code,reporting_amount_minor,memo,necessity
    )
    with original as (
      select category_id,necessity,sum(reporting_amount_minor)::bigint original_minor
      from finance.ledger_entries
      where transaction_id=v_original.id and user_id=v_user_id
        and entry_kind='category' and reporting_amount_minor>0
      group by category_id,necessity
    ),
    recovered as (
      select le.category_id,le.necessity,(-sum(le.reporting_amount_minor))::bigint recovered_minor
      from finance.transactions rt
      join finance.ledger_entries le on le.transaction_id=rt.id and le.user_id=rt.user_id
      where rt.user_id=v_user_id and rt.related_transaction_id=v_original.id
        and rt.status='posted' and rt.type in ('refund','reimbursement')
        and le.entry_kind='category' and le.reporting_amount_minor<0
      group by le.category_id,le.necessity
    )
    select v_user_id,v_tx_id,'category',o.category_id,
      -(o.original_minor-coalesce(r.recovered_minor,0)),
      v_original.reporting_currency,
      -(o.original_minor-coalesce(r.recovered_minor,0)),
      'Refund of remaining amount for '||v_original.id::text,
      o.necessity
    from original o
    left join recovered r on r.category_id=o.category_id and r.necessity=o.necessity
    where o.original_minor-coalesce(r.recovered_minor,0)>0;
  else
    for v_item in select * from jsonb_array_elements(p_allocations)
    loop
      v_category_id := (v_item->>'category_id')::uuid;
      v_amount := (v_item->>'amount_minor')::bigint;
      if v_item ? 'necessity' then
        v_necessity := (v_item->>'necessity')::finance.necessity;
      else
        with original as (
          select necessity,sum(reporting_amount_minor)::bigint original_minor
          from finance.ledger_entries
          where transaction_id=v_original.id and user_id=v_user_id
            and entry_kind='category' and category_id=v_category_id
            and reporting_amount_minor>0
          group by necessity
        ),
        recovered as (
          select le.necessity,(-sum(le.reporting_amount_minor))::bigint recovered_minor
          from finance.transactions rt
          join finance.ledger_entries le on le.transaction_id=rt.id and le.user_id=rt.user_id
          where rt.user_id=v_user_id and rt.related_transaction_id=v_original.id
            and rt.status='posted' and rt.type in ('refund','reimbursement')
            and le.entry_kind='category' and le.category_id=v_category_id
            and le.reporting_amount_minor<0
          group by le.necessity
        )
        select min(o.necessity) into v_necessity
        from original o left join recovered r using(necessity)
        where o.original_minor-coalesce(r.recovered_minor,0)>0;
      end if;

      insert into finance.ledger_entries(
        user_id,transaction_id,entry_kind,category_id,signed_amount_minor,
        currency_code,reporting_amount_minor,necessity
      ) values(
        v_user_id,v_tx_id,'category',v_category_id,-v_amount,
        v_original.reporting_currency,-v_amount,v_necessity
      );
    end loop;
  end if;

  update finance.transactions set status='posted',posted_at=now()
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
  v_necessity finance.necessity;
  v_original_amount bigint;
  v_existing_recovery bigint;
  v_dimension_count integer;
  v_dimension_remaining bigint;
begin
  if v_user_id is null then raise exception using errcode='42501', message='authentication required'; end if;
  if p_amount_minor<=0 then raise exception using errcode='23514', message='reimbursement amount must be positive'; end if;
  if jsonb_typeof(p_allocations)<>'array' or jsonb_array_length(p_allocations)=0 then
    raise exception using errcode='23514', message='reimbursement requires explicit category allocations';
  end if;

  select * into v_original from finance.transactions
  where id=p_original_transaction_id and user_id=v_user_id and status='posted';
  if not found or v_original.type<>'expense' then
    raise exception using errcode='23514', message='reimbursement must reference a posted expense';
  end if;

  select currency_code into v_account_currency from finance.accounts
  where id=p_account_id and user_id=v_user_id and not is_archived;
  if not found then raise exception using errcode='P0002', message='reimbursement account not found'; end if;
  if v_account_currency<>v_original.reporting_currency then
    raise exception using errcode='0A000', message='reimbursement convenience flow requires reporting-currency account';
  end if;

  select coalesce(sum(reporting_amount_minor),0)::bigint into v_original_amount
  from finance.ledger_entries
  where transaction_id=v_original.id and user_id=v_user_id
    and entry_kind='category' and reporting_amount_minor>0;

  select coalesce(-sum(le.reporting_amount_minor),0)::bigint into v_existing_recovery
  from finance.transactions rt
  join finance.ledger_entries le on le.transaction_id=rt.id and le.user_id=rt.user_id
  where rt.user_id=v_user_id and rt.related_transaction_id=v_original.id
    and rt.status='posted' and rt.type in ('refund','reimbursement')
    and le.entry_kind='category' and le.reporting_amount_minor<0;

  if p_amount_minor>(v_original_amount-v_existing_recovery) then
    raise exception using errcode='23514', message='reimbursement exceeds unrecovered amount of original expense';
  end if;

  select coalesce(sum((x->>'amount_minor')::bigint),0) into v_total
  from jsonb_array_elements(p_allocations) x;
  if v_total<>p_amount_minor then
    raise exception using errcode='23514', message='reimbursement allocations do not equal amount';
  end if;

  for v_item in select * from jsonb_array_elements(p_allocations)
  loop
    v_category_id := (v_item->>'category_id')::uuid;
    v_amount := (v_item->>'amount_minor')::bigint;
    if v_amount<=0 then raise exception using errcode='23514', message='reimbursement allocation must be positive'; end if;

    if v_item ? 'necessity' then
      v_necessity := (v_item->>'necessity')::finance.necessity;
    else
      with original as (
        select necessity,sum(reporting_amount_minor)::bigint original_minor
        from finance.ledger_entries
        where transaction_id=v_original.id and user_id=v_user_id
          and entry_kind='category' and category_id=v_category_id and reporting_amount_minor>0
        group by necessity
      ),
      recovered as (
        select le.necessity,(-sum(le.reporting_amount_minor))::bigint recovered_minor
        from finance.transactions rt
        join finance.ledger_entries le on le.transaction_id=rt.id and le.user_id=rt.user_id
        where rt.user_id=v_user_id and rt.related_transaction_id=v_original.id
          and rt.status='posted' and rt.type in ('refund','reimbursement')
          and le.entry_kind='category' and le.category_id=v_category_id
          and le.reporting_amount_minor<0
        group by le.necessity
      ),
      remain as (
        select o.necessity,o.original_minor-coalesce(r.recovered_minor,0) remaining
        from original o left join recovered r using(necessity)
        where o.original_minor-coalesce(r.recovered_minor,0)>0
      )
      select count(*)::int,min(necessity),coalesce(sum(remaining),0)::bigint
      into v_dimension_count,v_necessity,v_dimension_remaining from remain;

      if v_dimension_count<>1 then
        raise exception using errcode='23514',
          message='reimbursement allocation necessity is ambiguous; specify necessity explicitly';
      end if;
    end if;

    with original as (
      select coalesce(sum(reporting_amount_minor),0)::bigint original_minor
      from finance.ledger_entries
      where transaction_id=v_original.id and user_id=v_user_id
        and entry_kind='category' and category_id=v_category_id
        and necessity=v_necessity and reporting_amount_minor>0
    ),
    recovered as (
      select coalesce(-sum(le.reporting_amount_minor),0)::bigint recovered_minor
      from finance.transactions rt
      join finance.ledger_entries le on le.transaction_id=rt.id and le.user_id=rt.user_id
      where rt.user_id=v_user_id and rt.related_transaction_id=v_original.id
        and rt.status='posted' and rt.type in ('refund','reimbursement')
        and le.entry_kind='category' and le.category_id=v_category_id
        and le.necessity=v_necessity and le.reporting_amount_minor<0
    )
    select o.original_minor-r.recovered_minor into v_dimension_remaining
    from original o cross join recovered r;

    if v_amount>coalesce(v_dimension_remaining,0) then
      raise exception using errcode='23514',
        message='reimbursement allocation exceeds unrecovered category/necessity amount';
    end if;
  end loop;

  insert into finance.transactions(
    id,user_id,type,status,occurred_at,merchant_id,description,note,source,
    reporting_currency,related_transaction_id,relation_kind
  ) values(
    v_tx_id,v_user_id,'reimbursement','draft',p_occurred_at,v_original.merchant_id,
    'Reimbursement',nullif(btrim(p_note),''),'manual',v_original.reporting_currency,
    v_original.id,'reimbursement_of'
  );

  insert into finance.ledger_entries(
    user_id,transaction_id,entry_kind,account_id,signed_amount_minor,
    currency_code,reporting_amount_minor,necessity
  ) values(
    v_user_id,v_tx_id,'account',p_account_id,p_amount_minor,
    v_account_currency,p_amount_minor,null
  );

  for v_item in select * from jsonb_array_elements(p_allocations)
  loop
    v_category_id := (v_item->>'category_id')::uuid;
    v_amount := (v_item->>'amount_minor')::bigint;
    if v_item ? 'necessity' then
      v_necessity := (v_item->>'necessity')::finance.necessity;
    else
      with original as (
        select necessity,sum(reporting_amount_minor)::bigint original_minor
        from finance.ledger_entries
        where transaction_id=v_original.id and user_id=v_user_id
          and entry_kind='category' and category_id=v_category_id and reporting_amount_minor>0
        group by necessity
      ),
      recovered as (
        select le.necessity,(-sum(le.reporting_amount_minor))::bigint recovered_minor
        from finance.transactions rt
        join finance.ledger_entries le on le.transaction_id=rt.id and le.user_id=rt.user_id
        where rt.user_id=v_user_id and rt.related_transaction_id=v_original.id
          and rt.status='posted' and rt.type in ('refund','reimbursement')
          and le.entry_kind='category' and le.category_id=v_category_id
          and le.reporting_amount_minor<0
        group by le.necessity
      )
      select min(o.necessity) into v_necessity
      from original o left join recovered r using(necessity)
      where o.original_minor-coalesce(r.recovered_minor,0)>0;
    end if;

    insert into finance.ledger_entries(
      user_id,transaction_id,entry_kind,category_id,signed_amount_minor,
      currency_code,reporting_amount_minor,necessity
    ) values(
      v_user_id,v_tx_id,'category',v_category_id,-v_amount,
      v_original.reporting_currency,-v_amount,v_necessity
    );
  end loop;

  update finance.transactions set status='posted',posted_at=now()
  where id=v_tx_id and user_id=v_user_id;
  return v_tx_id;
end;
$$;

do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='finance'
      and p.proname in ('rule_condition_matches','resolve_classification','create_refund','create_reimbursement')
  loop
    execute format('revoke all on function %s from public, anon',f);
    execute format('grant execute on function %s to authenticated, service_role',f);
  end loop;
end $$;
