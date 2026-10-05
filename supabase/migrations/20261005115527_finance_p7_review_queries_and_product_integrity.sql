
create or replace function finance.get_receipt_review(
  p_receipt_id uuid
)
returns jsonb
language plpgsql
stable
security invoker
set search_path=''
as $$
declare
  v_user_id uuid := auth.uid();
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception using errcode='42501',message='authentication required';
  end if;

  select jsonb_build_object(
    'receipt',jsonb_build_object(
      'id',r.id,
      'merchant_id',r.merchant_id,
      'merchant_name',m.name,
      'merchant_raw_name',r.merchant_raw_name,
      'merchant_address_raw',r.merchant_address_raw,
      'purchased_at',r.purchased_at,
      'currency_code',r.currency_code,
      'subtotal_minor',r.subtotal_minor,
      'tax_minor',r.tax_minor,
      'discount_minor',r.discount_minor,
      'deposit_minor',r.deposit_minor,
      'total_minor',r.total_minor,
      'receipt_number',r.receipt_number,
      'payment_method_raw',r.payment_method_raw,
      'overall_confidence',r.overall_confidence,
      'processing_status',r.processing_status,
      'reconciliation_status',r.reconciliation_status,
      'reconciliation_delta_minor',r.reconciliation_delta_minor,
      'reconciliation_formula',r.metadata->>'reconciliation_formula',
      'reconciliation_expected_minor',r.metadata->'reconciliation_expected_minor',
      'review_reasons',r.review_reasons,
      'review_waivers',r.review_waivers,
      'review_started_at',r.review_started_at,
      'header_reviewed_at',r.header_reviewed_at,
      'last_reviewed_at',r.last_reviewed_at,
      'review_revision',r.review_revision,
      'confirmed_at',r.confirmed_at
    ),
    'issues',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'code',reason,
          'severity',case
            when reason in ('total_missing','items_missing','purchase_time_missing',
                            'product_normalization_required') then 'error'
            when reason in ('arithmetic_mismatch','merchant_missing','merchant_unresolved') then 'warning'
            else 'attention'
          end,
          'blocking',true,
          'action',case reason
            when 'total_missing' then 'edit_header'
            when 'items_missing' then 'restore_or_review_items'
            when 'purchase_time_missing' then 'edit_header'
            when 'merchant_missing' then 'edit_merchant'
            when 'merchant_unresolved' then 'edit_merchant'
            when 'arithmetic_mismatch' then 'review_amounts_or_waive'
            when 'reconciliation_insufficient' then 'review_amounts_or_waive'
            when 'low_confidence' then 'accept_or_edit_header'
            when 'item_review_required' then 'review_items'
            when 'product_normalization_required' then 'assign_or_skip_products'
            else 'review'
          end
        )
        order by reason
      )
      from jsonb_array_elements_text(r.review_reasons) issue(reason)
    ),'[]'::jsonb),
    'pages',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',rp.id,
          'page_index',rp.page_index,
          'storage_path',rp.storage_path,
          'mime_type',rp.mime_type,
          'width_px',rp.width_px,
          'height_px',rp.height_px,
          'status',rp.status
        )
        order by rp.page_index
      )
      from finance.receipt_pages rp
      where rp.receipt_id=r.id and rp.user_id=r.user_id
        and rp.status<>'deleted'
    ),'[]'::jsonb),
    'items',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',ri.id,
          'line_index',ri.line_index,
          'raw_name',ri.raw_name,
          'normalized_name',ri.normalized_name,
          'quantity',ri.quantity,
          'unit_price_minor',ri.unit_price_minor,
          'line_total_minor',ri.line_total_minor,
          'discount_minor',ri.discount_minor,
          'deposit_minor',ri.deposit_minor,
          'effective_total_minor',ri.effective_total_minor,
          'confidence',ri.confidence,
          'ocr_review_required',ri.review_required,
          'reviewed_at',ri.reviewed_at,
          'review_note',ri.review_note,
          'is_excluded',ri.is_excluded,
          'normalization_status',ri.normalization_status,
          'normalization_source',ri.normalization_source,
          'normalization_confidence',ri.normalization_confidence,
          'normalization_review_required',ri.normalization_review_required,
          'user_corrected',ri.user_corrected,
          'product_id',ri.product_id,
          'product_name',p.name,
          'brand',p.brand,
          'family_id',p.family_id,
          'family_name',pf.name,
          'product_type',p.product_type,
          'size_value',p.size_value,
          'size_unit',p.size_unit,
          'category_id',ri.category_id,
          'category_name',c.name,
          'necessity',ri.necessity,
          'source_line',case when rl.id is null then null else jsonb_build_object(
            'id',rl.id,
            'raw_text',rl.raw_text,
            'normalized_text',rl.normalized_text,
            'kind',rl.kind,
            'amount_minor',rl.amount_minor,
            'confidence',rl.confidence,
            'page_id',rl.page_id,
            'page_line_index',rl.page_line_index,
            'bbox',rl.bbox
          ) end
        )
        order by ri.line_index,ri.id
      )
      from finance.receipt_items ri
      left join finance.products p
        on p.id=ri.product_id and p.user_id=ri.user_id
      left join finance.product_families pf
        on pf.id=p.family_id and pf.user_id=p.user_id
      left join finance.categories c
        on c.id=ri.category_id and c.user_id=ri.user_id
      left join finance.receipt_lines rl
        on rl.id=ri.source_line_id and rl.user_id=ri.user_id
      where ri.receipt_id=r.id and ri.user_id=r.user_id
    ),'[]'::jsonb),
    'events',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',e.id,
          'receipt_item_id',e.receipt_item_id,
          'event_type',e.event_type,
          'field_name',e.field_name,
          'before_value',e.before_value,
          'after_value',e.after_value,
          'reason',e.reason,
          'metadata',e.metadata,
          'created_at',e.created_at
        )
        order by e.created_at desc,e.id desc
      )
      from (
        select *
        from finance.receipt_review_events
        where receipt_id=r.id and user_id=r.user_id
        order by created_at desc,id desc
        limit 100
      ) e
    ),'[]'::jsonb),
    'summary',jsonb_build_object(
      'item_count',(
        select count(*) from finance.receipt_items ri
        where ri.receipt_id=r.id and ri.user_id=r.user_id and not ri.is_excluded
      ),
      'excluded_item_count',(
        select count(*) from finance.receipt_items ri
        where ri.receipt_id=r.id and ri.user_id=r.user_id and ri.is_excluded
      ),
      'ocr_review_count',(
        select count(*) from finance.receipt_items ri
        where ri.receipt_id=r.id and ri.user_id=r.user_id
          and not ri.is_excluded and ri.review_required and ri.reviewed_at is null
      ),
      'normalization_review_count',(
        select count(*) from finance.receipt_items ri
        where ri.receipt_id=r.id and ri.user_id=r.user_id
          and not ri.is_excluded
          and ri.normalization_status in ('pending','review_required')
      ),
      'active_item_sum_minor',(
        select sum(ri.effective_total_minor)::bigint
        from finance.receipt_items ri
        where ri.receipt_id=r.id and ri.user_id=r.user_id and not ri.is_excluded
      ),
      'can_confirm',jsonb_array_length(r.review_reasons)=0
        and r.total_minor is not null
        and exists(
          select 1 from finance.receipt_items ri
          where ri.receipt_id=r.id and ri.user_id=r.user_id and not ri.is_excluded
        )
    )
  )
  into v_result
  from finance.receipts r
  left join finance.merchants m
    on m.id=r.merchant_id and m.user_id=r.user_id
  where r.id=p_receipt_id and r.user_id=v_user_id;

  if v_result is null then
    raise exception using errcode='P0002',message='receipt not found';
  end if;

  return v_result;
