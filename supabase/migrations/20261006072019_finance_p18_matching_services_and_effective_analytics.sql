CREATE OR REPLACE FUNCTION finance.category_period_spend(p_category_id uuid, p_start timestamp with time zone, p_end timestamp with time zone)
 RETURNS bigint
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select coalesce(sum(le.reporting_amount_minor),0)::bigint
  from finance.transactions t
  join finance.effective_transaction_categories le on le.transaction_id=t.id and le.user_id=t.user_id
  join finance.category_tree ct
    on ct.id=le.category_id
   and ct.user_id=le.user_id
  where t.user_id=auth.uid()
    and t.status='posted'
    and t.type in ('expense','refund','reimbursement')
    and t.occurred_at>=p_start
    and t.occurred_at<p_end
    and p_category_id=any(ct.id_path);
$function$;

CREATE OR REPLACE FUNCTION finance.confirm_receipt_transaction_match(p_match_id uuid, p_matched_amount_minor bigint DEFAULT NULL::bigint, p_note text DEFAULT NULL::text, p_decision_source text DEFAULT 'manual'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid:=auth.uid();
  v_match finance.receipt_transaction_matches%rowtype;
  v_receipt finance.receipts%rowtype;
  v_tx finance.transactions%rowtype;
  v_matchable bigint;
  v_receipt_used bigint:=0;
  v_tx_used bigint:=0;
  v_receipt_remaining bigint;
  v_tx_remaining bigint;
  v_amount bigint;
  v_state jsonb;
  v_allocations jsonb;
  v_other record;
begin
  if v_user_id is null then
    raise exception using errcode='42501',message='authentication required';
  end if;
  if p_decision_source not in ('manual','deterministic') then
    raise exception using errcode='23514',message='invalid match decision source';
  end if;
  if p_note is not null and char_length(p_note)>1000 then
    raise exception using errcode='23514',message='match note is too long';
  end if;

  select *
  into v_match
  from finance.receipt_transaction_matches
  where id=p_match_id and user_id=v_user_id
  for update;

  if not found then
    raise exception using errcode='23503',message='receipt match not found';
  end if;

  select * into v_receipt
  from finance.receipts
  where id=v_match.receipt_id and user_id=v_user_id;

  if not found
     or v_receipt.processing_status<>'confirmed'
     or v_receipt.total_minor is null
     or v_receipt.total_minor<=0 then
    raise exception using errcode='55000',
      message='receipt must be confirmed with a positive total before matching';
  end if;

  select * into v_tx
  from finance.transactions
  where id=v_match.transaction_id
    and user_id=v_user_id
    and status='posted'
    and type='expense';

  if not found then
    raise exception using errcode='55000',
      message='receipt can only match a posted expense transaction';
  end if;

  if exists(
    select 1
    from finance.receipt_transaction_matches other
    join finance.receipts r
      on r.id=other.receipt_id and r.user_id=other.user_id
    where other.user_id=v_user_id
      and other.transaction_id=v_match.transaction_id
      and other.status='confirmed'
      and other.id<>v_match.id
      and r.currency_code<>v_receipt.currency_code
  ) then
    raise exception using errcode='23514',
      message='one transaction cannot combine confirmed receipts in different currencies';
  end if;

  v_matchable:=finance.transaction_matchable_amount(
    v_match.transaction_id,
    v_receipt.currency_code
  );

  if v_matchable is null or v_matchable<=0 then
    raise exception using errcode='23514',
      message='transaction has no matchable amount in receipt currency';
  end if;

  select coalesce(sum(matched_amount_minor),0)::bigint
  into v_receipt_used
  from finance.receipt_transaction_matches
  where user_id=v_user_id
    and receipt_id=v_match.receipt_id
    and status='confirmed'
    and id<>v_match.id;

  select coalesce(sum(rtm.matched_amount_minor),0)::bigint
  into v_tx_used
  from finance.receipt_transaction_matches rtm
  join finance.receipts r
    on r.id=rtm.receipt_id and r.user_id=rtm.user_id
  where rtm.user_id=v_user_id
    and rtm.transaction_id=v_match.transaction_id
    and rtm.status='confirmed'
    and rtm.id<>v_match.id
    and r.currency_code=v_receipt.currency_code;

  v_receipt_remaining:=v_receipt.total_minor-v_receipt_used;
  v_tx_remaining:=v_matchable-v_tx_used;

  if v_receipt_remaining<=0 then
    raise exception using errcode='23514',message='receipt is already fully matched';
  end if;
  if v_tx_remaining<=0 then
    raise exception using errcode='23514',message='transaction is already fully matched';
  end if;

  v_amount:=coalesce(
    p_matched_amount_minor,
    least(v_receipt_remaining,v_tx_remaining)
  );

  if v_amount<=0
     or v_amount>v_receipt_remaining
     or v_amount>v_tx_remaining then
    raise exception using errcode='23514',
      message='matched amount exceeds remaining receipt or transaction amount';
  end if;

  update finance.receipt_transaction_matches
  set
    status='confirmed',
    matched_amount_minor=v_amount,
    confirmed_at=now(),
    rejected_at=null,
    decision_source=p_decision_source,
    decision_note=nullif(btrim(p_note),'')
  where id=v_match.id and user_id=v_user_id;

  if v_receipt_used+v_amount=v_receipt.total_minor then
    update finance.receipt_transaction_matches
    set
      status='rejected',
      rejected_at=now(),
      confirmed_at=null,
      decision_source=coalesce(decision_source,'deterministic'),
      decision_note=coalesce(
        decision_note,
        'Superseded because receipt is fully matched'
      )
    where user_id=v_user_id
      and receipt_id=v_match.receipt_id
      and id<>v_match.id
      and status='suggested';
  end if;

  if v_tx_used+v_amount=v_matchable then
    for v_other in
      update finance.receipt_transaction_matches
      set
        status='rejected',
        rejected_at=now(),
        confirmed_at=null,
        decision_source=coalesce(decision_source,'deterministic'),
        decision_note=coalesce(
          decision_note,
          'Superseded because transaction is fully matched'
        )
      where user_id=v_user_id
        and transaction_id=v_match.transaction_id
        and id<>v_match.id
        and status='suggested'
      returning receipt_id
    loop
      if v_other.receipt_id<>v_match.receipt_id then
        perform finance.refresh_receipt_match_state(v_other.receipt_id);
      end if;
    end loop;
  end if;

  v_state:=finance.refresh_receipt_match_state(v_match.receipt_id);
  v_allocations:=
    finance.rebuild_transaction_receipt_allocations(
      v_match.transaction_id
    );

  return jsonb_build_object(
    'match_id',v_match.id,
    'receipt_id',v_match.receipt_id,
    'transaction_id',v_match.transaction_id,
    'matched_amount_minor',v_amount,
    'decision_source',p_decision_source,
    'receipt_state',v_state,
    'allocation_state',v_allocations
  );
end;
$function$;

CREATE OR REPLACE FUNCTION finance.get_analytics_breakdown(p_period_start timestamp with time zone, p_period_end timestamp with time zone, p_compare_start timestamp with time zone DEFAULT NULL::timestamp with time zone, p_compare_end timestamp with time zone DEFAULT NULL::timestamp with time zone, p_dimension text DEFAULT 'category'::text, p_limit integer DEFAULT 8)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
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
  join finance.effective_transaction_categories le on le.transaction_id=t.id and le.user_id=t.user_id
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
        when 'merchant' then coalesce(em.merchant_id::text,'__unassigned__')
        when 'necessity' then coalesce(le.necessity::text,'unclassified')
      end as item_key,
      case v_dimension
        when 'category' then coalesce(c.name,'Uncategorized')
        when 'merchant' then coalesce(em.merchant_name,'Unassigned merchant')
        when 'necessity' then initcap(replace(coalesce(le.necessity::text,'unclassified'),'_',' '))
      end as label,
      t.id as transaction_id,le.reporting_amount_minor
    from periods p
    join finance.transactions t on t.user_id=v_user_id and t.status='posted'
      and t.type in ('expense','refund','reimbursement') and t.occurred_at>=p.start_at and t.occurred_at<p.end_at
    join finance.effective_transaction_categories le on le.transaction_id=t.id and le.user_id=t.user_id
    left join finance.effective_transaction_merchants em on em.transaction_id=t.id and em.user_id=t.user_id
    left join finance.categories c on c.id=le.category_id and c.user_id=le.user_id
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
$function$;

CREATE OR REPLACE FUNCTION finance.get_analytics_time_series(p_period_start timestamp with time zone, p_period_end timestamp with time zone, p_compare_start timestamp with time zone DEFAULT NULL::timestamp with time zone, p_compare_end timestamp with time zone DEFAULT NULL::timestamp with time zone, p_bucket_kind text DEFAULT 'day'::text)
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
    left join finance.effective_transaction_categories le on le.transaction_id=t.id and le.user_id=t.user_id
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
$function$;

CREATE OR REPLACE FUNCTION finance.get_overview_dashboard(p_period_start timestamp with time zone, p_period_end timestamp with time zone, p_compare_start timestamp with time zone DEFAULT NULL::timestamp with time zone, p_compare_end timestamp with time zone DEFAULT NULL::timestamp with time zone, p_as_of timestamp with time zone DEFAULT now(), p_recent_limit integer DEFAULT 6)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_currency text := 'EUR';
  v_locale text := 'de-DE';
  v_time_zone text := 'Europe/Berlin';
  v_compare_start timestamptz;
  v_compare_end timestamptz;
  v_current_income bigint := 0;
  v_current_gross_spend bigint := 0;
  v_current_recoveries bigint := 0;
  v_current_net_spent bigint := 0;
  v_current_cash_flow bigint := 0;
  v_current_transaction_count integer := 0;
  v_current_expense_count integer := 0;
  v_previous_income bigint := 0;
  v_previous_gross_spend bigint := 0;
  v_previous_recoveries bigint := 0;
  v_previous_net_spent bigint := 0;
  v_previous_cash_flow bigint := 0;
  v_previous_transaction_count integer := 0;
  v_previous_expense_count integer := 0;
  v_savings_rate numeric;
  v_previous_savings_rate numeric;
  v_local_start date;
  v_local_end date;
  v_budget_configured boolean := false;
  v_budget_period_count integer := 0;
  v_planned_income bigint := 0;
  v_planned_spend bigint := 0;
  v_budgeted_spent bigint := 0;
  v_remaining bigint;
  v_elapsed_ratio numeric := 0;
  v_pace_ratio numeric;
  v_projected_spend bigint;
  v_status_code text := 'no_activity';
  v_status_tone text := 'neutral';
  v_unclassified_spend bigint := 0;
  v_categories jsonb := '[]'::jsonb;
  v_attention jsonb := '{}'::jsonb;
  v_recent jsonb := '[]'::jsonb;
  v_accounts jsonb := '{}'::jsonb;
begin
  if v_user_id is null then
    raise exception using errcode='42501',message='authentication required';
  end if;
  if p_period_start is null or p_period_end is null or p_period_start >= p_period_end then
    raise exception using errcode='23514',message='overview period must have start < end';
  end if;
  if p_as_of is null then p_as_of := now(); end if;

  v_compare_end := coalesce(p_compare_end,p_period_start);
  v_compare_start := coalesce(
    p_compare_start,
    v_compare_end - (p_period_end - p_period_start)
  );
  if v_compare_start >= v_compare_end then
    raise exception using errcode='23514',message='comparison period must have start < end';
  end if;

  select
    coalesce(p.reporting_currency,'EUR'),
    coalesce(p.locale,'de-DE'),
    coalesce(p.time_zone,'Europe/Berlin')
  into v_currency,v_locale,v_time_zone
  from finance.profiles p
  where p.user_id=v_user_id;

  with ranges(label,start_at,end_at) as (
    values
      ('current'::text,p_period_start,p_period_end),
      ('previous'::text,v_compare_start,v_compare_end)
  ),
  flows as (
    select r.label,t.id as transaction_id,t.type,le.reporting_amount_minor
    from ranges r
    join finance.transactions t
      on t.user_id=v_user_id
     and t.status='posted'
     and t.occurred_at>=r.start_at
     and t.occurred_at<r.end_at
    join finance.effective_transaction_categories le on le.transaction_id=t.id and le.user_id=t.user_id
  ),
  metrics as (
    select
      label,
      coalesce(-sum(reporting_amount_minor) filter(where type='income'),0)::bigint as income_minor,
      coalesce(sum(reporting_amount_minor) filter(
        where type='expense' and reporting_amount_minor>0
      ),0)::bigint as gross_spend_minor,
      coalesce(-sum(reporting_amount_minor) filter(
        where type in ('refund','reimbursement') and reporting_amount_minor<0
      ),0)::bigint as recoveries_minor,
      coalesce(sum(reporting_amount_minor) filter(
        where type in ('expense','refund','reimbursement')
      ),0)::bigint as net_spent_minor,
      count(distinct transaction_id)::integer as transaction_count,
      count(distinct transaction_id) filter(where type='expense')::integer as expense_count
    from flows
    group by label
  )
  select
    coalesce(max(income_minor) filter(where label='current'),0),
    coalesce(max(gross_spend_minor) filter(where label='current'),0),
    coalesce(max(recoveries_minor) filter(where label='current'),0),
    coalesce(max(net_spent_minor) filter(where label='current'),0),
    coalesce(max(transaction_count) filter(where label='current'),0),
    coalesce(max(expense_count) filter(where label='current'),0),
    coalesce(max(income_minor) filter(where label='previous'),0),
    coalesce(max(gross_spend_minor) filter(where label='previous'),0),
    coalesce(max(recoveries_minor) filter(where label='previous'),0),
    coalesce(max(net_spent_minor) filter(where label='previous'),0),
    coalesce(max(transaction_count) filter(where label='previous'),0),
    coalesce(max(expense_count) filter(where label='previous'),0)
  into
    v_current_income,v_current_gross_spend,v_current_recoveries,
    v_current_net_spent,v_current_transaction_count,v_current_expense_count,
    v_previous_income,v_previous_gross_spend,v_previous_recoveries,
    v_previous_net_spent,v_previous_transaction_count,v_previous_expense_count
  from metrics;

  v_current_net_spent := greatest(v_current_net_spent,0);
  v_previous_net_spent := greatest(v_previous_net_spent,0);
  v_current_cash_flow := v_current_income-v_current_net_spent;
  v_previous_cash_flow := v_previous_income-v_previous_net_spent;

  if v_current_income>0 then
    v_savings_rate := v_current_cash_flow::numeric/v_current_income::numeric;
  end if;
  if v_previous_income>0 then
    v_previous_savings_rate := v_previous_cash_flow::numeric/v_previous_income::numeric;
  end if;

  v_local_start := (p_period_start at time zone v_time_zone)::date;
  v_local_end := ((p_period_end-interval '1 microsecond') at time zone v_time_zone)::date;

  with active_periods as (
    select bp.id,bp.planned_income_minor
    from finance.budget_periods bp
    join finance.budgets b
      on b.id=bp.budget_id and b.user_id=bp.user_id
    where bp.user_id=v_user_id
      and b.is_active
      and bp.starts_on<=v_local_end
      and bp.ends_on>=v_local_start
  )
  select count(*)>0,count(*)::integer,coalesce(sum(planned_income_minor),0)::bigint
  into v_budget_configured,v_budget_period_count,v_planned_income
  from active_periods;

  if v_budget_configured then
    with active_periods as (
      select bp.id
      from finance.budget_periods bp
      join finance.budgets b
        on b.id=bp.budget_id and b.user_id=bp.user_id
      where bp.user_id=v_user_id
        and b.is_active
        and bp.starts_on<=v_local_end
        and bp.ends_on>=v_local_start
    ),
    allocations as (
      select ba.category_id,ba.planned_minor
      from finance.budget_allocations ba
      join active_periods ap on ap.id=ba.budget_period_id
      where ba.user_id=v_user_id
    ),
    budget_categories as (
      select distinct category_id from allocations
    )
    select
      coalesce((select sum(planned_minor) from allocations),0)::bigint,
      coalesce((
        select sum(le.reporting_amount_minor)
        from finance.transactions t
        join finance.effective_transaction_categories le on le.transaction_id=t.id and le.user_id=t.user_id
        join budget_categories bc on bc.category_id=le.category_id
        where t.user_id=v_user_id
          and t.status='posted'
          and t.type in ('expense','refund','reimbursement')
          and t.occurred_at>=p_period_start
          and t.occurred_at<p_period_end
      ),0)::bigint
    into v_planned_spend,v_budgeted_spent;

    v_budgeted_spent := greatest(v_budgeted_spent,0);
    v_remaining := v_planned_spend-v_budgeted_spent;
  end if;

  if p_as_of<=p_period_start then
    v_elapsed_ratio := 0;
  elsif p_as_of>=p_period_end then
    v_elapsed_ratio := 1;
  else
    v_elapsed_ratio :=
      extract(epoch from (p_as_of-p_period_start))
      / nullif(extract(epoch from (p_period_end-p_period_start)),0);
  end if;
  v_elapsed_ratio := greatest(0,least(1,v_elapsed_ratio));

  if v_budget_configured and v_planned_spend>0 then
    v_pace_ratio := v_budgeted_spent::numeric/v_planned_spend::numeric;
    if v_elapsed_ratio>=0.05 then
      v_projected_spend := round(
        v_budgeted_spent::numeric/nullif(v_elapsed_ratio,0)
      )::bigint;
    end if;
    if v_budgeted_spent>v_planned_spend then
      v_status_code := 'over_plan';
      v_status_tone := 'negative';
    elsif v_projected_spend is not null
      and v_projected_spend>round(v_planned_spend::numeric*1.05)::bigint then
      v_status_code := 'at_risk';
      v_status_tone := 'warning';
    else
      v_status_code := 'on_track';
      v_status_tone := 'positive';
    end if;
  elsif v_current_transaction_count=0 then
    v_status_code := 'no_activity';
    v_status_tone := 'neutral';
  elsif v_current_cash_flow<0 then
    v_status_code := 'negative_cash_flow';
    v_status_tone := 'warning';
  else
    v_status_code := 'positive_cash_flow';
    v_status_tone := 'positive';
  end if;

  select coalesce(sum(le.reporting_amount_minor),0)::bigint
  into v_unclassified_spend
  from finance.transactions t
  join finance.effective_transaction_categories le on le.transaction_id=t.id and le.user_id=t.user_id
  where t.user_id=v_user_id
    and t.status='posted'
    and t.type in ('expense','refund','reimbursement')
    and t.occurred_at>=p_period_start
    and t.occurred_at<p_period_end
    and le.necessity='unclassified';
  v_unclassified_spend := greatest(v_unclassified_spend,0);

  with current_categories as (
    select le.category_id,sum(le.reporting_amount_minor)::bigint as amount_minor
    from finance.transactions t
    join finance.effective_transaction_categories le on le.transaction_id=t.id and le.user_id=t.user_id
    where t.user_id=v_user_id
      and t.status='posted'
      and t.type in ('expense','refund','reimbursement')
      and t.occurred_at>=p_period_start and t.occurred_at<p_period_end
      and le.category_id is not null
    group by le.category_id
  ),
  previous_categories as (
    select le.category_id,sum(le.reporting_amount_minor)::bigint as amount_minor
    from finance.transactions t
    join finance.effective_transaction_categories le on le.transaction_id=t.id and le.user_id=t.user_id
    where t.user_id=v_user_id
      and t.status='posted'
      and t.type in ('expense','refund','reimbursement')
      and t.occurred_at>=v_compare_start and t.occurred_at<v_compare_end
      and le.category_id is not null
    group by le.category_id
  ),
  ranked as (
    select
      c.id,c.name,
      greatest(coalesce(cc.amount_minor,0),0)::bigint as current_minor,
      greatest(coalesce(pc.amount_minor,0),0)::bigint as previous_minor
    from current_categories cc
    join finance.categories c on c.id=cc.category_id and c.user_id=v_user_id
    left join previous_categories pc on pc.category_id=cc.category_id
    where coalesce(cc.amount_minor,0)>0
    order by coalesce(cc.amount_minor,0) desc,c.name
    limit 5
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'category_id',r.id,
      'name',r.name,
      'current_minor',r.current_minor,
      'previous_minor',r.previous_minor,
      'delta_minor',r.current_minor-r.previous_minor,
      'delta_ratio',case when r.previous_minor>0
        then (r.current_minor-r.previous_minor)::numeric/r.previous_minor::numeric
        else null end,
      'share',case when v_current_net_spent>0
        then r.current_minor::numeric/v_current_net_spent::numeric
        else null end
    )
    order by r.current_minor desc,r.name
  ),'[]'::jsonb)
  into v_categories
  from ranked r;

  with raw_attention as (
    select
      5 as priority,r.updated_at as occurred_at,
      'receipt_processing_failed'::text as code,'negative'::text as severity,
      r.id as entity_id,'receipt'::text as entity_kind,
      coalesce(m.name,r.merchant_raw_name,'Receipt') as subject,
      r.processing_status::text as detail_code,'open_receipt'::text as action
    from finance.receipts r
    left join finance.merchants m on m.id=r.merchant_id and m.user_id=r.user_id
    where r.user_id=v_user_id
      and r.processing_status in ('processing_failed','incomplete')

    union all

    select
      10,r.updated_at,
      case when jsonb_array_length(r.review_reasons)=0
        then 'receipt_ready_to_confirm' else 'receipt_review_required' end,
      case when jsonb_array_length(r.review_reasons)=0 then 'accent' else 'warning' end,
      r.id,'receipt',coalesce(m.name,r.merchant_raw_name,'Receipt'),
      case when jsonb_array_length(r.review_reasons)=0 then 'ready'
        else jsonb_array_length(r.review_reasons)::text end,
      'review_receipt'
    from finance.receipts r
    left join finance.merchants m on m.id=r.merchant_id and m.user_id=r.user_id
    where r.user_id=v_user_id and r.processing_status='review_required'

    union all

    select
      20,rtm.updated_at,'receipt_match_suggested','accent',
      r.id,'receipt',coalesce(m.name,r.merchant_raw_name,'Receipt'),
      coalesce(round(rtm.confidence*100)::integer::text,''),'review_match'
    from finance.receipt_transaction_matches rtm
    join finance.receipts r on r.id=rtm.receipt_id and r.user_id=rtm.user_id
    left join finance.merchants m on m.id=r.merchant_id and m.user_id=r.user_id
    where rtm.user_id=v_user_id and rtm.status='suggested'

    union all

    select
      30,r.updated_at,'receipt_unmatched','neutral',
      r.id,'receipt',coalesce(m.name,r.merchant_raw_name,'Receipt'),
      coalesce(r.total_minor::text,''),'review_match'
    from finance.receipts r
    left join finance.merchants m on m.id=r.merchant_id and m.user_id=r.user_id
    where r.user_id=v_user_id
      and r.processing_status='confirmed'
      and r.match_status='unmatched'
      and not exists(
        select 1 from finance.receipt_transaction_matches rtm
        where rtm.user_id=r.user_id
          and rtm.receipt_id=r.id
          and rtm.status='confirmed'
      )

    union all

    select
      40,p_as_of,
      case when v_status_code='over_plan' then 'budget_over_plan' else 'budget_at_risk' end,
      case when v_status_code='over_plan' then 'negative' else 'warning' end,
      null::uuid,'budget','Current plan',
      coalesce(v_projected_spend,v_budgeted_spent)::text,'open_budget'
    where v_status_code in ('over_plan','at_risk')

    union all

    select
      50,p_as_of,'unclassified_spending','neutral',
      null::uuid,'classification','Unclassified spending',
      v_unclassified_spend::text,'open_activity'
    where v_unclassified_spend>0
  ),
  counted as (
    select count(*)::integer as total_count from raw_attention
  ),
  top_items as (
    select *
    from raw_attention
    order by priority,occurred_at desc nulls last,entity_id nulls last
    limit 6
  )
  select jsonb_build_object(
    'total_count',(select total_count from counted),
    'items',coalesce((
      select jsonb_agg(jsonb_build_object(
        'code',a.code,'severity',a.severity,'entity_id',a.entity_id,
        'entity_kind',a.entity_kind,'subject',a.subject,
        'detail_code',a.detail_code,'action',a.action,'occurred_at',a.occurred_at
      ) order by a.priority,a.occurred_at desc nulls last)
      from top_items a
    ),'[]'::jsonb)
  )
  into v_attention;

  select coalesce(finance.search_activity(
    '{}'::jsonb,
    greatest(1,least(coalesce(p_recent_limit,6),12)),
    null
  )->'items','[]'::jsonb)
  into v_recent;

  select jsonb_build_object(
    'active_count',count(*)::integer,
    'tracked_net_worth_minor',coalesce((
      select sum(le.reporting_amount_minor)
      from finance.ledger_entries le
      join finance.transactions t on t.id=le.transaction_id and t.user_id=le.user_id
      join finance.accounts a on a.id=le.account_id and a.user_id=le.user_id
      where le.user_id=v_user_id
        and le.entry_kind='account'
        and t.status='posted'
        and a.include_in_net_worth
        and not a.is_archived
    ),0)::bigint
  )
  into v_accounts
  from finance.accounts a
  where a.user_id=v_user_id and not a.is_archived;

  return jsonb_build_object(
    'profile',jsonb_build_object(
      'currency_code',v_currency,'locale',v_locale,'time_zone',v_time_zone
    ),
    'period',jsonb_build_object(
      'start',p_period_start,'end',p_period_end,
      'compare_start',v_compare_start,'compare_end',v_compare_end,
      'as_of',p_as_of,'elapsed_ratio',v_elapsed_ratio
    ),
    'summary',jsonb_build_object(
      'income_minor',v_current_income,
      'gross_spend_minor',v_current_gross_spend,
      'recoveries_minor',v_current_recoveries,
      'net_spent_minor',v_current_net_spent,
      'net_cash_flow_minor',v_current_cash_flow,
      'savings_rate',v_savings_rate,
      'transaction_count',v_current_transaction_count,
      'expense_count',v_current_expense_count,
      'available_to_spend_minor',case when v_budget_configured then v_remaining else null end
    ),
    'comparison',jsonb_build_object(
      'income_minor',v_previous_income,
      'gross_spend_minor',v_previous_gross_spend,
      'recoveries_minor',v_previous_recoveries,
      'net_spent_minor',v_previous_net_spent,
      'net_cash_flow_minor',v_previous_cash_flow,
      'savings_rate',v_previous_savings_rate,
      'transaction_count',v_previous_transaction_count,
      'expense_count',v_previous_expense_count
    ),
    'planning',jsonb_build_object(
      'configured',v_budget_configured,
      'budget_period_count',v_budget_period_count,
      'planned_income_minor',case when v_budget_configured then v_planned_income else null end,
      'planned_spend_minor',case when v_budget_configured then v_planned_spend else null end,
      'budgeted_spent_minor',case when v_budget_configured then v_budgeted_spent else null end,
      'remaining_minor',case when v_budget_configured then v_remaining else null end,
      'pace_ratio',v_pace_ratio,
      'elapsed_ratio',v_elapsed_ratio,
      'projected_spend_minor',v_projected_spend
    ),
    'financial_status',jsonb_build_object('code',v_status_code,'tone',v_status_tone),
    'top_categories',v_categories,
    'attention',v_attention,
    'recent_activity',v_recent,
    'accounts',v_accounts
  );
