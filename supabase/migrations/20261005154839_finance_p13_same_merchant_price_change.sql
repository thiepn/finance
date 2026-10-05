CREATE OR REPLACE FUNCTION finance.get_product_intelligence(p_product_id uuid, p_range text DEFAULT '1y'::text, p_anchor_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_range text := lower(btrim(coalesce(p_range,'1y')));
  v_time_zone text := 'Europe/Berlin';
  v_currency text := 'EUR';
  v_locale text := 'de-DE';
  v_anchor date;
  v_end_date date;
  v_start_date date;
  v_compare_start_date date;
  v_compare_end_date date;
  v_bucket text;
  v_step interval;
  v_product finance.products%rowtype;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception using errcode='42501',message='authentication required';
  end if;

  select *
  into v_product
  from finance.products p
  where p.user_id=v_user_id
    and p.id=p_product_id
    and not p.is_archived;

  if not found then
    raise exception using errcode='23503',message='product not found';
  end if;

  select
    coalesce(p.time_zone,'Europe/Berlin'),
    coalesce(p.reporting_currency,'EUR'),
    coalesce(p.locale,'de-DE')
  into v_time_zone,v_currency,v_locale
  from finance.profiles p
  where p.user_id=v_user_id;

  v_anchor := coalesce(p_anchor_date,(now() at time zone v_time_zone)::date);
  v_end_date := v_anchor+1;

  if v_range='1m' then
    v_start_date := (v_end_date-interval '1 month')::date;
    v_compare_end_date := v_start_date;
    v_compare_start_date := (v_start_date-interval '1 month')::date;
    v_bucket := 'day';
    v_step := interval '1 day';
  elsif v_range='3m' then
    v_start_date := (v_end_date-interval '3 months')::date;
    v_compare_end_date := v_start_date;
    v_compare_start_date := (v_start_date-interval '3 months')::date;
    v_bucket := 'week';
    v_step := interval '1 week';
  elsif v_range='6m' then
    v_start_date := (v_end_date-interval '6 months')::date;
    v_compare_end_date := v_start_date;
    v_compare_start_date := (v_start_date-interval '6 months')::date;
    v_bucket := 'week';
    v_step := interval '1 week';
  elsif v_range='1y' then
    v_start_date := (v_end_date-interval '1 year')::date;
    v_compare_end_date := v_start_date;
    v_compare_start_date := (v_start_date-interval '1 year')::date;
    v_bucket := 'month';
    v_step := interval '1 month';
  elsif v_range='all' then
    v_start_date := coalesce(
      (
        select min(coalesce(r.purchased_at,r.capture_finalized_at,r.created_at)
          at time zone v_time_zone)::date
        from finance.receipt_items ri
        join finance.receipts r
          on r.id=ri.receipt_id and r.user_id=ri.user_id
        join finance.receipt_transaction_matches rtm
          on rtm.receipt_id=r.id
         and rtm.user_id=r.user_id
         and rtm.status='confirmed'
        join finance.transactions t
          on t.id=rtm.transaction_id
         and t.user_id=rtm.user_id
         and t.status='posted'
         and t.type='expense'
        where ri.user_id=v_user_id
          and ri.product_id=p_product_id
          and not ri.is_excluded
          and r.processing_status='confirmed'
      ),
      (v_end_date-interval '1 month')::date
    );
    if v_start_date>=v_end_date then
      v_start_date := (v_end_date-interval '1 month')::date;
    end if;
    v_compare_start_date := null;
    v_compare_end_date := null;
    if (v_end_date-v_start_date)>730 then
      v_bucket := 'quarter';
      v_step := interval '3 months';
    else
      v_bucket := 'month';
      v_step := interval '1 month';
    end if;
  else
    raise exception using errcode='23514',
      message='product range must be 1m, 3m, 6m, 1y, or all';
  end if;

  with
  receipt_fact as (
    select
      r.id as receipt_id,
      coalesce(r.purchased_at,min(t.occurred_at)) as event_at,
      coalesce(
        r.merchant_id,
        (array_agg(t.merchant_id order by t.occurred_at)
          filter(where t.merchant_id is not null))[1]
      ) as merchant_id
    from finance.receipts r
    join finance.receipt_transaction_matches rtm
      on rtm.receipt_id=r.id
     and rtm.user_id=r.user_id
     and rtm.status='confirmed'
    join finance.transactions t
      on t.id=rtm.transaction_id
     and t.user_id=rtm.user_id
     and t.status='posted'
     and t.type='expense'
    where r.user_id=v_user_id
      and r.processing_status='confirmed'
    group by r.id,r.purchased_at,r.merchant_id
  ),
  evidence_all as (
    select
      ri.id as receipt_item_id,
      ri.receipt_id,
      ri.product_id,
      ri.quantity,
      ri.effective_total_minor,
      ri.unit_price_minor,
      rf.event_at,
      rf.merchant_id,
      m.name as merchant_name,
      pp.list_unit_price_minor,
      pp.effective_unit_price_minor,
      pp.currency_code
    from receipt_fact rf
    join finance.receipt_items ri
      on ri.receipt_id=rf.receipt_id
     and ri.user_id=v_user_id
     and not ri.is_excluded
     and ri.product_id is not null
    left join finance.product_prices pp
      on pp.receipt_item_id=ri.id
     and pp.user_id=ri.user_id
     and pp.product_id=ri.product_id
     and pp.is_active
    left join finance.merchants m
      on m.id=rf.merchant_id and m.user_id=v_user_id
  ),
  evidence as (
    select * from evidence_all
    where product_id=p_product_id
  ),
  periods as (
    select
      'current'::text as period_key,
      v_start_date::timestamp at time zone v_time_zone as start_at,
      v_end_date::timestamp at time zone v_time_zone as end_at,
      v_start_date::timestamp as local_start,
      v_end_date::timestamp as local_end
    union all
    select
      'comparison',
      v_compare_start_date::timestamp at time zone v_time_zone,
      v_compare_end_date::timestamp at time zone v_time_zone,
      v_compare_start_date::timestamp,
      v_compare_end_date::timestamp
    where v_compare_start_date is not null
  ),
  period_evidence as (
    select p.period_key,e.*
    from periods p
    join evidence e
      on e.event_at>=p.start_at and e.event_at<p.end_at
  ),
  summary as (
    select
      period_key,
      count(distinct receipt_id)::integer as purchase_count,
      coalesce(sum(effective_total_minor),0)::bigint as total_spend_minor,
      coalesce(sum(quantity),0)::numeric as total_quantity,
      min(event_at) as first_purchase_at,
      max(event_at) as last_purchase_at,
      min(effective_unit_price_minor) filter(
        where effective_unit_price_minor is not null
      )::bigint as min_unit_price_minor,
      max(effective_unit_price_minor) filter(
        where effective_unit_price_minor is not null
      )::bigint as max_unit_price_minor,
      round(avg(effective_unit_price_minor) filter(
        where effective_unit_price_minor is not null
      ))::bigint as avg_unit_price_minor,
      count(effective_unit_price_minor)::integer as price_observation_count
    from period_evidence
    group by period_key
  ),
  current_summary as (
    select
      coalesce(max(purchase_count),0)::integer as purchase_count,
      coalesce(max(total_spend_minor),0)::bigint as total_spend_minor,
      coalesce(max(total_quantity),0)::numeric as total_quantity,
      max(first_purchase_at) as first_purchase_at,
      max(last_purchase_at) as last_purchase_at,
      max(min_unit_price_minor)::bigint as min_unit_price_minor,
      max(max_unit_price_minor)::bigint as max_unit_price_minor,
      max(avg_unit_price_minor)::bigint as avg_unit_price_minor,
      coalesce(max(price_observation_count),0)::integer as price_observation_count
    from summary where period_key='current'
  ),
  comparison_summary as (
    select
      coalesce(max(purchase_count),0)::integer as purchase_count,
      coalesce(max(total_spend_minor),0)::bigint as total_spend_minor,
      coalesce(max(total_quantity),0)::numeric as total_quantity,
      max(first_purchase_at) as first_purchase_at,
      max(last_purchase_at) as last_purchase_at,
      max(min_unit_price_minor)::bigint as min_unit_price_minor,
      max(max_unit_price_minor)::bigint as max_unit_price_minor,
      max(avg_unit_price_minor)::bigint as avg_unit_price_minor,
      coalesce(max(price_observation_count),0)::integer as price_observation_count
    from summary where period_key='comparison'
  ),
  buckets as (
    select
      p.period_key,
      row_number() over(partition by p.period_key order by gs)::integer as bucket_index,
      (gs at time zone v_time_zone) as bucket_start,
      (least(gs+v_step,p.local_end) at time zone v_time_zone) as bucket_end
    from periods p
    cross join lateral generate_series(
      p.local_start,
      p.local_end-interval '1 microsecond',
      v_step
    ) gs
  ),
  frequency as (
    select
      b.period_key,b.bucket_index,b.bucket_start,b.bucket_end,
      count(distinct pe.receipt_id)::integer as purchase_count,
      coalesce(sum(pe.quantity),0)::numeric as quantity,
      coalesce(sum(pe.effective_total_minor),0)::bigint as spend_minor
    from buckets b
    left join period_evidence pe
      on pe.period_key=b.period_key
     and pe.event_at>=b.bucket_start
     and pe.event_at<b.bucket_end
    group by b.period_key,b.bucket_index,b.bucket_start,b.bucket_end
  ),
  price_ranked as (
    select
      e.*,
      row_number() over(order by e.event_at desc,e.receipt_item_id desc) as rn_desc,
      count(*) over() as total_count
    from evidence e
    where e.event_at>=v_start_date::timestamp at time zone v_time_zone
      and e.event_at<v_end_date::timestamp at time zone v_time_zone
      and e.effective_unit_price_minor is not null
  ),
  price_selected as (
    select *
    from price_ranked
    where rn_desc<=500
  ),
  latest_observation as (
    select e.*
    from evidence e
    where e.event_at<v_end_date::timestamp at time zone v_time_zone
      and e.effective_unit_price_minor is not null
    order by e.event_at desc,e.receipt_item_id desc
    limit 1
  ),
  latest_change as (
    select
      l.effective_unit_price_minor::bigint as latest_price_minor,
      p.effective_unit_price_minor::bigint as previous_price_minor,
      l.event_at as latest_price_at,
      l.merchant_id as latest_merchant_id,
      l.merchant_name as latest_merchant_name
    from latest_observation l
    left join lateral (
      select e.effective_unit_price_minor
      from evidence e
      where e.effective_unit_price_minor is not null
        and e.merchant_id is not distinct from l.merchant_id
        and e.receipt_item_id<>l.receipt_item_id
        and e.event_at<=l.event_at
      order by e.event_at desc,e.receipt_item_id desc
      limit 1
    ) p on true
  ),
  merchant_stats_base as (
    select
      e.merchant_id,
      coalesce(e.merchant_name,'Unassigned merchant') as merchant_name,
      count(distinct e.receipt_id)::integer as purchase_count,
      coalesce(sum(e.effective_total_minor),0)::bigint as spend_minor,
      min(e.effective_unit_price_minor) filter(
        where e.effective_unit_price_minor is not null
      )::bigint as min_unit_price_minor,
      max(e.effective_unit_price_minor) filter(
        where e.effective_unit_price_minor is not null
      )::bigint as max_unit_price_minor,
      round(avg(e.effective_unit_price_minor) filter(
        where e.effective_unit_price_minor is not null
      ))::bigint as avg_unit_price_minor,
      max(e.event_at) as last_purchase_at
    from evidence e
    where e.event_at>=v_start_date::timestamp at time zone v_time_zone
      and e.event_at<v_end_date::timestamp at time zone v_time_zone
    group by e.merchant_id,coalesce(e.merchant_name,'Unassigned merchant')
  ),
  merchant_latest as (
    select distinct on (e.merchant_id)
      e.merchant_id,
      e.effective_unit_price_minor as latest_unit_price_minor,
      e.event_at as latest_price_at
    from evidence e
    where e.event_at>=v_start_date::timestamp at time zone v_time_zone
      and e.event_at<v_end_date::timestamp at time zone v_time_zone
      and e.effective_unit_price_minor is not null
    order by e.merchant_id,e.event_at desc,e.receipt_item_id desc
  ),
  merchant_previous as (
    select merchant_id,effective_unit_price_minor as previous_unit_price_minor
    from (
      select
        e.merchant_id,
        e.effective_unit_price_minor,
        row_number() over(
          partition by e.merchant_id
          order by e.event_at desc,e.receipt_item_id desc
        ) as rn
      from evidence e
      where e.event_at<v_end_date::timestamp at time zone v_time_zone
        and e.effective_unit_price_minor is not null
    ) x
    where rn=2
  ),
  merchant_stats as (
    select
      b.*,
      l.latest_unit_price_minor,
      l.latest_price_at,
      p.previous_unit_price_minor,
      case
        when l.latest_unit_price_minor is not null
          and p.previous_unit_price_minor is not null
          then l.latest_unit_price_minor-p.previous_unit_price_minor
        else null
      end as price_change_minor,
      case
        when p.previous_unit_price_minor is not null
          and p.previous_unit_price_minor<>0
          then (l.latest_unit_price_minor-p.previous_unit_price_minor)::numeric
            /p.previous_unit_price_minor::numeric
        else null
      end as price_change_ratio
    from merchant_stats_base b
    left join merchant_latest l
      on l.merchant_id is not distinct from b.merchant_id
    left join merchant_previous p
      on p.merchant_id is not distinct from b.merchant_id
  ),
  cheapest as (
    select *
    from merchant_stats
    where latest_unit_price_minor is not null
    order by latest_unit_price_minor,last_purchase_at desc
    limit 1
  ),
  family_rows as (
    select
      fp.id,
      fp.name,
      fp.variant_name,
      fp.size_value,
      fp.size_unit,
      count(distinct e.receipt_id)::integer as purchase_count,
      coalesce(sum(e.effective_total_minor),0)::bigint as spend_minor,
      max(e.event_at) as last_purchase_at
    from finance.products fp
    left join evidence_all e
      on e.product_id=fp.id
     and e.event_at>=v_start_date::timestamp at time zone v_time_zone
     and e.event_at<v_end_date::timestamp at time zone v_time_zone
    where fp.user_id=v_user_id
      and not fp.is_archived
      and v_product.family_id is not null
      and fp.family_id=v_product.family_id
    group by fp.id,fp.name,fp.variant_name,fp.size_value,fp.size_unit
  ),
  family_latest_prices as (
    select distinct on (fp.id)
      fp.id as product_id,
      e.effective_unit_price_minor,
      e.merchant_id,
      e.merchant_name,
      e.event_at,
      case
        when e.effective_unit_price_minor is null
          or fp.size_value is null
          or fp.size_value<=0
          or fp.size_unit not in ('g','ml','count')
          then null
        when fp.size_unit in ('g','ml')
          then round(e.effective_unit_price_minor::numeric*100/fp.size_value)::bigint
        else round(e.effective_unit_price_minor::numeric/fp.size_value)::bigint
      end as basis_price_minor,
      case
        when fp.size_unit='g' then '100 g'
        when fp.size_unit='ml' then '100 ml'
        when fp.size_unit='count' then '1 count'
        else null
      end as basis_label
    from finance.products fp
    join evidence_all e on e.product_id=fp.id
    where fp.user_id=v_user_id
      and not fp.is_archived
      and v_product.family_id is not null
      and fp.family_id=v_product.family_id
      and e.event_at<v_end_date::timestamp at time zone v_time_zone
      and e.effective_unit_price_minor is not null
    order by fp.id,e.event_at desc,e.receipt_item_id desc
  ),
  family_combined as (
    select
      f.*,
      p.effective_unit_price_minor as latest_unit_price_minor,
      p.merchant_id as latest_merchant_id,
      p.merchant_name as latest_merchant_name,
      p.event_at as latest_price_at,
      p.basis_price_minor,
      p.basis_label
    from family_rows f
    left join family_latest_prices p on p.product_id=f.id
  ),
  product_meta as (
    select
      p.id,p.name,p.brand,p.family_id,
      coalesce(pf.name,p.family_name) as family_name,
      p.variant_name,p.product_type,p.barcode,p.size_value,p.size_unit,
      p.default_category_id,c.name as category_name,
      p.default_necessity::text as necessity
    from finance.products p
    left join finance.product_families pf
      on pf.id=p.family_id and pf.user_id=p.user_id
    left join finance.categories c
      on c.id=p.default_category_id and c.user_id=p.user_id
    where p.user_id=v_user_id and p.id=p_product_id
  )
  select jsonb_build_object(
    'profile',jsonb_build_object(
      'currency_code',v_currency,'locale',v_locale,'time_zone',v_time_zone
    ),
    'range',v_range,
    'anchor_date',v_anchor,
    'bucket_kind',v_bucket,
    'period',jsonb_build_object(
      'start',v_start_date::timestamp at time zone v_time_zone,
      'end',v_end_date::timestamp at time zone v_time_zone,
      'compare_start',case when v_compare_start_date is null then null
        else v_compare_start_date::timestamp at time zone v_time_zone end,
      'compare_end',case when v_compare_end_date is null then null
        else v_compare_end_date::timestamp at time zone v_time_zone end
    ),
    'product',(select to_jsonb(pm) from product_meta pm),
    'summary',jsonb_build_object(
      'current',(select to_jsonb(cs) from current_summary cs),
      'comparison',(select to_jsonb(cs) from comparison_summary cs),
      'spend_delta_minor',(select c.total_spend_minor-p.total_spend_minor
        from current_summary c cross join comparison_summary p),
      'spend_delta_ratio',(select case when p.total_spend_minor>0
        then (c.total_spend_minor-p.total_spend_minor)::numeric/p.total_spend_minor::numeric
        else null end
        from current_summary c cross join comparison_summary p),
      'purchase_delta',(select c.purchase_count-p.purchase_count
        from current_summary c cross join comparison_summary p),
      'purchase_delta_ratio',(select case when p.purchase_count>0
        then (c.purchase_count-p.purchase_count)::numeric/p.purchase_count::numeric
        else null end
        from current_summary c cross join comparison_summary p),
      'quantity_delta',(select c.total_quantity-p.total_quantity
        from current_summary c cross join comparison_summary p),
      'quantity_delta_ratio',(select case when p.total_quantity>0
        then (c.total_quantity-p.total_quantity)::numeric/p.total_quantity::numeric
        else null end
        from current_summary c cross join comparison_summary p)
    ),
    'latest_price',(
      select jsonb_build_object(
        'latest_unit_price_minor',lc.latest_price_minor,
        'previous_unit_price_minor',lc.previous_price_minor,
        'change_minor',case when lc.latest_price_minor is not null and lc.previous_price_minor is not null
          then lc.latest_price_minor-lc.previous_price_minor else null end,
        'change_ratio',case when lc.previous_price_minor is not null and lc.previous_price_minor<>0
          then (lc.latest_price_minor-lc.previous_price_minor)::numeric/lc.previous_price_minor::numeric else null end,
        'direction',case
          when lc.latest_price_minor is null or lc.previous_price_minor is null then 'insufficient_history'
          when lc.latest_price_minor=lc.previous_price_minor then 'stable'
          when (lc.latest_price_minor-lc.previous_price_minor)::numeric/lc.previous_price_minor::numeric>=0.05 then 'up'
          when (lc.latest_price_minor-lc.previous_price_minor)::numeric/lc.previous_price_minor::numeric<=-0.05 then 'down'
          else 'stable'
        end,
        'observed_at',lc.latest_price_at,
        'merchant_id',lc.latest_merchant_id,
        'merchant_name',lc.latest_merchant_name,
        'basis_price_minor',case
          when lc.latest_price_minor is null
            or v_product.size_value is null
            or v_product.size_value<=0
            or v_product.size_unit not in ('g','ml','count') then null
          when v_product.size_unit in ('g','ml')
            then round(lc.latest_price_minor::numeric*100/v_product.size_value)::bigint
          else round(lc.latest_price_minor::numeric/v_product.size_value)::bigint
        end,
        'basis_label',case
          when v_product.size_unit='g' then '100 g'
          when v_product.size_unit='ml' then '100 ml'
          when v_product.size_unit='count' then '1 count'
          else null
        end
      )
      from latest_change lc
    ),
    'frequency',jsonb_build_object(
      'current',coalesce((
        select jsonb_agg(jsonb_build_object(
          'bucket_index',f.bucket_index,
          'bucket_start',f.bucket_start,
          'bucket_end',f.bucket_end,
          'purchase_count',f.purchase_count,
          'quantity',f.quantity,
          'spend_minor',f.spend_minor
        ) order by f.bucket_index)
        from frequency f where f.period_key='current'
      ),'[]'::jsonb),
      'comparison',coalesce((
        select jsonb_agg(jsonb_build_object(
          'bucket_index',f.bucket_index,
          'bucket_start',f.bucket_start,
          'bucket_end',f.bucket_end,
          'purchase_count',f.purchase_count,
          'quantity',f.quantity,
          'spend_minor',f.spend_minor
        ) order by f.bucket_index)
        from frequency f where f.period_key='comparison'
      ),'[]'::jsonb)
    ),
    'price_history',coalesce((
      select jsonb_agg(jsonb_build_object(
        'receipt_item_id',p.receipt_item_id,
        'receipt_id',p.receipt_id,
        'observed_at',p.event_at,
        'merchant_id',p.merchant_id,
        'merchant_name',coalesce(p.merchant_name,'Unassigned merchant'),
        'currency_code',coalesce(p.currency_code,v_currency),
        'list_unit_price_minor',p.list_unit_price_minor,
        'effective_unit_price_minor',p.effective_unit_price_minor,
        'quantity',p.quantity,
        'basis_price_minor',case
          when v_product.size_value is null
            or v_product.size_value<=0
            or v_product.size_unit not in ('g','ml','count') then null
          when v_product.size_unit in ('g','ml')
            then round(p.effective_unit_price_minor::numeric*100/v_product.size_value)::bigint
          else round(p.effective_unit_price_minor::numeric/v_product.size_value)::bigint
        end,
        'basis_label',case
          when v_product.size_unit='g' then '100 g'
          when v_product.size_unit='ml' then '100 ml'
          when v_product.size_unit='count' then '1 count'
          else null
        end
      ) order by p.event_at,p.receipt_item_id)
      from price_selected p
    ),'[]'::jsonb),
    'price_history_count',coalesce((select max(total_count) from price_ranked),0),
    'price_history_truncated',coalesce((select max(total_count)>500 from price_ranked),false),
    'merchants',coalesce((
      select jsonb_agg(jsonb_build_object(
        'merchant_id',m.merchant_id,
        'merchant_name',m.merchant_name,
        'purchase_count',m.purchase_count,
        'spend_minor',m.spend_minor,
        'min_unit_price_minor',m.min_unit_price_minor,
        'max_unit_price_minor',m.max_unit_price_minor,
        'avg_unit_price_minor',m.avg_unit_price_minor,
        'latest_unit_price_minor',m.latest_unit_price_minor,
        'latest_price_at',m.latest_price_at,
        'previous_unit_price_minor',m.previous_unit_price_minor,
        'price_change_minor',m.price_change_minor,
        'price_change_ratio',m.price_change_ratio
      ) order by m.latest_unit_price_minor nulls last,m.purchase_count desc,m.merchant_name)
      from merchant_stats m
    ),'[]'::jsonb),
    'cheapest_merchant',coalesce((
      select jsonb_build_object(
        'merchant_id',c.merchant_id,
        'merchant_name',c.merchant_name,
        'latest_unit_price_minor',c.latest_unit_price_minor,
        'latest_price_at',c.latest_price_at,
        'purchase_count',c.purchase_count
      )
      from cheapest c
    ),'null'::jsonb),
    'family_variants',coalesce((
      select jsonb_agg(jsonb_build_object(
        'product_id',f.id,
        'name',f.name,
        'variant_name',f.variant_name,
        'size_value',f.size_value,
        'size_unit',f.size_unit,
        'purchase_count',f.purchase_count,
        'spend_minor',f.spend_minor,
        'last_purchase_at',f.last_purchase_at,
        'latest_unit_price_minor',f.latest_unit_price_minor,
        'latest_merchant_id',f.latest_merchant_id,
        'latest_merchant_name',f.latest_merchant_name,
        'latest_price_at',f.latest_price_at,
        'basis_price_minor',f.basis_price_minor,
        'basis_label',f.basis_label,
        'is_current',f.id=p_product_id
      ) order by
        f.basis_price_minor nulls last,
        f.latest_unit_price_minor nulls last,
        f.name)
      from family_combined f
    ),'[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$function$;
alter function finance.get_product_intelligence(uuid,text,date) security invoker;
revoke all on function finance.get_product_intelligence(uuid,text,date) from public,anon;
grant execute on function finance.get_product_intelligence(uuid,text,date) to authenticated,service_role;
