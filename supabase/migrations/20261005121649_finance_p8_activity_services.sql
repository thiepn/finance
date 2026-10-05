
create or replace function finance.search_activity(
  p_filters jsonb default '{}'::jsonb,
  p_limit integer default 50,
  p_cursor jsonb default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path=''
as $$
declare
  v_user_id uuid := auth.uid();
  v_limit integer := greatest(1,least(coalesce(p_limit,50),200));
  v_q text;
  v_from timestamptz;
  v_to timestamptz;
  v_min bigint;
  v_max bigint;
  v_account_ids uuid[];
  v_merchant_ids uuid[];
  v_category_ids uuid[];
  v_product_ids uuid[];
  v_tag_ids uuid[];
  v_entity_kinds text[];
  v_transaction_types text[];
  v_transaction_statuses text[];
  v_sources text[];
  v_necessities text[];
  v_receipt_statuses text[];
  v_has_receipt boolean;
  v_has_receipt_set boolean := false;
  v_financial_effect boolean;
  v_financial_effect_set boolean := false;
  v_include_unconfirmed boolean := false;
  v_merchant_name text;
  v_account_name text;
  v_category_name text;
  v_product_name text;
  v_tag_name text;
  v_cursor_at timestamptz;
  v_cursor_kind text;
  v_cursor_id uuid;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception using errcode='42501',message='authentication required';
  end if;

  if p_filters is null then p_filters := '{}'::jsonb; end if;
  if jsonb_typeof(p_filters)<>'object' then
    raise exception using errcode='23514',message='activity filters must be an object';
  end if;

  if exists(
    select 1 from jsonb_object_keys(p_filters) k
    where k not in (
      'q','from','to','amount_min_minor','amount_max_minor',
      'account_ids','merchant_ids','category_ids','product_ids','tag_ids',
      'entity_kinds','transaction_types','transaction_statuses','sources',
      'necessities','receipt_statuses','has_receipt','financial_effect',
      'include_unconfirmed_receipts',
      'merchant_name','account_name','category_name','product_name','tag_name'
    )
  ) then
    raise exception using errcode='23514',message='activity filters contain unsupported fields';
  end if;

  v_q := nullif(lower(btrim(p_filters->>'q')),'');
  v_from := case when nullif(p_filters->>'from','') is null then null else (p_filters->>'from')::timestamptz end;
  v_to := case when nullif(p_filters->>'to','') is null then null else (p_filters->>'to')::timestamptz end;
  v_min := case when p_filters ? 'amount_min_minor' and p_filters->'amount_min_minor'<>'null'::jsonb
    then (p_filters->>'amount_min_minor')::bigint else null end;
  v_max := case when p_filters ? 'amount_max_minor' and p_filters->'amount_max_minor'<>'null'::jsonb
    then (p_filters->>'amount_max_minor')::bigint else null end;

  if v_min is not null and v_min<0 then
    raise exception using errcode='23514',message='minimum amount cannot be negative';
  end if;
  if v_max is not null and v_max<0 then
    raise exception using errcode='23514',message='maximum amount cannot be negative';
  end if;
  if v_min is not null and v_max is not null and v_min>v_max then
    raise exception using errcode='23514',message='minimum amount cannot exceed maximum amount';
  end if;
  if v_from is not null and v_to is not null and v_from>v_to then
    raise exception using errcode='23514',message='activity from date cannot exceed to date';
  end if;

  if p_filters ? 'account_ids' then
    if jsonb_typeof(p_filters->'account_ids')<>'array' then raise exception using errcode='23514',message='account_ids must be an array'; end if;
    select coalesce(array_agg(value::uuid),'{}'::uuid[]) into v_account_ids from jsonb_array_elements_text(p_filters->'account_ids');
  end if;
  if p_filters ? 'merchant_ids' then
    if jsonb_typeof(p_filters->'merchant_ids')<>'array' then raise exception using errcode='23514',message='merchant_ids must be an array'; end if;
    select coalesce(array_agg(value::uuid),'{}'::uuid[]) into v_merchant_ids from jsonb_array_elements_text(p_filters->'merchant_ids');
  end if;
  if p_filters ? 'category_ids' then
    if jsonb_typeof(p_filters->'category_ids')<>'array' then raise exception using errcode='23514',message='category_ids must be an array'; end if;
    select coalesce(array_agg(value::uuid),'{}'::uuid[]) into v_category_ids from jsonb_array_elements_text(p_filters->'category_ids');
  end if;
  if p_filters ? 'product_ids' then
    if jsonb_typeof(p_filters->'product_ids')<>'array' then raise exception using errcode='23514',message='product_ids must be an array'; end if;
    select coalesce(array_agg(value::uuid),'{}'::uuid[]) into v_product_ids from jsonb_array_elements_text(p_filters->'product_ids');
  end if;
  if p_filters ? 'tag_ids' then
    if jsonb_typeof(p_filters->'tag_ids')<>'array' then raise exception using errcode='23514',message='tag_ids must be an array'; end if;
    select coalesce(array_agg(value::uuid),'{}'::uuid[]) into v_tag_ids from jsonb_array_elements_text(p_filters->'tag_ids');
  end if;

  if p_filters ? 'entity_kinds' then
    if jsonb_typeof(p_filters->'entity_kinds')<>'array' then raise exception using errcode='23514',message='entity_kinds must be an array'; end if;
    select coalesce(array_agg(lower(value)),'{}'::text[]) into v_entity_kinds from jsonb_array_elements_text(p_filters->'entity_kinds');
    if exists(select 1 from unnest(v_entity_kinds) x where x not in ('transaction','receipt')) then
      raise exception using errcode='23514',message='invalid activity entity kind';
    end if;
  end if;
  if p_filters ? 'transaction_types' then
    if jsonb_typeof(p_filters->'transaction_types')<>'array' then raise exception using errcode='23514',message='transaction_types must be an array'; end if;
    select coalesce(array_agg(lower(value)),'{}'::text[]) into v_transaction_types from jsonb_array_elements_text(p_filters->'transaction_types');
  end if;
  if p_filters ? 'transaction_statuses' then
    if jsonb_typeof(p_filters->'transaction_statuses')<>'array' then raise exception using errcode='23514',message='transaction_statuses must be an array'; end if;
    select coalesce(array_agg(lower(value)),'{}'::text[]) into v_transaction_statuses from jsonb_array_elements_text(p_filters->'transaction_statuses');
  end if;
  if p_filters ? 'sources' then
    if jsonb_typeof(p_filters->'sources')<>'array' then raise exception using errcode='23514',message='sources must be an array'; end if;
    select coalesce(array_agg(lower(value)),'{}'::text[]) into v_sources from jsonb_array_elements_text(p_filters->'sources');
  end if;
  if p_filters ? 'necessities' then
    if jsonb_typeof(p_filters->'necessities')<>'array' then raise exception using errcode='23514',message='necessities must be an array'; end if;
    select coalesce(array_agg(lower(value)),'{}'::text[]) into v_necessities from jsonb_array_elements_text(p_filters->'necessities');
  end if;
  if p_filters ? 'receipt_statuses' then
    if jsonb_typeof(p_filters->'receipt_statuses')<>'array' then raise exception using errcode='23514',message='receipt_statuses must be an array'; end if;
    select coalesce(array_agg(lower(value)),'{}'::text[]) into v_receipt_statuses from jsonb_array_elements_text(p_filters->'receipt_statuses');
    v_include_unconfirmed := true;
  end if;

  if p_filters ? 'has_receipt' and p_filters->'has_receipt'<>'null'::jsonb then
    v_has_receipt := (p_filters->>'has_receipt')::boolean;
    v_has_receipt_set := true;
  end if;
  if p_filters ? 'financial_effect' and p_filters->'financial_effect'<>'null'::jsonb then
    v_financial_effect := (p_filters->>'financial_effect')::boolean;
    v_financial_effect_set := true;
  end if;
  if p_filters ? 'include_unconfirmed_receipts' and p_filters->'include_unconfirmed_receipts'<>'null'::jsonb then
    v_include_unconfirmed := (p_filters->>'include_unconfirmed_receipts')::boolean;
  end if;

  v_merchant_name := nullif(lower(btrim(p_filters->>'merchant_name')),'');
  v_account_name := nullif(lower(btrim(p_filters->>'account_name')),'');
  v_category_name := nullif(lower(btrim(p_filters->>'category_name')),'');
  v_product_name := nullif(lower(btrim(p_filters->>'product_name')),'');
  v_tag_name := nullif(lower(btrim(p_filters->>'tag_name')),'');

  if p_cursor is not null then
    if jsonb_typeof(p_cursor)<>'object'
       or nullif(p_cursor->>'occurred_at','') is null
       or nullif(p_cursor->>'entity_kind','') is null
       or nullif(p_cursor->>'id','') is null then
      raise exception using errcode='23514',message='invalid activity cursor';
    end if;
    v_cursor_at := (p_cursor->>'occurred_at')::timestamptz;
    v_cursor_kind := p_cursor->>'entity_kind';
    v_cursor_id := (p_cursor->>'id')::uuid;
  end if;

  with activity as (
    select * from finance.activity_transactions
    union all
    select * from finance.activity_receipts
  ),
  filtered as (
    select a.*
    from activity a
    where a.user_id=v_user_id
      and (
        a.entity_kind='transaction'
        or a.financial_effect
        or v_include_unconfirmed
      )
      and (v_entity_kinds is null or a.entity_kind=any(v_entity_kinds))
      and (v_from is null or a.occurred_at>=v_from)
      and (v_to is null or a.occurred_at<=v_to)
      and (v_min is null or a.amount_minor>=v_min)
      and (v_max is null or a.amount_minor<=v_max)
      and (v_account_ids is null or a.account_ids && v_account_ids)
      and (v_merchant_ids is null or a.merchant_id=any(v_merchant_ids))
      and (v_category_ids is null or a.category_ids && v_category_ids)
      and (v_product_ids is null or a.product_ids && v_product_ids)
      and (v_tag_ids is null or a.tag_ids && v_tag_ids)
      and (v_transaction_types is null or (
        a.entity_kind='transaction' and a.transaction_type=any(v_transaction_types)
      ))
      and (v_transaction_statuses is null or (
        a.entity_kind='transaction' and a.status=any(v_transaction_statuses)
      ))
      and (v_sources is null or a.source=any(v_sources))
      and (v_necessities is null or a.necessities && v_necessities)
      and (v_receipt_statuses is null or a.receipt_statuses && v_receipt_statuses)
      and (not v_has_receipt_set or a.has_receipt=v_has_receipt)
      and (not v_financial_effect_set or a.financial_effect=v_financial_effect)
      and (v_merchant_name is null or strpos(lower(coalesce(a.merchant_name,'')),v_merchant_name)>0)
      and (v_account_name is null or exists(
        select 1 from unnest(a.account_names) n
        where strpos(lower(n),v_account_name)>0
      ))
      and (v_category_name is null or exists(
        select 1 from unnest(a.category_names) n
        where strpos(lower(n),v_category_name)>0
      ))
      and (v_product_name is null or exists(
        select 1 from unnest(a.product_names) n
        where strpos(lower(n),v_product_name)>0
      ))
      and (v_tag_name is null or exists(
        select 1 from unnest(a.tag_names) n
        where strpos(lower(n),v_tag_name)>0
      ))
      and (v_q is null or not exists(
        select 1
        from unnest(regexp_split_to_array(v_q,'\s+')) token
        where token<>'' and strpos(a.search_text,token)=0
      ))
      and (
        v_cursor_at is null
        or (a.occurred_at,a.entity_kind,a.id)
           < (v_cursor_at,v_cursor_kind,v_cursor_id)
      )
  ),
  numbered as (
    select
      f.*,
      row_number() over(
        order by f.occurred_at desc,f.entity_kind desc,f.id desc
      ) as rn
    from filtered f
    order by f.occurred_at desc,f.entity_kind desc,f.id desc
    limit v_limit+1
  ),
  page as (
    select * from numbered where rn<=v_limit
  ),
  meta as (
    select count(*)>v_limit as has_more from numbered
  )
  select jsonb_build_object(
    'items',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',p.id,
          'entity_kind',p.entity_kind,
          'occurred_at',p.occurred_at,
          'transaction_id',p.transaction_id,
          'receipt_id',p.receipt_id,
          'transaction_type',p.transaction_type,
          'status',p.status,
          'source',p.source,
          'merchant_id',p.merchant_id,
          'merchant_name',p.merchant_name,
          'title',p.title,
          'description',p.description,
          'note',p.note,
          'currency_code',p.currency_code,
          'amount_minor',p.amount_minor,
          'financial_effect',p.financial_effect,
          'has_receipt',p.has_receipt,
          'receipt_statuses',p.receipt_statuses,
          'accounts',p.accounts,
          'categories',p.categories,
          'product_ids',p.product_ids,
          'product_names',p.product_names,
          'tag_ids',p.tag_ids,
          'tag_names',p.tag_names,
          'receipt_ids',p.receipt_ids,
          'receipt_count',p.receipt_count,
          'item_count',p.item_count
        )
        order by p.occurred_at desc,p.entity_kind desc,p.id desc
      )
      from page p
    ),'[]'::jsonb),
    'next_cursor',case
      when (select has_more from meta) then (
        select jsonb_build_object(
          'occurred_at',p.occurred_at,
          'entity_kind',p.entity_kind,
          'id',p.id
        )
        from page p
        order by p.rn desc
        limit 1
      )
      else null
    end,
    'has_more',(select has_more from meta)
  )
  into v_result;

  return v_result;
