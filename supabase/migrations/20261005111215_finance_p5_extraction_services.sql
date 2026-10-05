
create or replace function finance.begin_receipt_processing(
  p_receipt_id uuid,
  p_mode finance.receipt_pipeline_mode,
  p_pipeline_version text,
  p_ocr_provider text,
  p_ocr_model text,
  p_parser_version text,
  p_input_digest text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_user_id uuid := auth.uid();
  v_capture_status finance.receipt_capture_status;
  v_run_id uuid := gen_random_uuid();
begin
  if v_user_id is null then
    raise exception using errcode='42501',message='authentication required';
  end if;
  if nullif(btrim(p_pipeline_version),'') is null
     or nullif(btrim(p_parser_version),'') is null then
    raise exception using errcode='23514',message='pipeline and parser versions are required';
  end if;
  if p_metadata is null or jsonb_typeof(p_metadata)<>'object' then
    raise exception using errcode='23514',message='processing metadata must be an object';
  end if;

  select capture_status into v_capture_status
  from finance.receipts
  where id=p_receipt_id and user_id=v_user_id;

  if not found then
    raise exception using errcode='P0002',message='receipt not found';
  end if;
  if v_capture_status<>'ready' then
    raise exception using errcode='55000',message='receipt capture must be finalized before processing';
  end if;

  update finance.receipt_processing_runs
  set is_current=false
  where receipt_id=p_receipt_id and user_id=v_user_id and is_current;

  insert into finance.receipt_processing_runs(
    id,user_id,receipt_id,mode,pipeline_version,ocr_provider,ocr_model,
    parser_provider,parser_version,status,input_digest,is_current,metadata,started_at
  )
  values(
    v_run_id,v_user_id,p_receipt_id,p_mode,btrim(p_pipeline_version),
    nullif(btrim(p_ocr_provider),''),nullif(btrim(p_ocr_model),''),
    'deterministic',btrim(p_parser_version),'running',
    nullif(btrim(p_input_digest),''),true,p_metadata,now()
  );

  update finance.receipts
  set current_processing_run_id=v_run_id,
      processing_status='extracting',
      reconciliation_status='not_run',
      reconciliation_delta_minor=null,
      review_reasons='[]'::jsonb
  where id=p_receipt_id and user_id=v_user_id;

  return v_run_id;
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
  v_candidate_expected bigint;
  v_candidate_delta bigint;
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
    and processing_run_id=p_run_id;

  if v_item_sum is not null then
    v_candidates := v_candidates || jsonb_build_array(
      jsonb_build_object('formula','item_sum','expected',v_item_sum)
    );
    if coalesce(p_discount_minor,0)<>0 then
      v_candidates := v_candidates || jsonb_build_array(
        jsonb_build_object(
          'formula','item_sum_minus_receipt_discount',
          'expected',v_item_sum-coalesce(p_discount_minor,0)
        )
      );
    end if;
  end if;

  if p_subtotal_minor is not null then
    v_candidates := v_candidates || jsonb_build_array(
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
    'status',
      case
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

revoke all on function finance_private.best_receipt_reconciliation(uuid,uuid,bigint,bigint,bigint,bigint)
from public,anon,authenticated;

create or replace function finance.submit_receipt_extraction(
  p_run_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_user_id uuid := auth.uid();
  v_run finance.receipt_processing_runs%rowtype;
  v_receipt_id uuid;
  v_header jsonb;
  v_page jsonb;
  v_line jsonb;
  v_item jsonb;
  v_page_id uuid;
  v_line_id uuid;
  v_source_line_id uuid;
  v_merchant_id uuid;
  v_merchant_raw text;
  v_currency text;
  v_purchased_at timestamptz;
  v_subtotal bigint;
  v_tax bigint;
  v_discount bigint := 0;
  v_deposit bigint := 0;
  v_total bigint;
  v_receipt_number text;
  v_payment_method text;
  v_locale text;
  v_header_conf numeric;
  v_page_conf numeric;
  v_item_conf numeric;
  v_overall_conf numeric;
  v_page_count integer;
  v_actual_page_count integer;
  v_item_count integer;
  v_review_count integer;
  v_raw_ocr text;
  v_reconcile jsonb;
  v_reconcile_status finance.receipt_reconciliation_status;
  v_delta bigint;
  v_reasons jsonb := '[]'::jsonb;
  v_processing_status finance.receipt_processing_status;
  v_kind finance.receipt_line_kind;
  v_line_index integer;
  v_source_line_index integer;
  v_effective bigint;
  v_line_total bigint;
  v_item_discount bigint;
  v_item_deposit bigint;
  v_quantity numeric;
  v_conf numeric;
  v_review boolean;
  v_metadata jsonb;
begin
  if v_user_id is null then
    raise exception using errcode='42501',message='authentication required';
  end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' then
    raise exception using errcode='23514',message='extraction payload must be an object';
  end if;

  select * into v_run
  from finance.receipt_processing_runs
  where id=p_run_id and user_id=v_user_id;

  if not found then raise exception using errcode='P0002',message='processing run not found'; end if;
  if not v_run.is_current then raise exception using errcode='55000',message='processing run is no longer current'; end if;
  if v_run.status not in ('pending','running') then
    raise exception using errcode='55000',message='processing run is not writable';
  end if;

  v_receipt_id := v_run.receipt_id;
  v_header := coalesce(p_payload->'header','{}'::jsonb);

  if jsonb_typeof(v_header)<>'object'
     or jsonb_typeof(coalesce(p_payload->'pages','[]'::jsonb))<>'array'
     or jsonb_typeof(coalesce(p_payload->'lines','[]'::jsonb))<>'array'
     or jsonb_typeof(coalesce(p_payload->'items','[]'::jsonb))<>'array' then
    raise exception using errcode='23514',message='invalid extraction payload shape';
  end if;

  select count(*)::integer into v_actual_page_count
  from finance.receipt_pages
  where receipt_id=v_receipt_id and user_id=v_user_id and status='ready';

  v_page_count := jsonb_array_length(coalesce(p_payload->'pages','[]'::jsonb));
  if v_page_count<>v_actual_page_count then
    raise exception using errcode='23514',
      message=format('extraction has %s pages but receipt has %s ready pages',v_page_count,v_actual_page_count);
  end if;

  -- Validate page ownership and uniqueness before replacing current extraction.
  if exists(
    select 1
    from jsonb_array_elements(coalesce(p_payload->'pages','[]'::jsonb)) p
    left join finance.receipt_pages rp
      on rp.id=(p->>'page_id')::uuid
     and rp.receipt_id=v_receipt_id
     and rp.user_id=v_user_id
     and rp.status='ready'
    where rp.id is null
  ) then
    raise exception using errcode='23503',message='extraction contains a page outside this receipt';
  end if;

  if (
    select count(distinct (p->>'page_id')::uuid)
    from jsonb_array_elements(coalesce(p_payload->'pages','[]'::jsonb)) p
  )<>v_page_count then
    raise exception using errcode='23514',message='extraction contains duplicate pages';
  end if;

  -- Parse header before mutating current projection.
  v_merchant_raw := nullif(btrim(v_header->>'merchant_name'),'');
  if v_merchant_raw is not null then
    v_merchant_id := finance.resolve_merchant(v_merchant_raw);
  end if;

  v_currency := upper(coalesce(nullif(v_header->>'currency_code',''),'EUR'));
  if v_currency !~ '^[A-Z]{3}$' then
    raise exception using errcode='23514',message='invalid extracted currency';
  end if;

  if nullif(v_header->>'purchased_at','') is not null then
    v_purchased_at := (v_header->>'purchased_at')::timestamptz;
  end if;
  if v_header ? 'subtotal_minor' and v_header->>'subtotal_minor' is not null then
    v_subtotal := (v_header->>'subtotal_minor')::bigint;
  end if;
  if v_header ? 'tax_minor' and v_header->>'tax_minor' is not null then
    v_tax := (v_header->>'tax_minor')::bigint;
  end if;
  if v_header ? 'discount_minor' and v_header->>'discount_minor' is not null then
    v_discount := greatest((v_header->>'discount_minor')::bigint,0);
  end if;
  if v_header ? 'deposit_minor' and v_header->>'deposit_minor' is not null then
    v_deposit := greatest((v_header->>'deposit_minor')::bigint,0);
  end if;
  if v_header ? 'total_minor' and v_header->>'total_minor' is not null then
    v_total := (v_header->>'total_minor')::bigint;
    if v_total<0 then raise exception using errcode='23514',message='receipt total cannot be negative'; end if;
  end if;
  v_receipt_number := nullif(btrim(v_header->>'receipt_number'),'');
  v_payment_method := nullif(btrim(v_header->>'payment_method'),'');
  v_locale := nullif(btrim(v_header->>'locale'),'');
  if v_header ? 'confidence' and v_header->>'confidence' is not null then
    v_header_conf := (v_header->>'confidence')::numeric;
    if v_header_conf<0 or v_header_conf>1 then raise exception using errcode='23514',message='header confidence out of range'; end if;
  end if;

  -- Replace only the current projection after all basic validation passed.
  delete from finance.receipt_items
  where receipt_id=v_receipt_id and user_id=v_user_id;

  delete from finance.receipt_page_extractions
  where run_id=p_run_id and user_id=v_user_id;
  delete from finance.receipt_lines
  where run_id=p_run_id and user_id=v_user_id;

  v_raw_ocr := '';
  for v_page in
    select value
    from jsonb_array_elements(coalesce(p_payload->'pages','[]'::jsonb))
    order by (value->>'page_index')::integer
  loop
    v_page_id := (v_page->>'page_id')::uuid;
    v_conf := null;
    if v_page ? 'confidence' and v_page->>'confidence' is not null then
      v_conf := (v_page->>'confidence')::numeric;
      if v_conf<0 or v_conf>1 then raise exception using errcode='23514',message='page confidence out of range'; end if;
    end if;

    insert into finance.receipt_page_extractions(
      user_id,receipt_id,page_id,run_id,page_index,raw_text,confidence,blocks,metadata
    )
    values(
      v_user_id,v_receipt_id,v_page_id,p_run_id,(v_page->>'page_index')::integer,
      coalesce(v_page->>'raw_text',''),v_conf,v_page->'blocks',
      coalesce(v_page->'metadata','{}'::jsonb)
    );

    v_raw_ocr := v_raw_ocr ||
      case when v_raw_ocr='' then '' else E'\n\n--- PAGE ---\n\n' end ||
      coalesce(v_page->>'raw_text','');
  end loop;

  for v_line in
    select value
    from jsonb_array_elements(coalesce(p_payload->'lines','[]'::jsonb))
    order by (value->>'line_index')::integer
  loop
    v_line_index := (v_line->>'line_index')::integer;
    v_page_id := case
      when nullif(v_line->>'page_id','') is null then null
      else (v_line->>'page_id')::uuid
    end;
    if v_page_id is not null and not exists(
      select 1 from finance.receipt_pages
      where id=v_page_id and receipt_id=v_receipt_id and user_id=v_user_id
    ) then
      raise exception using errcode='23503',message='line page does not belong to receipt';
    end if;

    v_kind := coalesce(nullif(v_line->>'kind',''),'unknown')::finance.receipt_line_kind;
    v_conf := case when v_line ? 'confidence' and v_line->>'confidence' is not null
      then (v_line->>'confidence')::numeric else null end;
    if v_conf is not null and (v_conf<0 or v_conf>1) then
      raise exception using errcode='23514',message='line confidence out of range';
    end if;

    insert into finance.receipt_lines(
      user_id,receipt_id,page_id,run_id,line_index,page_line_index,
      raw_text,normalized_text,kind,amount_minor,quantity,unit_price_minor,
      confidence,bbox,metadata
    )
    values(
      v_user_id,v_receipt_id,v_page_id,p_run_id,v_line_index,
      case when v_line ? 'page_line_index' and v_line->>'page_line_index' is not null
        then (v_line->>'page_line_index')::integer else null end,
      btrim(v_line->>'raw_text'),nullif(btrim(v_line->>'normalized_text'),''),
      v_kind,
      case when v_line ? 'amount_minor' and v_line->>'amount_minor' is not null
        then (v_line->>'amount_minor')::bigint else null end,
      case when v_line ? 'quantity' and v_line->>'quantity' is not null
        then (v_line->>'quantity')::numeric else null end,
      case when v_line ? 'unit_price_minor' and v_line->>'unit_price_minor' is not null
        then (v_line->>'unit_price_minor')::bigint else null end,
      v_conf,v_line->'bbox',coalesce(v_line->'metadata','{}'::jsonb)
    );
  end loop;

  for v_item in
    select value
    from jsonb_array_elements(coalesce(p_payload->'items','[]'::jsonb))
    order by (value->>'line_index')::integer
  loop
    v_line_index := (v_item->>'line_index')::integer;
    v_source_line_index := case
      when v_item ? 'source_line_index' and v_item->>'source_line_index' is not null
      then (v_item->>'source_line_index')::integer
      else v_line_index
    end;

    select id,page_id into v_source_line_id,v_page_id
    from finance.receipt_lines
    where run_id=p_run_id and user_id=v_user_id and line_index=v_source_line_index;

    if v_source_line_id is null then
      raise exception using errcode='23503',
        message=format('receipt item source line %s not found',v_source_line_index);
    end if;

    v_quantity := coalesce((v_item->>'quantity')::numeric,1);
    if v_quantity<=0 then raise exception using errcode='23514',message='item quantity must be positive'; end if;

    v_line_total := (v_item->>'line_total_minor')::bigint;
    v_item_discount := coalesce((v_item->>'discount_minor')::bigint,0);
    v_item_deposit := coalesce((v_item->>'deposit_minor')::bigint,0);
    if v_item_discount<0 or v_item_deposit<0 then
      raise exception using errcode='23514',message='item discount/deposit cannot be negative';
    end if;

    v_effective := case
      when v_item ? 'effective_total_minor' and v_item->>'effective_total_minor' is not null
      then (v_item->>'effective_total_minor')::bigint
      else v_line_total-v_item_discount+v_item_deposit
    end;

    v_conf := case when v_item ? 'confidence' and v_item->>'confidence' is not null
      then (v_item->>'confidence')::numeric else null end;
    if v_conf is not null and (v_conf<0 or v_conf>1) then
      raise exception using errcode='23514',message='item confidence out of range';
    end if;

    v_review := coalesce((v_item->>'review_required')::boolean,false)
                or v_conf is null or v_conf<0.80;
    v_metadata := coalesce(v_item->'metadata','{}'::jsonb);

    insert into finance.receipt_items(
      user_id,receipt_id,line_index,raw_name,normalized_name,
      necessity,quantity,unit_price_minor,line_total_minor,discount_minor,
      deposit_minor,effective_total_minor,confidence,review_required,metadata,
      source_line_id,processing_run_id,source_page_id
    )
    values(
      v_user_id,v_receipt_id,v_line_index,btrim(v_item->>'raw_name'),
      nullif(btrim(v_item->>'normalized_name'),''),
      'unclassified',v_quantity,
      case when v_item ? 'unit_price_minor' and v_item->>'unit_price_minor' is not null
        then (v_item->>'unit_price_minor')::bigint else null end,
      v_line_total,v_item_discount,v_item_deposit,v_effective,
      v_conf,v_review,v_metadata,v_source_line_id,p_run_id,v_page_id
    );
  end loop;

  select count(*)::integer,
         count(*) filter(where review_required)::integer,
         avg(confidence)
  into v_item_count,v_review_count,v_item_conf
  from finance.receipt_items
  where receipt_id=v_receipt_id and processing_run_id=p_run_id;

  select avg(confidence) into v_page_conf
  from finance.receipt_page_extractions
  where run_id=p_run_id and user_id=v_user_id;

  v_overall_conf := coalesce(
    v_header_conf,
    case when v_item_conf is not null and v_page_conf is not null
      then (v_item_conf+v_page_conf)/2
      else coalesce(v_item_conf,v_page_conf)
    end
  );

  v_reconcile := finance_private.best_receipt_reconciliation(
    v_receipt_id,p_run_id,v_total,v_subtotal,v_discount,v_deposit
  );
  v_reconcile_status := (v_reconcile->>'status')::finance.receipt_reconciliation_status;
  v_delta := case when v_reconcile->>'delta_minor' is null then null
                  else (v_reconcile->>'delta_minor')::bigint end;

  if v_total is null then v_reasons := v_reasons||jsonb_build_array('total_missing'); end if;
  if v_item_count=0 then v_reasons := v_reasons||jsonb_build_array('items_missing'); end if;
  if v_reconcile_status='mismatch' then v_reasons := v_reasons||jsonb_build_array('arithmetic_mismatch'); end if;
  if v_reconcile_status='insufficient_data' then v_reasons := v_reasons||jsonb_build_array('reconciliation_insufficient'); end if;
  if v_overall_conf is null or v_overall_conf<0.85 then v_reasons := v_reasons||jsonb_build_array('low_confidence'); end if;
  if v_review_count>0 then v_reasons := v_reasons||jsonb_build_array('item_review_required'); end if;
  if v_merchant_raw is null then
    v_reasons := v_reasons||jsonb_build_array('merchant_missing');
  elsif v_merchant_id is null then
    v_reasons := v_reasons||jsonb_build_array('merchant_unresolved');
  end if;
  if v_purchased_at is null then v_reasons := v_reasons||jsonb_build_array('purchase_time_missing'); end if;

  v_processing_status := case
    when jsonb_array_length(v_reasons)>0 then 'review_required'::finance.receipt_processing_status
    else 'normalizing'::finance.receipt_processing_status
  end;

  update finance.receipts
  set merchant_id=v_merchant_id,
      merchant_raw_name=v_merchant_raw,
      merchant_address_raw=nullif(btrim(v_header->>'merchant_address'),''),
      purchased_at=v_purchased_at,
      currency_code=v_currency,
      subtotal_minor=v_subtotal,
      tax_minor=v_tax,
      discount_minor=v_discount,
      deposit_minor=v_deposit,
      total_minor=v_total,
      receipt_number=v_receipt_number,
      payment_method_raw=v_payment_method,
      locale=v_locale,
      raw_ocr=v_raw_ocr,
      overall_confidence=v_overall_conf,
      reconciliation_status=v_reconcile_status,
      reconciliation_delta_minor=v_delta,
      review_reasons=v_reasons,
      processing_status=v_processing_status,
      metadata=metadata||jsonb_build_object(
        'reconciliation_formula',v_reconcile->>'formula',
        'reconciliation_expected_minor',v_reconcile->'expected_minor',
        'extraction_pipeline_version',v_run.pipeline_version,
        'extraction_parser_version',v_run.parser_version
      )
  where id=v_receipt_id and user_id=v_user_id;

  update finance.receipt_processing_runs
  set status='succeeded',
      confidence=v_overall_conf,
      completed_at=now(),
      duration_ms=case when started_at is null then null
        else greatest(0,(extract(epoch from (now()-started_at))*1000)::integer) end
  where id=p_run_id and user_id=v_user_id;

  return finance.get_receipt_processing(v_receipt_id);
end;
$$;

create or replace function finance.fail_receipt_processing(
  p_run_id uuid,
  p_error_text text,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_user_id uuid := auth.uid();
  v_receipt_id uuid;
  v_is_current boolean;
begin
  if v_user_id is null then raise exception using errcode='42501',message='authentication required'; end if;
  if nullif(btrim(p_error_text),'') is null then raise exception using errcode='23514',message='processing error is required'; end if;
  if p_metadata is null or jsonb_typeof(p_metadata)<>'object' then
    raise exception using errcode='23514',message='failure metadata must be an object';
  end if;

  select receipt_id,is_current into v_receipt_id,v_is_current
  from finance.receipt_processing_runs
  where id=p_run_id and user_id=v_user_id;

  if not found then raise exception using errcode='P0002',message='processing run not found'; end if;

  update finance.receipt_processing_runs
  set status='failed',error_text=btrim(p_error_text),metadata=metadata||p_metadata,
      completed_at=now(),
      duration_ms=case when started_at is null then null
        else greatest(0,(extract(epoch from (now()-started_at))*1000)::integer) end
  where id=p_run_id and user_id=v_user_id;

  if v_is_current then
    update finance.receipts
    set processing_status='processing_failed',
        review_reasons=(
          select coalesce(jsonb_agg(distinct x),'[]'::jsonb)
          from jsonb_array_elements(review_reasons||jsonb_build_array('processing_failed')) x
        )
    where id=v_receipt_id and user_id=v_user_id;
  end if;
end;
$$;

create or replace function finance.get_receipt_processing(
  p_receipt_id uuid
)
returns jsonb
language sql
stable
security invoker
set search_path=''
as $$
  select jsonb_build_object(
    'summary',jsonb_build_object(
      'receipt_id',r.id,
      'processing_status',r.processing_status,
      'current_processing_run_id',r.current_processing_run_id,
      'merchant_id',r.merchant_id,
      'merchant_raw_name',r.merchant_raw_name,
      'merchant_address_raw',r.merchant_address_raw,
      'purchased_at',r.purchased_at,
      'receipt_number',r.receipt_number,
      'payment_method_raw',r.payment_method_raw,
      'locale',r.locale,
      'currency_code',r.currency_code,
      'subtotal_minor',r.subtotal_minor,
      'tax_minor',r.tax_minor,
      'discount_minor',r.discount_minor,
      'deposit_minor',r.deposit_minor,
      'total_minor',r.total_minor,
      'overall_confidence',r.overall_confidence,
      'reconciliation_status',r.reconciliation_status,
      'reconciliation_delta_minor',r.reconciliation_delta_minor,
      'review_reasons',r.review_reasons
    ),
    'run',case when pr.id is null then null else jsonb_build_object(
      'id',pr.id,
      'mode',pr.mode,
      'pipeline_version',pr.pipeline_version,
      'ocr_provider',pr.ocr_provider,
      'ocr_model',pr.ocr_model,
      'parser_provider',pr.parser_provider,
      'parser_version',pr.parser_version,
      'status',pr.status,
      'confidence',pr.confidence,
      'duration_ms',pr.duration_ms,
      'error_text',pr.error_text,
      'started_at',pr.started_at,
      'completed_at',pr.completed_at
    ) end,
    'pages',coalesce((
      select jsonb_agg(jsonb_build_object(
        'page_id',pe.page_id,
        'page_index',pe.page_index,
        'raw_text',pe.raw_text,
        'confidence',pe.confidence,
        'blocks',pe.blocks,
        'metadata',pe.metadata
      ) order by pe.page_index)
      from finance.receipt_page_extractions pe
      where pe.run_id=pr.id and pe.user_id=pr.user_id
    ),'[]'::jsonb),
    'lines',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',rl.id,
        'page_id',rl.page_id,
        'line_index',rl.line_index,
        'page_line_index',rl.page_line_index,
        'raw_text',rl.raw_text,
        'normalized_text',rl.normalized_text,
        'kind',rl.kind,
        'amount_minor',rl.amount_minor,
        'quantity',rl.quantity,
        'unit_price_minor',rl.unit_price_minor,
        'confidence',rl.confidence,
        'bbox',rl.bbox,
        'metadata',rl.metadata
      ) order by rl.line_index)
      from finance.receipt_lines rl
      where rl.run_id=pr.id and rl.user_id=pr.user_id
    ),'[]'::jsonb),
    'items',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',ri.id,
        'line_index',ri.line_index,
        'source_line_id',ri.source_line_id,
        'source_page_id',ri.source_page_id,
        'raw_name',ri.raw_name,
        'normalized_name',ri.normalized_name,
        'quantity',ri.quantity,
        'unit_price_minor',ri.unit_price_minor,
        'line_total_minor',ri.line_total_minor,
        'discount_minor',ri.discount_minor,
        'deposit_minor',ri.deposit_minor,
        'effective_total_minor',ri.effective_total_minor,
        'confidence',ri.confidence,
        'review_required',ri.review_required,
        'metadata',ri.metadata
      ) order by ri.line_index)
      from finance.receipt_items ri
      where ri.processing_run_id=pr.id and ri.user_id=pr.user_id
    ),'[]'::jsonb)
  )
  from finance.receipts r
  left join finance.receipt_processing_runs pr
    on pr.id=r.current_processing_run_id and pr.user_id=r.user_id
  where r.id=p_receipt_id;
$$;

do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='finance'
      and p.proname in (
        'begin_receipt_processing','submit_receipt_extraction',
        'fail_receipt_processing','get_receipt_processing'
      )
  loop
    execute format('revoke all on function %s from public,anon',f);
    execute format('grant execute on function %s to authenticated,service_role',f);
  end loop;
end $$;
