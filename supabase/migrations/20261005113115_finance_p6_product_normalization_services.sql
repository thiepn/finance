
create or replace function finance.normalize_product_text(p_text text)
returns text
language sql
immutable
security invoker
set search_path=''
as $$
  select nullif(
    regexp_replace(
      lower(regexp_replace(btrim(coalesce(p_text,'')),'[^[:alnum:]]+',' ','g')),
      '\s+',' ','g'
    ),
    ''
  );
$$;

create or replace function finance.canonical_product_size(
  p_value numeric,
  p_unit text
)
returns jsonb
language plpgsql
immutable
security invoker
set search_path=''
as $$
declare
  v_unit text := lower(btrim(coalesce(p_unit,'')));
begin
  if p_value is null then
    return jsonb_build_object('value',null,'unit',null);
  end if;
  if p_value < 0 then
    raise exception using errcode='23514',message='product size cannot be negative';
  end if;

  return case
    when v_unit in ('kg','kilogram','kilograms','kilogramm')
      then jsonb_build_object('value',p_value*1000,'unit','g')
    when v_unit in ('g','gr','gram','grams','gramm')
      then jsonb_build_object('value',p_value,'unit','g')
    when v_unit in ('l','liter','litre','liters','litres')
      then jsonb_build_object('value',p_value*1000,'unit','ml')
    when v_unit in ('cl')
      then jsonb_build_object('value',p_value*10,'unit','ml')
    when v_unit in ('ml','milliliter','millilitre')
      then jsonb_build_object('value',p_value,'unit','ml')
    when v_unit in ('stk','stück','stueck','pc','pcs','piece','pieces','count','ct')
      then jsonb_build_object('value',p_value,'unit','count')
    when v_unit=''
      then jsonb_build_object('value',p_value,'unit',null)
    else jsonb_build_object('value',p_value,'unit',v_unit)
  end;
end;
$$;

