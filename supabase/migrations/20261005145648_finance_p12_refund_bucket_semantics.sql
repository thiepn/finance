CREATE OR REPLACE FUNCTION finance.get_spending_explorer(p_period_start timestamp with time zone, p_period_end timestamp with time zone, p_compare_start timestamp with time zone, p_compare_end timestamp with time zone, p_bucket_kind text DEFAULT 'day'::text, p_category_id uuid DEFAULT NULL::uuid, p_merchant_id uuid DEFAULT NULL::uuid, p_necessity text DEFAULT NULL::text, p_limit integer DEFAULT 8)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_time_zone text := 'Europe/Berlin';
  v_currency text := 'EUR';
  v_locale text := 'de-DE';
  v_bucket text := lower(btrim(coalesce(p_bucket_kind,'day')));
  v_step interval;
  v_limit integer := greatest(1,least(coalesce(p_limit,8),24));
  v_necessity text := nullif(lower(btrim(coalesce(p_necessity,''))),'');
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception using errcode='42501',message='authentication required';
  end if;
  if p_period_start is null or p_period_end is null or p_period_start>=p_period_end then
    raise exception using errcode='23514',message='explorer period must have start < end';
  end if;
  if p_compare_start is null or p_compare_end is null or p_compare_start>=p_compare_end then
    raise exception using errcode='23514',message='explorer comparison period must have start < end';
  end if;

  if v_bucket='day' then v_step := interval '1 day';
  elsif v_bucket='week' then v_step := interval '1 week';
  elsif v_bucket='month' then v_step := interval '1 month';
  elsif v_bucket='quarter' then v_step := interval '3 months';
  elsif v_bucket='year' then v_step := interval '1 year';
  else
    raise exception using errcode='23514',
      message='explorer bucket must be day, week, month, quarter, or year';
  end if;

  if v_necessity is not null
     and v_necessity not in ('essential','flexible','discretionary','unclassified') then
    raise exception using errcode='23514',message='invalid necessity filter';
  end if;

  if p_category_id is not null and not exists(
    select 1 from finance.categories c
    where c.user_id=v_user_id and c.id=p_category_id
  ) then
    raise exception using errcode='23503',message='category not found';
  end if;

  if p_merchant_id is not null and not exists(
    select 1 from finance.merchants m
    where m.user_id=v_user_id and m.id=p_merchant_id
  ) then
    raise exception using errcode='23503',message='merchant not found';
  end if;

  select
    coalesce(p.time_zone,'Europe/Berlin'),
    coalesce(p.reporting_currency,'EUR'),
    coalesce(p.locale,'de-DE')
  into v_time_zone,v_currency,v_locale
  from finance.profiles p
  where p.user_id=v_user_id;

  with recursive
  category_scope(id) as (
    select c.id
    from finance.categories c
    where c.user_id=v_user_id and c.id=p_category_id
    union all
    select child.id
    from finance.categories child
    join category_scope parent on child.parent_id=parent.id
    where child.user_id=v_user_id
  ),
  breadcrumb(id,parent_id,name,depth,path) as (
    select c.id,c.parent_id,c.name,0,array[c.id]
    from finance.categories c
    where c.user_id=v_user_id and c.id=p_category_id
    union all
    select parent.id,parent.parent_id,parent.name,b.depth+1,b.path||parent.id
    from breadcrumb b
    join finance.categories parent
      on parent.id=b.parent_id and parent.user_id=v_user_id
    where not parent.id=any(b.path)
  ),
  periods as (
    select 'current'::text as period_key,p_period_start as start_at,p_period_end as end_at,
      (p_period_start at time zone v_time_zone) as local_start,
      (p_period_end at time zone v_time_zone) as local_end
    union all
    select 'comparison',p_compare_start,p_compare_end,
      (p_compare_start at time zone v_time_zone),
      (p_compare_end at time zone v_time_zone)
  ),
  scoped_entries as (
    select
      p.period_key,
      t.id as transaction_id,
      t.occurred_at,
      t.merchant_id,
      t.type,
      le.category_id,
      le.necessity,
      le.reporting_amount_minor
    from periods p
    join finance.transactions t
      on t.user_id=v_user_id
     and t.status='posted'
     and t.type in ('expense','refund','reimbursement')
     and t.occurred_at>=p.start_at
     and t.occurred_at<p.end_at
    join finance.ledger_entries le
      on le.transaction_id=t.id
     and le.user_id=t.user_id
     and le.entry_kind='category'
    where
      (
        p_category_id is null
        or le.category_id in (select id from category_scope)
      )
      and (p_merchant_id is null or t.merchant_id=p_merchant_id)
      and (v_necessity is null or le.necessity::text=v_necessity)
  ),
  summary as (
    select
      period_key,
      coalesce(sum(reporting_amount_minor) filter(
        where type='expense' and reporting_amount_minor>0
      ),0)::bigint as gross_spend_minor,
      coalesce(-sum(reporting_amount_minor) filter(
        where type in ('refund','reimbursement') and reporting_amount_minor<0
      ),0)::bigint as recoveries_minor,
      greatest(coalesce(sum(reporting_amount_minor),0),0)::bigint as net_spend_minor,
      count(distinct transaction_id)::integer as transaction_count
    from scoped_entries
    group by period_key
  ),
  buckets as (
    select
      p.period_key,
      row_number() over(partition by p.period_key order by gs)::integer as bucket_index,
      (gs at time zone v_time_zone) as bucket_start,
      (least(gs+v_step,p.local_end) at time zone v_time_zone) as bucket_end
    from periods p
    cross join lateral generate_series(
      p.local_start,p.local_end-interval '1 microsecond',v_step
    ) gs
  ),
  bucket_values as (
    select
      b.period_key,b.bucket_index,b.bucket_start,b.bucket_end,
      coalesce(sum(se.reporting_amount_minor),0)::bigint as net_spend_minor,
      coalesce(sum(se.reporting_amount_minor) filter(
        where se.type='expense' and se.reporting_amount_minor>0
      ),0)::bigint as gross_spend_minor,
      coalesce(-sum(se.reporting_amount_minor) filter(
        where se.type in ('refund','reimbursement') and se.reporting_amount_minor<0
      ),0)::bigint as recoveries_minor,
      count(distinct se.transaction_id)::integer as transaction_count
    from buckets b
    left join scoped_entries se
      on se.period_key=b.period_key
     and se.occurred_at>=b.bucket_start
     and se.occurred_at<b.bucket_end
    group by b.period_key,b.bucket_index,b.bucket_start,b.bucket_end
  ),
  child_nodes as (
    select c.id,c.name,c.sort_order
    from finance.categories c
    where c.user_id=v_user_id
      and not c.is_archived
      and (
        (p_category_id is null and c.parent_id is null and c.kind='expense')
        or
        (p_category_id is not null and c.parent_id=p_category_id)
      )
  ),
  child_closure(root_id,descendant_id) as (
    select n.id,n.id from child_nodes n
    union all
    select cc.root_id,c.id
    from child_closure cc
    join finance.categories c
      on c.parent_id=cc.descendant_id
     and c.user_id=v_user_id
  ),
  child_agg as (
    select
      n.id,n.name,n.sort_order,
      coalesce(sum(se.reporting_amount_minor) filter(
        where se.period_key='current' and se.category_id=cc.descendant_id
      ),0)::bigint as current_minor,
      coalesce(sum(se.reporting_amount_minor) filter(
        where se.period_key='comparison' and se.category_id=cc.descendant_id
      ),0)::bigint as previous_minor,
      count(distinct se.transaction_id) filter(
        where se.period_key='current' and se.category_id=cc.descendant_id
      )::integer as current_transaction_count,
      exists(
        select 1 from finance.categories x
        where x.user_id=v_user_id and x.parent_id=n.id and not x.is_archived
      ) as has_children
    from child_nodes n
    join child_closure cc on cc.root_id=n.id
    left join scoped_entries se on se.category_id=cc.descendant_id
    group by n.id,n.name,n.sort_order
  ),
  merchant_agg as (
    select
      coalesce(se.merchant_id::text,'__unassigned__') as key,
      coalesce(m.name,'Unassigned merchant') as label,
      greatest(coalesce(sum(se.reporting_amount_minor) filter(
        where se.period_key='current'
      ),0),0)::bigint as current_minor,
      greatest(coalesce(sum(se.reporting_amount_minor) filter(
        where se.period_key='comparison'
      ),0),0)::bigint as previous_minor,
      count(distinct se.transaction_id) filter(
        where se.period_key='current'
      )::integer as current_transaction_count
    from scoped_entries se
    left join finance.merchants m
      on m.id=se.merchant_id and m.user_id=v_user_id
    group by coalesce(se.merchant_id::text,'__unassigned__'),coalesce(m.name,'Unassigned merchant')
  ),
  necessity_agg as (
    select
      coalesce(se.necessity::text,'unclassified') as key,
      initcap(replace(coalesce(se.necessity::text,'unclassified'),'_',' ')) as label,
      greatest(coalesce(sum(se.reporting_amount_minor) filter(
        where se.period_key='current'
      ),0),0)::bigint as current_minor,
      greatest(coalesce(sum(se.reporting_amount_minor) filter(
        where se.period_key='comparison'
      ),0),0)::bigint as previous_minor
    from scoped_entries se
    group by coalesce(se.necessity::text,'unclassified')
  ),
  receipt_facts as (
    select
      r.id as receipt_id,
      coalesce(r.purchased_at,min(t.occurred_at)) as event_at,
      coalesce(r.merchant_id,(array_agg(t.merchant_id order by t.occurred_at)
        filter(where t.merchant_id is not null))[1]) as merchant_id
    from finance.receipts r
    join finance.receipt_transaction_matches rtm
      on rtm.receipt_id=r.id
     and rtm.user_id=r.user_id
     and rtm.status='confirmed'
    join finance.transactions t
      on t.id=rtm.transaction_id
     and t.user_id=rtm.user_id
     and t.status='posted'
     and t.type in ('expense','refund','reimbursement')
    where r.user_id=v_user_id
      and r.processing_status='confirmed'
    group by r.id,r.purchased_at,r.merchant_id
  ),
  product_evidence as (
    select
      case
        when rf.event_at>=p_period_start and rf.event_at<p_period_end then 'current'
        when rf.event_at>=p_compare_start and rf.event_at<p_compare_end then 'comparison'
        else null
      end as period_key,
      ri.id as receipt_item_id,
      ri.receipt_id,
      ri.product_id,
      ri.category_id,
      ri.necessity,
      ri.quantity,
      ri.effective_total_minor,
      rf.event_at,
      rf.merchant_id
    from receipt_facts rf
    join finance.receipt_items ri
      on ri.receipt_id=rf.receipt_id
     and ri.user_id=v_user_id
     and not ri.is_excluded
     and ri.product_id is not null
    where
      (
        (rf.event_at>=p_period_start and rf.event_at<p_period_end)
        or
        (rf.event_at>=p_compare_start and rf.event_at<p_compare_end)
      )
      and (
        p_category_id is null
        or ri.category_id in (select id from category_scope)
      )
      and (p_merchant_id is null or rf.merchant_id=p_merchant_id)
      and (v_necessity is null or ri.necessity::text=v_necessity)
  ),
  product_agg as (
    select
      p.id,p.name,p.brand,p.family_id,p.family_name,p.product_type,
      coalesce(sum(pe.effective_total_minor) filter(
        where pe.period_key='current'
      ),0)::bigint as current_minor,
      coalesce(sum(pe.effective_total_minor) filter(
        where pe.period_key='comparison'
      ),0)::bigint as previous_minor,
      count(distinct pe.receipt_id) filter(
        where pe.period_key='current'
      )::integer as current_purchase_count,
      coalesce(sum(pe.quantity) filter(
        where pe.period_key='current'
      ),0)::numeric as current_quantity
    from product_evidence pe
    join finance.products p
      on p.id=pe.product_id and p.user_id=v_user_id
    group by p.id,p.name,p.brand,p.family_id,p.family_name,p.product_type
  ),
  current_summary as (
    select
      coalesce(max(gross_spend_minor),0)::bigint as gross_spend_minor,
      coalesce(max(recoveries_minor),0)::bigint as recoveries_minor,
      coalesce(max(net_spend_minor),0)::bigint as net_spend_minor,
      coalesce(max(transaction_count),0)::integer as transaction_count
    from summary where period_key='current'
  ),
  comparison_summary as (
    select
      coalesce(max(gross_spend_minor),0)::bigint as gross_spend_minor,
      coalesce(max(recoveries_minor),0)::bigint as recoveries_minor,
      coalesce(max(net_spend_minor),0)::bigint as net_spend_minor,
      coalesce(max(transaction_count),0)::integer as transaction_count
    from summary where period_key='comparison'
  ),
  itemized_total as (
    select coalesce(sum(effective_total_minor),0)::bigint as amount_minor
    from product_evidence where period_key='current'
  )
  select jsonb_build_object(
    'profile',jsonb_build_object(
      'currency_code',v_currency,'locale',v_locale,'time_zone',v_time_zone
    ),
    'period',jsonb_build_object(
      'start',p_period_start,'end',p_period_end,
      'compare_start',p_compare_start,'compare_end',p_compare_end
    ),
    'bucket_kind',v_bucket,
    'scope',jsonb_build_object(
      'category_id',p_category_id,
      'merchant_id',p_merchant_id,
      'necessity',v_necessity,
      'category_name',(select c.name from finance.categories c
        where c.user_id=v_user_id and c.id=p_category_id),
      'merchant_name',(select m.name from finance.merchants m
        where m.user_id=v_user_id and m.id=p_merchant_id),
      'breadcrumb',coalesce((
        select jsonb_agg(jsonb_build_object(
          'category_id',b.id,'name',b.name
        ) order by b.depth desc)
        from breadcrumb b
      ),'[]'::jsonb)
    ),
    'summary',jsonb_build_object(
      'current',(select to_jsonb(cs) from current_summary cs),
      'comparison',(select to_jsonb(cs) from comparison_summary cs),
      'delta_minor',(select c.net_spend_minor-p.net_spend_minor
        from current_summary c cross join comparison_summary p),
      'delta_ratio',(select case when p.net_spend_minor>0
        then (c.net_spend_minor-p.net_spend_minor)::numeric/p.net_spend_minor::numeric
        else null end
        from current_summary c cross join comparison_summary p),
      'itemized_evidence_minor',(select amount_minor from itemized_total),
      'itemized_coverage_ratio',(select case when c.net_spend_minor>0
        then least(1::numeric,(i.amount_minor::numeric/c.net_spend_minor::numeric))
        else null end
        from current_summary c cross join itemized_total i)
    ),
    'series',jsonb_build_object(
      'current',coalesce((
        select jsonb_agg(jsonb_build_object(
          'bucket_index',b.bucket_index,'bucket_start',b.bucket_start,'bucket_end',b.bucket_end,
          'net_spend_minor',b.net_spend_minor,'gross_spend_minor',b.gross_spend_minor,
          'recoveries_minor',b.recoveries_minor,'transaction_count',b.transaction_count
        ) order by b.bucket_index)
        from bucket_values b where b.period_key='current'
      ),'[]'::jsonb),
      'comparison',coalesce((
        select jsonb_agg(jsonb_build_object(
          'bucket_index',b.bucket_index,'bucket_start',b.bucket_start,'bucket_end',b.bucket_end,
          'net_spend_minor',b.net_spend_minor,'gross_spend_minor',b.gross_spend_minor,
          'recoveries_minor',b.recoveries_minor,'transaction_count',b.transaction_count
        ) order by b.bucket_index)
        from bucket_values b where b.period_key='comparison'
      ),'[]'::jsonb)
    ),
    'children',coalesce((
      select jsonb_agg(jsonb_build_object(
        'category_id',a.id,'name',a.name,
        'current_minor',greatest(a.current_minor,0),
        'previous_minor',greatest(a.previous_minor,0),
        'delta_minor',greatest(a.current_minor,0)-greatest(a.previous_minor,0),
        'delta_ratio',case when greatest(a.previous_minor,0)>0
          then (greatest(a.current_minor,0)-greatest(a.previous_minor,0))::numeric
            /greatest(a.previous_minor,0)::numeric
          else null end,
        'share',case when cs.net_spend_minor>0
          then greatest(a.current_minor,0)::numeric/cs.net_spend_minor::numeric
          else null end,
        'transaction_count',a.current_transaction_count,
        'has_children',a.has_children
      ) order by greatest(a.current_minor,0) desc,a.sort_order,a.name)
      from child_agg a cross join current_summary cs
      where greatest(a.current_minor,0)>0 or greatest(a.previous_minor,0)>0
    ),'[]'::jsonb),
    'direct_category_minor',case when p_category_id is null then null else coalesce((
      select greatest(sum(se.reporting_amount_minor),0)::bigint
      from scoped_entries se
      where se.period_key='current' and se.category_id=p_category_id
    ),0) end,
    'merchants',coalesce((
      select jsonb_agg(jsonb_build_object(
        'merchant_id',case when a.key='__unassigned__' then null else a.key end,
        'name',a.label,'current_minor',a.current_minor,'previous_minor',a.previous_minor,
        'delta_minor',a.current_minor-a.previous_minor,
        'delta_ratio',case when a.previous_minor>0
          then (a.current_minor-a.previous_minor)::numeric/a.previous_minor::numeric
          else null end,
        'share',case when cs.net_spend_minor>0
          then a.current_minor::numeric/cs.net_spend_minor::numeric else null end,
        'transaction_count',a.current_transaction_count
      ) order by a.current_minor desc,a.label)
      from (
        select * from merchant_agg
        where current_minor>0 or previous_minor>0
        order by current_minor desc,previous_minor desc,label
        limit v_limit
      ) a cross join current_summary cs
    ),'[]'::jsonb),
    'necessities',coalesce((
      select jsonb_agg(jsonb_build_object(
        'necessity',a.key,'label',a.label,
        'current_minor',a.current_minor,'previous_minor',a.previous_minor,
        'delta_minor',a.current_minor-a.previous_minor,
        'delta_ratio',case when a.previous_minor>0
          then (a.current_minor-a.previous_minor)::numeric/a.previous_minor::numeric
          else null end,
        'share',case when cs.net_spend_minor>0
          then a.current_minor::numeric/cs.net_spend_minor::numeric else null end
      ) order by a.current_minor desc,a.label)
      from necessity_agg a cross join current_summary cs
      where a.current_minor>0 or a.previous_minor>0
    ),'[]'::jsonb),
    'products',coalesce((
      select jsonb_agg(jsonb_build_object(
        'product_id',a.id,'name',a.name,'brand',a.brand,
        'family_id',a.family_id,'family_name',a.family_name,'product_type',a.product_type,
        'current_itemized_minor',a.current_minor,'previous_itemized_minor',a.previous_minor,
        'delta_minor',a.current_minor-a.previous_minor,
        'delta_ratio',case when a.previous_minor>0
          then (a.current_minor-a.previous_minor)::numeric/a.previous_minor::numeric
          else null end,
        'purchase_count',a.current_purchase_count,
        'quantity',a.current_quantity,
        'share_of_itemized',case when i.amount_minor>0
          then a.current_minor::numeric/i.amount_minor::numeric else null end
      ) order by a.current_minor desc,a.name)
      from (
        select * from product_agg
        where current_minor>0 or previous_minor>0
        order by current_minor desc,previous_minor desc,name
        limit v_limit
      ) a cross join itemized_total i
    ),'[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$function$
