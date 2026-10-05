
create or replace function finance.recalculate_receipt_review(
  p_receipt_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_user_id uuid := auth.uid();
  v_receipt finance.receipts%rowtype;
  v_item_count integer := 0;
  v_item_review_count integer := 0;
  v_normalization_count integer := 0;
  v_item_sum bigint;
  v_candidates jsonb := '[]'::jsonb;
  v_best_formula text;
  v_best_expected bigint;
  v_best_delta bigint;
  v_recon_status finance.receipt_reconciliation_status;
  v_reasons text[] := array[]::text[];
  v_reason text;
  v_blocking text[] := array[]::text[];
  v_review_json jsonb := '[]'::jsonb;
  v_status finance.receipt_processing_status;
begin
  if v_user_id is null then
    raise exception using errcode='42501',message='authentication required';
  end if;

  select * into v_receipt
  from finance.receipts
  where id=p_receipt_id and user_id=v_user_id
  for update;

  if not found then
    raise exception using errcode='P0002',message='receipt not found';
  end if;

  select
    count(*)::integer,
    count(*) filter(where review_required and reviewed_at is null)::integer,
    count(*) filter(
      where normalization_status in ('pending','review_required')
    )::integer,
    sum(effective_total_minor)::bigint
  into
    v_item_count,
    v_item_review_count,
    v_normalization_count,
    v_item_sum
  from finance.receipt_items
  where receipt_id=p_receipt_id
    and user_id=v_user_id
    and not is_excluded;

  if v_receipt.total_minor is null then
    v_recon_status := 'insufficient_data';
  else
    if v_item_sum is not null then
      v_candidates := v_candidates||jsonb_build_array(
        jsonb_build_object('formula','item_sum','expected',v_item_sum)
      );

      if coalesce(v_receipt.discount_minor,0)<>0 then
        v_candidates := v_candidates||jsonb_build_array(
          jsonb_build_object(
            'formula','item_sum_minus_receipt_discount',
            'expected',v_item_sum-coalesce(v_receipt.discount_minor,0)
          )
        );
      end if;
    end if;

    if v_receipt.subtotal_minor is not null then
      v_candidates := v_candidates||jsonb_build_array(
        jsonb_build_object(
          'formula','subtotal_minus_discount_plus_deposit',
          'expected',
          v_receipt.subtotal_minor
            -coalesce(v_receipt.discount_minor,0)
            +coalesce(v_receipt.deposit_minor,0)
        )
      );
    end if;

    if jsonb_array_length(v_candidates)=0 then
      v_recon_status := 'insufficient_data';
    else
      select
        c->>'formula',
        (c->>'expected')::bigint,
        abs((c->>'expected')::bigint-v_receipt.total_minor)
      into v_best_formula,v_best_expected,v_best_delta
      from jsonb_array_elements(v_candidates) c
      order by abs((c->>'expected')::bigint-v_receipt.total_minor),c->>'formula'
      limit 1;

      v_recon_status := case
        when v_best_delta=0 then 'exact'
        when v_best_delta<=2 then 'within_tolerance'
        else 'mismatch'
      end;
    end if;
  end if;

  if v_receipt.total_minor is null then
    v_reasons := array_append(v_reasons,'total_missing');
  end if;
  if v_item_count=0 then
    v_reasons := array_append(v_reasons,'items_missing');
  end if;
  if v_recon_status='mismatch' then
    v_reasons := array_append(v_reasons,'arithmetic_mismatch');
  elsif v_recon_status='insufficient_data' then
    v_reasons := array_append(v_reasons,'reconciliation_insufficient');
  end if;
  if (
    (v_receipt.overall_confidence is null or v_receipt.overall_confidence<0.85)
    and v_receipt.header_reviewed_at is null
  ) then
    v_reasons := array_append(v_reasons,'low_confidence');
  end if;
  if v_item_review_count>0 then
    v_reasons := array_append(v_reasons,'item_review_required');
  end if;
  if v_normalization_count>0 then
    v_reasons := array_append(v_reasons,'product_normalization_required');
  end if;
  if v_receipt.merchant_id is null and v_receipt.merchant_raw_name is null then
    v_reasons := array_append(v_reasons,'merchant_missing');
  elsif v_receipt.merchant_id is null then
    v_reasons := array_append(v_reasons,'merchant_unresolved');
  end if;
  if v_receipt.purchased_at is null then
    v_reasons := array_append(v_reasons,'purchase_time_missing');
  end if;

  foreach v_reason in array v_reasons loop
    if not (coalesce(v_receipt.review_waivers,'{}'::jsonb) ? v_reason) then
      v_blocking := array_append(v_blocking,v_reason);
    end if;
  end loop;

  select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb)
  into v_review_json
  from unnest(v_blocking) x;

  v_status := case
    when cardinality(v_blocking)>0 then 'review_required'::finance.receipt_processing_status
    when v_receipt.confirmed_at is not null then 'confirmed'::finance.receipt_processing_status
    else 'classifying'::finance.receipt_processing_status
  end;

  update finance.receipts
  set reconciliation_status=v_recon_status,
      reconciliation_delta_minor=case
        when v_best_expected is null or total_minor is null then null
        else v_best_expected-total_minor
      end,
      review_reasons=v_review_json,
      processing_status=v_status,
      metadata=metadata||jsonb_build_object(
        'reconciliation_formula',v_best_formula,
        'reconciliation_expected_minor',v_best_expected,
        'review_active_item_count',v_item_count,
        'review_item_sum_minor',v_item_sum
      )
  where id=p_receipt_id and user_id=v_user_id;

  return jsonb_build_object(
    'receipt_id',p_receipt_id,
    'processing_status',v_status,
    'review_reasons',v_review_json,
    'waivers',v_receipt.review_waivers,
    'active_item_count',v_item_count,
    'item_review_count',v_item_review_count,
    'normalization_review_count',v_normalization_count,
    'item_sum_minor',v_item_sum,
    'reconciliation_status',v_recon_status,
    'reconciliation_expected_minor',v_best_expected,
    'reconciliation_delta_minor',
      case when v_best_expected is null or v_receipt.total_minor is null
        then null else v_best_expected-v_receipt.total_minor end,
    'reconciliation_formula',v_best_formula,
    'can_confirm',cardinality(v_blocking)=0
  );