end;
$$;

create or replace function finance.get_receipt_review_queue(
  p_limit integer default 50
)
returns jsonb
language sql
stable
security invoker
set search_path=''
as $$
  select coalesce(jsonb_agg(row_data order by sort_time desc),'[]'::jsonb)
  from (
    select
      coalesce(r.purchased_at,r.capture_finalized_at,r.created_at) as sort_time,
      jsonb_build_object(
        'receipt_id',r.id,
        'merchant_id',r.merchant_id,
        'merchant_name',m.name,
        'merchant_raw_name',r.merchant_raw_name,
        'purchased_at',r.purchased_at,
        'currency_code',r.currency_code,
        'total_minor',r.total_minor,
        'processing_status',r.processing_status,
        'overall_confidence',r.overall_confidence,
        'reconciliation_status',r.reconciliation_status,
        'reconciliation_delta_minor',r.reconciliation_delta_minor,
        'review_reasons',r.review_reasons,
        'review_revision',r.review_revision,
        'review_started_at',r.review_started_at,
        'item_count',(
          select count(*) from finance.receipt_items ri
          where ri.receipt_id=r.id and ri.user_id=r.user_id and not ri.is_excluded
        ),
        'unresolved_item_count',(
          select count(*) from finance.receipt_items ri
          where ri.receipt_id=r.id and ri.user_id=r.user_id
            and not ri.is_excluded
            and (
              (ri.review_required and ri.reviewed_at is null)
              or ri.normalization_status in ('pending','review_required')
            )
        ),
        'ready_to_confirm',jsonb_array_length(r.review_reasons)=0
      ) as row_data
    from finance.receipts r
    left join finance.merchants m
      on m.id=r.merchant_id and m.user_id=r.user_id
    where r.current_processing_run_id is not null
      and r.processing_status in ('review_required','normalizing','classifying')
    order by coalesce(r.purchased_at,r.capture_finalized_at,r.created_at) desc
    limit greatest(1,least(coalesce(p_limit,50),200))
  ) q;