end;
$$;

create or replace function finance.get_activity_filter_catalog(
  p_product_query text default null,
  p_product_limit integer default 50
)
returns jsonb
language sql
stable
security invoker
set search_path=''
as $$
  select jsonb_build_object(
    'accounts',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',a.id,'name',a.name,'kind',a.kind,'currency_code',a.currency_code,
        'is_archived',a.is_archived
      ) order by a.is_archived,a.sort_order,a.name)
      from finance.accounts a
      where not a.is_archived
    ),'[]'::jsonb),
    'merchants',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',m.id,'name',m.name,'merchant_group',m.merchant_group
      ) order by m.name)
      from finance.merchants m
      where not m.is_archived
    ),'[]'::jsonb),
    'categories',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',c.id,'parent_id',c.parent_id,'name',c.name,'kind',c.kind,
        'necessity_default',c.necessity_default,'system_key',c.system_key
      ) order by c.sort_order,c.name)
      from finance.categories c
      where not c.is_archived
    ),'[]'::jsonb),
    'tags',coalesce((
      select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name) order by t.name)
      from finance.tags t
    ),'[]'::jsonb),
    'products',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',x.id,'name',x.name,'brand',x.brand,'family_id',x.family_id,
        'family_name',x.family_name,'size_value',x.size_value,'size_unit',x.size_unit,
        'last_seen_at',x.last_seen_at
      ) order by x.last_seen_at desc nulls last,x.name)
      from (
        select p.*
        from finance.products p
        where not p.is_archived
          and (
            nullif(lower(btrim(p_product_query)),'') is null
            or strpos(lower(p.name),lower(btrim(p_product_query)))>0
            or strpos(lower(coalesce(p.brand,'')),lower(btrim(p_product_query)))>0
            or strpos(lower(coalesce(p.family_name,'')),lower(btrim(p_product_query)))>0
          )
        order by p.last_seen_at desc nulls last,p.name
        limit greatest(1,least(coalesce(p_product_limit,50),200))
      ) x
    ),'[]'::jsonb)
  );