create or replace function finance.upsert_product_family(
  p_name text,
  p_brand text default null,
  p_product_type text default null,
  p_default_category_id uuid default null,
  p_default_necessity finance.necessity default 'unclassified',
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_user_id uuid := auth.uid();
  v_name text := nullif(btrim(p_name),'');
  v_norm text;
  v_brand text := nullif(btrim(p_brand),'');
  v_brand_norm text;
  v_id uuid;
begin
  if v_user_id is null then raise exception using errcode='42501',message='authentication required'; end if;
  if v_name is null then raise exception using errcode='23514',message='family name is required'; end if;
  if p_metadata is null or jsonb_typeof(p_metadata)<>'object' then
    raise exception using errcode='23514',message='family metadata must be an object';
  end if;

  v_norm := finance.normalize_product_text(v_name);
  v_brand_norm := finance.normalize_product_text(v_brand);

  if p_default_category_id is not null and not exists(
    select 1 from finance.categories
    where id=p_default_category_id and user_id=v_user_id and not is_archived
  ) then raise exception using errcode='23503',message='default category not found'; end if;

  select id into v_id
  from finance.product_families
  where user_id=v_user_id and normalized_name=v_norm
    and coalesce(normalized_brand,'')=coalesce(v_brand_norm,'')
    and not is_archived
  order by created_at,id
  limit 1;

  if v_id is null then
    insert into finance.product_families(
      user_id,name,normalized_name,brand,normalized_brand,product_type,
      default_category_id,default_necessity,metadata
    ) values(
      v_user_id,v_name,v_norm,v_brand,v_brand_norm,nullif(btrim(p_product_type),''),
      p_default_category_id,p_default_necessity,p_metadata
    )
    returning id into v_id;
  else
    update finance.product_families
    set name=v_name,
        brand=coalesce(v_brand,brand),
        normalized_brand=coalesce(v_brand_norm,normalized_brand),
        product_type=coalesce(nullif(btrim(p_product_type),''),product_type),
        default_category_id=coalesce(p_default_category_id,default_category_id),
        default_necessity=case
          when p_default_necessity<>'unclassified' then p_default_necessity
          else default_necessity
        end,
        metadata=metadata||p_metadata
    where id=v_id and user_id=v_user_id;
  end if;

  return v_id;
end;
$$;

create or replace function finance.upsert_product(
  p_name text,
  p_brand text default null,
  p_family_id uuid default null,
  p_variant_name text default null,
  p_product_type text default null,
  p_barcode text default null,
  p_size_value numeric default null,
  p_size_unit text default null,
  p_default_category_id uuid default null,
  p_default_necessity finance.necessity default 'unclassified',
  p_source finance.rule_source default 'learned',
  p_confidence numeric default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_user_id uuid := auth.uid();
  v_name text := nullif(btrim(p_name),'');
  v_norm text;
  v_brand text := nullif(btrim(p_brand),'');
  v_brand_norm text;
  v_barcode text := nullif(regexp_replace(coalesce(p_barcode,''),'\s+','','g'),'');
  v_size jsonb;
  v_size_value numeric;
  v_size_unit text;
  v_id uuid;
  v_existing_source finance.rule_source;
  v_new_rank integer;
  v_old_rank integer;
begin
  if v_user_id is null then raise exception using errcode='42501',message='authentication required'; end if;
  if v_name is null then raise exception using errcode='23514',message='product name is required'; end if;
  if p_confidence is not null and (p_confidence<0 or p_confidence>1) then
    raise exception using errcode='23514',message='product confidence out of range';
  end if;
  if p_metadata is null or jsonb_typeof(p_metadata)<>'object' then
    raise exception using errcode='23514',message='product metadata must be an object';
  end if;

  v_norm := finance.normalize_product_text(v_name);
  v_brand_norm := finance.normalize_product_text(v_brand);
  v_size := finance.canonical_product_size(p_size_value,p_size_unit);
  v_size_value := nullif(v_size->>'value','')::numeric;
  v_size_unit := nullif(v_size->>'unit','');

  if p_family_id is not null and not exists(
    select 1 from finance.product_families
    where id=p_family_id and user_id=v_user_id and not is_archived
  ) then raise exception using errcode='23503',message='product family not found'; end if;

  if p_default_category_id is not null and not exists(
    select 1 from finance.categories
    where id=p_default_category_id and user_id=v_user_id and not is_archived
  ) then raise exception using errcode='23503',message='default category not found'; end if;

  if v_barcode is not null then
    select id,source into v_id,v_existing_source
    from finance.products
    where user_id=v_user_id and barcode=v_barcode and not is_archived
    order by created_at,id limit 1;
  end if;

  if v_id is null then
    select id,source into v_id,v_existing_source
    from finance.products
    where user_id=v_user_id and normalized_name=v_norm and not is_archived
    order by created_at,id limit 1;
  end if;

  if v_id is null then
    insert into finance.products(
      user_id,name,normalized_name,brand,normalized_brand,family_id,variant_name,
      product_type,barcode,size_value,size_unit,default_category_id,
      default_necessity,source,confidence,metadata
    ) values(
      v_user_id,v_name,v_norm,v_brand,v_brand_norm,p_family_id,
      nullif(btrim(p_variant_name),''),nullif(btrim(p_product_type),''),
      v_barcode,v_size_value,v_size_unit,p_default_category_id,
      p_default_necessity,p_source,p_confidence,p_metadata
    )
    returning id into v_id;
  else
    v_new_rank := case p_source
      when 'user' then 10 when 'learned' then 20 when 'merchant' then 30
      when 'global' then 40 when 'ai' then 50 end;
    v_old_rank := case v_existing_source
      when 'user' then 10 when 'learned' then 20 when 'merchant' then 30
      when 'global' then 40 when 'ai' then 50 end;

    update finance.products
    set name=case when v_new_rank<=v_old_rank then v_name else name end,
        normalized_name=case when v_new_rank<=v_old_rank then v_norm else normalized_name end,
        brand=case when v_new_rank<=v_old_rank and v_brand is not null then v_brand else brand end,
        normalized_brand=case when v_new_rank<=v_old_rank and v_brand_norm is not null then v_brand_norm else normalized_brand end,
        family_id=case when v_new_rank<=v_old_rank and p_family_id is not null then p_family_id else family_id end,
        variant_name=case when v_new_rank<=v_old_rank and nullif(btrim(p_variant_name),'') is not null then btrim(p_variant_name) else variant_name end,
        product_type=case when v_new_rank<=v_old_rank and nullif(btrim(p_product_type),'') is not null then btrim(p_product_type) else product_type end,
        barcode=coalesce(v_barcode,barcode),
        size_value=case when v_new_rank<=v_old_rank and v_size_value is not null then v_size_value else size_value end,
        size_unit=case when v_new_rank<=v_old_rank and v_size_unit is not null then v_size_unit else size_unit end,
        default_category_id=case when v_new_rank<=v_old_rank and p_default_category_id is not null then p_default_category_id else default_category_id end,
        default_necessity=case when v_new_rank<=v_old_rank and p_default_necessity<>'unclassified' then p_default_necessity else default_necessity end,
        source=case when v_new_rank<=v_old_rank then p_source else source end,
        confidence=case when v_new_rank<=v_old_rank and p_confidence is not null then p_confidence else confidence end,
        metadata=metadata||p_metadata
    where id=v_id and user_id=v_user_id;
  end if;

  return v_id;
end;
$$;

create or replace function finance.add_product_alias(
  p_product_id uuid,
  p_raw_alias text,
  p_merchant_id uuid default null,
  p_source finance.rule_source default 'learned',
  p_confidence numeric default null,
  p_confirm boolean default false
)
returns uuid
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_user_id uuid := auth.uid();
  v_raw text := nullif(btrim(p_raw_alias),'');
  v_norm text;
  v_id uuid;
  v_existing_product uuid;
  v_existing_source finance.rule_source;
  v_new_rank integer;
  v_old_rank integer;
begin
  if v_user_id is null then raise exception using errcode='42501',message='authentication required'; end if;
  if v_raw is null then raise exception using errcode='23514',message='product alias is required'; end if;
  if p_confidence is not null and (p_confidence<0 or p_confidence>1) then
    raise exception using errcode='23514',message='alias confidence out of range';
  end if;
  if not exists(
    select 1 from finance.products
    where id=p_product_id and user_id=v_user_id and not is_archived
  ) then raise exception using errcode='23503',message='product not found'; end if;
  if p_merchant_id is not null and not exists(
    select 1 from finance.merchants
    where id=p_merchant_id and user_id=v_user_id and not is_archived
  ) then raise exception using errcode='23503',message='merchant not found'; end if;

  v_norm := finance.normalize_product_text(v_raw);

  select id,product_id,source
  into v_id,v_existing_product,v_existing_source
  from finance.product_aliases
  where user_id=v_user_id
    and normalized_alias=v_norm
    and is_active
    and (
      (p_merchant_id is null and merchant_id is null)
      or merchant_id=p_merchant_id
    )
  order by created_at,id
  limit 1;

  if v_id is null then
    insert into finance.product_aliases(
      user_id,product_id,merchant_id,raw_alias,normalized_alias,
      source,confidence,times_confirmed,last_confirmed_at
    ) values(
      v_user_id,p_product_id,p_merchant_id,v_raw,v_norm,p_source,p_confidence,
      case when p_confirm then 1 else 0 end,
      case when p_confirm then now() else null end
    )
    returning id into v_id;
  else
    v_new_rank := case p_source
      when 'user' then 10 when 'learned' then 20 when 'merchant' then 30
      when 'global' then 40 when 'ai' then 50 end;
    v_old_rank := case v_existing_source
      when 'user' then 10 when 'learned' then 20 when 'merchant' then 30
      when 'global' then 40 when 'ai' then 50 end;

    if v_existing_product<>p_product_id and v_new_rank>v_old_rank then
      return v_id;
    end if;

    update finance.product_aliases
    set product_id=case when v_new_rank<=v_old_rank then p_product_id else product_id end,
        raw_alias=case when v_new_rank<=v_old_rank then v_raw else raw_alias end,
        source=case when v_new_rank<=v_old_rank then p_source else source end,
        confidence=case
          when v_new_rank<=v_old_rank and p_confidence is not null then p_confidence
          else confidence
        end,
        times_confirmed=times_confirmed+case when p_confirm then 1 else 0 end,
        last_confirmed_at=case when p_confirm then now() else last_confirmed_at end
    where id=v_id and user_id=v_user_id;
  end if;

  return v_id;
end;
$$;

create or replace function finance.resolve_product_alias(
  p_raw_name text,
  p_merchant_id uuid default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path=''
as $$
declare
  v_user_id uuid := auth.uid();
  v_norm text;
  v_alias record;
  v_product finance.products%rowtype;
begin
  if v_user_id is null then raise exception using errcode='42501',message='authentication required'; end if;
  v_norm := finance.normalize_product_text(p_raw_name);
  if v_norm is null then return null; end if;

  if p_merchant_id is not null then
    select pa.* into v_alias
    from finance.product_aliases pa
    join finance.products p on p.id=pa.product_id and p.user_id=pa.user_id
    where pa.user_id=v_user_id and pa.merchant_id=p_merchant_id
      and pa.normalized_alias=v_norm and pa.is_active and not p.is_archived
    order by
      case pa.source
        when 'user' then 10 when 'learned' then 20 when 'merchant' then 30
        when 'global' then 40 when 'ai' then 50 end,
      pa.times_confirmed desc,pa.created_at,pa.id
    limit 1;
  end if;

  if v_alias.id is null then
    select pa.* into v_alias
    from finance.product_aliases pa
    join finance.products p on p.id=pa.product_id and p.user_id=pa.user_id
    where pa.user_id=v_user_id and pa.merchant_id is null
      and pa.normalized_alias=v_norm and pa.is_active and not p.is_archived
    order by
      case pa.source
        when 'user' then 10 when 'learned' then 20 when 'merchant' then 30
        when 'global' then 40 when 'ai' then 50 end,
      pa.times_confirmed desc,pa.created_at,pa.id
    limit 1;
  end if;

  if v_alias.id is not null then
    select * into v_product from finance.products
    where id=v_alias.product_id and user_id=v_user_id;

    return jsonb_build_object(
      'product_id',v_product.id,
      'product_name',v_product.name,
      'family_id',v_product.family_id,
      'alias_id',v_alias.id,
      'match_type',case when v_alias.merchant_id is null then 'global_alias' else 'merchant_alias' end,
      'source',v_alias.source,
      'confidence',coalesce(v_alias.confidence,0.95),
      'normalized_input',v_norm
    );
  end if;

  select * into v_product
  from finance.products
  where user_id=v_user_id and normalized_name=v_norm and not is_archived
  order by
    case source
      when 'user' then 10 when 'learned' then 20 when 'merchant' then 30
      when 'global' then 40 when 'ai' then 50 end,
    created_at,id
  limit 1;

  if v_product.id is not null then
    return jsonb_build_object(
      'product_id',v_product.id,
      'product_name',v_product.name,
      'family_id',v_product.family_id,
      'alias_id',null,
      'match_type','canonical_name',
      'source',v_product.source,
      'confidence',coalesce(v_product.confidence,0.90),
      'normalized_input',v_norm
    );
  end if;

  return jsonb_build_object(
    'product_id',null,
    'alias_id',null,
    'match_type','none',
    'source',null,
    'confidence',null,
    'normalized_input',v_norm
  );
end;
$$;

create or replace function finance.apply_receipt_item_product(
  p_receipt_item_id uuid,
  p_product_id uuid,
  p_source finance.rule_source,
  p_confidence numeric,
  p_normalization_version text,
  p_alias_id uuid default null,
  p_learn_alias boolean default false,
  p_user_corrected boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_user_id uuid := auth.uid();
  v_item finance.receipt_items%rowtype;
  v_product finance.products%rowtype;
  v_receipt finance.receipts%rowtype;
  v_previous_product_id uuid;
  v_alias_id uuid := p_alias_id;
  v_resolution jsonb;
  v_category_id uuid;
  v_necessity finance.necessity;
  v_effective_unit bigint;
  v_observed_at timestamptz;
  v_status finance.product_normalization_status;
  v_norm_review boolean;
  v_tags jsonb;
  v_tag text;
begin
  if v_user_id is null then raise exception using errcode='42501',message='authentication required'; end if;
  if p_confidence is not null and (p_confidence<0 or p_confidence>1) then
    raise exception using errcode='23514',message='normalization confidence out of range';
  end if;
  if nullif(btrim(p_normalization_version),'') is null then
    raise exception using errcode='23514',message='normalization version is required';
  end if;

  select * into v_item from finance.receipt_items
  where id=p_receipt_item_id and user_id=v_user_id
  for update;
  if not found then raise exception using errcode='P0002',message='receipt item not found'; end if;

  select * into v_product from finance.products
  where id=p_product_id and user_id=v_user_id and not is_archived;
  if not found then raise exception using errcode='P0002',message='product not found'; end if;

  select * into v_receipt from finance.receipts
  where id=v_item.receipt_id and user_id=v_user_id;

  if p_alias_id is not null and not exists(
    select 1 from finance.product_aliases
    where id=p_alias_id and user_id=v_user_id and product_id=p_product_id and is_active
  ) then raise exception using errcode='23503',message='product alias does not match product'; end if;

  v_previous_product_id := v_item.product_id;
  v_norm_review := (p_confidence is null or p_confidence<0.85) and not p_user_corrected;
  v_status := case
    when p_user_corrected then 'corrected'::finance.product_normalization_status
    else 'matched'::finance.product_normalization_status
  end;

  v_resolution := finance.resolve_classification(
    'receipt_item',
    jsonb_build_object(
      'merchant_id',v_receipt.merchant_id,
      'raw_name',v_item.raw_name,
      'normalized_name',v_product.name,
      'product_id',v_product.id,
      'amount_minor',v_item.effective_total_minor
    )
  );

  v_category_id := coalesce(
    v_item.category_id,
    nullif(v_resolution->>'category_id','')::uuid,
    v_product.default_category_id
  );
  v_necessity := case
    when v_item.necessity<>'unclassified' then v_item.necessity
    when nullif(v_resolution->>'necessity','') is not null
      then (v_resolution->>'necessity')::finance.necessity
    when v_product.default_necessity<>'unclassified' then v_product.default_necessity
    else 'unclassified'::finance.necessity
  end;

  update finance.receipt_items
  set product_id=v_product.id,
      normalized_name=v_product.name,
      category_id=v_category_id,
      necessity=v_necessity,
      normalization_status=v_status,
      normalization_source=p_source,
      normalization_confidence=case when p_user_corrected then 1 else p_confidence end,
      normalization_version=btrim(p_normalization_version),
      normalization_review_required=v_norm_review,
      normalized_at=now(),
      user_corrected=p_user_corrected
  where id=v_item.id and user_id=v_user_id;

  if p_learn_alias then
    v_alias_id := finance.add_product_alias(
      v_product.id,
      v_item.raw_name,
      v_receipt.merchant_id,
      case when p_user_corrected then 'user'::finance.rule_source else p_source end,
      case when p_user_corrected then 1 else p_confidence end,
      p_user_corrected
    );
  end if;

  if v_alias_id is not null then
    update finance.product_aliases
    set use_count=use_count+1,last_used_at=now()
    where id=v_alias_id and user_id=v_user_id;
  end if;

  v_observed_at := coalesce(v_receipt.purchased_at,v_receipt.capture_finalized_at,v_receipt.created_at);

  if v_item.quantity>0 and (v_item.line_total_minor-v_item.discount_minor)>=0 then
    v_effective_unit := round(
      (v_item.line_total_minor-v_item.discount_minor)::numeric / v_item.quantity
    )::bigint;

    insert into finance.product_prices(
      user_id,product_id,merchant_id,receipt_item_id,observed_at,currency_code,
      list_unit_price_minor,effective_unit_price_minor,quantity
    ) values(
      v_user_id,v_product.id,v_receipt.merchant_id,v_item.id,v_observed_at,
      v_receipt.currency_code,v_item.unit_price_minor,v_effective_unit,v_item.quantity
    )
    on conflict(user_id,receipt_item_id) where receipt_item_id is not null
    do update set
      product_id=excluded.product_id,
      merchant_id=excluded.merchant_id,
      observed_at=excluded.observed_at,
      currency_code=excluded.currency_code,
      list_unit_price_minor=excluded.list_unit_price_minor,
      effective_unit_price_minor=excluded.effective_unit_price_minor,
      quantity=excluded.quantity;
  end if;

  update finance.products
  set first_seen_at=least(coalesce(first_seen_at,v_observed_at),v_observed_at),
      last_seen_at=greatest(coalesce(last_seen_at,v_observed_at),v_observed_at)
  where id=v_product.id and user_id=v_user_id;

  if v_resolution ? 'tag_ids' then
    v_tags := v_resolution->'tag_ids';
    for v_tag in select jsonb_array_elements_text(v_tags)
    loop
      perform finance.assign_tag('receipt_item',v_item.id,v_tag::uuid);
    end loop;
  end if;

  insert into finance.product_normalization_events(
    user_id,receipt_item_id,previous_product_id,product_id,alias_id,source,status,
    confidence,normalization_version,user_corrected,metadata
  ) values(
    v_user_id,v_item.id,v_previous_product_id,v_product.id,v_alias_id,
    case when p_user_corrected then 'user'::finance.rule_source else p_source end,
    v_status,case when p_user_corrected then 1 else p_confidence end,
    btrim(p_normalization_version),p_user_corrected,
    jsonb_build_object(
      'classification_rule_ids',coalesce(v_resolution->'matched_rule_ids','[]'::jsonb),
      'category_id',v_category_id,
      'necessity',v_necessity
    )
  );

  return jsonb_build_object(
    'receipt_item_id',v_item.id,
    'product_id',v_product.id,
    'product_name',v_product.name,
    'family_id',v_product.family_id,
    'alias_id',v_alias_id,
    'normalization_status',v_status,
    'normalization_review_required',v_norm_review,
    'category_id',v_category_id,
    'necessity',v_necessity
  );
end;
$$;

create or replace function finance.normalize_receipt_item_by_alias(
  p_receipt_item_id uuid,
  p_normalization_version text default 'alias-1'
)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_user_id uuid := auth.uid();
  v_item finance.receipt_items%rowtype;
  v_merchant_id uuid;
  v_match jsonb;
  v_product_id uuid;
  v_alias_id uuid;
  v_source finance.rule_source;
  v_conf numeric;
begin
  if v_user_id is null then raise exception using errcode='42501',message='authentication required'; end if;

  select ri.* into v_item
  from finance.receipt_items ri
  where ri.id=p_receipt_item_id and ri.user_id=v_user_id;
  if not found then raise exception using errcode='P0002',message='receipt item not found'; end if;

  select merchant_id into v_merchant_id
  from finance.receipts
  where id=v_item.receipt_id and user_id=v_user_id;

  v_match := finance.resolve_product_alias(v_item.raw_name,v_merchant_id);
  v_product_id := nullif(v_match->>'product_id','')::uuid;

  if v_product_id is null then
    update finance.receipt_items
    set normalization_status='review_required',
        normalization_review_required=true,
        normalization_version=btrim(p_normalization_version),
        normalized_at=now()
    where id=v_item.id and user_id=v_user_id;

    return v_match||jsonb_build_object(
      'receipt_item_id',v_item.id,
      'normalization_status','review_required'
    );
  end if;

  v_alias_id := nullif(v_match->>'alias_id','')::uuid;
  v_source := coalesce(nullif(v_match->>'source','')::finance.rule_source,'learned');
  v_conf := nullif(v_match->>'confidence','')::numeric;

  return finance.apply_receipt_item_product(
    v_item.id,v_product_id,v_source,v_conf,p_normalization_version,
    v_alias_id,false,false
  )||jsonb_build_object('match_type',v_match->>'match_type');
end;
$$;

create or replace function finance.correct_receipt_item_product(
  p_receipt_item_id uuid,
  p_product_id uuid,
  p_learn_merchant_alias boolean default true,
  p_normalization_version text default 'user-correction-1'
)
returns jsonb
language sql
security invoker
set search_path=''
as $$
  select finance.apply_receipt_item_product(
    p_receipt_item_id,p_product_id,'user'::finance.rule_source,1,
    p_normalization_version,null,p_learn_merchant_alias,true
  );
$$;

create or replace function finance.get_product_normalization_queue(
  p_receipt_id uuid default null,
  p_limit integer default 100
)
returns jsonb
language sql
stable
security invoker
set search_path=''
as $$
  select coalesce(jsonb_agg(row_data order by sort_time,line_index),'[]'::jsonb)
  from (
    select
      coalesce(r.purchased_at,r.capture_finalized_at,r.created_at) as sort_time,
      ri.line_index,
      jsonb_build_object(
        'receipt_item_id',ri.id,
        'receipt_id',ri.receipt_id,
        'line_index',ri.line_index,
        'raw_name',ri.raw_name,
        'normalized_name',ri.normalized_name,
        'product_id',ri.product_id,
        'normalization_status',ri.normalization_status,
        'normalization_source',ri.normalization_source,
        'normalization_confidence',ri.normalization_confidence,
        'normalization_review_required',ri.normalization_review_required,
        'item_confidence',ri.confidence,
        'merchant_id',r.merchant_id,
        'merchant_name',m.name,
        'purchased_at',r.purchased_at,
        'amount_minor',ri.effective_total_minor,
        'currency_code',r.currency_code,
        'exact_match',finance.resolve_product_alias(ri.raw_name,r.merchant_id)
      ) as row_data
    from finance.receipt_items ri
    join finance.receipts r on r.id=ri.receipt_id and r.user_id=ri.user_id
    left join finance.merchants m on m.id=r.merchant_id and m.user_id=r.user_id
    where (p_receipt_id is null or ri.receipt_id=p_receipt_id)
      and ri.normalization_status in ('pending','review_required')
    order by coalesce(r.purchased_at,r.capture_finalized_at,r.created_at),ri.line_index
    limit greatest(1,least(coalesce(p_limit,100),500))
  ) q;
$$;

create or replace function finance.get_products()
returns jsonb
language sql
stable
security invoker
set search_path=''
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',p.id,
      'name',p.name,
      'normalized_name',p.normalized_name,
      'brand',p.brand,
      'family_id',p.family_id,
      'family_name',p.family_name,
      'variant_name',p.variant_name,
      'product_type',p.product_type,
      'barcode',p.barcode,
      'size_value',p.size_value,
      'size_unit',p.size_unit,
      'default_category_id',p.default_category_id,
      'default_necessity',p.default_necessity,
      'source',p.source,
      'confidence',p.confidence,
      'purchase_count',p.purchase_count,
      'total_spend_minor',p.total_spend_minor,
      'total_quantity',p.total_quantity,
      'first_purchase_at',p.first_purchase_at,
      'last_purchase_at',p.last_purchase_at,
      'min_unit_price_minor',p.min_unit_price_minor,
      'max_unit_price_minor',p.max_unit_price_minor,
      'avg_unit_price_minor',p.avg_unit_price_minor
    )
    order by p.last_purchase_at desc nulls last,p.name
  ),'[]'::jsonb)
  from finance.product_intelligence_summary p
  where not p.is_archived;
$$;

create or replace function finance.get_product_families()
returns jsonb
language sql
stable
security invoker
set search_path=''
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',pf.id,
      'name',pf.name,
      'brand',pf.brand,
      'product_type',pf.product_type,
      'default_category_id',pf.default_category_id,
      'default_necessity',pf.default_necessity,
      'is_archived',pf.is_archived,
      'product_count',(
        select count(*) from finance.products p
        where p.family_id=pf.id and p.user_id=pf.user_id and not p.is_archived
      )
    )
    order by pf.name
  ),'[]'::jsonb)
  from finance.product_families pf
  where not pf.is_archived;
$$;

do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='finance'
      and p.proname in (
        'normalize_product_text','canonical_product_size','upsert_product_family',
        'upsert_product','add_product_alias','resolve_product_alias',
        'apply_receipt_item_product','normalize_receipt_item_by_alias',
        'correct_receipt_item_product','get_product_normalization_queue',
        'get_products','get_product_families'
      )
  loop
    execute format('revoke all on function %s from public,anon',f);
    execute format('grant execute on function %s to authenticated,service_role',f);
  end loop;
end $$;