$$;

create or replace function finance.review_assign_product(
  p_receipt_item_id uuid,
  p_product_id uuid,
  p_learn_merchant_alias boolean default true,
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
  v_result jsonb;
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

  v_result := finance.correct_receipt_item_product(
    p_receipt_item_id,p_product_id,p_learn_merchant_alias,'p7-review-correction'
  );

  update finance.receipt_items
  set reviewed_at=now(),review_note=nullif(btrim(p_note),'')
  where id=p_receipt_item_id and user_id=v_user_id;

  update finance.receipts
  set review_started_at=coalesce(review_started_at,now()),
      last_reviewed_at=now(),
      review_revision=review_revision+1,
      confirmed_at=null
  where id=v_item.receipt_id and user_id=v_user_id;

  insert into finance.receipt_review_events(
    user_id,receipt_id,receipt_item_id,event_type,field_name,
    before_value,after_value,reason,metadata
  ) values(
    v_user_id,v_item.receipt_id,p_receipt_item_id,'item_corrected','product_id',
    to_jsonb(v_item.product_id),to_jsonb(p_product_id),
    nullif(btrim(p_note),''),
    jsonb_build_object('learn_merchant_alias',p_learn_merchant_alias)
  );

  perform finance.recalculate_receipt_review(v_item.receipt_id);
  return finance.get_receipt_review(v_item.receipt_id);
end;
$$;

create or replace function finance.review_create_product_candidate(
  p_receipt_item_id uuid,
  p_candidate jsonb,
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
  v_name text;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception using errcode='42501',message='authentication required';
  end if;
  if p_candidate is null or jsonb_typeof(p_candidate)<>'object' then
    raise exception using errcode='23514',message='candidate must be an object';
  end if;

  v_name := nullif(btrim(p_candidate->>'name'),'');
  if v_name is null then
    raise exception using errcode='23514',message='candidate name is required';
  end if;

  select * into v_item
  from finance.receipt_items
  where id=p_receipt_item_id and user_id=v_user_id
  for update;
  if not found then
    raise exception using errcode='P0002',message='receipt item not found';
  end if;

  v_result := finance.create_and_assign_product_candidate(
    p_receipt_item_id,
    v_name,
    nullif(btrim(p_candidate->>'brand'),''),
    nullif(btrim(p_candidate->>'family_name'),''),
    nullif(btrim(p_candidate->>'variant_name'),''),
    nullif(btrim(p_candidate->>'product_type'),''),
    nullif(btrim(p_candidate->>'barcode'),''),
    case when p_candidate ? 'size_value' and p_candidate->'size_value'<>'null'::jsonb
      then (p_candidate->>'size_value')::numeric else null end,
    nullif(btrim(p_candidate->>'size_unit'),''),
    1,
    'p7-user-product-create',
    true
  );

  update finance.receipt_items
  set reviewed_at=now(),review_note=nullif(btrim(p_note),'')
  where id=p_receipt_item_id and user_id=v_user_id;

  update finance.receipts
  set review_started_at=coalesce(review_started_at,now()),
      last_reviewed_at=now(),
      review_revision=review_revision+1,
      confirmed_at=null
  where id=v_item.receipt_id and user_id=v_user_id;

  insert into finance.receipt_review_events(
    user_id,receipt_id,receipt_item_id,event_type,field_name,
    before_value,after_value,reason,metadata
  ) values(
    v_user_id,v_item.receipt_id,p_receipt_item_id,'item_corrected','product_id',
    to_jsonb(v_item.product_id),v_result->'product_id',
    nullif(btrim(p_note),''),
    jsonb_build_object('product_created',true)
  );

  perform finance.recalculate_receipt_review(v_item.receipt_id);
  return finance.get_receipt_review(v_item.receipt_id);
end;
$$;

create or replace function finance_private.best_receipt_reconciliation(
  p_receipt_id uuid,
  p_run_id uuid,
  p_total_minor bigint,
  p_subtotal_minor bigint,
  p_discount_minor bigint,
  p_deposit_minor bigint
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_item_sum bigint;
  v_candidates jsonb := '[]'::jsonb;
  v_best_formula text;
  v_best_expected bigint;
  v_best_delta bigint;
begin
  if p_total_minor is null then
    return jsonb_build_object(
      'status','insufficient_data',
      'expected_minor',null,
      'delta_minor',null,
      'formula',null
    );
  end if;

  select sum(effective_total_minor)::bigint
  into v_item_sum
  from finance.receipt_items
  where receipt_id=p_receipt_id
    and processing_run_id=p_run_id
    and not is_excluded;

  if v_item_sum is not null then
    v_candidates := v_candidates||jsonb_build_array(
      jsonb_build_object('formula','item_sum','expected',v_item_sum)
    );
    if coalesce(p_discount_minor,0)<>0 then
      v_candidates := v_candidates||jsonb_build_array(
        jsonb_build_object(
          'formula','item_sum_minus_receipt_discount',
          'expected',v_item_sum-coalesce(p_discount_minor,0)
        )
      );
    end if;
  end if;

  if p_subtotal_minor is not null then
    v_candidates := v_candidates||jsonb_build_array(
      jsonb_build_object(
        'formula','subtotal_minus_discount_plus_deposit',
        'expected',
        p_subtotal_minor-coalesce(p_discount_minor,0)+coalesce(p_deposit_minor,0)
      )
    );
  end if;

  if jsonb_array_length(v_candidates)=0 then
    return jsonb_build_object(
      'status','insufficient_data',
      'expected_minor',null,
      'delta_minor',null,
      'formula',null
    );
  end if;

  select
    c->>'formula',
    (c->>'expected')::bigint,
    abs((c->>'expected')::bigint-p_total_minor)
  into v_best_formula,v_best_expected,v_best_delta
  from jsonb_array_elements(v_candidates) c
  order by abs((c->>'expected')::bigint-p_total_minor),c->>'formula'
  limit 1;

  return jsonb_build_object(
    'status',case
      when v_best_delta=0 then 'exact'
      when v_best_delta<=2 then 'within_tolerance'
      else 'mismatch'
    end,
    'expected_minor',v_best_expected,
    'delta_minor',v_best_expected-p_total_minor,
    'formula',v_best_formula,
    'item_sum_minor',v_item_sum
  );
end;
$$;

create or replace view finance.product_intelligence_summary
with (security_invoker=true)
as
select
  p.id,
  p.user_id,
  p.name,
  p.normalized_name,
  p.brand,
  p.normalized_brand,
  p.family_id,
  pf.name as family_name,
  p.variant_name,
  p.product_type,
  p.barcode,
  p.size_value,
  p.size_unit,
  p.default_category_id,
  p.default_necessity,
  p.source,
  p.confidence,
  p.is_archived,
  coalesce(purchases.purchase_count,0)::bigint as purchase_count,
  coalesce(purchases.total_spend_minor,0)::bigint as total_spend_minor,
  coalesce(purchases.total_quantity,0)::numeric as total_quantity,
  purchases.first_purchase_at,
  purchases.last_purchase_at,
  prices.min_unit_price_minor,
  prices.max_unit_price_minor,
  prices.avg_unit_price_minor
from finance.products p
left join finance.product_families pf
  on pf.id=p.family_id and pf.user_id=p.user_id
left join lateral (
  select
    count(*)::bigint as purchase_count,
    coalesce(sum(ri.effective_total_minor),0)::bigint as total_spend_minor,
    coalesce(sum(ri.quantity),0)::numeric as total_quantity,
    min(r.purchased_at) as first_purchase_at,
    max(r.purchased_at) as last_purchase_at
  from finance.receipt_items ri
  join finance.receipts r
    on r.id=ri.receipt_id and r.user_id=ri.user_id
  where ri.product_id=p.id and ri.user_id=p.user_id and not ri.is_excluded
) purchases on true
left join lateral (
  select
    min(pp.effective_unit_price_minor) as min_unit_price_minor,
    max(pp.effective_unit_price_minor) as max_unit_price_minor,
    avg(pp.effective_unit_price_minor)::numeric as avg_unit_price_minor
  from finance.product_prices pp
  where pp.product_id=p.id and pp.user_id=p.user_id and pp.is_active
) prices on true;

revoke all on finance.product_intelligence_summary from anon,authenticated;
grant select on finance.product_intelligence_summary to authenticated,service_role;

create or replace function finance.get_product_detail(p_product_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path=''
as $$
  select jsonb_build_object(
    'product',jsonb_build_object(
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
    ),
    'aliases',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',pa.id,
        'merchant_id',pa.merchant_id,
        'merchant_name',m.name,
        'raw_alias',pa.raw_alias,
        'normalized_alias',pa.normalized_alias,
        'source',pa.source,
        'confidence',pa.confidence,
        'times_confirmed',pa.times_confirmed,
        'use_count',pa.use_count,
        'last_used_at',pa.last_used_at,
        'is_active',pa.is_active
      ) order by
        case pa.source
          when 'user' then 10 when 'learned' then 20 when 'merchant' then 30
          when 'global' then 40 when 'ai' then 50 end,
        pa.use_count desc,pa.created_at)
      from finance.product_aliases pa
      left join finance.merchants m
        on m.id=pa.merchant_id and m.user_id=pa.user_id
      where pa.product_id=p.id and pa.user_id=p.user_id
    ),'[]'::jsonb),
    'price_history',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',pp.id,
        'merchant_id',pp.merchant_id,
        'merchant_name',m.name,
        'receipt_item_id',pp.receipt_item_id,
        'observed_at',pp.observed_at,
        'currency_code',pp.currency_code,
        'list_unit_price_minor',pp.list_unit_price_minor,
        'effective_unit_price_minor',pp.effective_unit_price_minor,
        'quantity',pp.quantity
      ) order by pp.observed_at,pp.id)
      from finance.product_prices pp
      left join finance.merchants m
        on m.id=pp.merchant_id and m.user_id=pp.user_id
      where pp.product_id=p.id and pp.user_id=p.user_id and pp.is_active
    ),'[]'::jsonb),
    'recent_purchases',coalesce((
      select jsonb_agg(x.data order by x.observed_at desc)
      from (
        select
          coalesce(r.purchased_at,r.capture_finalized_at,r.created_at) as observed_at,
          jsonb_build_object(
            'receipt_item_id',ri.id,
            'receipt_id',ri.receipt_id,
            'merchant_id',r.merchant_id,
            'merchant_name',m.name,
            'purchased_at',r.purchased_at,
            'quantity',ri.quantity,
            'line_total_minor',ri.line_total_minor,
            'discount_minor',ri.discount_minor,
            'deposit_minor',ri.deposit_minor,
            'effective_total_minor',ri.effective_total_minor,
            'currency_code',r.currency_code,
            'raw_name',ri.raw_name
          ) as data
        from finance.receipt_items ri
        join finance.receipts r
          on r.id=ri.receipt_id and r.user_id=ri.user_id
        left join finance.merchants m
          on m.id=r.merchant_id and m.user_id=r.user_id
        where ri.product_id=p.id and ri.user_id=p.user_id and not ri.is_excluded
        order by coalesce(r.purchased_at,r.capture_finalized_at,r.created_at) desc
        limit 50
      ) x
    ),'[]'::jsonb)
  )
  from finance.product_intelligence_summary p
  where p.id=p_product_id;
$$;
