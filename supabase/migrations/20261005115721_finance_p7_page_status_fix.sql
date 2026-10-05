CREATE OR REPLACE FUNCTION finance.get_receipt_review(p_receipt_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
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
        and rp.status='ready'
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
$function$
