create or replace function finance.get_analytics_time_series(
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_compare_start timestamptz default null,
  p_compare_end timestamptz default null,
  p_bucket_kind text default 'day'
)
returns jsonb
language plpgsql
stable
security invoker
set search_path=''
as $$
declare
  v_user_id uuid := auth.uid();
  v_time_zone text := 'Europe/Berlin';
  v_currency text := 'EUR';
  v_locale text := 'de-DE';
  v_bucket text := lower(btrim(coalesce(p_bucket_kind,'day')));
  v_step interval;
  v_compare_start timestamptz;
  v_compare_end timestamptz;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception using errcode='42501',message='authentication required';
  end if;
  if p_period_start is null or p_period_end is null or p_period_start>=p_period_end then
    raise exception using errcode='23514',message='analytics period must have start < end';
  end if;
  v_compare_end := coalesce(p_compare_end,p_period_start);
  v_compare_start := coalesce(p_compare_start,v_compare_end-(p_period_end-p_period_start));
  if v_compare_start>=v_compare_end then
    raise exception using errcode='23514',message='analytics comparison period must have start < end';
  end if;

  if v_bucket='day' then v_step := interval '1 day';
  elsif v_bucket='week' then v_step := interval '1 week';
  elsif v_bucket='month' then v_step := interval '1 month';
  elsif v_bucket='quarter' then v_step := interval '3 months';
  elsif v_bucket='year' then v_step := interval '1 year';
  else raise exception using errcode='23514',
    message='analytics bucket must be day, week, month, quarter, or year';
  end if;

  select coalesce(p.time_zone,'Europe/Berlin'),coalesce(p.reporting_currency,'EUR'),coalesce(p.locale,'de-DE')
  into v_time_zone,v_currency,v_locale
  from finance.profiles p where p.user_id=v_user_id;

  with ranges as (
    select 'current'::text as period_key,p_period_start as start_at,p_period_end as end_at,
      (p_period_start at time zone v_time_zone) as local_start,
      (p_period_end at time zone v_time_zone) as local_end
    union all
    select 'comparison',v_compare_start,v_compare_end,
      (v_compare_start at time zone v_time_zone),
      (v_compare_end at time zone v_time_zone)
  ),
  buckets as (
    select r.period_key,gs as local_bucket_start,least(gs+v_step,r.local_end) as local_bucket_end,
      row_number() over(partition by r.period_key order by gs)::integer as bucket_index
    from ranges r
    cross join lateral generate_series(r.local_start,r.local_end-interval '1 microsecond',v_step) gs
  ),
  flow as (
    select r.period_key,
      case v_bucket
        when 'day' then date_trunc('day',t.occurred_at at time zone v_time_zone)
        when 'week' then date_trunc('week',t.occurred_at at time zone v_time_zone)
        when 'month' then date_trunc('month',t.occurred_at at time zone v_time_zone)
        when 'quarter' then date_trunc('quarter',t.occurred_at at time zone v_time_zone)
        when 'year' then date_trunc('year',t.occurred_at at time zone v_time_zone)
      end as local_bucket_start,
      t.id as transaction_id,t.type,le.reporting_amount_minor
    from ranges r
    join finance.transactions t on t.user_id=v_user_id and t.status='posted'
      and t.occurred_at>=r.start_at and t.occurred_at<r.end_at
    join finance.ledger_entries le on le.transaction_id=t.id and le.user_id=t.user_id and le.entry_kind='category'
  ),
  aggregates as (
    select period_key,local_bucket_start,
      coalesce(sum(reporting_amount_minor) filter(where type='expense' and reporting_amount_minor>0),0)::bigint as gross_spend_minor,
      coalesce(-sum(reporting_amount_minor) filter(where type in ('refund','reimbursement') and reporting_amount_minor<0),0)::bigint as recoveries_minor,
      coalesce(sum(reporting_amount_minor) filter(where type in ('expense','refund','reimbursement')),0)::bigint as net_spend_minor,
      coalesce(-sum(reporting_amount_minor) filter(where type='income'),0)::bigint as income_minor,
      count(distinct transaction_id)::integer as transaction_count
    from flow group by period_key,local_bucket_start
  ),
  points as (
    select b.period_key,b.bucket_index,
      (b.local_bucket_start at time zone v_time_zone) as bucket_start,
      (b.local_bucket_end at time zone v_time_zone) as bucket_end,
      coalesce(a.gross_spend_minor,0)::bigint as gross_spend_minor,
      coalesce(a.recoveries_minor,0)::bigint as recoveries_minor,
      coalesce(a.net_spend_minor,0)::bigint as net_spend_minor,
      coalesce(a.income_minor,0)::bigint as income_minor,
      (coalesce(a.income_minor,0)-coalesce(a.net_spend_minor,0))::bigint as cash_flow_minor,
      coalesce(a.transaction_count,0)::integer as transaction_count
    from buckets b
    left join aggregates a on a.period_key=b.period_key and a.local_bucket_start=b.local_bucket_start
  ),
  totals as (
    select period_key,
      coalesce(sum(gross_spend_minor),0)::bigint as gross_spend_minor,
      coalesce(sum(recoveries_minor),0)::bigint as recoveries_minor,
      coalesce(sum(net_spend_minor),0)::bigint as net_spend_minor,
      coalesce(sum(income_minor),0)::bigint as income_minor,
      coalesce(sum(cash_flow_minor),0)::bigint as cash_flow_minor,
      coalesce(sum(transaction_count),0)::integer as transaction_count
    from points group by period_key
  )
  select jsonb_build_object(
    'profile',jsonb_build_object('currency_code',v_currency,'locale',v_locale,'time_zone',v_time_zone),
    'bucket_kind',v_bucket,
    'period',jsonb_build_object('start',p_period_start,'end',p_period_end,'compare_start',v_compare_start,'compare_end',v_compare_end),
    'current',coalesce((select jsonb_agg(jsonb_build_object(
      'bucket_index',p.bucket_index,'bucket_start',p.bucket_start,'bucket_end',p.bucket_end,
      'gross_spend_minor',p.gross_spend_minor,'recoveries_minor',p.recoveries_minor,
      'net_spend_minor',p.net_spend_minor,'income_minor',p.income_minor,
      'cash_flow_minor',p.cash_flow_minor,'transaction_count',p.transaction_count
    ) order by p.bucket_index) from points p where p.period_key='current'),'[]'::jsonb),
    'comparison',coalesce((select jsonb_agg(jsonb_build_object(
      'bucket_index',p.bucket_index,'bucket_start',p.bucket_start,'bucket_end',p.bucket_end,
      'gross_spend_minor',p.gross_spend_minor,'recoveries_minor',p.recoveries_minor,
      'net_spend_minor',p.net_spend_minor,'income_minor',p.income_minor,
      'cash_flow_minor',p.cash_flow_minor,'transaction_count',p.transaction_count
    ) order by p.bucket_index) from points p where p.period_key='comparison'),'[]'::jsonb),
    'totals',jsonb_build_object(
      'current',coalesce((select to_jsonb(t)-'period_key' from totals t where t.period_key='current'),
        jsonb_build_object('gross_spend_minor',0,'recoveries_minor',0,'net_spend_minor',0,'income_minor',0,'cash_flow_minor',0,'transaction_count',0)),
      'comparison',coalesce((select to_jsonb(t)-'period_key' from totals t where t.period_key='comparison'),
        jsonb_build_object('gross_spend_minor',0,'recoveries_minor',0,'net_spend_minor',0,'income_minor',0,'cash_flow_minor',0,'transaction_count',0))
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function finance.get_analytics_time_series(timestamptz,timestamptz,timestamptz,timestamptz,text) from public,anon;
grant execute on function finance.get_analytics_time_series(timestamptz,timestamptz,timestamptz,timestamptz,text) to authenticated,service_role;

create or replace function public.finance_get_analytics_time_series(
  p_period_start timestamptz,p_period_end timestamptz,p_compare_start timestamptz default null,
  p_compare_end timestamptz default null,p_bucket_kind text default 'day'
)
returns jsonb language sql stable security invoker set search_path=''
as $$ select finance.get_analytics_time_series(p_period_start,p_period_end,p_compare_start,p_compare_end,p_bucket_kind); $$;

revoke all on function public.finance_get_analytics_time_series(timestamptz,timestamptz,timestamptz,timestamptz,text) from public,anon;
grant execute on function public.finance_get_analytics_time_series(timestamptz,timestamptz,timestamptz,timestamptz,text) to authenticated,service_role;

create or replace function finance.get_analytics_breakdown(
  p_period_start timestamptz,p_period_end timestamptz,p_compare_start timestamptz default null,
  p_compare_end timestamptz default null,p_dimension text default 'category',p_limit integer default 8
)
returns jsonb language plpgsql stable security invoker set search_path=''
as $$
declare
  v_user_id uuid := auth.uid();
  v_dimension text := lower(btrim(coalesce(p_dimension,'category')));
  v_compare_start timestamptz;
  v_compare_end timestamptz;
  v_limit integer := greatest(1,least(coalesce(p_limit,8),30));
  v_current_total bigint := 0;
  v_result jsonb;
begin
  if v_user_id is null then raise exception using errcode='42501',message='authentication required'; end if;
  if p_period_start is null or p_period_end is null or p_period_start>=p_period_end then
    raise exception using errcode='23514',message='analytics period must have start < end';
  end if;
  v_compare_end := coalesce(p_compare_end,p_period_start);
  v_compare_start := coalesce(p_compare_start,v_compare_end-(p_period_end-p_period_start));
  if v_compare_start>=v_compare_end then raise exception using errcode='23514',message='analytics comparison period must have start < end'; end if;
  if v_dimension not in ('category','merchant','necessity') then
    raise exception using errcode='23514',message='analytics breakdown dimension must be category, merchant, or necessity';
  end if;

  select greatest(coalesce(sum(le.reporting_amount_minor),0),0)::bigint into v_current_total
  from finance.transactions t
  join finance.ledger_entries le on le.transaction_id=t.id and le.user_id=t.user_id and le.entry_kind='category'
  where t.user_id=v_user_id and t.status='posted' and t.type in ('expense','refund','reimbursement')
    and t.occurred_at>=p_period_start and t.occurred_at<p_period_end;

  with periods as (
    select 'current'::text as period_key,p_period_start as start_at,p_period_end as end_at
    union all select 'comparison',v_compare_start,v_compare_end
  ),
  classified as (
    select p.period_key,
      case v_dimension
        when 'category' then coalesce(le.category_id::text,'__uncategorized__')
        when 'merchant' then coalesce(t.merchant_id::text,'__unassigned__')
        when 'necessity' then coalesce(le.necessity::text,'unclassified')
      end as item_key,
      case v_dimension
        when 'category' then coalesce(c.name,'Uncategorized')
        when 'merchant' then coalesce(m.name,'Unassigned merchant')
        when 'necessity' then initcap(replace(coalesce(le.necessity::text,'unclassified'),'_',' '))
      end as label,
      t.id as transaction_id,le.reporting_amount_minor
    from periods p
    join finance.transactions t on t.user_id=v_user_id and t.status='posted'
      and t.type in ('expense','refund','reimbursement') and t.occurred_at>=p.start_at and t.occurred_at<p.end_at
    join finance.ledger_entries le on le.transaction_id=t.id and le.user_id=t.user_id and le.entry_kind='category'
    left join finance.categories c on c.id=le.category_id and c.user_id=le.user_id
    left join finance.merchants m on m.id=t.merchant_id and m.user_id=t.user_id
  ),
  aggregated as (
    select period_key,item_key,max(label) as label,sum(reporting_amount_minor)::bigint as amount_minor,
      count(distinct transaction_id)::integer as transaction_count
    from classified group by period_key,item_key
  ),
  joined as (
    select coalesce(c.item_key,p.item_key) as item_key,coalesce(c.label,p.label) as label,
      greatest(coalesce(c.amount_minor,0),0)::bigint as current_minor,
      greatest(coalesce(p.amount_minor,0),0)::bigint as previous_minor,
      coalesce(c.transaction_count,0)::integer as current_transaction_count,
      coalesce(p.transaction_count,0)::integer as previous_transaction_count
    from (select * from aggregated where period_key='current') c
    full join (select * from aggregated where period_key='comparison') p using(item_key)
  ),
  ranked as (
    select * from joined where current_minor<>0 or previous_minor<>0
    order by current_minor desc,previous_minor desc,label limit v_limit
  )
  select jsonb_build_object(
    'dimension',v_dimension,
    'period',jsonb_build_object('start',p_period_start,'end',p_period_end,'compare_start',v_compare_start,'compare_end',v_compare_end),
    'current_total_minor',v_current_total,
    'items',coalesce(jsonb_agg(jsonb_build_object(
      'key',r.item_key,'label',r.label,'current_minor',r.current_minor,'previous_minor',r.previous_minor,
      'delta_minor',r.current_minor-r.previous_minor,
      'delta_ratio',case when r.previous_minor>0 then (r.current_minor-r.previous_minor)::numeric/r.previous_minor::numeric else null end,
      'share',case when v_current_total>0 then r.current_minor::numeric/v_current_total::numeric else null end,
      'current_transaction_count',r.current_transaction_count,
      'previous_transaction_count',r.previous_transaction_count
    ) order by r.current_minor desc,r.previous_minor desc,r.label),'[]'::jsonb)
  ) into v_result from ranked r;

  return v_result;
end;
$$;

revoke all on function finance.get_analytics_breakdown(timestamptz,timestamptz,timestamptz,timestamptz,text,integer) from public,anon;
grant execute on function finance.get_analytics_breakdown(timestamptz,timestamptz,timestamptz,timestamptz,text,integer) to authenticated,service_role;

create or replace function public.finance_get_analytics_breakdown(
  p_period_start timestamptz,p_period_end timestamptz,p_compare_start timestamptz default null,
  p_compare_end timestamptz default null,p_dimension text default 'category',p_limit integer default 8
)
returns jsonb language sql stable security invoker set search_path=''
as $$ select finance.get_analytics_breakdown(p_period_start,p_period_end,p_compare_start,p_compare_end,p_dimension,p_limit); $$;

revoke all on function public.finance_get_analytics_breakdown(timestamptz,timestamptz,timestamptz,timestamptz,text,integer) from public,anon;
grant execute on function public.finance_get_analytics_breakdown(timestamptz,timestamptz,timestamptz,timestamptz,text,integer) to authenticated,service_role;
