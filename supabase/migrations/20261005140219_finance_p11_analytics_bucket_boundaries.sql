
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
  else
    raise exception using errcode='23514',
      message='analytics bucket must be day, week, month, quarter, or year';
  end if;

  select
    coalesce(p.time_zone,'Europe/Berlin'),
    coalesce(p.reporting_currency,'EUR'),
    coalesce(p.locale,'de-DE')
  into v_time_zone,v_currency,v_locale
  from finance.profiles p
  where p.user_id=v_user_id;

  with ranges as (
    select
      'current'::text as period_key,
      p_period_start as start_at,
      p_period_end as end_at,
      (p_period_start at time zone v_time_zone) as local_start,
      (p_period_end at time zone v_time_zone) as local_end
    union all
    select
      'comparison',
      v_compare_start,
      v_compare_end,
      (v_compare_start at time zone v_time_zone),
      (v_compare_end at time zone v_time_zone)
  ),
  buckets as (
    select
      r.period_key,
      row_number() over(partition by r.period_key order by gs)::integer as bucket_index,
      (gs at time zone v_time_zone) as bucket_start,
      (least(gs+v_step,r.local_end) at time zone v_time_zone) as bucket_end
    from ranges r
    cross join lateral generate_series(
      r.local_start,
      r.local_end-interval '1 microsecond',
      v_step
    ) gs
  ),
  aggregates as (
    select
      b.period_key,
      b.bucket_index,
      coalesce(
        sum(le.reporting_amount_minor) filter(
          where t.type='expense' and le.reporting_amount_minor>0
        ),0
      )::bigint as gross_spend_minor,
      coalesce(
        -sum(le.reporting_amount_minor) filter(
          where t.type in ('refund','reimbursement')
            and le.reporting_amount_minor<0
        ),0
      )::bigint as recoveries_minor,
      coalesce(
        sum(le.reporting_amount_minor) filter(
          where t.type in ('expense','refund','reimbursement')
        ),0
      )::bigint as net_spend_minor,
      coalesce(
        -sum(le.reporting_amount_minor) filter(where t.type='income'),0
      )::bigint as income_minor,
      count(distinct t.id)::integer as transaction_count
    from buckets b
    left join finance.transactions t
      on t.user_id=v_user_id
     and t.status='posted'
     and t.occurred_at>=b.bucket_start
     and t.occurred_at<b.bucket_end
    left join finance.ledger_entries le
      on le.transaction_id=t.id
     and le.user_id=t.user_id
     and le.entry_kind='category'
    group by b.period_key,b.bucket_index
  ),
  points as (
    select
      b.period_key,
      b.bucket_index,
      b.bucket_start,
      b.bucket_end,
      a.gross_spend_minor,
      a.recoveries_minor,
      a.net_spend_minor,
      a.income_minor,
      (a.income_minor-a.net_spend_minor)::bigint as cash_flow_minor,
      a.transaction_count
    from buckets b
    join aggregates a
      on a.period_key=b.period_key
     and a.bucket_index=b.bucket_index
  ),
  totals as (
    select
      period_key,
      coalesce(sum(gross_spend_minor),0)::bigint as gross_spend_minor,
      coalesce(sum(recoveries_minor),0)::bigint as recoveries_minor,
      coalesce(sum(net_spend_minor),0)::bigint as net_spend_minor,
      coalesce(sum(income_minor),0)::bigint as income_minor,
      coalesce(sum(cash_flow_minor),0)::bigint as cash_flow_minor,
      coalesce(sum(transaction_count),0)::integer as transaction_count
    from points
    group by period_key
  )
  select jsonb_build_object(
    'profile',jsonb_build_object(
      'currency_code',v_currency,
      'locale',v_locale,
      'time_zone',v_time_zone
    ),
    'bucket_kind',v_bucket,
    'period',jsonb_build_object(
      'start',p_period_start,
      'end',p_period_end,
      'compare_start',v_compare_start,
      'compare_end',v_compare_end
    ),
    'current',coalesce((
      select jsonb_agg(jsonb_build_object(
        'bucket_index',p.bucket_index,
        'bucket_start',p.bucket_start,
        'bucket_end',p.bucket_end,
        'gross_spend_minor',p.gross_spend_minor,
        'recoveries_minor',p.recoveries_minor,
        'net_spend_minor',p.net_spend_minor,
        'income_minor',p.income_minor,
        'cash_flow_minor',p.cash_flow_minor,
        'transaction_count',p.transaction_count
      ) order by p.bucket_index)
      from points p
      where p.period_key='current'
    ),'[]'::jsonb),
    'comparison',coalesce((
      select jsonb_agg(jsonb_build_object(
        'bucket_index',p.bucket_index,
        'bucket_start',p.bucket_start,
        'bucket_end',p.bucket_end,
        'gross_spend_minor',p.gross_spend_minor,
        'recoveries_minor',p.recoveries_minor,
        'net_spend_minor',p.net_spend_minor,
        'income_minor',p.income_minor,
        'cash_flow_minor',p.cash_flow_minor,
        'transaction_count',p.transaction_count
      ) order by p.bucket_index)
      from points p
      where p.period_key='comparison'
    ),'[]'::jsonb),
    'totals',jsonb_build_object(
      'current',coalesce((
        select to_jsonb(t)-'period_key'
        from totals t
        where t.period_key='current'
      ),jsonb_build_object(
        'gross_spend_minor',0,'recoveries_minor',0,'net_spend_minor',0,
        'income_minor',0,'cash_flow_minor',0,'transaction_count',0
      )),
      'comparison',coalesce((
        select to_jsonb(t)-'period_key'
        from totals t
        where t.period_key='comparison'
      ),jsonb_build_object(
        'gross_spend_minor',0,'recoveries_minor',0,'net_spend_minor',0,
        'income_minor',0,'cash_flow_minor',0,'transaction_count',0
      ))
    )
  )
  into v_result;

  return v_result;
end;
$$;
