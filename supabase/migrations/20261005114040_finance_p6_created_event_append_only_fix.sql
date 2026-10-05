
create or replace function finance.create_and_assign_product_candidate(
  p_receipt_item_id uuid,
  p_name text,
  p_brand text default null,
  p_family_name text default null,
  p_variant_name text default null,
  p_product_type text default null,
  p_barcode text default null,
  p_size_value numeric default null,
  p_size_unit text default null,
  p_confidence numeric default null,
  p_normalization_version text default 'deterministic-1',
  p_user_confirmed boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_user_id uuid := auth.uid();
  v_item finance.receipt_items%rowtype;
  v_receipt finance.receipts%rowtype;
  v_family_id uuid;
  v_product_id uuid;
  v_source finance.rule_source;
  v_default_category uuid;
  v_default_necessity finance.necessity := 'unclassified';
  v_result jsonb;
begin
  if v_user_id is null then raise exception using errcode='42501',message='authentication required'; end if;

  if p_user_confirmed then
    v_source := 'user';
  else
    v_source := 'learned';
    if p_confidence is null or p_confidence<0.92 then
      raise exception using errcode='23514',
        message='automatic product creation requires confidence of at least 0.92';
    end if;
  end if;

  select * into v_item
  from finance.receipt_items
  where id=p_receipt_item_id and user_id=v_user_id
  for update;
  if not found then raise exception using errcode='P0002',message='receipt item not found'; end if;

  select * into v_receipt
  from finance.receipts
  where id=v_item.receipt_id and user_id=v_user_id;

  if p_family_name is not null and nullif(btrim(p_family_name),'') is not null then
    v_family_id := finance.upsert_product_family(
      p_family_name,p_brand,p_product_type,null,'unclassified',
      jsonb_build_object(
        'created_from','receipt_normalization',
        'normalization_version',p_normalization_version
      )
    );
  end if;

  if v_family_id is not null then
    select default_category_id,default_necessity
    into v_default_category,v_default_necessity
    from finance.product_families
    where id=v_family_id and user_id=v_user_id;
  end if;

  v_product_id := finance.upsert_product(
    p_name,p_brand,v_family_id,p_variant_name,p_product_type,p_barcode,
    p_size_value,p_size_unit,v_default_category,v_default_necessity,
    v_source,case when p_user_confirmed then 1 else p_confidence end,
    jsonb_build_object(
      'created_from','receipt_normalization',
      'first_raw_name',v_item.raw_name,
      'first_merchant_id',v_receipt.merchant_id,
      'normalization_version',p_normalization_version
    )
  );

  v_result := finance.apply_receipt_item_product(
    v_item.id,v_product_id,v_source,
    case when p_user_confirmed then 1 else p_confidence end,
    p_normalization_version,null,true,p_user_confirmed
  );

  if not p_user_confirmed then
    update finance.receipt_items
    set normalization_status='created'
    where id=v_item.id and user_id=v_user_id;

    insert into finance.product_normalization_events(
      user_id,receipt_item_id,previous_product_id,product_id,alias_id,
      source,status,confidence,normalization_version,user_corrected,metadata
    ) values(
      v_user_id,v_item.id,v_item.product_id,v_product_id,
      nullif(v_result->>'alias_id','')::uuid,
      'learned','created',p_confidence,btrim(p_normalization_version),false,
      jsonb_build_object(
        'event_kind','product_created',
        'family_id',v_family_id
      )
    );

    v_result := jsonb_set(
      v_result,
      '{normalization_status}',
      '"created"'::jsonb,
      true
    );
  end if;

  return v_result||jsonb_build_object(
    'created_or_upserted',true,
    'family_id',v_family_id
  );
end;
$$;