$$;

create or replace function finance.get_activity_detail(
  p_entity_kind text,
  p_entity_id uuid
)
returns jsonb
language plpgsql
stable
security invoker
set search_path=''
as $$
declare
  v_user_id uuid := auth.uid();
  v_kind text := lower(btrim(p_entity_kind));
  v_base jsonb;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception using errcode='42501',message='authentication required';
  end if;

  if v_kind='transaction' then
    select to_jsonb(a)-'search_text'-'user_id'
    into v_base
    from finance.activity_transactions a
    where a.id=p_entity_id and a.user_id=v_user_id;

    if v_base is null then
      raise exception using errcode='P0002',message='transaction activity not found';
    end if;

    select jsonb_build_object(
      'entity_kind','transaction',
      'activity',v_base,
      'ledger_entries',coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',le.id,
          'entry_kind',le.entry_kind,
          'account_id',le.account_id,
          'account_name',a.name,
          'category_id',le.category_id,
          'category_name',c.name,
          'system_code',le.system_code,
          'signed_amount_minor',le.signed_amount_minor,
          'currency_code',le.currency_code,
          'reporting_amount_minor',le.reporting_amount_minor,
          'exchange_rate',le.exchange_rate,
          'necessity',le.necessity,
          'memo',le.memo
        ) order by le.entry_kind,le.created_at,le.id)
        from finance.ledger_entries le
        left join finance.accounts a
          on a.id=le.account_id and a.user_id=le.user_id
        left join finance.categories c
          on c.id=le.category_id and c.user_id=le.user_id
        where le.transaction_id=p_entity_id and le.user_id=v_user_id
      ),'[]'::jsonb),
      'tags',coalesce((
        select jsonb_agg(jsonb_build_object('id',tg.id,'name',tg.name) order by tg.name)
        from finance.transaction_tags tt
        join finance.tags tg on tg.id=tt.tag_id and tg.user_id=tt.user_id
        where tt.transaction_id=p_entity_id and tt.user_id=v_user_id
      ),'[]'::jsonb),
      'receipt_matches',coalesce((
        select jsonb_agg(jsonb_build_object(
          'match_id',rtm.id,
          'status',rtm.status,
          'matched_amount_minor',rtm.matched_amount_minor,
          'confidence',rtm.confidence,
          'reason',rtm.reason,
          'confirmed_at',rtm.confirmed_at,
          'receipt_id',r.id,
          'receipt',finance.get_receipt_review(r.id)
        ) order by
          case rtm.status when 'confirmed' then 0 when 'suggested' then 1 else 2 end,
          r.purchased_at desc nulls last,r.id
        )
        from finance.receipt_transaction_matches rtm
        join finance.receipts r
          on r.id=rtm.receipt_id and r.user_id=rtm.user_id
        where rtm.transaction_id=p_entity_id and rtm.user_id=v_user_id
      ),'[]'::jsonb),
      'related_transaction',(
        select case when rel.id is null then null else jsonb_build_object(
          'id',rel.id,
          'type',rel.type,
          'status',rel.status,
          'occurred_at',rel.occurred_at,
          'description',rel.description,
          'relation_kind',t.relation_kind
        ) end
        from finance.transactions t
        left join finance.transactions rel
          on rel.id=t.related_transaction_id and rel.user_id=t.user_id
        where t.id=p_entity_id and t.user_id=v_user_id
      )
    )
    into v_result;

    return v_result;
  elsif v_kind='receipt' then
    if not exists(
      select 1 from finance.receipts
      where id=p_entity_id and user_id=v_user_id
    ) then
      raise exception using errcode='P0002',message='receipt activity not found';
    end if;

    return jsonb_build_object(
      'entity_kind','receipt',
      'receipt',finance.get_receipt_review(p_entity_id),
      'transaction_matches',coalesce((
        select jsonb_agg(jsonb_build_object(
          'match_id',rtm.id,
          'status',rtm.status,
          'matched_amount_minor',rtm.matched_amount_minor,
          'confidence',rtm.confidence,
          'reason',rtm.reason,
          'confirmed_at',rtm.confirmed_at,
          'transaction_id',t.id,
          'transaction_type',t.type,
          'transaction_status',t.status,
          'occurred_at',t.occurred_at,
          'description',t.description,
          'merchant_id',t.merchant_id,
          'amount_minor',ts.display_amount_minor,
          'currency_code',t.reporting_currency
        ) order by
          case rtm.status when 'confirmed' then 0 when 'suggested' then 1 else 2 end,
          t.occurred_at desc,t.id
        )
        from finance.receipt_transaction_matches rtm
        join finance.transactions t
          on t.id=rtm.transaction_id and t.user_id=rtm.user_id
        join finance.transaction_summary ts
          on ts.id=t.id and ts.user_id=t.user_id
        where rtm.receipt_id=p_entity_id and rtm.user_id=v_user_id
      ),'[]'::jsonb)
    );
  else
    raise exception using errcode='23514',message='activity entity kind must be transaction or receipt';
  end if;
end;
$$;

do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='finance'
      and p.proname in (
        'search_activity','get_activity_filter_catalog','get_activity_detail'
      )
  loop
    execute format('revoke all on function %s from public,anon',f);
    execute format('grant execute on function %s to authenticated,service_role',f);
  end loop;
end $$;