end;
$function$;

CREATE OR REPLACE FUNCTION finance.get_receipt_match_dashboard(p_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid:=auth.uid();
  v_limit integer:=greatest(1,least(coalesce(p_limit,50),200));
begin
  if v_user_id is null then
    raise exception using errcode='42501',message='authentication required';
  end if;

  return jsonb_build_object(
    'summary',jsonb_build_object(
      'unmatched_count',(
        select count(*) from finance.receipts r
        where r.user_id=v_user_id
          and r.processing_status='confirmed'
          and r.match_status='unmatched'
      ),
      'suggested_count',(
        select count(*) from finance.receipts r
        where r.user_id=v_user_id
          and r.processing_status='confirmed'
          and r.match_status='suggested_match'
      ),
      'partial_count',(
        select count(*) from finance.receipts r
        where r.user_id=v_user_id
          and r.processing_status='confirmed'
          and r.match_status='partially_matched'
      ),
      'matched_count',(
        select count(*) from finance.receipts r
        where r.user_id=v_user_id
          and r.processing_status='confirmed'
          and r.match_status in ('matched','multi_payment_matched')
      )
    ),
    'receipts',coalesce((
      select jsonb_agg(jsonb_build_object(
        'receipt_id',q.id,
        'merchant_id',q.merchant_id,
        'merchant_name',q.merchant_name,
        'purchased_at',q.purchased_at,
        'currency_code',q.currency_code,
        'total_minor',q.total_minor,
        'match_status',q.match_status,
        'covered_minor',q.match_covered_minor,
        'remaining_minor',q.match_remaining_minor,
        'suggested_count',q.suggested_count,
        'confirmed_count',q.confirmed_count,
        'top_confidence',q.top_confidence,
        'top_transaction_id',q.top_transaction_id,
        'top_transaction_at',q.top_transaction_at,
        'top_transaction_description',q.top_transaction_description,
        'top_transaction_amount_minor',q.top_transaction_amount_minor,
        'updated_at',q.updated_at
      ) order by
        case q.match_status
          when 'suggested_match' then 0
          when 'partially_matched' then 1
          when 'unmatched' then 2
          else 3
        end,
        q.purchased_at desc nulls last,
        q.updated_at desc)
      from (
        select
          r.id,
          r.merchant_id,
          coalesce(m.name,r.merchant_raw_name,'Receipt') as merchant_name,
          r.purchased_at,
          r.currency_code,
          r.total_minor,
          r.match_status,
          r.match_covered_minor,
          r.match_remaining_minor,
          r.updated_at,
          coalesce((
            select count(*)
            from finance.receipt_transaction_matches x
            where x.user_id=r.user_id
              and x.receipt_id=r.id
              and x.status='suggested'
          ),0)::integer as suggested_count,
          coalesce((
            select count(*)
            from finance.receipt_transaction_matches x
            where x.user_id=r.user_id
              and x.receipt_id=r.id
              and x.status='confirmed'
          ),0)::integer as confirmed_count,
          top_match.confidence as top_confidence,
          top_match.transaction_id as top_transaction_id,
          top_match.occurred_at as top_transaction_at,
          top_match.description as top_transaction_description,
          top_match.display_amount_minor as top_transaction_amount_minor
        from finance.receipts r
        left join finance.merchants m
          on m.id=r.merchant_id and m.user_id=r.user_id
        left join lateral (
          select
            rtm.confidence,
            t.id as transaction_id,
            t.occurred_at,
            coalesce(etm.merchant_name,t.description) as description,
            ts.display_amount_minor
          from finance.receipt_transaction_matches rtm
          join finance.transactions t
            on t.id=rtm.transaction_id
           and t.user_id=rtm.user_id
          join finance.transaction_summary ts
            on ts.id=t.id and ts.user_id=t.user_id
          left join finance.effective_transaction_merchants etm
            on etm.transaction_id=t.id and etm.user_id=t.user_id
          where rtm.user_id=r.user_id
            and rtm.receipt_id=r.id
            and rtm.status='suggested'
          order by rtm.confidence desc,rtm.candidate_rank,rtm.id
          limit 1
        ) top_match on true
        where r.user_id=v_user_id
          and r.processing_status='confirmed'
        order by
          case r.match_status
            when 'suggested_match' then 0
            when 'partially_matched' then 1
            when 'unmatched' then 2
            else 3
          end,
          r.purchased_at desc nulls last,
          r.updated_at desc
        limit v_limit
      ) q
    ),'[]'::jsonb)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION finance.get_receipt_match_workspace(p_receipt_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid:=auth.uid();
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception using errcode='42501',message='authentication required';
  end if;

  if not exists(
    select 1 from finance.receipts
    where id=p_receipt_id and user_id=v_user_id
  ) then
    raise exception using errcode='23503',message='receipt not found';
  end if;

  select jsonb_build_object(
    'receipt',jsonb_build_object(
      'receipt_id',r.id,
      'merchant_id',r.merchant_id,
      'merchant_name',coalesce(m.name,r.merchant_raw_name,'Receipt'),
      'merchant_raw_name',r.merchant_raw_name,
      'purchased_at',r.purchased_at,
      'currency_code',r.currency_code,
      'total_minor',r.total_minor,
      'payment_method_raw',r.payment_method_raw,
      'receipt_number',r.receipt_number,
      'processing_status',r.processing_status,
      'match_status',r.match_status,
      'covered_minor',r.match_covered_minor,
      'remaining_minor',r.match_remaining_minor,
      'match_updated_at',r.match_updated_at
    ),
    'items',coalesce((
      select jsonb_agg(jsonb_build_object(
        'item_id',ri.id,
        'line_index',ri.line_index,
        'raw_name',ri.raw_name,
        'normalized_name',ri.normalized_name,
        'product_id',ri.product_id,
        'product_name',p.name,
        'category_id',ri.category_id,
        'category_name',c.name,
        'necessity',ri.necessity,
        'quantity',ri.quantity,
        'effective_total_minor',ri.effective_total_minor
      ) order by ri.line_index)
      from finance.receipt_items ri
      left join finance.products p
        on p.id=ri.product_id and p.user_id=ri.user_id
      left join finance.categories c
        on c.id=ri.category_id and c.user_id=ri.user_id
      where ri.user_id=v_user_id
        and ri.receipt_id=r.id
        and not ri.is_excluded
    ),'[]'::jsonb),
    'matches',coalesce((
      select jsonb_agg(jsonb_build_object(
        'match_id',rtm.id,
        'status',rtm.status,
        'matched_amount_minor',rtm.matched_amount_minor,
        'confidence',rtm.confidence,
        'candidate_rank',rtm.candidate_rank,
        'amount_delta_minor',rtm.amount_delta_minor,
        'date_delta_days',rtm.date_delta_days,
        'amount_score',rtm.amount_score,
        'date_score',rtm.date_score,
        'merchant_score',rtm.merchant_score,
        'currency_score',rtm.currency_score,
        'score_version',rtm.score_version,
        'decision_source',rtm.decision_source,
        'decision_note',rtm.decision_note,
        'confirmed_at',rtm.confirmed_at,
        'rejected_at',rtm.rejected_at,
        'transaction',jsonb_build_object(
          'transaction_id',t.id,
          'type',t.type,
          'status',t.status,
          'source',t.source,
          'occurred_at',t.occurred_at,
          'description',t.description,
          'merchant_id',etm.merchant_id,
          'merchant_name',etm.merchant_name,
          'merchant_source',etm.merchant_source,
          'reporting_currency',t.reporting_currency,
          'display_amount_minor',ts.display_amount_minor,
          'matchable_amount_minor',
            finance.transaction_matchable_amount(
              t.id,r.currency_code
            ),
          'accounts',coalesce((
            select jsonb_agg(jsonb_build_object(
              'account_id',a.id,
              'name',a.name,
              'kind',a.kind,
              'currency_code',a.currency_code,
              'signed_amount_minor',le.signed_amount_minor
            ) order by a.name)
            from finance.ledger_entries le
            join finance.accounts a
              on a.id=le.account_id and a.user_id=le.user_id
            where le.user_id=t.user_id
              and le.transaction_id=t.id
              and le.entry_kind='account'
          ),'[]'::jsonb)
        ),
        'reason',rtm.reason
      ) order by
        case rtm.status
          when 'confirmed' then 0
          when 'suggested' then 1
          else 2
        end,
        rtm.candidate_rank nulls last,
        rtm.confidence desc nulls last,
        t.occurred_at desc)
      from finance.receipt_transaction_matches rtm
      join finance.transactions t
        on t.id=rtm.transaction_id and t.user_id=rtm.user_id
      join finance.transaction_summary ts
        on ts.id=t.id and ts.user_id=t.user_id
      left join finance.effective_transaction_merchants etm
        on etm.transaction_id=t.id and etm.user_id=t.user_id
      where rtm.user_id=v_user_id
        and rtm.receipt_id=r.id
    ),'[]'::jsonb),
    'effective_allocations',coalesce((
      select jsonb_agg(jsonb_build_object(
        'transaction_id',a.transaction_id,
        'match_id',a.match_id,
        'category_id',a.category_id,
        'category_name',c.name,
        'necessity',a.necessity,
        'source_currency_code',a.source_currency_code,
        'source_amount_minor',a.source_amount_minor,
        'reporting_currency',a.reporting_currency,
        'reporting_amount_minor',a.reporting_amount_minor
      ) order by a.transaction_id,c.name nulls last,a.necessity)
      from finance.receipt_match_allocations a
      left join finance.categories c
        on c.id=a.category_id and c.user_id=a.user_id
      where a.user_id=v_user_id
        and a.receipt_id=r.id
    ),'[]'::jsonb)
  )
  into v_result
  from finance.receipts r
  left join finance.merchants m
    on m.id=r.merchant_id and m.user_id=r.user_id
  where r.id=p_receipt_id and r.user_id=v_user_id;

  return v_result;
end;
$function$;

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
      em.merchant_id,
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
    join finance.effective_transaction_categories le on le.transaction_id=t.id and le.user_id=t.user_id
    left join finance.effective_transaction_merchants em on em.transaction_id=t.id and em.user_id=t.user_id
    where
      (
        p_category_id is null
        or le.category_id in (select id from category_scope)
      )
      and (p_merchant_id is null or em.merchant_id=p_merchant_id)
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
$function$;

CREATE OR REPLACE FUNCTION finance.normalize_match_text(p_value text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select lower(
    regexp_replace(
      coalesce(p_value,''),
      '[^[:alnum:]]+',
      '',
      'g'
    )
  );
$function$;

CREATE OR REPLACE FUNCTION finance.rebuild_transaction_receipt_allocations(p_transaction_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid:=auth.uid();
  v_reporting_currency text;
  v_display_amount bigint;
  v_source_currency text;
  v_matchable_amount bigint;
  v_confirmed_sum bigint;
  v_match_count integer;
  v_valid_item_matches integer;
  v_inserted integer:=0;
begin
  if v_user_id is null then
    raise exception using errcode='42501',message='authentication required';
  end if;

  delete from finance.receipt_match_allocations
  where user_id=v_user_id
    and transaction_id=p_transaction_id;

  select t.reporting_currency,finance.transaction_display_amount(t.id)
  into v_reporting_currency,v_display_amount
  from finance.transactions t
  where t.id=p_transaction_id
    and t.user_id=v_user_id
    and t.status='posted'
    and t.type='expense';

  if not found or coalesce(v_display_amount,0)<=0 then
    return jsonb_build_object(
      'transaction_id',p_transaction_id,
      'applied',false,
      'reason','transaction_not_eligible'
    );
  end if;

  select
    min(r.currency_code),
    case when min(r.currency_code)=max(r.currency_code)
      then min(r.currency_code) else null end,
    coalesce(sum(rtm.matched_amount_minor),0)::bigint,
    count(*)::integer
  into
    v_source_currency,v_source_currency,
    v_confirmed_sum,v_match_count
  from finance.receipt_transaction_matches rtm
  join finance.receipts r
    on r.id=rtm.receipt_id and r.user_id=rtm.user_id
  where rtm.user_id=v_user_id
    and rtm.transaction_id=p_transaction_id
    and rtm.status='confirmed';

  if v_match_count=0 or v_source_currency is null then
    return jsonb_build_object(
      'transaction_id',p_transaction_id,
      'applied',false,
      'reason',case when v_match_count=0
        then 'no_confirmed_matches'
        else 'mixed_receipt_currencies' end
    );
  end if;

  v_matchable_amount:=
    finance.transaction_matchable_amount(
      p_transaction_id,
      v_source_currency
    );

  if v_matchable_amount is null
     or v_confirmed_sum<>v_matchable_amount then
    return jsonb_build_object(
      'transaction_id',p_transaction_id,
      'applied',false,
      'reason','transaction_not_fully_covered',
      'matchable_amount_minor',v_matchable_amount,
      'confirmed_amount_minor',v_confirmed_sum
    );
  end if;

  select count(*)::integer
  into v_valid_item_matches
  from (
    select rtm.id
    from finance.receipt_transaction_matches rtm
    join finance.receipts r
      on r.id=rtm.receipt_id and r.user_id=rtm.user_id
    where rtm.user_id=v_user_id
      and rtm.transaction_id=p_transaction_id
      and rtm.status='confirmed'
      and exists(
        select 1
        from finance.receipt_items ri
        where ri.user_id=rtm.user_id
          and ri.receipt_id=rtm.receipt_id
          and not ri.is_excluded
          and ri.effective_total_minor>0
      )
  ) q;

  if v_valid_item_matches<>v_match_count then
    return jsonb_build_object(
      'transaction_id',p_transaction_id,
      'applied',false,
      'reason','receipt_items_unavailable'
    );
  end if;

  with confirmed as (
    select
      rtm.id as match_id,
      rtm.receipt_id,
      rtm.transaction_id,
      rtm.matched_amount_minor,
      r.currency_code,
      row_number() over(order by rtm.id) as match_rank
    from finance.receipt_transaction_matches rtm
    join finance.receipts r
      on r.id=rtm.receipt_id and r.user_id=rtm.user_id
    where rtm.user_id=v_user_id
      and rtm.transaction_id=p_transaction_id
      and rtm.status='confirmed'
  ),
  match_floor as (
    select
      c.*,
      floor(
        v_display_amount::numeric
        * c.matched_amount_minor::numeric
        / nullif(v_confirmed_sum,0)::numeric
      )::bigint as reporting_floor
    from confirmed c
  ),
  match_targets as (
    select
      mf.*,
      mf.reporting_floor
      + case when mf.match_rank=1 then
          v_display_amount
          - sum(mf.reporting_floor) over()
        else 0 end
        as reporting_target_minor
    from match_floor mf
  ),
  category_source as (
    select
      mt.match_id,
      mt.receipt_id,
      mt.transaction_id,
      mt.matched_amount_minor,
      mt.currency_code,
      mt.reporting_target_minor,
      ri.category_id,
      ri.necessity,
      sum(ri.effective_total_minor)::bigint as raw_source_minor,
      sum(sum(ri.effective_total_minor)) over(
        partition by mt.match_id
      )::bigint as raw_source_total,
      row_number() over(
        partition by mt.match_id
        order by
          sum(ri.effective_total_minor) desc,
          ri.category_id nulls last,
          ri.necessity
      ) as category_rank
    from match_targets mt
    join finance.receipt_items ri
      on ri.user_id=v_user_id
     and ri.receipt_id=mt.receipt_id
     and not ri.is_excluded
     and ri.effective_total_minor>0
    group by
      mt.match_id,mt.receipt_id,mt.transaction_id,
      mt.matched_amount_minor,mt.currency_code,
      mt.reporting_target_minor,
      ri.category_id,ri.necessity
  ),
  source_floor as (
    select
      cs.*,
      floor(
        cs.matched_amount_minor::numeric
        * cs.raw_source_minor::numeric
        / nullif(cs.raw_source_total,0)::numeric
      )::bigint as source_floor_minor
    from category_source cs
  ),
  source_targets as (
    select
      sf.*,
      sf.source_floor_minor
      + case when sf.category_rank=1 then
          sf.matched_amount_minor
          - sum(sf.source_floor_minor) over(
              partition by sf.match_id
            )
        else 0 end
        as source_target_minor
    from source_floor sf
  ),
  reporting_floor as (
    select
      st.*,
      floor(
        st.reporting_target_minor::numeric
        * st.source_target_minor::numeric
        / nullif(st.matched_amount_minor,0)::numeric
      )::bigint as reporting_category_floor
    from source_targets st
  ),
  final_allocations as (
    select
      rf.*,
      rf.reporting_category_floor
      + case when rf.category_rank=1 then
          rf.reporting_target_minor
          - sum(rf.reporting_category_floor) over(
              partition by rf.match_id
            )
        else 0 end
        as reporting_category_minor
    from reporting_floor rf
  )
  insert into finance.receipt_match_allocations(
    user_id,match_id,receipt_id,transaction_id,
    category_id,necessity,
    source_currency_code,source_amount_minor,
    reporting_currency,reporting_amount_minor
  )
  select
    v_user_id,
    fa.match_id,
    fa.receipt_id,
    fa.transaction_id,
    fa.category_id,
    fa.necessity,
    fa.currency_code,
    fa.source_target_minor,
    v_reporting_currency,
    fa.reporting_category_minor
  from final_allocations fa
  where fa.source_target_minor>=0
    and fa.reporting_category_minor>=0;

  get diagnostics v_inserted=row_count;

  return jsonb_build_object(
    'transaction_id',p_transaction_id,
    'applied',true,
    'allocation_count',v_inserted,
    'source_currency',v_source_currency,
    'source_amount_minor',v_matchable_amount,
    'reporting_amount_minor',v_display_amount
  );
end;
$function$;

CREATE OR REPLACE FUNCTION finance.refresh_receipt_match_candidates(p_receipt_id uuid, p_auto_confirm boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid:=auth.uid();
  v_receipt finance.receipts%rowtype;
  v_time_zone text:='Europe/Berlin';
  v_receipt_date date;
  v_confirmed_sum bigint:=0;
  v_remaining bigint;
  v_inserted integer:=0;
  v_top_id uuid;
  v_top_confidence numeric;
  v_top_delta bigint;
  v_top_date integer;
  v_top_merchant numeric;
  v_second_confidence numeric;
  v_auto_result jsonb;
  v_state jsonb;
begin
  if v_user_id is null then
    raise exception using errcode='42501',message='authentication required';
  end if;

  select * into v_receipt
  from finance.receipts
  where id=p_receipt_id and user_id=v_user_id
  for update;

  if not found then
    raise exception using errcode='23503',message='receipt not found';
  end if;

  if v_receipt.processing_status<>'confirmed'
     or v_receipt.total_minor is null
     or v_receipt.total_minor<=0 then
    perform finance.refresh_receipt_match_state(p_receipt_id);
    return jsonb_build_object(
      'receipt_id',p_receipt_id,
      'candidate_count',0,
      'auto_confirmed',false,
      'reason','receipt_not_ready'
    );
  end if;

  select coalesce(time_zone,'Europe/Berlin')
  into v_time_zone
  from finance.profiles
  where user_id=v_user_id;

  v_receipt_date:=(
    coalesce(
      v_receipt.purchased_at,
      v_receipt.capture_finalized_at,
      v_receipt.created_at
    ) at time zone v_time_zone
  )::date;

  select coalesce(sum(matched_amount_minor),0)::bigint
  into v_confirmed_sum
  from finance.receipt_transaction_matches
  where user_id=v_user_id
    and receipt_id=p_receipt_id
    and status='confirmed';

  v_remaining:=v_receipt.total_minor-v_confirmed_sum;

  if v_remaining<=0 then
    v_state:=finance.refresh_receipt_match_state(p_receipt_id);
    return jsonb_build_object(
      'receipt_id',p_receipt_id,
      'candidate_count',0,
      'auto_confirmed',false,
      'receipt_state',v_state
    );
  end if;

  delete from finance.receipt_transaction_matches
  where user_id=v_user_id
    and receipt_id=p_receipt_id
    and status='suggested';

  with transaction_base as (
    select
      t.id as transaction_id,
      t.occurred_at,
      finance.transaction_matchable_amount(
        t.id,v_receipt.currency_code
      ) as matchable_amount_minor,
      coalesce(
        tm.name,
        nullif(t.metadata->>'counterparty_name',''),
        t.description,
        ''
      ) as transaction_merchant_text
    from finance.transactions t
    left join finance.merchants tm
      on tm.id=t.merchant_id and tm.user_id=t.user_id
    where t.user_id=v_user_id
      and t.status='posted'
      and t.type='expense'
      and (t.occurred_at at time zone v_time_zone)::date
          between v_receipt_date-7 and v_receipt_date+7
  ),
  available as (
    select
      tb.*,
      greatest(
        coalesce(tb.matchable_amount_minor,0)
        - coalesce((
          select sum(rtm.matched_amount_minor)
          from finance.receipt_transaction_matches rtm
          join finance.receipts rr
            on rr.id=rtm.receipt_id
           and rr.user_id=rtm.user_id
          where rtm.user_id=v_user_id
            and rtm.transaction_id=tb.transaction_id
            and rtm.status='confirmed'
            and rr.currency_code=v_receipt.currency_code
        ),0),
        0
      )::bigint as available_minor,
      abs(
        (
          (tb.occurred_at at time zone v_time_zone)::date
          - v_receipt_date
        )::integer
      ) as date_delta_days
    from transaction_base tb
    where tb.matchable_amount_minor is not null
      and tb.matchable_amount_minor>0
  ),
  scored_base as (
    select
      a.*,
      abs(a.available_minor-v_remaining)::bigint
        as amount_delta_minor,
      finance.normalize_match_text(
        coalesce(
          (
            select m.name
            from finance.merchants m
            where m.id=v_receipt.merchant_id
              and m.user_id=v_user_id
          ),
          v_receipt.merchant_raw_name,
          ''
        )
      ) as receipt_merchant_norm,
      finance.normalize_match_text(
        a.transaction_merchant_text
      ) as transaction_merchant_norm
    from available a
    where a.available_minor>0
  ),
  scored as (
    select
      sb.*,
      case
        when sb.amount_delta_minor=0 then 1.0
        when sb.amount_delta_minor<=greatest(50,round(v_remaining*0.01)::bigint)
          then 0.8
        when sb.amount_delta_minor<=greatest(100,round(v_remaining*0.02)::bigint)
          then 0.6
        when sb.amount_delta_minor<=greatest(200,round(v_remaining*0.05)::bigint)
          then 0.3
        else 0.0
      end::numeric as amount_score,
      case
        when sb.date_delta_days=0 then 1.0
        when sb.date_delta_days=1 then 0.9
        when sb.date_delta_days=2 then 0.7
        when sb.date_delta_days=3 then 0.5
        else 0.2
      end::numeric as date_score,
      case
        when sb.receipt_merchant_norm=''
          or sb.transaction_merchant_norm='' then 0.0
        when sb.receipt_merchant_norm=sb.transaction_merchant_norm then 1.0
        when length(sb.receipt_merchant_norm)>=4
          and (
            position(
              sb.receipt_merchant_norm
              in sb.transaction_merchant_norm
            )>0
            or position(
              sb.transaction_merchant_norm
              in sb.receipt_merchant_norm
            )>0
          ) then 0.8
        else 0.0
      end::numeric as merchant_score,
      1.0::numeric as currency_score
    from scored_base sb
  ),
  ranked as (
    select
      s.*,
      (
        s.amount_score*0.55
        + s.date_score*0.20
        + s.merchant_score*0.20
        + s.currency_score*0.05
      )::numeric as confidence,
      row_number() over(
        order by
          (
            s.amount_score*0.55
            + s.date_score*0.20
            + s.merchant_score*0.20
            + s.currency_score*0.05
          ) desc,
          s.amount_delta_minor,
          s.date_delta_days,
          s.transaction_id
      )::integer as candidate_rank
    from scored s
  )
  insert into finance.receipt_transaction_matches(
    user_id,receipt_id,transaction_id,status,
    matched_amount_minor,confidence,reason,
    candidate_rank,amount_delta_minor,date_delta_days,
    amount_score,date_score,merchant_score,currency_score,
    score_version,decision_source,last_scored_at
  )
  select
    v_user_id,
    p_receipt_id,
    r.transaction_id,
    'suggested',
    least(v_remaining,r.available_minor),
    r.confidence,
    jsonb_build_object(
      'score_version','p18-v1',
      'receipt_remaining_minor',v_remaining,
      'transaction_available_minor',r.available_minor,
      'amount_delta_minor',r.amount_delta_minor,
      'date_delta_days',r.date_delta_days,
      'receipt_merchant_norm',r.receipt_merchant_norm,
      'transaction_merchant_norm',r.transaction_merchant_norm
    ),
    r.candidate_rank,
    r.amount_delta_minor,
    r.date_delta_days,
    r.amount_score,
    r.date_score,
    r.merchant_score,
    r.currency_score,
    'p18-v1',
    'deterministic',
    now()
  from ranked r
  where r.candidate_rank<=8
    and not exists(
      select 1
      from finance.receipt_transaction_matches existing
      where existing.user_id=v_user_id
        and existing.receipt_id=p_receipt_id
        and existing.transaction_id=r.transaction_id
        and existing.status in ('confirmed','rejected')
    )
  on conflict(receipt_id,transaction_id)
  do update set
    matched_amount_minor=excluded.matched_amount_minor,
    confidence=excluded.confidence,
    reason=excluded.reason,
    candidate_rank=excluded.candidate_rank,
    amount_delta_minor=excluded.amount_delta_minor,
    date_delta_days=excluded.date_delta_days,
    amount_score=excluded.amount_score,
    date_score=excluded.date_score,
    merchant_score=excluded.merchant_score,
    currency_score=excluded.currency_score,
    score_version=excluded.score_version,
    decision_source='deterministic',
    last_scored_at=now()
  where finance.receipt_transaction_matches.status='suggested';

  get diagnostics v_inserted=row_count;

  v_state:=finance.refresh_receipt_match_state(p_receipt_id);

  if p_auto_confirm and v_confirmed_sum=0 then
    select
      id,confidence,amount_delta_minor,date_delta_days,merchant_score
    into
      v_top_id,v_top_confidence,v_top_delta,v_top_date,v_top_merchant
    from finance.receipt_transaction_matches
    where user_id=v_user_id
      and receipt_id=p_receipt_id
      and status='suggested'
    order by confidence desc,candidate_rank
    limit 1;

    select confidence
    into v_second_confidence
    from finance.receipt_transaction_matches
    where user_id=v_user_id
      and receipt_id=p_receipt_id
      and status='suggested'
      and id<>v_top_id
    order by confidence desc,candidate_rank
    limit 1;

    if v_top_id is not null
       and v_top_confidence>=0.92
       and v_top_delta=0
       and v_top_date<=1
       and v_top_merchant>=0.75
       and (
         v_second_confidence is null
         or v_top_confidence-v_second_confidence>=0.12
       ) then
      v_auto_result:=finance.confirm_receipt_transaction_match(
        v_top_id,
        v_receipt.total_minor,
        'Automatically confirmed by deterministic P18 match rules',
        'deterministic'
      );

      return jsonb_build_object(
        'receipt_id',p_receipt_id,
        'candidate_count',v_inserted,
        'auto_confirmed',true,
        'match',v_auto_result
      );
    end if;
  end if;

  return jsonb_build_object(
    'receipt_id',p_receipt_id,
    'candidate_count',v_inserted,
    'auto_confirmed',false,
    'receipt_state',v_state
  );
end;
$function$;

CREATE OR REPLACE FUNCTION finance.refresh_receipt_match_queue(p_limit integer DEFAULT 100, p_auto_confirm boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid:=auth.uid();
  v_limit integer:=greatest(1,least(coalesce(p_limit,100),500));
  v_receipt record;
  v_result jsonb;
  v_scanned integer:=0;
  v_auto integer:=0;
begin
  if v_user_id is null then
    raise exception using errcode='42501',message='authentication required';
  end if;

  for v_receipt in
    select r.id
    from finance.receipts r
    where r.user_id=v_user_id
      and r.processing_status='confirmed'
      and r.total_minor is not null
      and r.total_minor>0
      and r.match_status in (
        'unmatched','suggested_match','partially_matched'
      )
    order by r.updated_at desc
    limit v_limit
  loop
    v_result:=finance.refresh_receipt_match_candidates(
      v_receipt.id,p_auto_confirm
    );
    v_scanned:=v_scanned+1;
    if coalesce((v_result->>'auto_confirmed')::boolean,false) then
      v_auto:=v_auto+1;
    end if;
  end loop;

  return jsonb_build_object(
    'scanned_count',v_scanned,
    'auto_confirmed_count',v_auto
  );
end;
$function$;

CREATE OR REPLACE FUNCTION finance.refresh_receipt_match_state(p_receipt_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid:=auth.uid();
  v_total bigint;
  v_confirmed_sum bigint:=0;
  v_confirmed_count integer:=0;
  v_suggested_count integer:=0;
  v_status finance.receipt_match_status;
  v_remaining bigint;
begin
  if v_user_id is null then
    raise exception using errcode='42501',message='authentication required';
  end if;

  select total_minor
  into v_total
  from finance.receipts
  where id=p_receipt_id and user_id=v_user_id;

  if not found then
    raise exception using errcode='23503',message='receipt not found';
  end if;

  select
    coalesce(sum(matched_amount_minor),0)::bigint,
    count(*)::integer
  into v_confirmed_sum,v_confirmed_count
  from finance.receipt_transaction_matches
  where user_id=v_user_id
    and receipt_id=p_receipt_id
    and status='confirmed';

  select count(*)::integer
  into v_suggested_count
  from finance.receipt_transaction_matches
  where user_id=v_user_id
    and receipt_id=p_receipt_id
    and status='suggested';

  if v_total is null then
    v_remaining:=null;
    v_status:=case
      when v_confirmed_count>0 then 'partially_matched'
      when v_suggested_count>0 then 'suggested_match'
      else 'unmatched'
    end;
  else
    v_remaining:=greatest(v_total-v_confirmed_sum,0);

    if v_confirmed_sum=0 then
      v_status:=case
        when v_suggested_count>0 then 'suggested_match'
        else 'unmatched'
      end;
    elsif v_confirmed_sum<v_total then
      v_status:='partially_matched';
    elsif v_confirmed_sum=v_total and v_confirmed_count=1 then
      v_status:='matched';
    elsif v_confirmed_sum=v_total and v_confirmed_count>1 then
      v_status:='multi_payment_matched';
    else
      raise exception using errcode='23514',
        message='confirmed receipt matches exceed receipt total';
    end if;
  end if;

  update finance.receipts
  set
    match_status=v_status,
    match_covered_minor=v_confirmed_sum,
    match_remaining_minor=v_remaining,
    match_updated_at=now()
  where id=p_receipt_id and user_id=v_user_id;

  return jsonb_build_object(
    'receipt_id',p_receipt_id,
    'match_status',v_status,
    'covered_minor',v_confirmed_sum,
    'remaining_minor',v_remaining,
    'confirmed_count',v_confirmed_count,
    'suggested_count',v_suggested_count
  );
end;
$function$;

CREATE OR REPLACE FUNCTION finance.reject_receipt_transaction_match(p_match_id uuid, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid:=auth.uid();
  v_match finance.receipt_transaction_matches%rowtype;
  v_was_confirmed boolean:=false;
  v_state jsonb;
  v_allocations jsonb;
begin
  if v_user_id is null then
    raise exception using errcode='42501',message='authentication required';
  end if;
  if p_note is not null and char_length(p_note)>1000 then
    raise exception using errcode='23514',message='match note is too long';
  end if;

  select *
  into v_match
  from finance.receipt_transaction_matches
  where id=p_match_id and user_id=v_user_id
  for update;

  if not found then
    raise exception using errcode='23503',message='receipt match not found';
  end if;

  v_was_confirmed:=v_match.status='confirmed';

  update finance.receipt_transaction_matches
  set
    status='rejected',
    rejected_at=now(),
    confirmed_at=null,
    decision_source='manual',
    decision_note=nullif(btrim(p_note),'')
  where id=p_match_id and user_id=v_user_id;

  v_state:=finance.refresh_receipt_match_state(v_match.receipt_id);
  v_allocations:=
    finance.rebuild_transaction_receipt_allocations(
      v_match.transaction_id
    );

  if v_was_confirmed then
    perform finance.refresh_receipt_match_candidates(
      v_match.receipt_id,
      false
    );
  end if;

  return jsonb_build_object(
    'match_id',p_match_id,
    'receipt_id',v_match.receipt_id,
    'transaction_id',v_match.transaction_id,
    'status','rejected',
    'receipt_state',v_state,
    'allocation_state',v_allocations
  );
end;
$function$;

CREATE OR REPLACE FUNCTION finance.transaction_matchable_amount(p_transaction_id uuid, p_currency_code text)
 RETURNS bigint
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid:=auth.uid();
  v_currency text:=upper(btrim(coalesce(p_currency_code,'')));
  v_reporting_currency text;
  v_amount bigint;
begin
  if v_user_id is null then
    raise exception using errcode='42501',message='authentication required';
  end if;
  if v_currency !~ '^[A-Z]{3}$' then
    raise exception using errcode='23514',message='invalid match currency';
  end if;

  select t.reporting_currency
  into v_reporting_currency
  from finance.transactions t
  where t.id=p_transaction_id
    and t.user_id=v_user_id
    and t.status='posted'
    and t.type='expense';

  if not found then
    return null;
  end if;

  select abs(sum(le.signed_amount_minor))::bigint
  into v_amount
  from finance.ledger_entries le
  where le.transaction_id=p_transaction_id
    and le.user_id=v_user_id
    and le.entry_kind='account'
    and le.signed_amount_minor<0
    and le.currency_code=v_currency;

  if coalesce(v_amount,0)>0 then
    return v_amount;
  end if;

  if v_reporting_currency=v_currency then
    return finance.transaction_display_amount(p_transaction_id);
  end if;

  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION finance.unconfirm_receipt_transaction_match(p_match_id uuid, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid:=auth.uid();
  v_match finance.receipt_transaction_matches%rowtype;
  v_state jsonb;
  v_allocations jsonb;
begin
  if v_user_id is null then
    raise exception using errcode='42501',message='authentication required';
  end if;
  if p_note is not null and char_length(p_note)>1000 then
    raise exception using errcode='23514',message='match note is too long';
  end if;

  select *
  into v_match
  from finance.receipt_transaction_matches
  where id=p_match_id
    and user_id=v_user_id
    and status='confirmed'
  for update;

  if not found then
    raise exception using errcode='23503',message='confirmed receipt match not found';
  end if;

  update finance.receipt_transaction_matches
  set
    status='suggested',
    confirmed_at=null,
    rejected_at=null,
    decision_source='manual',
    decision_note=nullif(btrim(p_note),''),
    last_scored_at=now()
  where id=p_match_id and user_id=v_user_id;

  v_allocations:=
    finance.rebuild_transaction_receipt_allocations(
      v_match.transaction_id
    );

  perform finance.refresh_receipt_match_candidates(
    v_match.receipt_id,
    false
  );

  v_state:=finance.refresh_receipt_match_state(
    v_match.receipt_id
  );

  return jsonb_build_object(
    'match_id',p_match_id,
    'receipt_id',v_match.receipt_id,
    'transaction_id',v_match.transaction_id,
    'status','suggested',
    'receipt_state',v_state,
    'allocation_state',v_allocations
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.finance_confirm_receipt_transaction_match(p_match_id uuid, p_matched_amount_minor bigint DEFAULT NULL::bigint, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select finance.confirm_receipt_transaction_match(
    p_match_id,p_matched_amount_minor,p_note,'manual'
  );
$function$;

CREATE OR REPLACE FUNCTION public.finance_get_receipt_match_dashboard(p_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select finance.get_receipt_match_dashboard(p_limit);
$function$;

CREATE OR REPLACE FUNCTION public.finance_get_receipt_match_workspace(p_receipt_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select finance.get_receipt_match_workspace(p_receipt_id);
$function$;

CREATE OR REPLACE FUNCTION public.finance_refresh_receipt_match_candidates(p_receipt_id uuid, p_auto_confirm boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select finance.refresh_receipt_match_candidates(
    p_receipt_id,p_auto_confirm
  );
$function$;

CREATE OR REPLACE FUNCTION public.finance_refresh_receipt_match_queue(p_limit integer DEFAULT 100, p_auto_confirm boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select finance.refresh_receipt_match_queue(
    p_limit,p_auto_confirm
  );
$function$;

CREATE OR REPLACE FUNCTION public.finance_reject_receipt_transaction_match(p_match_id uuid, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select finance.reject_receipt_transaction_match(
    p_match_id,p_note
  );
$function$;

CREATE OR REPLACE FUNCTION public.finance_unconfirm_receipt_transaction_match(p_match_id uuid, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select finance.unconfirm_receipt_transaction_match(
    p_match_id,p_note
  );
$function$;

alter function finance.category_period_spend(p_category_id uuid, p_start timestamp with time zone, p_end timestamp with time zone) security invoker;
revoke all on function finance.category_period_spend(p_category_id uuid, p_start timestamp with time zone, p_end timestamp with time zone) from public,anon;
grant execute on function finance.category_period_spend(p_category_id uuid, p_start timestamp with time zone, p_end timestamp with time zone) to authenticated,service_role;

alter function finance.confirm_receipt_transaction_match(p_match_id uuid, p_matched_amount_minor bigint, p_note text, p_decision_source text) security invoker;
revoke all on function finance.confirm_receipt_transaction_match(p_match_id uuid, p_matched_amount_minor bigint, p_note text, p_decision_source text) from public,anon;
grant execute on function finance.confirm_receipt_transaction_match(p_match_id uuid, p_matched_amount_minor bigint, p_note text, p_decision_source text) to authenticated,service_role;

alter function finance.get_analytics_breakdown(p_period_start timestamp with time zone, p_period_end timestamp with time zone, p_compare_start timestamp with time zone, p_compare_end timestamp with time zone, p_dimension text, p_limit integer) security invoker;
revoke all on function finance.get_analytics_breakdown(p_period_start timestamp with time zone, p_period_end timestamp with time zone, p_compare_start timestamp with time zone, p_compare_end timestamp with time zone, p_dimension text, p_limit integer) from public,anon;
grant execute on function finance.get_analytics_breakdown(p_period_start timestamp with time zone, p_period_end timestamp with time zone, p_compare_start timestamp with time zone, p_compare_end timestamp with time zone, p_dimension text, p_limit integer) to authenticated,service_role;

alter function finance.get_analytics_time_series(p_period_start timestamp with time zone, p_period_end timestamp with time zone, p_compare_start timestamp with time zone, p_compare_end timestamp with time zone, p_bucket_kind text) security invoker;
revoke all on function finance.get_analytics_time_series(p_period_start timestamp with time zone, p_period_end timestamp with time zone, p_compare_start timestamp with time zone, p_compare_end timestamp with time zone, p_bucket_kind text) from public,anon;
grant execute on function finance.get_analytics_time_series(p_period_start timestamp with time zone, p_period_end timestamp with time zone, p_compare_start timestamp with time zone, p_compare_end timestamp with time zone, p_bucket_kind text) to authenticated,service_role;

alter function finance.get_overview_dashboard(p_period_start timestamp with time zone, p_period_end timestamp with time zone, p_compare_start timestamp with time zone, p_compare_end timestamp with time zone, p_as_of timestamp with time zone, p_recent_limit integer) security invoker;
revoke all on function finance.get_overview_dashboard(p_period_start timestamp with time zone, p_period_end timestamp with time zone, p_compare_start timestamp with time zone, p_compare_end timestamp with time zone, p_as_of timestamp with time zone, p_recent_limit integer) from public,anon;
grant execute on function finance.get_overview_dashboard(p_period_start timestamp with time zone, p_period_end timestamp with time zone, p_compare_start timestamp with time zone, p_compare_end timestamp with time zone, p_as_of timestamp with time zone, p_recent_limit integer) to authenticated,service_role;

alter function finance.get_receipt_match_dashboard(p_limit integer) security invoker;
revoke all on function finance.get_receipt_match_dashboard(p_limit integer) from public,anon;
grant execute on function finance.get_receipt_match_dashboard(p_limit integer) to authenticated,service_role;

alter function finance.get_receipt_match_workspace(p_receipt_id uuid) security invoker;
revoke all on function finance.get_receipt_match_workspace(p_receipt_id uuid) from public,anon;
grant execute on function finance.get_receipt_match_workspace(p_receipt_id uuid) to authenticated,service_role;

alter function finance.get_spending_explorer(p_period_start timestamp with time zone, p_period_end timestamp with time zone, p_compare_start timestamp with time zone, p_compare_end timestamp with time zone, p_bucket_kind text, p_category_id uuid, p_merchant_id uuid, p_necessity text, p_limit integer) security invoker;
revoke all on function finance.get_spending_explorer(p_period_start timestamp with time zone, p_period_end timestamp with time zone, p_compare_start timestamp with time zone, p_compare_end timestamp with time zone, p_bucket_kind text, p_category_id uuid, p_merchant_id uuid, p_necessity text, p_limit integer) from public,anon;
grant execute on function finance.get_spending_explorer(p_period_start timestamp with time zone, p_period_end timestamp with time zone, p_compare_start timestamp with time zone, p_compare_end timestamp with time zone, p_bucket_kind text, p_category_id uuid, p_merchant_id uuid, p_necessity text, p_limit integer) to authenticated,service_role;

alter function finance.normalize_match_text(p_value text) security invoker;
revoke all on function finance.normalize_match_text(p_value text) from public,anon;
grant execute on function finance.normalize_match_text(p_value text) to authenticated,service_role;

alter function finance.rebuild_transaction_receipt_allocations(p_transaction_id uuid) security invoker;
revoke all on function finance.rebuild_transaction_receipt_allocations(p_transaction_id uuid) from public,anon;
grant execute on function finance.rebuild_transaction_receipt_allocations(p_transaction_id uuid) to authenticated,service_role;

alter function finance.refresh_receipt_match_candidates(p_receipt_id uuid, p_auto_confirm boolean) security invoker;
revoke all on function finance.refresh_receipt_match_candidates(p_receipt_id uuid, p_auto_confirm boolean) from public,anon;
grant execute on function finance.refresh_receipt_match_candidates(p_receipt_id uuid, p_auto_confirm boolean) to authenticated,service_role;

alter function finance.refresh_receipt_match_queue(p_limit integer, p_auto_confirm boolean) security invoker;
revoke all on function finance.refresh_receipt_match_queue(p_limit integer, p_auto_confirm boolean) from public,anon;
grant execute on function finance.refresh_receipt_match_queue(p_limit integer, p_auto_confirm boolean) to authenticated,service_role;

alter function finance.refresh_receipt_match_state(p_receipt_id uuid) security invoker;
revoke all on function finance.refresh_receipt_match_state(p_receipt_id uuid) from public,anon;
grant execute on function finance.refresh_receipt_match_state(p_receipt_id uuid) to authenticated,service_role;

alter function finance.reject_receipt_transaction_match(p_match_id uuid, p_note text) security invoker;
revoke all on function finance.reject_receipt_transaction_match(p_match_id uuid, p_note text) from public,anon;
grant execute on function finance.reject_receipt_transaction_match(p_match_id uuid, p_note text) to authenticated,service_role;

alter function finance.transaction_matchable_amount(p_transaction_id uuid, p_currency_code text) security invoker;
revoke all on function finance.transaction_matchable_amount(p_transaction_id uuid, p_currency_code text) from public,anon;
grant execute on function finance.transaction_matchable_amount(p_transaction_id uuid, p_currency_code text) to authenticated,service_role;

alter function finance.unconfirm_receipt_transaction_match(p_match_id uuid, p_note text) security invoker;
revoke all on function finance.unconfirm_receipt_transaction_match(p_match_id uuid, p_note text) from public,anon;
grant execute on function finance.unconfirm_receipt_transaction_match(p_match_id uuid, p_note text) to authenticated,service_role;

alter function public.finance_confirm_receipt_transaction_match(p_match_id uuid, p_matched_amount_minor bigint, p_note text) security invoker;
revoke all on function public.finance_confirm_receipt_transaction_match(p_match_id uuid, p_matched_amount_minor bigint, p_note text) from public,anon;
grant execute on function public.finance_confirm_receipt_transaction_match(p_match_id uuid, p_matched_amount_minor bigint, p_note text) to authenticated,service_role;

alter function public.finance_get_receipt_match_dashboard(p_limit integer) security invoker;
revoke all on function public.finance_get_receipt_match_dashboard(p_limit integer) from public,anon;
grant execute on function public.finance_get_receipt_match_dashboard(p_limit integer) to authenticated,service_role;

alter function public.finance_get_receipt_match_workspace(p_receipt_id uuid) security invoker;
revoke all on function public.finance_get_receipt_match_workspace(p_receipt_id uuid) from public,anon;
grant execute on function public.finance_get_receipt_match_workspace(p_receipt_id uuid) to authenticated,service_role;

alter function public.finance_refresh_receipt_match_candidates(p_receipt_id uuid, p_auto_confirm boolean) security invoker;
revoke all on function public.finance_refresh_receipt_match_candidates(p_receipt_id uuid, p_auto_confirm boolean) from public,anon;
grant execute on function public.finance_refresh_receipt_match_candidates(p_receipt_id uuid, p_auto_confirm boolean) to authenticated,service_role;

alter function public.finance_refresh_receipt_match_queue(p_limit integer, p_auto_confirm boolean) security invoker;
revoke all on function public.finance_refresh_receipt_match_queue(p_limit integer, p_auto_confirm boolean) from public,anon;
grant execute on function public.finance_refresh_receipt_match_queue(p_limit integer, p_auto_confirm boolean) to authenticated,service_role;

alter function public.finance_reject_receipt_transaction_match(p_match_id uuid, p_note text) security invoker;
revoke all on function public.finance_reject_receipt_transaction_match(p_match_id uuid, p_note text) from public,anon;
grant execute on function public.finance_reject_receipt_transaction_match(p_match_id uuid, p_note text) to authenticated,service_role;

alter function public.finance_unconfirm_receipt_transaction_match(p_match_id uuid, p_note text) security invoker;
revoke all on function public.finance_unconfirm_receipt_transaction_match(p_match_id uuid, p_note text) from public,anon;
grant execute on function public.finance_unconfirm_receipt_transaction_match(p_match_id uuid, p_note text) to authenticated,service_role;

create or replace view finance.activity_transactions with (security_invoker=true) as
SELECT t.id,
    t.user_id,
    'transaction'::text AS entity_kind,
    t.occurred_at,
    t.id AS transaction_id,
    NULL::uuid AS receipt_id,
    t.type::text AS transaction_type,
    t.status::text AS status,
    t.source::text AS source,
    em.merchant_id,
    em.merchant_name,
    COALESCE(em.merchant_name, t.description, t.type::text) AS title,
    t.description,
    t.note,
    t.reporting_currency AS currency_code,
    COALESCE(amounts.display_amount_minor, 0::bigint) AS amount_minor,
    t.status = 'posted'::finance.transaction_status AS financial_effect,
    COALESCE(receipts.receipt_count, 0) > 0 AS has_receipt,
    COALESCE(receipts.receipt_statuses, '{}'::text[]) AS receipt_statuses,
    COALESCE(accounts.account_ids, '{}'::uuid[]) AS account_ids,
    COALESCE(accounts.account_names, '{}'::text[]) AS account_names,
    COALESCE(accounts.accounts, '[]'::jsonb) AS accounts,
    COALESCE(categories.category_ids, '{}'::uuid[]) AS category_ids,
    COALESCE(categories.category_names, '{}'::text[]) AS category_names,
    COALESCE(categories.necessities, '{}'::text[]) AS necessities,
    COALESCE(categories.categories, '[]'::jsonb) AS categories,
    COALESCE(products.product_ids, '{}'::uuid[]) AS product_ids,
    COALESCE(products.product_names, '{}'::text[]) AS product_names,
    COALESCE(tags.tag_ids, '{}'::uuid[]) AS tag_ids,
    COALESCE(tags.tag_names, '{}'::text[]) AS tag_names,
    COALESCE(receipts.receipt_ids, '{}'::uuid[]) AS receipt_ids,
    COALESCE(receipts.receipt_count, 0) AS receipt_count,
    COALESCE(products.item_count, 0) AS item_count,
    lower(concat_ws(' '::text, t.description, t.note, em.merchant_name, array_to_string(accounts.account_names, ' '::text), array_to_string(categories.category_names, ' '::text), array_to_string(products.product_names, ' '::text), array_to_string(tags.tag_names, ' '::text))) AS search_text,
    t.created_at,
    t.updated_at
   FROM finance.transactions t
     LEFT JOIN finance.effective_transaction_merchants em ON em.transaction_id = t.id AND em.user_id = t.user_id
     LEFT JOIN LATERAL ( SELECT COALESCE(- sum(le.reporting_amount_minor) FILTER (WHERE le.entry_kind = 'account'::finance.entry_kind AND le.reporting_amount_minor < 0), sum(le.reporting_amount_minor) FILTER (WHERE le.entry_kind = 'account'::finance.entry_kind AND le.reporting_amount_minor > 0), 0::numeric)::bigint AS display_amount_minor
           FROM finance.ledger_entries le
          WHERE le.transaction_id = t.id AND le.user_id = t.user_id) amounts ON true
     LEFT JOIN LATERAL ( SELECT COALESCE(array_agg(a.id ORDER BY a.name, a.id), '{}'::uuid[]) AS account_ids,
            COALESCE(array_agg(a.name ORDER BY a.name, a.id), '{}'::text[]) AS account_names,
            COALESCE(jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name, 'kind', a.kind, 'currency_code', a.currency_code, 'signed_amount_minor', le.signed_amount_minor, 'reporting_amount_minor', le.reporting_amount_minor) ORDER BY a.name, a.id), '[]'::jsonb) AS accounts
           FROM finance.ledger_entries le
             JOIN finance.accounts a ON a.id = le.account_id AND a.user_id = le.user_id
          WHERE le.transaction_id = t.id AND le.user_id = t.user_id AND le.entry_kind = 'account'::finance.entry_kind) accounts ON true
     LEFT JOIN LATERAL ( SELECT COALESCE(array_agg(ec.category_id ORDER BY c.name, ec.category_id) FILTER (WHERE ec.category_id IS NOT NULL), '{}'::uuid[]) AS category_ids,
            COALESCE(array_agg(c.name ORDER BY c.name, ec.category_id) FILTER (WHERE c.name IS NOT NULL), '{}'::text[]) AS category_names,
            COALESCE(array_agg(DISTINCT ec.necessity::text) FILTER (WHERE ec.necessity IS NOT NULL), '{}'::text[]) AS necessities,
            COALESCE(jsonb_agg(jsonb_build_object('id', ec.category_id, 'name', c.name, 'signed_amount_minor', ec.reporting_amount_minor, 'reporting_amount_minor', ec.reporting_amount_minor, 'necessity', ec.necessity, 'memo',
                CASE
                    WHEN ec.classification_source = 'receipt'::text THEN 'Receipt-derived classification'::text
                    ELSE NULL::text
                END, 'classification_source', ec.classification_source) ORDER BY c.name, ec.category_id), '[]'::jsonb) AS categories
           FROM finance.effective_transaction_categories ec
             LEFT JOIN finance.categories c ON c.id = ec.category_id AND c.user_id = ec.user_id
          WHERE ec.transaction_id = t.id AND ec.user_id = t.user_id) categories ON true
     LEFT JOIN LATERAL ( SELECT COALESCE(array_agg(DISTINCT q.id ORDER BY q.id), '{}'::uuid[]) AS tag_ids,
            COALESCE(array_agg(DISTINCT q.name ORDER BY q.name), '{}'::text[]) AS tag_names
           FROM ( SELECT tg.id,
                    tg.name
                   FROM finance.transaction_tags tt
                     JOIN finance.tags tg ON tg.id = tt.tag_id AND tg.user_id = tt.user_id
                  WHERE tt.transaction_id = t.id AND tt.user_id = t.user_id
                UNION
                 SELECT tg.id,
                    tg.name
                   FROM finance.receipt_transaction_matches rtm
                     JOIN finance.receipt_items ri ON ri.receipt_id = rtm.receipt_id AND ri.user_id = rtm.user_id AND NOT ri.is_excluded
                     JOIN finance.receipt_item_tags rit ON rit.receipt_item_id = ri.id AND rit.user_id = ri.user_id
                     JOIN finance.tags tg ON tg.id = rit.tag_id AND tg.user_id = rit.user_id
                  WHERE rtm.transaction_id = t.id AND rtm.user_id = t.user_id AND rtm.status = 'confirmed'::finance.match_candidate_status) q) tags ON true
     LEFT JOIN LATERAL ( SELECT COALESCE(array_agg(r.id ORDER BY r.purchased_at, r.id), '{}'::uuid[]) AS receipt_ids,
            COALESCE(array_agg(DISTINCT r.processing_status::text), '{}'::text[]) AS receipt_statuses,
            count(*)::integer AS receipt_count
           FROM finance.receipt_transaction_matches rtm
             JOIN finance.receipts r ON r.id = rtm.receipt_id AND r.user_id = rtm.user_id
          WHERE rtm.transaction_id = t.id AND rtm.user_id = t.user_id AND rtm.status = 'confirmed'::finance.match_candidate_status) receipts ON true
     LEFT JOIN LATERAL ( SELECT COALESCE(array_agg(DISTINCT p.id) FILTER (WHERE p.id IS NOT NULL), '{}'::uuid[]) AS product_ids,
            COALESCE(array_agg(DISTINCT p.name) FILTER (WHERE p.name IS NOT NULL), '{}'::text[]) AS product_names,
            count(ri.id) FILTER (WHERE NOT ri.is_excluded)::integer AS item_count
           FROM finance.receipt_transaction_matches rtm
             JOIN finance.receipt_items ri ON ri.receipt_id = rtm.receipt_id AND ri.user_id = rtm.user_id
             LEFT JOIN finance.products p ON p.id = ri.product_id AND p.user_id = ri.user_id
          WHERE rtm.transaction_id = t.id AND rtm.user_id = t.user_id AND rtm.status = 'confirmed'::finance.match_candidate_status AND NOT ri.is_excluded) products ON true;
grant select on finance.activity_transactions to authenticated,service_role;

create or replace view finance.effective_transaction_categories with (security_invoker=true) as
WITH receipt_allocations AS (
         SELECT a.user_id,
            a.transaction_id,
            a.category_id,
            a.necessity,
            sum(a.reporting_amount_minor)::bigint AS reporting_amount_minor
           FROM finance.receipt_match_allocations a
          GROUP BY a.user_id, a.transaction_id, a.category_id, a.necessity
        )
 SELECT ra.user_id,
    ra.transaction_id,
    ra.category_id,
    ra.necessity,
    ra.reporting_amount_minor,
    'receipt'::text AS classification_source
   FROM receipt_allocations ra
UNION ALL
 SELECT le.user_id,
    le.transaction_id,
    le.category_id,
    le.necessity,
    le.reporting_amount_minor,
    'ledger'::text AS classification_source
   FROM finance.ledger_entries le
  WHERE le.entry_kind = 'category'::finance.entry_kind AND NOT (EXISTS ( SELECT 1
           FROM finance.receipt_match_allocations a
          WHERE a.user_id = le.user_id AND a.transaction_id = le.transaction_id));
grant select on finance.effective_transaction_categories to authenticated,service_role;

create or replace view finance.effective_transaction_merchants with (security_invoker=true) as
WITH matched AS (
         SELECT t_1.user_id,
            t_1.id AS transaction_id,
            count(DISTINCT r.id)::integer AS receipt_count,
            count(DISTINCT r.id) FILTER (WHERE r.merchant_id IS NOT NULL)::integer AS merchant_id_count,
            count(DISTINCT r.merchant_id)::integer AS distinct_merchant_count,
            (array_agg(r.merchant_id ORDER BY r.id) FILTER (WHERE r.merchant_id IS NOT NULL))[1] AS receipt_merchant_id,
            count(DISTINCT finance.normalize_match_text(COALESCE(rm.name, r.merchant_raw_name, ''::text))) FILTER (WHERE finance.normalize_match_text(COALESCE(rm.name, r.merchant_raw_name, ''::text)) <> ''::text)::integer AS distinct_receipt_name_count,
            (array_agg(COALESCE(rm.name, r.merchant_raw_name) ORDER BY r.id) FILTER (WHERE NULLIF(btrim(COALESCE(rm.name, r.merchant_raw_name, ''::text)), ''::text) IS NOT NULL))[1] AS receipt_display_name
           FROM finance.transactions t_1
             JOIN finance.receipt_match_allocations a ON a.transaction_id = t_1.id AND a.user_id = t_1.user_id
             JOIN finance.receipt_transaction_matches rtm ON rtm.id = a.match_id AND rtm.user_id = a.user_id AND rtm.status = 'confirmed'::finance.match_candidate_status
             JOIN finance.receipts r ON r.id = rtm.receipt_id AND r.user_id = rtm.user_id
             LEFT JOIN finance.merchants rm ON rm.id = r.merchant_id AND rm.user_id = r.user_id
          GROUP BY t_1.user_id, t_1.id
        )
 SELECT t.user_id,
    t.id AS transaction_id,
        CASE
            WHEN m.receipt_count > 0 AND m.merchant_id_count = m.receipt_count AND m.distinct_merchant_count = 1 THEN m.receipt_merchant_id
            ELSE t.merchant_id
        END AS merchant_id,
    COALESCE(
        CASE
            WHEN m.receipt_count > 0 AND m.merchant_id_count = m.receipt_count AND m.distinct_merchant_count = 1 THEN receipt_merchant.name
            WHEN m.receipt_count > 0 AND m.distinct_receipt_name_count = 1 THEN m.receipt_display_name
            ELSE NULL::text
        END, transaction_merchant.name, t.description) AS merchant_name,
        CASE
            WHEN m.receipt_count > 0 AND (m.merchant_id_count = m.receipt_count AND m.distinct_merchant_count = 1 OR m.distinct_receipt_name_count = 1) THEN 'receipt'::text
            ELSE 'transaction'::text
        END AS merchant_source
   FROM finance.transactions t
     LEFT JOIN matched m ON m.user_id = t.user_id AND m.transaction_id = t.id
     LEFT JOIN finance.merchants receipt_merchant ON receipt_merchant.id = m.receipt_merchant_id AND receipt_merchant.user_id = t.user_id
     LEFT JOIN finance.merchants transaction_merchant ON transaction_merchant.id = t.merchant_id AND transaction_merchant.user_id = t.user_id;
grant select on finance.effective_transaction_merchants to authenticated,service_role;