end;
$$;

create or replace function finance.start_receipt_review(
  p_receipt_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_user_id uuid := auth.uid();
  v_started timestamptz;
begin
  if v_user_id is null then
    raise exception using errcode='42501',message='authentication required';
  end if;

  update finance.receipts
  set review_started_at=coalesce(review_started_at,now()),
      last_reviewed_at=now()
  where id=p_receipt_id and user_id=v_user_id
  returning review_started_at into v_started;

  if v_started is null then
    raise exception using errcode='P0002',message='receipt not found';
  end if;

  insert into finance.receipt_review_events(
    user_id,receipt_id,event_type,metadata
  ) values(
    v_user_id,p_receipt_id,'review_started',
    jsonb_build_object('started_at',v_started)
  );

  perform finance.recalculate_receipt_review(p_receipt_id);
  return finance.get_receipt_review(p_receipt_id);
end;
$$;

create or replace function finance.accept_receipt_header(
  p_receipt_id uuid,
  p_note text default null
)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception using errcode='42501',message='authentication required';
  end if;

  update finance.receipts
  set header_reviewed_at=now(),
      last_reviewed_at=now(),
      review_started_at=coalesce(review_started_at,now()),
      review_revision=review_revision+1,
      confirmed_at=null
  where id=p_receipt_id and user_id=v_user_id;

  if not found then
    raise exception using errcode='P0002',message='receipt not found';
  end if;

  insert into finance.receipt_review_events(
    user_id,receipt_id,event_type,reason
  ) values(
    v_user_id,p_receipt_id,'header_accepted',nullif(btrim(p_note),'')
  );

  perform finance.recalculate_receipt_review(p_receipt_id);
  return finance.get_receipt_review(p_receipt_id);
end;
$$;

create or replace function finance.update_receipt_header_review(
  p_receipt_id uuid,
  p_patch jsonb,
  p_note text default null
)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_user_id uuid := auth.uid();
  v_receipt finance.receipts%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_merchant_id uuid;
  v_original_raw text;
  v_currency text;
  v_nonnegative bigint;
begin
  if v_user_id is null then
    raise exception using errcode='42501',message='authentication required';
  end if;
  if p_patch is null or jsonb_typeof(p_patch)<>'object' then
    raise exception using errcode='23514',message='header patch must be an object';
  end if;

  if exists(
    select 1 from jsonb_object_keys(p_patch) k
    where k not in (
      'merchant_id','merchant_name','purchased_at','currency_code',
      'subtotal_minor','tax_minor','discount_minor','deposit_minor',
      'total_minor','receipt_number','payment_method_raw'
    )
  ) then
    raise exception using errcode='23514',message='header patch contains unsupported fields';
  end if;

  select * into v_receipt
  from finance.receipts
  where id=p_receipt_id and user_id=v_user_id
  for update;

  if not found then
    raise exception using errcode='P0002',message='receipt not found';
  end if;

  v_before := jsonb_build_object(
    'merchant_id',v_receipt.merchant_id,
    'merchant_raw_name',v_receipt.merchant_raw_name,
    'purchased_at',v_receipt.purchased_at,
    'currency_code',v_receipt.currency_code,
    'subtotal_minor',v_receipt.subtotal_minor,
    'tax_minor',v_receipt.tax_minor,
    'discount_minor',v_receipt.discount_minor,
    'deposit_minor',v_receipt.deposit_minor,
    'total_minor',v_receipt.total_minor,
    'receipt_number',v_receipt.receipt_number,
    'payment_method_raw',v_receipt.payment_method_raw
  );

  v_original_raw := v_receipt.merchant_raw_name;

  if p_patch ? 'merchant_name' then
    if nullif(btrim(p_patch->>'merchant_name'),'') is null then
      v_merchant_id := null;
    else
      v_merchant_id := finance.upsert_merchant(
        btrim(p_patch->>'merchant_name'),
        null,null,'unclassified',null
      );
      if v_original_raw is not null then
        perform finance.add_merchant_alias(v_merchant_id,v_original_raw);
      end if;
    end if;
  elsif p_patch ? 'merchant_id' then
    if p_patch->'merchant_id'='null'::jsonb then
      v_merchant_id := null;
    else
      v_merchant_id := (p_patch->>'merchant_id')::uuid;
      if not exists(
        select 1 from finance.merchants
        where id=v_merchant_id and user_id=v_user_id and not is_archived
      ) then
        raise exception using errcode='23503',message='merchant not found';
      end if;
      if v_original_raw is not null then
        perform finance.add_merchant_alias(v_merchant_id,v_original_raw);
      end if;
    end if;
  else
    v_merchant_id := v_receipt.merchant_id;
  end if;

  if p_patch ? 'currency_code' then
    v_currency := upper(nullif(btrim(p_patch->>'currency_code'),''));
    if v_currency is null or v_currency !~ '^[A-Z]{3}$' then
      raise exception using errcode='23514',message='invalid currency code';
    end if;
  else
    v_currency := v_receipt.currency_code;
  end if;

  foreach v_nonnegative in array array[
    case when p_patch ? 'discount_minor' and p_patch->'discount_minor'<>'null'::jsonb
      then (p_patch->>'discount_minor')::bigint else null end,
    case when p_patch ? 'deposit_minor' and p_patch->'deposit_minor'<>'null'::jsonb
      then (p_patch->>'deposit_minor')::bigint else null end,
    case when p_patch ? 'total_minor' and p_patch->'total_minor'<>'null'::jsonb
      then (p_patch->>'total_minor')::bigint else null end
  ] loop
    if v_nonnegative is not null and v_nonnegative<0 then
      raise exception using errcode='23514',message='receipt totals cannot be negative';
    end if;
  end loop;

  update finance.receipts
  set merchant_id=v_merchant_id,
      merchant_raw_name=case
        when p_patch ? 'merchant_name'
          then nullif(btrim(p_patch->>'merchant_name'),'')
        else merchant_raw_name
      end,
      purchased_at=case
        when p_patch ? 'purchased_at' and p_patch->'purchased_at'='null'::jsonb then null
        when p_patch ? 'purchased_at' then (p_patch->>'purchased_at')::timestamptz
        else purchased_at
      end,
      currency_code=v_currency,
      subtotal_minor=case
        when p_patch ? 'subtotal_minor' and p_patch->'subtotal_minor'='null'::jsonb then null
        when p_patch ? 'subtotal_minor' then (p_patch->>'subtotal_minor')::bigint
        else subtotal_minor
      end,
      tax_minor=case
        when p_patch ? 'tax_minor' and p_patch->'tax_minor'='null'::jsonb then null
        when p_patch ? 'tax_minor' then (p_patch->>'tax_minor')::bigint
        else tax_minor
      end,
      discount_minor=case
        when p_patch ? 'discount_minor' and p_patch->'discount_minor'='null'::jsonb then 0
        when p_patch ? 'discount_minor' then (p_patch->>'discount_minor')::bigint
        else discount_minor
      end,
      deposit_minor=case
        when p_patch ? 'deposit_minor' and p_patch->'deposit_minor'='null'::jsonb then 0
        when p_patch ? 'deposit_minor' then (p_patch->>'deposit_minor')::bigint
        else deposit_minor
      end,
      total_minor=case
        when p_patch ? 'total_minor' and p_patch->'total_minor'='null'::jsonb then null
        when p_patch ? 'total_minor' then (p_patch->>'total_minor')::bigint
        else total_minor
      end,
      receipt_number=case
        when p_patch ? 'receipt_number'
          then nullif(btrim(p_patch->>'receipt_number'),'')
        else receipt_number
      end,
      payment_method_raw=case
        when p_patch ? 'payment_method_raw'
          then nullif(btrim(p_patch->>'payment_method_raw'),'')
        else payment_method_raw
      end,
      header_reviewed_at=now(),
      review_started_at=coalesce(review_started_at,now()),
      last_reviewed_at=now(),
      review_revision=review_revision+1,
      confirmed_at=null
  where id=p_receipt_id and user_id=v_user_id;

  select jsonb_build_object(
    'merchant_id',merchant_id,
    'merchant_raw_name',merchant_raw_name,
    'purchased_at',purchased_at,
    'currency_code',currency_code,
    'subtotal_minor',subtotal_minor,
    'tax_minor',tax_minor,
    'discount_minor',discount_minor,
    'deposit_minor',deposit_minor,
    'total_minor',total_minor,
    'receipt_number',receipt_number,
    'payment_method_raw',payment_method_raw
  )
  into v_after
  from finance.receipts
  where id=p_receipt_id and user_id=v_user_id;

  insert into finance.receipt_review_events(
    user_id,receipt_id,event_type,before_value,after_value,reason
  ) values(
    v_user_id,p_receipt_id,'header_corrected',
    v_before,v_after,nullif(btrim(p_note),'')
  );

  perform finance.recalculate_receipt_review(p_receipt_id);
  return finance.get_receipt_review(p_receipt_id);
end;
$$;

create or replace function finance.sync_receipt_item_price(
  p_receipt_item_id uuid
)
returns void
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_user_id uuid := auth.uid();
  v_item finance.receipt_items%rowtype;
  v_receipt finance.receipts%rowtype;
  v_effective_unit bigint;
  v_observed timestamptz;
begin
  if v_user_id is null then
    raise exception using errcode='42501',message='authentication required';
  end if;

  select * into v_item
  from finance.receipt_items
  where id=p_receipt_item_id and user_id=v_user_id;

  if not found then
    raise exception using errcode='P0002',message='receipt item not found';
  end if;

  update finance.product_prices
  set is_active=not v_item.is_excluded
  where receipt_item_id=v_item.id and user_id=v_user_id;

  if v_item.product_id is null or v_item.is_excluded or v_item.quantity<=0 then
    return;
  end if;

  select * into v_receipt
  from finance.receipts
  where id=v_item.receipt_id and user_id=v_user_id;

  v_observed := coalesce(
    v_receipt.purchased_at,
    v_receipt.capture_finalized_at,
    v_receipt.created_at
  );
  v_effective_unit := round(
    (v_item.line_total_minor-v_item.discount_minor)::numeric / v_item.quantity
  )::bigint;

  insert into finance.product_prices(
    user_id,product_id,merchant_id,receipt_item_id,observed_at,currency_code,
    list_unit_price_minor,effective_unit_price_minor,quantity,is_active
  ) values(
    v_user_id,v_item.product_id,v_receipt.merchant_id,v_item.id,
    v_observed,v_receipt.currency_code,v_item.unit_price_minor,
    v_effective_unit,v_item.quantity,true
  )
  on conflict(user_id,receipt_item_id) where receipt_item_id is not null
  do update set
    product_id=excluded.product_id,
    merchant_id=excluded.merchant_id,
    observed_at=excluded.observed_at,
    currency_code=excluded.currency_code,
    list_unit_price_minor=excluded.list_unit_price_minor,
    effective_unit_price_minor=excluded.effective_unit_price_minor,
    quantity=excluded.quantity,
    is_active=true;
end;
$$;

create or replace function finance.accept_receipt_item_review(
  p_receipt_item_id uuid,
  p_note text default null
)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_user_id uuid := auth.uid();
  v_receipt_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode='42501',message='authentication required';
  end if;

  update finance.receipt_items
  set reviewed_at=now(),
      review_note=nullif(btrim(p_note),'')
  where id=p_receipt_item_id and user_id=v_user_id
  returning receipt_id into v_receipt_id;

  if v_receipt_id is null then
    raise exception using errcode='P0002',message='receipt item not found';
  end if;

  update finance.receipts
  set review_started_at=coalesce(review_started_at,now()),
      last_reviewed_at=now(),
      review_revision=review_revision+1,
      confirmed_at=null
  where id=v_receipt_id and user_id=v_user_id;

  insert into finance.receipt_review_events(
    user_id,receipt_id,receipt_item_id,event_type,reason
  ) values(
    v_user_id,v_receipt_id,p_receipt_item_id,'item_accepted',
    nullif(btrim(p_note),'')
  );

  perform finance.recalculate_receipt_review(v_receipt_id);
  return finance.get_receipt_review(v_receipt_id);
end;
$$;

create or replace function finance.update_receipt_item_review(
  p_receipt_item_id uuid,
  p_patch jsonb,
  p_note text default null
)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_user_id uuid := auth.uid();
  v_item finance.receipt_items%rowtype;
  v_receipt_id uuid;
  v_before jsonb;
  v_after jsonb;
  v_quantity numeric;
  v_unit bigint;
  v_line_total bigint;
  v_discount bigint;
  v_deposit bigint;
  v_effective bigint;
begin
  if v_user_id is null then
    raise exception using errcode='42501',message='authentication required';
  end if;
  if p_patch is null or jsonb_typeof(p_patch)<>'object' then
    raise exception using errcode='23514',message='item patch must be an object';
  end if;
  if exists(
    select 1 from jsonb_object_keys(p_patch) k
    where k not in (
      'quantity','unit_price_minor','line_total_minor',
      'discount_minor','deposit_minor','effective_total_minor'
    )
  ) then
    raise exception using errcode='23514',message='item patch contains unsupported fields';
  end if;

  select * into v_item
  from finance.receipt_items
  where id=p_receipt_item_id and user_id=v_user_id
  for update;

  if not found then
    raise exception using errcode='P0002',message='receipt item not found';
  end if;

  v_receipt_id := v_item.receipt_id;
  v_before := jsonb_build_object(
    'quantity',v_item.quantity,
    'unit_price_minor',v_item.unit_price_minor,
    'line_total_minor',v_item.line_total_minor,
    'discount_minor',v_item.discount_minor,
    'deposit_minor',v_item.deposit_minor,
    'effective_total_minor',v_item.effective_total_minor
  );

  v_quantity := case
    when p_patch ? 'quantity' then (p_patch->>'quantity')::numeric
    else v_item.quantity end;
  if v_quantity<=0 then
    raise exception using errcode='23514',message='quantity must be positive';
  end if;

  v_unit := case
    when p_patch ? 'unit_price_minor' and p_patch->'unit_price_minor'='null'::jsonb then null
    when p_patch ? 'unit_price_minor' then (p_patch->>'unit_price_minor')::bigint
    else v_item.unit_price_minor end;
  v_line_total := case
    when p_patch ? 'line_total_minor' then (p_patch->>'line_total_minor')::bigint
    else v_item.line_total_minor end;
  v_discount := case
    when p_patch ? 'discount_minor' then (p_patch->>'discount_minor')::bigint
    else v_item.discount_minor end;
  v_deposit := case
    when p_patch ? 'deposit_minor' then (p_patch->>'deposit_minor')::bigint
    else v_item.deposit_minor end;

  if v_discount<0 or v_deposit<0 then
    raise exception using errcode='23514',message='discount/deposit cannot be negative';
  end if;

  v_effective := case
    when p_patch ? 'effective_total_minor'
      then (p_patch->>'effective_total_minor')::bigint
    else v_line_total-v_discount+v_deposit
  end;

  update finance.receipt_items
  set quantity=v_quantity,
      unit_price_minor=v_unit,
      line_total_minor=v_line_total,
      discount_minor=v_discount,
      deposit_minor=v_deposit,
      effective_total_minor=v_effective,
      reviewed_at=now(),
      review_note=nullif(btrim(p_note),'')
  where id=p_receipt_item_id and user_id=v_user_id;

  perform finance.sync_receipt_item_price(p_receipt_item_id);

  select jsonb_build_object(
    'quantity',quantity,
    'unit_price_minor',unit_price_minor,
    'line_total_minor',line_total_minor,
    'discount_minor',discount_minor,
    'deposit_minor',deposit_minor,
    'effective_total_minor',effective_total_minor
  ) into v_after
  from finance.receipt_items
  where id=p_receipt_item_id and user_id=v_user_id;

  update finance.receipts
  set review_started_at=coalesce(review_started_at,now()),
      last_reviewed_at=now(),
      review_revision=review_revision+1,
      confirmed_at=null
  where id=v_receipt_id and user_id=v_user_id;

  insert into finance.receipt_review_events(
    user_id,receipt_id,receipt_item_id,event_type,
    before_value,after_value,reason
  ) values(
    v_user_id,v_receipt_id,p_receipt_item_id,'item_corrected',
    v_before,v_after,nullif(btrim(p_note),'')
  );

  perform finance.recalculate_receipt_review(v_receipt_id);
  return finance.get_receipt_review(v_receipt_id);
end;
$$;

create or replace function finance.set_receipt_item_excluded(
  p_receipt_item_id uuid,
  p_excluded boolean,
  p_note text default null
)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_user_id uuid := auth.uid();
  v_receipt_id uuid;
  v_before boolean;
begin
  if v_user_id is null then
    raise exception using errcode='42501',message='authentication required';
  end if;

  select receipt_id,is_excluded into v_receipt_id,v_before
  from finance.receipt_items
  where id=p_receipt_item_id and user_id=v_user_id
  for update;

  if v_receipt_id is null then
    raise exception using errcode='P0002',message='receipt item not found';
  end if;

  update finance.receipt_items
  set is_excluded=p_excluded,
      reviewed_at=now(),
      review_note=nullif(btrim(p_note),'')
  where id=p_receipt_item_id and user_id=v_user_id;

  perform finance.sync_receipt_item_price(p_receipt_item_id);

  update finance.receipts
  set review_started_at=coalesce(review_started_at,now()),
      last_reviewed_at=now(),
      review_revision=review_revision+1,
      confirmed_at=null
  where id=v_receipt_id and user_id=v_user_id;

  insert into finance.receipt_review_events(
    user_id,receipt_id,receipt_item_id,event_type,
    before_value,after_value,reason
  ) values(
    v_user_id,v_receipt_id,p_receipt_item_id,
    case when p_excluded then 'item_excluded'::finance.receipt_review_event_type
         else 'item_restored'::finance.receipt_review_event_type end,
    to_jsonb(v_before),to_jsonb(p_excluded),nullif(btrim(p_note),'')
  );

  perform finance.recalculate_receipt_review(v_receipt_id);
  return finance.get_receipt_review(v_receipt_id);
end;
$$;

create or replace function finance.skip_receipt_item_product(
  p_receipt_item_id uuid,
  p_note text default null
)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_user_id uuid := auth.uid();
  v_item finance.receipt_items%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode='42501',message='authentication required';
  end if;

  select * into v_item
  from finance.receipt_items
  where id=p_receipt_item_id and user_id=v_user_id
  for update;

  if not found then
    raise exception using errcode='P0002',message='receipt item not found';
  end if;

  update finance.receipt_items
  set normalization_status='skipped',
      normalization_review_required=false,
      normalization_source='user',
      normalization_confidence=1,
      normalized_at=now(),
      reviewed_at=now(),
      review_note=nullif(btrim(p_note),''),
      user_corrected=true
  where id=p_receipt_item_id and user_id=v_user_id;

  insert into finance.product_normalization_events(
    user_id,receipt_item_id,previous_product_id,product_id,source,status,
    confidence,normalization_version,user_corrected,metadata
  ) values(
    v_user_id,p_receipt_item_id,v_item.product_id,v_item.product_id,
    'user','skipped',1,'p7-review-skip',true,
    jsonb_build_object('reason',nullif(btrim(p_note),''))
  );

  update finance.receipts
  set review_started_at=coalesce(review_started_at,now()),
      last_reviewed_at=now(),
      review_revision=review_revision+1,
      confirmed_at=null
  where id=v_item.receipt_id and user_id=v_user_id;

  insert into finance.receipt_review_events(
    user_id,receipt_id,receipt_item_id,event_type,reason
  ) values(
    v_user_id,v_item.receipt_id,p_receipt_item_id,'product_skipped',
    nullif(btrim(p_note),'')
  );

  perform finance.recalculate_receipt_review(v_item.receipt_id);
  return finance.get_receipt_review(v_item.receipt_id);
end;
$$;

create or replace function finance.waive_receipt_review_reason(
  p_receipt_id uuid,
  p_reason text,
  p_note text
)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_user_id uuid := auth.uid();
  v_note text := nullif(btrim(p_note),'');
begin
  if v_user_id is null then
    raise exception using errcode='42501',message='authentication required';
  end if;
  if p_reason not in (
    'arithmetic_mismatch',
    'reconciliation_insufficient',
    'low_confidence'
  ) then
    raise exception using errcode='23514',
      message='this review reason cannot be waived';
  end if;
  if v_note is null then
    raise exception using errcode='23514',
      message='a waiver note is required';
  end if;

  update finance.receipts
  set review_waivers=jsonb_set(
        coalesce(review_waivers,'{}'::jsonb),
        array[p_reason],
        jsonb_build_object('note',v_note,'waived_at',now()),
        true
      ),
      review_started_at=coalesce(review_started_at,now()),
      last_reviewed_at=now(),
      review_revision=review_revision+1,
      confirmed_at=null
  where id=p_receipt_id and user_id=v_user_id;

  if not found then
    raise exception using errcode='P0002',message='receipt not found';
  end if;

  insert into finance.receipt_review_events(
    user_id,receipt_id,event_type,field_name,after_value,reason
  ) values(
    v_user_id,p_receipt_id,'reason_waived',p_reason,
    jsonb_build_object('waived',true),v_note
  );

  perform finance.recalculate_receipt_review(p_receipt_id);
  return finance.get_receipt_review(p_receipt_id);
end;
$$;

create or replace function finance.confirm_receipt_review(
  p_receipt_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_user_id uuid := auth.uid();
  v_state jsonb;
begin
  if v_user_id is null then
    raise exception using errcode='42501',message='authentication required';
  end if;

  v_state := finance.recalculate_receipt_review(p_receipt_id);

  if not coalesce((v_state->>'can_confirm')::boolean,false) then
    raise exception using errcode='23514',
      message='receipt still has blocking review issues',
      detail=(v_state->'review_reasons')::text;
  end if;

  update finance.receipts
  set confirmed_at=now(),
      last_reviewed_at=now(),
      review_started_at=coalesce(review_started_at,now()),
      review_revision=review_revision+1,
      processing_status='confirmed'
  where id=p_receipt_id and user_id=v_user_id;

  insert into finance.receipt_review_events(
    user_id,receipt_id,event_type,metadata
  ) values(
    v_user_id,p_receipt_id,'receipt_confirmed',
    jsonb_build_object(
      'review_revision',
      (select review_revision from finance.receipts
       where id=p_receipt_id and user_id=v_user_id)
    )
  );

  return finance.get_receipt_review(p_receipt_id);
end;
$$;
