
create or replace function finance.create_category(
  p_name text,
  p_parent_id uuid default null,
  p_kind finance.category_kind default 'expense',
  p_necessity_default finance.necessity default 'unclassified',
  p_icon_key text default null,
  p_sort_order integer default 0
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_id uuid := gen_random_uuid();
begin
  if v_user_id is null then raise exception using errcode='42501', message='authentication required'; end if;
  if nullif(btrim(p_name),'') is null then raise exception using errcode='23514', message='category name is required'; end if;

  if p_parent_id is not null and not exists (
    select 1 from finance.categories
    where id=p_parent_id and user_id=v_user_id and not is_archived
  ) then
    raise exception using errcode='23503', message='active parent category not found';
  end if;

  insert into finance.categories(
    id,user_id,parent_id,name,kind,necessity_default,icon_key,sort_order
  ) values (
    v_id,v_user_id,p_parent_id,btrim(p_name),p_kind,p_necessity_default,
    nullif(btrim(p_icon_key),''),p_sort_order
  );

  return v_id;
end;
$$;

create or replace function finance.update_category(
  p_category_id uuid,
  p_name text,
  p_parent_id uuid,
  p_necessity_default finance.necessity,
  p_icon_key text default null,
  p_sort_order integer default 0
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception using errcode='42501', message='authentication required'; end if;
  if nullif(btrim(p_name),'') is null then raise exception using errcode='23514', message='category name is required'; end if;

  update finance.categories
  set name=btrim(p_name),
      parent_id=p_parent_id,
      necessity_default=p_necessity_default,
      icon_key=nullif(btrim(p_icon_key),''),
      sort_order=p_sort_order
  where id=p_category_id and user_id=v_user_id;

  if not found then raise exception using errcode='P0002', message='category not found'; end if;
end;
$$;

create or replace function finance.archive_category(
  p_category_id uuid,
  p_recursive boolean default false
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception using errcode='42501', message='authentication required'; end if;
  if not exists(select 1 from finance.categories where id=p_category_id and user_id=v_user_id) then
    raise exception using errcode='P0002', message='category not found';
  end if;

  if not p_recursive and exists (
    select 1 from finance.categories
    where parent_id=p_category_id and user_id=v_user_id and not is_archived
  ) then
    raise exception using errcode='23514', message='category has active children; archive recursively or archive children first';
  end if;

  if p_recursive then
    with recursive subtree as (
      select id from finance.categories where id=p_category_id and user_id=v_user_id
      union all
      select c.id from finance.categories c
      join subtree s on c.parent_id=s.id
      where c.user_id=v_user_id
    )
    update finance.categories
    set is_archived=true
    where user_id=v_user_id and id in (select id from subtree);
  else
    update finance.categories set is_archived=true
    where id=p_category_id and user_id=v_user_id;
  end if;
end;
$$;

create or replace function finance.restore_category(p_category_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_parent uuid;
begin
  if v_user_id is null then raise exception using errcode='42501', message='authentication required'; end if;

  select parent_id into v_parent
  from finance.categories
  where id=p_category_id and user_id=v_user_id;

  if not found then raise exception using errcode='P0002', message='category not found'; end if;

  if v_parent is not null and exists (
    select 1 from finance.categories
    where id=v_parent and user_id=v_user_id and is_archived
  ) then
    raise exception using errcode='23514', message='restore the parent category first';
  end if;

  update finance.categories set is_archived=false
  where id=p_category_id and user_id=v_user_id;
end;
$$;

create or replace function finance.upsert_merchant(
  p_name text,
  p_merchant_group text default null,
  p_default_category_id uuid default null,
  p_default_necessity finance.necessity default 'unclassified',
  p_website text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_normalized text;
  v_id uuid;
begin
  if v_user_id is null then raise exception using errcode='42501', message='authentication required'; end if;
  v_normalized := lower(regexp_replace(btrim(coalesce(p_name,'')), '[[:space:]]+', ' ', 'g'));
  if v_normalized='' then raise exception using errcode='23514', message='merchant name is required'; end if;

  if p_default_category_id is not null and not exists (
    select 1 from finance.categories
    where id=p_default_category_id and user_id=v_user_id and not is_archived
  ) then
    raise exception using errcode='23503', message='merchant default category not found';
  end if;

  select id into v_id
  from finance.merchants
  where user_id=v_user_id and normalized_name=v_normalized and not is_archived
  limit 1;

  if v_id is null then
    v_id := gen_random_uuid();
    insert into finance.merchants(
      id,user_id,name,normalized_name,merchant_group,default_category_id,
      default_necessity,website
    ) values (
      v_id,v_user_id,btrim(p_name),v_normalized,nullif(btrim(p_merchant_group),''),
      p_default_category_id,p_default_necessity,nullif(btrim(p_website),'')
    );
  else
    update finance.merchants
    set name=btrim(p_name),
        merchant_group=coalesce(nullif(btrim(p_merchant_group),''),merchant_group),
        default_category_id=coalesce(p_default_category_id,default_category_id),
        default_necessity=case
          when p_default_necessity <> 'unclassified' then p_default_necessity
          else default_necessity
        end,
        website=coalesce(nullif(btrim(p_website),''),website)
    where id=v_id and user_id=v_user_id;
  end if;

  return v_id;
end;
$$;

create or replace function finance.add_merchant_alias(
  p_merchant_id uuid,
  p_raw_name text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_norm text;
  v_id uuid;
begin
  if v_user_id is null then raise exception using errcode='42501', message='authentication required'; end if;
  if not exists(select 1 from finance.merchants where id=p_merchant_id and user_id=v_user_id and not is_archived) then
    raise exception using errcode='P0002', message='merchant not found';
  end if;

  v_norm := lower(regexp_replace(btrim(coalesce(p_raw_name,'')), '[[:space:]]+', ' ', 'g'));
  if v_norm='' then raise exception using errcode='23514', message='merchant alias is required'; end if;

  insert into finance.merchant_aliases(
    user_id,merchant_id,raw_name,normalized_alias,source,confidence,times_confirmed,last_confirmed_at
  ) values (
    v_user_id,p_merchant_id,btrim(p_raw_name),v_norm,'user',1,1,now()
  )
  on conflict (user_id,normalized_alias) do update
    set merchant_id=excluded.merchant_id,
        raw_name=excluded.raw_name,
        source='user',
        confidence=1,
        times_confirmed=finance.merchant_aliases.times_confirmed+1,
        last_confirmed_at=now(),
        updated_at=now()
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function finance.resolve_merchant(
  p_raw_name text
)
returns uuid
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_norm text;
  v_id uuid;
begin
  if v_user_id is null then raise exception using errcode='42501', message='authentication required'; end if;
  v_norm := lower(regexp_replace(btrim(coalesce(p_raw_name,'')), '[[:space:]]+', ' ', 'g'));
  if v_norm='' then return null; end if;

  select ma.merchant_id into v_id
  from finance.merchant_aliases ma
  join finance.merchants m on m.id=ma.merchant_id and m.user_id=ma.user_id
  where ma.user_id=v_user_id and ma.normalized_alias=v_norm and not m.is_archived
  limit 1;

  if v_id is not null then return v_id; end if;

  select id into v_id
  from finance.merchants
  where user_id=v_user_id and normalized_name=v_norm and not is_archived
  limit 1;

  return v_id;
end;
$$;

create or replace function finance.create_tag(p_name text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_norm text;
  v_id uuid;
begin
  if v_user_id is null then raise exception using errcode='42501', message='authentication required'; end if;
  v_norm := lower(regexp_replace(btrim(coalesce(p_name,'')), '[[:space:]]+', ' ', 'g'));
  if v_norm='' then raise exception using errcode='23514', message='tag name is required'; end if;

  insert into finance.tags(user_id,name,normalized_name)
  values(v_user_id,btrim(p_name),v_norm)
  on conflict(user_id,normalized_name) do update set name=excluded.name,updated_at=now()
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function finance.assign_tag(
  p_entity_type text,
  p_entity_id uuid,
  p_tag_id uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception using errcode='42501', message='authentication required'; end if;
  if not exists(select 1 from finance.tags where id=p_tag_id and user_id=v_user_id) then
    raise exception using errcode='23503', message='tag not found';
  end if;

  case p_entity_type
    when 'transaction' then
      insert into finance.transaction_tags(user_id,transaction_id,tag_id)
      values(v_user_id,p_entity_id,p_tag_id) on conflict do nothing;
    when 'merchant' then
      insert into finance.merchant_tags(user_id,merchant_id,tag_id)
      values(v_user_id,p_entity_id,p_tag_id) on conflict do nothing;
    when 'product' then
      insert into finance.product_tags(user_id,product_id,tag_id)
      values(v_user_id,p_entity_id,p_tag_id) on conflict do nothing;
    when 'receipt_item' then
      insert into finance.receipt_item_tags(user_id,receipt_item_id,tag_id)
      values(v_user_id,p_entity_id,p_tag_id) on conflict do nothing;
    else
      raise exception using errcode='23514', message='unsupported tag entity type';
  end case;
end;
$$;

create or replace function finance.unassign_tag(
  p_entity_type text,
  p_entity_id uuid,
  p_tag_id uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception using errcode='42501', message='authentication required'; end if;

  case p_entity_type
    when 'transaction' then
      delete from finance.transaction_tags where user_id=v_user_id and transaction_id=p_entity_id and tag_id=p_tag_id;
    when 'merchant' then
      delete from finance.merchant_tags where user_id=v_user_id and merchant_id=p_entity_id and tag_id=p_tag_id;
    when 'product' then
      delete from finance.product_tags where user_id=v_user_id and product_id=p_entity_id and tag_id=p_tag_id;
    when 'receipt_item' then
      delete from finance.receipt_item_tags where user_id=v_user_id and receipt_item_id=p_entity_id and tag_id=p_tag_id;
    else
      raise exception using errcode='23514', message='unsupported tag entity type';
  end case;
end;
$$;

create or replace function finance.create_classification_rule(
  p_name text,
  p_scope text,
  p_condition jsonb,
  p_action jsonb,
  p_priority integer default 1000,
  p_stop_processing boolean default false
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_id uuid := gen_random_uuid();
begin
  if v_user_id is null then raise exception using errcode='42501', message='authentication required'; end if;
  if nullif(btrim(p_name),'') is null then raise exception using errcode='23514', message='rule name is required'; end if;

  insert into finance.classification_rules(
    id,user_id,name,priority,enabled,source,scope,condition,action,stop_processing
  ) values (
    v_id,v_user_id,btrim(p_name),p_priority,true,'user',p_scope,p_condition,p_action,p_stop_processing
  );

  return v_id;
end;
$$;

create or replace function finance.update_classification_rule(
  p_rule_id uuid,
  p_name text,
  p_scope text,
  p_condition jsonb,
  p_action jsonb,
  p_priority integer,
  p_enabled boolean,
  p_stop_processing boolean
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception using errcode='42501', message='authentication required'; end if;
  if nullif(btrim(p_name),'') is null then raise exception using errcode='23514', message='rule name is required'; end if;

  update finance.classification_rules
  set name=btrim(p_name),scope=p_scope,condition=p_condition,action=p_action,
      priority=p_priority,enabled=p_enabled,stop_processing=p_stop_processing,
      source='user'
  where id=p_rule_id and user_id=v_user_id;

  if not found then raise exception using errcode='P0002', message='classification rule not found'; end if;
end;
$$;

create or replace function finance.delete_classification_rule(p_rule_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception using errcode='42501', message='authentication required'; end if;
  delete from finance.classification_rules where id=p_rule_id and user_id=v_user_id;
  if not found then raise exception using errcode='P0002', message='classification rule not found'; end if;
end;
$$;

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
  v_existing_tags jsonb;
  v_action_tags jsonb;
  v_tag text;
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
    select
      v_context || jsonb_build_object(
        'merchant_name',m.name,
        'merchant_group',m.merchant_group
      )
    into v_context
    from finance.merchants m
    where m.id=v_merchant_id and m.user_id=v_user_id and not m.is_archived;
  end if;

  for v_rule in
    select *
    from finance.classification_rules
    where user_id=v_user_id
      and enabled
      and scope in ('all',p_scope)
    order by
      case source
        when 'user' then 10
        when 'learned' then 20
        when 'merchant' then 30
        when 'global' then 40
        when 'ai' then 50
      end,
      priority asc,
      created_at asc,
      id asc
  loop
    if finance_private.rule_condition_matches(v_rule.condition,v_context) then
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
        for v_tag in select jsonb_array_elements_text(v_action_tags)
        loop
          if not (v_tags ? v_tag) then
            v_tags := v_tags || jsonb_build_array(v_tag);
          end if;
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
      select default_necessity::text into v_tag
      from finance.products
      where id=v_product_id and user_id=v_user_id and not is_archived;
      if v_tag is not null and v_tag <> 'unclassified' then
        v_result := v_result || jsonb_build_object('necessity',v_tag);
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
      select default_necessity::text into v_tag
      from finance.merchants
      where id=v_merchant_id and user_id=v_user_id and not is_archived;
      if v_tag is not null and v_tag <> 'unclassified' then
        v_result := v_result || jsonb_build_object('necessity',v_tag);
      end if;
    end if;
  end if;

  if v_result ? 'category_id' and not (v_result ? 'necessity') then
    select necessity_default::text into v_tag
    from finance.categories
    where id=(v_result->>'category_id')::uuid and user_id=v_user_id;
    if v_tag is not null then
      v_result := v_result || jsonb_build_object('necessity',v_tag);
    end if;
  end if;

  if jsonb_array_length(v_tags) > 0 then
    v_result := v_result || jsonb_build_object('tag_ids',v_tags);
  end if;

  return v_result || jsonb_build_object(
    'matched_rule_ids',v_matched,
    'context',v_context
  );
end;
$$;

-- P3 split-level necessity support in the transaction creation service.
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
  v_necessity finance.necessity;
begin
  if v_user_id is null then raise exception using errcode='42501', message='authentication required'; end if;
  if p_amount_minor <= 0 then raise exception using errcode='23514', message='expense amount must be positive'; end if;
  if jsonb_typeof(p_allocations) <> 'array' or jsonb_array_length(p_allocations)=0 then
    raise exception using errcode='23514', message='expense requires at least one category allocation';
  end if;

  select currency_code into v_account_currency
  from finance.accounts
  where id=p_account_id and user_id=v_user_id and not is_archived;
  if not found then raise exception using errcode='P0002', message='active finance account not found'; end if;

  select reporting_currency into v_reporting_currency from finance.profiles where user_id=v_user_id;
  if v_reporting_currency is null then
    perform finance.initialize_user();
    select reporting_currency into v_reporting_currency from finance.profiles where user_id=v_user_id;
  end if;

  if v_account_currency <> v_reporting_currency then
    raise exception using errcode='0A000', message='foreign-currency expense convenience flow requires explicit FX';
  end if;

  if p_merchant_id is not null and not exists(
    select 1 from finance.merchants where id=p_merchant_id and user_id=v_user_id
  ) then raise exception using errcode='23503', message='merchant does not belong to current user'; end if;

  select coalesce(sum((x->>'amount_minor')::bigint),0) into v_sum
  from jsonb_array_elements(p_allocations) x;
  if v_sum <> p_amount_minor then
    raise exception using errcode='23514',
      message=format('expense allocations sum to %s but amount is %s',v_sum,p_amount_minor);
  end if;

  insert into finance.transactions(
    id,user_id,type,status,occurred_at,merchant_id,description,note,source,reporting_currency
  ) values(
    v_tx_id,v_user_id,'expense','draft',p_occurred_at,p_merchant_id,
    nullif(btrim(p_description),''),nullif(btrim(p_note),''),
    'manual',v_reporting_currency
  );

  insert into finance.ledger_entries(
    user_id,transaction_id,entry_kind,account_id,signed_amount_minor,
    currency_code,reporting_amount_minor,necessity
  ) values(
    v_user_id,v_tx_id,'account',p_account_id,-p_amount_minor,
    v_account_currency,-p_amount_minor,null
  );

  for v_item in select * from jsonb_array_elements(p_allocations)
  loop
    v_category_id := (v_item->>'category_id')::uuid;
    v_amount := (v_item->>'amount_minor')::bigint;
    if v_amount <= 0 then raise exception using errcode='23514', message='category allocation must be positive'; end if;

    select kind,necessity_default into v_kind,v_necessity
    from finance.categories
    where id=v_category_id and user_id=v_user_id and not is_archived;

    if not found or v_kind not in ('expense','both') then
      raise exception using errcode='23514', message='expense allocation uses invalid category';
    end if;

    if v_item ? 'necessity' then
      v_necessity := (v_item->>'necessity')::finance.necessity;
    end if;

    insert into finance.ledger_entries(
      user_id,transaction_id,entry_kind,category_id,signed_amount_minor,
      currency_code,reporting_amount_minor,memo,necessity
    ) values(
      v_user_id,v_tx_id,'category',v_category_id,v_amount,
      v_reporting_currency,v_amount,nullif(btrim(v_item->>'memo'),''),v_necessity
    );
  end loop;

  update finance.transactions set status='posted',posted_at=now()
  where id=v_tx_id and user_id=v_user_id;
  return v_tx_id;
end;
$$;

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
  if v_user_id is null then raise exception using errcode='42501', message='authentication required'; end if;
  if p_amount_minor <= 0 then raise exception using errcode='23514', message='income amount must be positive'; end if;
  if jsonb_typeof(p_allocations) <> 'array' or jsonb_array_length(p_allocations)=0 then
    raise exception using errcode='23514', message='income requires at least one category allocation';
  end if;

  select currency_code into v_account_currency from finance.accounts
  where id=p_account_id and user_id=v_user_id and not is_archived;
  if not found then raise exception using errcode='P0002', message='active finance account not found'; end if;

  select reporting_currency into v_reporting_currency from finance.profiles where user_id=v_user_id;
  if v_reporting_currency is null then
    perform finance.initialize_user();
    select reporting_currency into v_reporting_currency from finance.profiles where user_id=v_user_id;
  end if;

  if v_account_currency <> v_reporting_currency then
    raise exception using errcode='0A000', message='foreign-currency income convenience flow requires explicit FX';
  end if;

  select coalesce(sum((x->>'amount_minor')::bigint),0) into v_sum
  from jsonb_array_elements(p_allocations) x;
  if v_sum <> p_amount_minor then raise exception using errcode='23514', message='income allocations do not equal amount'; end if;

  insert into finance.transactions(
    id,user_id,type,status,occurred_at,merchant_id,description,note,source,reporting_currency
  ) values(
    v_tx_id,v_user_id,'income','draft',p_occurred_at,p_merchant_id,
    nullif(btrim(p_description),''),nullif(btrim(p_note),''),
    'manual',v_reporting_currency
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
    if v_amount <= 0 then raise exception using errcode='23514', message='category allocation must be positive'; end if;

    select kind into v_kind from finance.categories
    where id=v_category_id and user_id=v_user_id and not is_archived;
    if not found or v_kind not in ('income','both') then
      raise exception using errcode='23514', message='income allocation uses invalid category';
    end if;

    insert into finance.ledger_entries(
      user_id,transaction_id,entry_kind,category_id,signed_amount_minor,
      currency_code,reporting_amount_minor,memo,necessity
    ) values(
      v_user_id,v_tx_id,'category',v_category_id,-v_amount,
      v_reporting_currency,-v_amount,nullif(btrim(v_item->>'memo'),''),'unclassified'
    );
  end loop;

  update finance.transactions set status='posted',posted_at=now()
  where id=v_tx_id and user_id=v_user_id;
  return v_tx_id;
end;
$$;

-- Re-grant refreshed P2/P3 service functions.
do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='finance'
      and p.proname in (
        'create_category','update_category','archive_category','restore_category',
        'upsert_merchant','add_merchant_alias','resolve_merchant',
        'create_tag','assign_tag','unassign_tag',
        'create_classification_rule','update_classification_rule',
        'delete_classification_rule','resolve_classification',
        'create_expense','create_income'
      )
  loop
    execute format('revoke all on function %s from public, anon',f);
    execute format('grant execute on function %s to authenticated, service_role',f);
  end loop;
end $$;
