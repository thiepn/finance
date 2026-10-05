CREATE OR REPLACE FUNCTION finance.confirm_recurring_candidate(p_transaction_ids uuid[], p_name text, p_cadence text, p_cadence_interval integer, p_is_subscription boolean DEFAULT false, p_tolerance_days integer DEFAULT 3)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid:=auth.uid();
  v_count integer;
  v_type finance.transaction_type;
  v_merchant_id uuid;
  v_merchant_name text;
  v_currency text;
  v_first_at timestamptz;
  v_last_at timestamptz;
  v_latest_amount bigint;
  v_avg_amount bigint;
  v_stddev bigint;
  v_amount_tolerance bigint;
  v_match_description text;
  v_pattern_id uuid;
  v_subscription_id uuid;
  v_next timestamptz;
  v_name text;
  v_tx record;
  v_billing_frequency text;
begin
  if v_user_id is null then
    raise exception using errcode='42501',message='authentication required';
  end if;
  if p_transaction_ids is null or cardinality(p_transaction_ids)<2 then
    raise exception using errcode='23514',
      message='at least two transactions are required to confirm recurrence';
  end if;

  perform finance.recurring_rrule(p_cadence,p_cadence_interval);

  with selected as (
    select a.*
    from finance.activity_transactions a
    where a.user_id=v_user_id
      and a.transaction_id=any(p_transaction_ids)
      and a.status='posted'
      and a.financial_effect
      and a.transaction_type in ('expense','income','transfer')
  )
  select
    count(*)::integer,
    case when count(distinct transaction_type)=1
      then max(transaction_type)::finance.transaction_type else null end,
    case
      when count(*) filter(where merchant_id is not null)=count(*)
       and count(distinct merchant_id)=1
      then max(merchant_id::text)::uuid
      else null
    end,
    max(merchant_name),
    case when count(distinct currency_code)=1
      then max(currency_code) else null end,
    min(occurred_at),
    max(occurred_at),
    (array_agg(amount_minor order by occurred_at desc,transaction_id desc))[1]::bigint,
    round(avg(amount_minor))::bigint,
    coalesce(round(stddev_pop(amount_minor)),0)::bigint,
    case
      when count(distinct finance.normalize_recurring_text(description))=1
      then max(finance.normalize_recurring_text(description))
      else null
    end
  into
    v_count,v_type,v_merchant_id,v_merchant_name,v_currency,
    v_first_at,v_last_at,v_latest_amount,v_avg_amount,v_stddev,
    v_match_description
  from selected;

  if v_count<>cardinality(p_transaction_ids) then
    raise exception using errcode='23503',
      message='one or more recurring candidate transactions are unavailable';
  end if;
  if v_type is null then
    raise exception using errcode='23514',
      message='recurring candidate transactions must share one transaction type';
  end if;
  if v_currency is null then
    raise exception using errcode='23514',
      message='recurring candidate transactions must share one currency';
  end if;

  v_amount_tolerance:=greatest(
    100::bigint,
    round(v_avg_amount*0.10)::bigint,
    (v_stddev*2)::bigint
  );
  v_next:=finance.recurring_advance(
    v_last_at,p_cadence,p_cadence_interval
  );
  v_name:=coalesce(nullif(btrim(p_name),''),v_merchant_name,'Recurring transaction');

  v_pattern_id:=finance.upsert_recurring_pattern(
    null,v_name,v_type,v_merchant_id,null,null,
    v_latest_amount,v_currency,p_cadence,p_cadence_interval,
    v_first_at,v_next,p_tolerance_days,v_amount_tolerance,
    v_match_description,'learned',1
  );

  for v_tx in
    select a.transaction_id,a.occurred_at,a.amount_minor
    from finance.activity_transactions a
    where a.user_id=v_user_id
      and a.transaction_id=any(p_transaction_ids)
    order by a.occurred_at,a.transaction_id
  loop
    insert into finance.recurring_transaction_links(
      user_id,recurring_pattern_id,transaction_id,expected_at,
      matched_amount_minor,amount_delta_minor,timing_delta_days,
      match_source,confidence
    ) values(
      v_user_id,v_pattern_id,v_tx.transaction_id,v_tx.occurred_at,
      v_tx.amount_minor,v_tx.amount_minor-v_latest_amount,0,
      'user',1
    )
    on conflict(user_id,transaction_id) do nothing;
  end loop;

  if p_is_subscription then
    if v_type<>'expense' then
      raise exception using errcode='23514',
        message='only recurring expenses can be marked as subscriptions';
    end if;

    v_billing_frequency:=case
      when lower(p_cadence)='weekly' and p_cadence_interval=1 then 'weekly'
      when lower(p_cadence)='weekly' and p_cadence_interval=2 then 'biweekly'
      when lower(p_cadence)='monthly' and p_cadence_interval=1 then 'monthly'
      when lower(p_cadence)='monthly' and p_cadence_interval=3 then 'quarterly'
      when lower(p_cadence)='monthly' and p_cadence_interval=6 then 'semiannual'
      when lower(p_cadence)='yearly' and p_cadence_interval=1 then 'yearly'
      else finance.recurring_rrule(p_cadence,p_cadence_interval)
    end;

    insert into finance.subscriptions(
      user_id,recurring_pattern_id,merchant_id,name,amount_minor,
      currency_code,billing_frequency,started_on,next_charge_at,status
    ) values(
      v_user_id,v_pattern_id,v_merchant_id,v_name,v_latest_amount,
      v_currency,v_billing_frequency,
      (v_first_at at time zone 'UTC')::date,v_next,'active'
    )
    on conflict(user_id,recurring_pattern_id)
      where recurring_pattern_id is not null
    do update set
      merchant_id=excluded.merchant_id,
      name=excluded.name,
      amount_minor=excluded.amount_minor,
      currency_code=excluded.currency_code,
      billing_frequency=excluded.billing_frequency,
      next_charge_at=excluded.next_charge_at,
      status='active',
      cancelled_on=null
    returning id into v_subscription_id;
  end if;

  return jsonb_build_object(
    'pattern_id',v_pattern_id,
    'subscription_id',v_subscription_id,
    'name',v_name,
    'transaction_type',v_type,
    'cadence',lower(p_cadence),
    'cadence_interval',p_cadence_interval,
    'expected_amount_minor',v_latest_amount,
    'next_expected_at',v_next,
    'linked_transaction_count',v_count,
    'is_subscription',p_is_subscription
  );
end;
$function$;

CREATE OR REPLACE FUNCTION finance.get_recurring_dashboard(p_anchor_date date DEFAULT NULL::date, p_horizon_days integer DEFAULT 45)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid:=auth.uid();
  v_currency text:='EUR';
  v_locale text:='de-DE';
  v_time_zone text:='Europe/Berlin';
  v_anchor date;
  v_as_of timestamptz;
  v_baseline_at timestamptz;
  v_horizon integer:=greatest(7,least(coalesce(p_horizon_days,45),120));
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception using errcode='42501',message='authentication required';
  end if;

  select
    coalesce(reporting_currency,'EUR'),
    coalesce(locale,'de-DE'),
    coalesce(time_zone,'Europe/Berlin')
  into v_currency,v_locale,v_time_zone
  from finance.profiles
  where user_id=v_user_id;

  v_anchor:=coalesce(p_anchor_date,(now() at time zone v_time_zone)::date);
  v_as_of:=(v_anchor+1)::timestamp at time zone v_time_zone
    - interval '1 microsecond';
  v_baseline_at:=(v_anchor+1)::timestamp at time zone v_time_zone
    - interval '3 months' - interval '1 microsecond';

  with occurrence_ranked as (
    select
      l.recurring_pattern_id,
      a.transaction_id,
      a.occurred_at,
      a.amount_minor,
      l.expected_at,
      l.amount_delta_minor,
      l.timing_delta_days,
      l.match_source::text as match_source,
      l.confidence,
      row_number() over(
        partition by l.recurring_pattern_id
        order by a.occurred_at desc,a.transaction_id desc
      ) as rn_desc
    from finance.recurring_transaction_links l
    join finance.activity_transactions a
      on a.transaction_id=l.transaction_id
     and a.user_id=l.user_id
    where l.user_id=v_user_id
      and a.status='posted'
      and a.financial_effect
  ),
  occurrence_stats as (
    select
      o.recurring_pattern_id,
      count(*)::integer as occurrence_count,
      min(o.occurred_at) as first_occurrence_at,
      max(o.occurred_at) as last_occurrence_at,
      round(avg(o.amount_minor))::bigint as average_amount_minor,
      max(o.amount_minor) filter(where o.rn_desc=1)::bigint as latest_amount_minor,
      max(o.amount_minor) filter(where o.rn_desc=2)::bigint as previous_amount_minor,
      max(o.transaction_id::text) filter(where o.rn_desc=1)::uuid
        as latest_transaction_id
    from occurrence_ranked o
    group by o.recurring_pattern_id
  ),
  baseline_amounts as (
    select distinct on (l.recurring_pattern_id)
      l.recurring_pattern_id,
      a.amount_minor as baseline_amount_minor,
      a.occurred_at as baseline_occurrence_at
    from finance.recurring_transaction_links l
    join finance.activity_transactions a
      on a.transaction_id=l.transaction_id
     and a.user_id=l.user_id
    where l.user_id=v_user_id
      and a.status='posted'
      and a.financial_effect
      and a.occurred_at<=v_baseline_at
    order by l.recurring_pattern_id,a.occurred_at desc,a.transaction_id desc
  ),
  pattern_base as (
    select
      rp.id as pattern_id,
      rp.name,
      rp.transaction_type::text as transaction_type,
      rp.status::text as status,
      rp.merchant_id,
      m.name as merchant_name,
      rp.category_id,
      c.name as category_name,
      rp.account_id,
      ac.name as account_name,
      rp.expected_amount_minor,
      rp.currency_code,
      rp.rrule,
      rp.cadence,
      rp.cadence_interval,
      rp.anchor_at,
      rp.next_expected_at,
      rp.tolerance_days,
      rp.amount_tolerance_minor,
      rp.source::text as source,
      rp.confidence,
      rp.match_description,
      s.id as subscription_id,
      s.name as subscription_name,
      s.amount_minor as subscription_amount_minor,
      s.billing_frequency,
      s.started_on,
      s.cancelled_on,
      s.next_charge_at,
      os.occurrence_count,
      os.first_occurrence_at,
      os.last_occurrence_at,
      os.average_amount_minor,
      os.latest_amount_minor,
      os.previous_amount_minor,
      os.latest_transaction_id,
      ba.baseline_amount_minor,
      ba.baseline_occurrence_at
    from finance.recurring_patterns rp
    left join finance.merchants m
      on m.id=rp.merchant_id and m.user_id=rp.user_id
    left join finance.categories c
      on c.id=rp.category_id and c.user_id=rp.user_id
    left join finance.accounts ac
      on ac.id=rp.account_id and ac.user_id=rp.user_id
    left join finance.subscriptions s
      on s.recurring_pattern_id=rp.id
     and s.user_id=rp.user_id
    left join occurrence_stats os
      on os.recurring_pattern_id=rp.id
    left join baseline_amounts ba
      on ba.recurring_pattern_id=rp.id
    where rp.user_id=v_user_id
  ),
  pattern_calc as (
    select
      p.*,
      coalesce(
        p.latest_amount_minor,
        p.subscription_amount_minor,
        p.expected_amount_minor,
        0
      )::bigint as effective_amount_minor,
      finance.recurring_monthly_equivalent(
        coalesce(
          p.latest_amount_minor,
          p.subscription_amount_minor,
          p.expected_amount_minor,
          0
        ),
        p.cadence,
        p.cadence_interval
      ) as monthly_equivalent_minor,
      finance.recurring_monthly_equivalent(
        coalesce(p.baseline_amount_minor,0),
        p.cadence,
        p.cadence_interval
      ) as baseline_monthly_equivalent_minor,
      case
        when p.latest_amount_minor is not null
         and p.previous_amount_minor is not null
          then p.latest_amount_minor-p.previous_amount_minor
        else null
      end as price_change_minor,
      case
        when p.previous_amount_minor is not null
         and p.previous_amount_minor<>0
          then (p.latest_amount_minor-p.previous_amount_minor)::numeric
            /p.previous_amount_minor::numeric
        else null
      end as price_change_ratio,
      case
        when p.status='ended' then 'ended'
        when p.status='paused' then 'paused'
        when p.next_expected_at is null then 'unscheduled'
        when v_as_of >
          p.next_expected_at+make_interval(days=>p.tolerance_days)
          then 'missing'
        when v_as_of>p.next_expected_at then 'late'
        when p.next_expected_at<=v_as_of+interval '2 days' then 'due'
        when p.next_expected_at<=v_as_of+make_interval(days=>v_horizon)
          then 'upcoming'
        else 'on_track'
      end as health,
      case
        when p.next_expected_at is null then null
        else (
          (p.next_expected_at at time zone v_time_zone)::date-v_anchor
        )::integer
      end as days_to_next
    from pattern_base p
  ),
  summary as (
    select
      count(*) filter(where status='active')::integer as active_count,
      count(*) filter(
        where status='active' and subscription_id is not null
      )::integer as subscription_count,
      coalesce(sum(monthly_equivalent_minor) filter(
        where status='active' and transaction_type='expense'
      ),0)::bigint as monthly_expense_minor,
      coalesce(sum(monthly_equivalent_minor) filter(
        where status='active' and transaction_type='income'
      ),0)::bigint as monthly_income_minor,
      coalesce(sum(monthly_equivalent_minor) filter(
        where status='active' and transaction_type='transfer'
      ),0)::bigint as monthly_transfer_minor,
      coalesce(sum(monthly_equivalent_minor) filter(
        where status='active'
          and transaction_type='expense'
          and subscription_id is not null
      ),0)::bigint as monthly_subscription_minor,
      coalesce(sum(baseline_monthly_equivalent_minor) filter(
        where transaction_type='expense'
          and baseline_amount_minor is not null
      ),0)::bigint as baseline_monthly_expense_minor,
      count(*) filter(
        where status='active' and health='missing'
      )::integer as missing_count,
      count(*) filter(
        where status='active'
          and price_change_ratio>=0.05
      )::integer as price_increase_count,
      coalesce(sum(effective_amount_minor) filter(
        where status='active'
          and transaction_type='expense'
          and next_expected_at>v_as_of
          and next_expected_at<=v_as_of+interval '30 days'
      ),0)::bigint as next_30d_expense_minor,
      count(*) filter(
        where status='active'
          and next_expected_at>v_as_of
          and next_expected_at<=v_as_of+interval '30 days'
      )::integer as next_30d_count
    from pattern_calc
  ),
  attention as (
    select
      p.pattern_id,
      'missing'::text as kind,
      'negative'::text as severity,
      p.name as title,
      'Expected charge has not appeared after its tolerance window.'::text as detail,
      p.next_expected_at as expected_at,
      null::bigint as change_minor,
      null::numeric as change_ratio
    from pattern_calc p
    where p.status='active' and p.health='missing'

    union all

    select
      p.pattern_id,
      'late'::text,
      'warning'::text,
      p.name,
      'Expected charge is late but still inside its tolerance window.'::text,
      p.next_expected_at,
      null::bigint,
      null::numeric
    from pattern_calc p
    where p.status='active' and p.health='late'

    union all

    select
      p.pattern_id,
      'price_increase'::text,
      'warning'::text,
      p.name,
      'Latest recurring charge is at least 5% higher than the previous observed charge.'::text,
      p.next_expected_at,
      p.price_change_minor,
      p.price_change_ratio
    from pattern_calc p
    where p.status='active'
      and p.price_change_ratio>=0.05
  ),
  month_buckets as (
    select
      gs::date as month_start,
      (gs::timestamp at time zone v_time_zone) as start_at,
      ((gs+interval '1 month')::timestamp at time zone v_time_zone) as end_at
    from generate_series(
      date_trunc('month',v_anchor::timestamp)-interval '11 months',
      date_trunc('month',v_anchor::timestamp),
      interval '1 month'
    ) gs
  ),
  trend as (
    select
      b.month_start,
      coalesce(sum(o.amount_minor) filter(
        where p.transaction_type='expense'
      ),0)::bigint as expense_minor,
      coalesce(sum(o.amount_minor) filter(
        where p.transaction_type='income'
      ),0)::bigint as income_minor,
      coalesce(sum(o.amount_minor) filter(
        where p.transaction_type='expense'
          and p.subscription_id is not null
      ),0)::bigint as subscription_minor
    from month_buckets b
    left join occurrence_ranked o
      on o.occurred_at>=b.start_at and o.occurred_at<b.end_at
    left join pattern_calc p
      on p.pattern_id=o.recurring_pattern_id
    group by b.month_start
    order by b.month_start
  )
  select jsonb_build_object(
    'profile',jsonb_build_object(
      'currency_code',v_currency,
      'locale',v_locale,
      'time_zone',v_time_zone
    ),
    'anchor_date',v_anchor,
    'horizon_days',v_horizon,
    'summary',(
      select jsonb_build_object(
        'active_count',s.active_count,
        'subscription_count',s.subscription_count,
        'monthly_expense_minor',s.monthly_expense_minor,
        'annualized_expense_minor',s.monthly_expense_minor*12,
        'monthly_income_minor',s.monthly_income_minor,
        'monthly_transfer_minor',s.monthly_transfer_minor,
        'monthly_subscription_minor',s.monthly_subscription_minor,
        'baseline_monthly_expense_minor',s.baseline_monthly_expense_minor,
        'creep_delta_minor',
          s.monthly_expense_minor-s.baseline_monthly_expense_minor,
        'creep_delta_ratio',case
          when s.baseline_monthly_expense_minor<>0
            then (s.monthly_expense_minor-s.baseline_monthly_expense_minor)::numeric
              /s.baseline_monthly_expense_minor::numeric
          else null
        end,
        'next_30d_expense_minor',s.next_30d_expense_minor,
        'next_30d_count',s.next_30d_count,
        'missing_count',s.missing_count,
        'price_increase_count',s.price_increase_count,
        'attention_count',(
          select count(*)::integer from attention
        )
      )
      from summary s
    ),
    'trend',coalesce((
      select jsonb_agg(jsonb_build_object(
        'month_start',t.month_start,
        'expense_minor',t.expense_minor,
        'income_minor',t.income_minor,
        'subscription_minor',t.subscription_minor
      ) order by t.month_start)
      from trend t
    ),'[]'::jsonb),
    'attention',coalesce((
      select jsonb_agg(jsonb_build_object(
        'pattern_id',a.pattern_id,
        'kind',a.kind,
        'severity',a.severity,
        'title',a.title,
        'detail',a.detail,
        'expected_at',a.expected_at,
        'change_minor',a.change_minor,
        'change_ratio',a.change_ratio
      ) order by
        case a.severity when 'negative' then 1 else 2 end,
        a.expected_at nulls last,
        a.title)
      from attention a
    ),'[]'::jsonb),
    'upcoming',coalesce((
      select jsonb_agg(jsonb_build_object(
        'pattern_id',p.pattern_id,
        'name',p.name,
        'transaction_type',p.transaction_type,
        'merchant_name',p.merchant_name,
        'is_subscription',p.subscription_id is not null,
        'amount_minor',p.effective_amount_minor,
        'currency_code',p.currency_code,
        'next_expected_at',p.next_expected_at,
        'days_to_next',p.days_to_next,
        'health',p.health
      ) order by p.next_expected_at,p.name)
      from pattern_calc p
      where p.status='active'
        and p.next_expected_at is not null
        and p.next_expected_at>=
          v_as_of-make_interval(days=>p.tolerance_days)
        and p.next_expected_at<=v_as_of+make_interval(days=>v_horizon)
    ),'[]'::jsonb),
    'patterns',coalesce((
      select jsonb_agg(jsonb_build_object(
        'pattern_id',p.pattern_id,
        'name',p.name,
        'transaction_type',p.transaction_type,
        'status',p.status,
        'health',p.health,
        'merchant_id',p.merchant_id,
        'merchant_name',p.merchant_name,
        'category_id',p.category_id,
        'category_name',p.category_name,
        'account_id',p.account_id,
        'account_name',p.account_name,
        'currency_code',p.currency_code,
        'rrule',p.rrule,
        'cadence',p.cadence,
        'cadence_interval',p.cadence_interval,
        'anchor_at',p.anchor_at,
        'next_expected_at',p.next_expected_at,
        'days_to_next',p.days_to_next,
        'tolerance_days',p.tolerance_days,
        'amount_tolerance_minor',p.amount_tolerance_minor,
        'source',p.source,
        'confidence',p.confidence,
        'expected_amount_minor',p.expected_amount_minor,
        'effective_amount_minor',p.effective_amount_minor,
        'monthly_equivalent_minor',p.monthly_equivalent_minor,
        'annualized_minor',p.monthly_equivalent_minor*12,
        'occurrence_count',coalesce(p.occurrence_count,0),
        'first_occurrence_at',p.first_occurrence_at,
        'last_occurrence_at',p.last_occurrence_at,
        'average_amount_minor',p.average_amount_minor,
        'latest_amount_minor',p.latest_amount_minor,
        'previous_amount_minor',p.previous_amount_minor,
        'latest_transaction_id',p.latest_transaction_id,
        'price_change_minor',p.price_change_minor,
        'price_change_ratio',p.price_change_ratio,
        'price_direction',case
          when p.latest_amount_minor is null
            or p.previous_amount_minor is null then 'insufficient_history'
          when p.price_change_ratio>=0.05 then 'up'
          when p.price_change_ratio<=-0.05 then 'down'
          else 'stable'
        end,
        'subscription',case
          when p.subscription_id is null then null
          else jsonb_build_object(
            'subscription_id',p.subscription_id,
            'name',p.subscription_name,
            'amount_minor',p.subscription_amount_minor,
            'billing_frequency',p.billing_frequency,
            'started_on',p.started_on,
            'cancelled_on',p.cancelled_on,
            'next_charge_at',p.next_charge_at
          )
        end,
        'recent_occurrences',coalesce((
          select jsonb_agg(jsonb_build_object(
            'transaction_id',x.transaction_id,
            'occurred_at',x.occurred_at,
            'amount_minor',x.amount_minor,
            'expected_at',x.expected_at,
            'amount_delta_minor',x.amount_delta_minor,
            'timing_delta_days',x.timing_delta_days,
            'match_source',x.match_source,
            'confidence',x.confidence
          ) order by x.occurred_at desc,x.transaction_id desc)
          from (
            select *
            from occurrence_ranked o
            where o.recurring_pattern_id=p.pattern_id
            order by o.occurred_at desc,o.transaction_id desc
            limit 12
          ) x
        ),'[]'::jsonb)
      ) order by
        case p.status when 'active' then 1 when 'paused' then 2 else 3 end,
        case p.health
          when 'missing' then 1
          when 'late' then 2
          when 'due' then 3
          when 'upcoming' then 4
          when 'on_track' then 5
          else 6
        end,
        p.monthly_equivalent_minor desc,
        p.name)
      from pattern_calc p
    ),'[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION finance.get_recurring_detection_candidates(p_anchor_date date DEFAULT NULL::date, p_history_months integer DEFAULT 18, p_limit integer DEFAULT 40)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid:=auth.uid();
  v_time_zone text:='Europe/Berlin';
  v_anchor date;
  v_start timestamptz;
  v_end timestamptz;
  v_limit integer:=greatest(1,least(coalesce(p_limit,40),100));
  v_months integer:=greatest(3,least(coalesce(p_history_months,18),36));
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception using errcode='42501',message='authentication required';
  end if;

  select coalesce(time_zone,'Europe/Berlin')
  into v_time_zone
  from finance.profiles
  where user_id=v_user_id;

  v_anchor:=coalesce(p_anchor_date,(now() at time zone v_time_zone)::date);
  v_end:=(v_anchor+1)::timestamp at time zone v_time_zone;
  v_start:=(v_anchor+1-make_interval(months=>v_months))::timestamp at time zone v_time_zone;

  with base as (
    select
      a.transaction_id,
      a.transaction_type,
      a.occurred_at,
      a.merchant_id,
      a.merchant_name,
      a.description,
      a.title,
      a.amount_minor,
      a.currency_code,
      finance.normalize_recurring_text(a.description) as normalized_description,
      case
        when a.merchant_id is not null then
          'm:'||a.merchant_id::text||'|d:'||
          coalesce(finance.normalize_recurring_text(a.description),'*')
        else
          't:'||coalesce(
            finance.normalize_recurring_text(a.description),
            finance.normalize_recurring_text(a.title),
            a.transaction_id::text
          )
      end as group_key
    from finance.activity_transactions a
    where a.user_id=v_user_id
      and a.status='posted'
      and a.financial_effect
      and a.transaction_type in ('expense','income','transfer')
      and a.amount_minor>0
      and a.occurred_at>=v_start
      and a.occurred_at<v_end
      and not exists(
        select 1
        from finance.recurring_transaction_links l
        where l.user_id=v_user_id
          and l.transaction_id=a.transaction_id
      )
  ),
  ordered as (
    select
      b.*,
      lag(b.occurred_at) over(
        partition by b.group_key,b.transaction_type
        order by b.occurred_at,b.transaction_id
      ) as previous_at
    from base b
  ),
  grouped as (
    select
      o.group_key,
      o.transaction_type,
      max(o.merchant_id::text)::uuid as merchant_id,
      max(o.merchant_name) as merchant_name,
      max(o.normalized_description) as normalized_description,
      (array_agg(coalesce(o.description,o.title)
        order by o.occurred_at desc,o.transaction_id desc))[1] as latest_label,
      count(*)::integer as occurrence_count,
      min(o.occurred_at) as first_at,
      max(o.occurred_at) as last_at,
      round(avg(o.amount_minor))::bigint as average_amount_minor,
      coalesce(round(stddev_pop(o.amount_minor)),0)::bigint as amount_stddev_minor,
      (array_agg(o.amount_minor order by o.occurred_at desc,o.transaction_id desc))[1]::bigint
        as latest_amount_minor,
      avg(extract(epoch from (o.occurred_at-o.previous_at))/86400)
        filter(where o.previous_at is not null) as average_interval_days,
      coalesce(
        stddev_pop(extract(epoch from (o.occurred_at-o.previous_at))/86400)
          filter(where o.previous_at is not null),
        0
      ) as interval_stddev_days,
      array_agg(o.transaction_id order by o.occurred_at,o.transaction_id) as transaction_ids,
      max(o.currency_code) as currency_code
    from ordered o
    group by o.group_key,o.transaction_type
    having count(*)>=3
  ),
  classified as (
    select
      g.*,
      case
        when g.average_interval_days between 0.5 and 2.0 then 'daily'
        when g.average_interval_days between 5 and 20 then 'weekly'
        when g.average_interval_days between 24 and 210 then 'monthly'
        when g.average_interval_days between 300 and 430 then 'yearly'
        else null
      end as cadence,
      case
        when g.average_interval_days between 0.5 and 2.0
          then greatest(1,round(g.average_interval_days))::integer
        when g.average_interval_days between 5 and 20
          then greatest(1,round(g.average_interval_days/7))::integer
        when g.average_interval_days between 24 and 210
          then greatest(1,round(g.average_interval_days/30.4375))::integer
        when g.average_interval_days between 300 and 430
          then greatest(1,round(g.average_interval_days/365.2425))::integer
        else null
      end as cadence_interval
    from grouped g
    where g.average_interval_days is not null
  ),
  scored as (
    select
      c.*,
      case c.cadence
        when 'daily' then c.cadence_interval::numeric
        when 'weekly' then 7*c.cadence_interval::numeric
        when 'monthly' then 30.4375*c.cadence_interval::numeric
        when 'yearly' then 365.2425*c.cadence_interval::numeric
        else null
      end as expected_interval_days
    from classified c
    where c.cadence is not null
  ),
  candidates as (
    select
      s.*,
      greatest(
        0::numeric,
        least(
          1::numeric,
          0.55 * greatest(
            0::numeric,
            1 - s.interval_stddev_days /
              greatest(2::numeric,s.expected_interval_days*0.25)
          )
          + 0.25 * greatest(
            0::numeric,
            1 - (s.amount_stddev_minor::numeric /
              greatest(s.average_amount_minor::numeric,1)) * 2
          )
          + 0.20 * least(1::numeric,s.occurrence_count::numeric/5)
        )
      ) as confidence,
      greatest(
        100::bigint,
        round(s.average_amount_minor*0.10)::bigint,
        (s.amount_stddev_minor*2)::bigint
      ) as amount_tolerance_minor,
      finance.recurring_advance(
        s.last_at,s.cadence,s.cadence_interval
      ) as next_expected_at
    from scored s
  ),
  eligible as (
    select c.*
    from candidates c
    where c.confidence>=0.60
      and not exists(
        select 1
        from finance.recurring_patterns rp
        where rp.user_id=v_user_id
          and rp.status in ('active','paused')
          and rp.transaction_type=c.transaction_type::finance.transaction_type
          and rp.merchant_id is not distinct from c.merchant_id
          and (
            rp.match_description is null
            or rp.match_description is not distinct from c.normalized_description
          )
      )
    order by c.confidence desc,c.occurrence_count desc,c.last_at desc
    limit v_limit
  )
  select jsonb_build_object(
    'anchor_date',v_anchor,
    'history_months',v_months,
    'candidates',coalesce(jsonb_agg(jsonb_build_object(
      'candidate_id',md5(e.group_key||'|'||e.transaction_type||'|'||e.cadence||'|'||e.cadence_interval),
      'name',coalesce(e.merchant_name,e.latest_label,'Recurring transaction'),
      'transaction_type',e.transaction_type,
      'merchant_id',e.merchant_id,
      'merchant_name',e.merchant_name,
      'match_description',e.normalized_description,
      'currency_code',e.currency_code,
      'occurrence_count',e.occurrence_count,
      'first_at',e.first_at,
      'last_at',e.last_at,
      'average_amount_minor',e.average_amount_minor,
      'latest_amount_minor',e.latest_amount_minor,
      'amount_stddev_minor',e.amount_stddev_minor,
      'amount_tolerance_minor',e.amount_tolerance_minor,
      'average_interval_days',round(e.average_interval_days::numeric,2),
      'interval_stddev_days',round(e.interval_stddev_days::numeric,2),
      'cadence',e.cadence,
      'cadence_interval',e.cadence_interval,
      'rrule',finance.recurring_rrule(e.cadence,e.cadence_interval),
      'next_expected_at',e.next_expected_at,
      'monthly_equivalent_minor',finance.recurring_monthly_equivalent(
        e.latest_amount_minor,e.cadence,e.cadence_interval
      ),
      'confidence',round(e.confidence,4),
      'transaction_ids',to_jsonb(e.transaction_ids),
      'subscription_likely',(
        e.transaction_type='expense'
        and e.merchant_id is not null
        and e.amount_stddev_minor::numeric /
          greatest(e.average_amount_minor::numeric,1) <= 0.10
        and finance.recurring_monthly_equivalent(
          e.latest_amount_minor,e.cadence,e.cadence_interval
        ) between 100 and 30000
      )
    ) order by e.confidence desc,e.occurrence_count desc,e.last_at desc),'[]'::jsonb)
  )
  into v_result
  from eligible e;

  return coalesce(v_result,jsonb_build_object(
    'anchor_date',v_anchor,
    'history_months',v_months,
    'candidates','[]'::jsonb
  ));
end;
$function$;

CREATE OR REPLACE FUNCTION finance.normalize_recurring_text(p_text text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select nullif(
    regexp_replace(
      lower(btrim(coalesce(p_text,''))),
      '[^[:alnum:]]+',
      ' ',
      'g'
    ),
    ''
  );
$function$;

CREATE OR REPLACE FUNCTION finance.recurring_advance(p_at timestamp with time zone, p_cadence text, p_interval integer DEFAULT 1)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
  v_interval integer:=greatest(1,coalesce(p_interval,1));
begin
  if p_at is null then return null; end if;

  return case lower(p_cadence)
    when 'daily' then p_at + make_interval(days=>v_interval)
    when 'weekly' then p_at + make_interval(days=>7*v_interval)
    when 'monthly' then p_at + make_interval(months=>v_interval)
    when 'yearly' then p_at + make_interval(years=>v_interval)
    else null
  end;
end;
$function$;

CREATE OR REPLACE FUNCTION finance.recurring_monthly_equivalent(p_amount_minor bigint, p_cadence text, p_interval integer DEFAULT 1)
 RETURNS bigint
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
  v_interval numeric:=greatest(1,coalesce(p_interval,1));
  v_amount numeric:=coalesce(p_amount_minor,0);
begin
  return case lower(p_cadence)
    when 'daily' then round(v_amount*365/(12*v_interval))::bigint
    when 'weekly' then round(v_amount*52/(12*v_interval))::bigint
    when 'monthly' then round(v_amount/v_interval)::bigint
    when 'yearly' then round(v_amount/(12*v_interval))::bigint
    else 0::bigint
  end;
end;
$function$;

CREATE OR REPLACE FUNCTION finance.recurring_rrule(p_cadence text, p_interval integer DEFAULT 1)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
  v_cadence text:=lower(btrim(coalesce(p_cadence,'')));
  v_interval integer:=coalesce(p_interval,1);
  v_freq text;
begin
  if v_interval<1 or v_interval>52 then
    raise exception using errcode='23514',
      message='recurring interval must be between 1 and 52';
  end if;

  v_freq:=case v_cadence
    when 'daily' then 'DAILY'
    when 'weekly' then 'WEEKLY'
    when 'monthly' then 'MONTHLY'
    when 'yearly' then 'YEARLY'
    else null
  end;

  if v_freq is null then
    raise exception using errcode='23514',
      message='recurring cadence must be daily, weekly, monthly, or yearly';
  end if;

  return 'FREQ='||v_freq||';INTERVAL='||v_interval::text;
end;
$function$;

CREATE OR REPLACE FUNCTION finance.set_recurring_status(p_pattern_id uuid, p_status finance.recurring_status)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid:=auth.uid();
begin
  if v_user_id is null then
    raise exception using errcode='42501',message='authentication required';
  end if;

  update finance.recurring_patterns
  set status=p_status
  where id=p_pattern_id and user_id=v_user_id;

  if not found then
    raise exception using errcode='23503',message='recurring pattern not found';
  end if;

  update finance.subscriptions
  set status=p_status,
      cancelled_on=case
        when p_status='ended' then coalesce(cancelled_on,current_date)
        when p_status='active' then null
        else cancelled_on
      end
  where recurring_pattern_id=p_pattern_id and user_id=v_user_id;

  return jsonb_build_object(
    'pattern_id',p_pattern_id,
    'status',p_status
  );
end;
$function$;

CREATE OR REPLACE FUNCTION finance.sync_recurring_patterns(p_pattern_id uuid DEFAULT NULL::uuid, p_as_of timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid:=auth.uid();
  v_pattern finance.recurring_patterns%rowtype;
  v_expected timestamptz;
  v_candidate record;
  v_synced integer:=0;
  v_patterns integer:=0;
  v_iterations integer;
  v_amount_limit bigint;
  v_confidence numeric;
begin
  if v_user_id is null then
    raise exception using errcode='42501',message='authentication required';
  end if;

  if p_pattern_id is not null and not exists(
    select 1 from finance.recurring_patterns
    where id=p_pattern_id and user_id=v_user_id
  ) then
    raise exception using errcode='23503',message='recurring pattern not found';
  end if;

  for v_pattern in
    select *
    from finance.recurring_patterns rp
    where rp.user_id=v_user_id
      and rp.status='active'
      and rp.cadence is not null
      and (p_pattern_id is null or rp.id=p_pattern_id)
    order by rp.created_at,rp.id
  loop
    v_patterns:=v_patterns+1;
    v_expected:=v_pattern.next_expected_at;

    if v_expected is null then
      select finance.recurring_advance(
        coalesce(
          max(a.occurred_at),
          v_pattern.anchor_at
        ),
        v_pattern.cadence,
        v_pattern.cadence_interval
      )
      into v_expected
      from finance.recurring_transaction_links l
      join finance.activity_transactions a
        on a.transaction_id=l.transaction_id
       and a.user_id=l.user_id
      where l.user_id=v_user_id
        and l.recurring_pattern_id=v_pattern.id;
    end if;

    if v_expected is null then
      continue;
    end if;

    v_iterations:=0;
    loop
      exit when v_expected >
        p_as_of + make_interval(days=>v_pattern.tolerance_days);
      exit when v_iterations>=24;
      v_iterations:=v_iterations+1;

      v_amount_limit:=case
        when v_pattern.expected_amount_minor is null then null
        else greatest(
          v_pattern.amount_tolerance_minor,
          round(v_pattern.expected_amount_minor*0.50)::bigint,
          100::bigint
        )
      end;

      select
        a.transaction_id,
        a.occurred_at,
        a.amount_minor,
        abs(extract(epoch from (a.occurred_at-v_expected))/86400) as abs_days,
        case
          when v_pattern.expected_amount_minor is null then null
          else a.amount_minor-v_pattern.expected_amount_minor
        end as amount_delta
      into v_candidate
      from finance.activity_transactions a
      where a.user_id=v_user_id
        and a.status='posted'
        and a.financial_effect
        and a.transaction_type=v_pattern.transaction_type::text
        and a.occurred_at >=
          v_expected-make_interval(days=>v_pattern.tolerance_days)
        and a.occurred_at <= least(
          p_as_of,
          v_expected+make_interval(days=>v_pattern.tolerance_days)
        )
        and (
          v_pattern.merchant_id is null
          or a.merchant_id=v_pattern.merchant_id
        )
        and (
          v_pattern.account_id is null
          or v_pattern.account_id=any(a.account_ids)
        )
        and (
          v_pattern.category_id is null
          or v_pattern.category_id=any(a.category_ids)
        )
        and (
          v_pattern.match_description is null
          or finance.normalize_recurring_text(a.description)
             =v_pattern.match_description
        )
        and (
          v_amount_limit is null
          or abs(a.amount_minor-v_pattern.expected_amount_minor)<=v_amount_limit
        )
        and not exists(
          select 1
          from finance.recurring_transaction_links l
          where l.user_id=v_user_id
            and l.transaction_id=a.transaction_id
        )
      order by
        abs(extract(epoch from (a.occurred_at-v_expected))) asc,
        case
          when v_pattern.expected_amount_minor is null then 0
          else abs(a.amount_minor-v_pattern.expected_amount_minor)
        end asc,
        a.occurred_at,
        a.transaction_id
      limit 1;

      if not found then
        exit;
      end if;

      v_confidence:=greatest(
        0::numeric,
        least(
          1::numeric,
          0.70 * greatest(
            0::numeric,
            1 - v_candidate.abs_days /
              greatest(v_pattern.tolerance_days::numeric,1)
          )
          + 0.30 * case
            when v_pattern.expected_amount_minor is null
              or v_pattern.expected_amount_minor=0 then 1
            else greatest(
              0::numeric,
              1 - abs(v_candidate.amount_delta)::numeric /
                greatest(v_pattern.expected_amount_minor::numeric,1)
            )
          end
        )
      );

      insert into finance.recurring_transaction_links(
        user_id,recurring_pattern_id,transaction_id,expected_at,
        matched_amount_minor,amount_delta_minor,timing_delta_days,
        match_source,confidence
      ) values(
        v_user_id,v_pattern.id,v_candidate.transaction_id,v_expected,
        v_candidate.amount_minor,v_candidate.amount_delta,
        (extract(epoch from (v_candidate.occurred_at-v_expected))/86400)::numeric,
        'learned',v_confidence
      )
      on conflict(user_id,transaction_id) do nothing;

      if found then
        v_synced:=v_synced+1;

        update finance.subscriptions
        set amount_minor=v_candidate.amount_minor
        where user_id=v_user_id
          and recurring_pattern_id=v_pattern.id
          and status='active';
      end if;

      v_expected:=finance.recurring_advance(
        v_expected,v_pattern.cadence,v_pattern.cadence_interval
      );
    end loop;

    update finance.recurring_patterns
    set next_expected_at=v_expected
    where id=v_pattern.id and user_id=v_user_id;

    update finance.subscriptions
    set next_charge_at=v_expected
    where user_id=v_user_id
      and recurring_pattern_id=v_pattern.id
      and status='active';
  end loop;

  return jsonb_build_object(
    'patterns_processed',v_patterns,
    'transactions_linked',v_synced,
    'as_of',p_as_of
  );
end;
$function$;

CREATE OR REPLACE FUNCTION finance.transaction_display_amount(p_transaction_id uuid)
 RETURNS bigint
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select abs(coalesce(sum(le.reporting_amount_minor),0))::bigint
  from finance.ledger_entries le
  where le.user_id=auth.uid()
    and le.transaction_id=p_transaction_id
    and le.entry_kind='category';
$function$;

CREATE OR REPLACE FUNCTION finance.upsert_recurring_pattern(p_pattern_id uuid, p_name text, p_transaction_type finance.transaction_type, p_merchant_id uuid DEFAULT NULL::uuid, p_category_id uuid DEFAULT NULL::uuid, p_account_id uuid DEFAULT NULL::uuid, p_expected_amount_minor bigint DEFAULT NULL::bigint, p_currency_code text DEFAULT 'EUR'::text, p_cadence text DEFAULT 'monthly'::text, p_cadence_interval integer DEFAULT 1, p_anchor_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_next_expected_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_tolerance_days integer DEFAULT 3, p_amount_tolerance_minor bigint DEFAULT 0, p_match_description text DEFAULT NULL::text, p_source finance.rule_source DEFAULT 'user'::finance.rule_source, p_confidence numeric DEFAULT 1)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid:=auth.uid();
  v_id uuid:=coalesce(p_pattern_id,gen_random_uuid());
  v_name text:=nullif(btrim(p_name),'');
  v_cadence text:=lower(btrim(coalesce(p_cadence,'')));
  v_currency text:=upper(btrim(coalesce(p_currency_code,'')));
  v_anchor timestamptz:=coalesce(p_anchor_at,now());
  v_next timestamptz;
  v_match_description text:=finance.normalize_recurring_text(p_match_description);
begin
  if v_user_id is null then
    raise exception using errcode='42501',message='authentication required';
  end if;
  if v_name is null then
    raise exception using errcode='23514',message='recurring pattern name is required';
  end if;
  if p_transaction_type not in ('expense','income','transfer') then
    raise exception using errcode='23514',
      message='recurring patterns support expense, income, or transfer transactions';
  end if;
  if p_expected_amount_minor is not null and p_expected_amount_minor<0 then
    raise exception using errcode='23514',message='expected amount cannot be negative';
  end if;
  if v_currency !~ '^[A-Z]{3}$' then
    raise exception using errcode='23514',message='invalid recurring currency code';
  end if;
  if p_tolerance_days<0 or p_tolerance_days>31 then
    raise exception using errcode='23514',message='tolerance days must be between 0 and 31';
  end if;
  if p_amount_tolerance_minor<0 then
    raise exception using errcode='23514',message='amount tolerance cannot be negative';
  end if;
  if p_confidence is not null and (p_confidence<0 or p_confidence>1) then
    raise exception using errcode='23514',message='confidence must be between 0 and 1';
  end if;

  perform finance.recurring_rrule(v_cadence,p_cadence_interval);

  if p_merchant_id is not null and not exists(
    select 1 from finance.merchants
    where id=p_merchant_id and user_id=v_user_id and not is_archived
  ) then
    raise exception using errcode='23503',message='recurring merchant not found';
  end if;

  if p_category_id is not null and not exists(
    select 1 from finance.categories
    where id=p_category_id and user_id=v_user_id and not is_archived
  ) then
    raise exception using errcode='23503',message='recurring category not found';
  end if;

  if p_account_id is not null and not exists(
    select 1 from finance.accounts
    where id=p_account_id and user_id=v_user_id and not is_archived
  ) then
    raise exception using errcode='23503',message='recurring account not found';
  end if;

  v_next:=coalesce(
    p_next_expected_at,
    finance.recurring_advance(v_anchor,v_cadence,p_cadence_interval)
  );

  if p_pattern_id is null then
    insert into finance.recurring_patterns(
      id,user_id,name,transaction_type,merchant_id,category_id,account_id,
      expected_amount_minor,currency_code,rrule,next_expected_at,
      tolerance_days,amount_tolerance_minor,status,cadence,cadence_interval,
      anchor_at,source,confidence,match_description
    ) values(
      v_id,v_user_id,v_name,p_transaction_type,p_merchant_id,p_category_id,p_account_id,
      p_expected_amount_minor,v_currency,
      finance.recurring_rrule(v_cadence,p_cadence_interval),v_next,
      p_tolerance_days,p_amount_tolerance_minor,'active',v_cadence,p_cadence_interval,
      v_anchor,p_source,p_confidence,v_match_description
    );
  else
    update finance.recurring_patterns
    set name=v_name,
        transaction_type=p_transaction_type,
        merchant_id=p_merchant_id,
        category_id=p_category_id,
        account_id=p_account_id,
        expected_amount_minor=p_expected_amount_minor,
        currency_code=v_currency,
        rrule=finance.recurring_rrule(v_cadence,p_cadence_interval),
        next_expected_at=v_next,
        tolerance_days=p_tolerance_days,
        amount_tolerance_minor=p_amount_tolerance_minor,
        cadence=v_cadence,
        cadence_interval=p_cadence_interval,
        anchor_at=v_anchor,
        source=p_source,
        confidence=p_confidence,
        match_description=v_match_description
    where id=p_pattern_id and user_id=v_user_id;

    if not found then
      raise exception using errcode='23503',message='recurring pattern not found';
    end if;
  end if;

  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.finance_confirm_recurring_candidate(p_transaction_ids uuid[], p_name text, p_cadence text, p_cadence_interval integer, p_is_subscription boolean DEFAULT false, p_tolerance_days integer DEFAULT 3)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select finance.confirm_recurring_candidate(
    p_transaction_ids,p_name,p_cadence,p_cadence_interval,
    p_is_subscription,p_tolerance_days
  );
$function$;

CREATE OR REPLACE FUNCTION public.finance_get_recurring_dashboard(p_anchor_date date DEFAULT NULL::date, p_horizon_days integer DEFAULT 45)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select finance.get_recurring_dashboard(p_anchor_date,p_horizon_days);
$function$;

CREATE OR REPLACE FUNCTION public.finance_get_recurring_detection_candidates(p_anchor_date date DEFAULT NULL::date, p_history_months integer DEFAULT 18, p_limit integer DEFAULT 40)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select finance.get_recurring_detection_candidates(
    p_anchor_date,p_history_months,p_limit
  );
$function$;

CREATE OR REPLACE FUNCTION public.finance_set_recurring_status(p_pattern_id uuid, p_status finance.recurring_status)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select finance.set_recurring_status(p_pattern_id,p_status);
$function$;

CREATE OR REPLACE FUNCTION public.finance_sync_recurring_patterns(p_pattern_id uuid DEFAULT NULL::uuid, p_as_of timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select finance.sync_recurring_patterns(p_pattern_id,p_as_of);
$function$;

CREATE OR REPLACE FUNCTION public.finance_upsert_recurring_pattern(p_pattern_id uuid DEFAULT NULL::uuid, p_name text DEFAULT NULL::text, p_transaction_type finance.transaction_type DEFAULT 'expense'::finance.transaction_type, p_merchant_id uuid DEFAULT NULL::uuid, p_category_id uuid DEFAULT NULL::uuid, p_account_id uuid DEFAULT NULL::uuid, p_expected_amount_minor bigint DEFAULT NULL::bigint, p_currency_code text DEFAULT 'EUR'::text, p_cadence text DEFAULT 'monthly'::text, p_cadence_interval integer DEFAULT 1, p_anchor_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_next_expected_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_tolerance_days integer DEFAULT 3, p_amount_tolerance_minor bigint DEFAULT 0, p_match_description text DEFAULT NULL::text, p_source finance.rule_source DEFAULT 'user'::finance.rule_source, p_confidence numeric DEFAULT 1)
 RETURNS uuid
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select finance.upsert_recurring_pattern(
    p_pattern_id,p_name,p_transaction_type,p_merchant_id,p_category_id,p_account_id,
    p_expected_amount_minor,p_currency_code,p_cadence,p_cadence_interval,
    p_anchor_at,p_next_expected_at,p_tolerance_days,p_amount_tolerance_minor,
    p_match_description,p_source,p_confidence
  );
$function$;

alter function finance.normalize_recurring_text(text) security invoker;
alter function finance.recurring_rrule(text,integer) security invoker;
alter function finance.recurring_advance(timestamptz,text,integer) security invoker;
alter function finance.recurring_monthly_equivalent(bigint,text,integer) security invoker;
alter function finance.transaction_display_amount(uuid) security invoker;
alter function finance.upsert_recurring_pattern(
  uuid,text,finance.transaction_type,uuid,uuid,uuid,bigint,text,text,integer,
  timestamptz,timestamptz,integer,bigint,text,finance.rule_source,numeric
) security invoker;
alter function finance.set_recurring_status(uuid,finance.recurring_status) security invoker;
alter function finance.get_recurring_detection_candidates(date,integer,integer) security invoker;
alter function finance.confirm_recurring_candidate(uuid[],text,text,integer,boolean,integer) security invoker;
alter function finance.sync_recurring_patterns(uuid,timestamptz) security invoker;
alter function finance.get_recurring_dashboard(date,integer) security invoker;

alter function public.finance_upsert_recurring_pattern(
  uuid,text,finance.transaction_type,uuid,uuid,uuid,bigint,text,text,integer,
  timestamptz,timestamptz,integer,bigint,text,finance.rule_source,numeric
) security invoker;
alter function public.finance_set_recurring_status(uuid,finance.recurring_status) security invoker;
alter function public.finance_get_recurring_detection_candidates(date,integer,integer) security invoker;
alter function public.finance_confirm_recurring_candidate(uuid[],text,text,integer,boolean,integer) security invoker;
alter function public.finance_sync_recurring_patterns(uuid,timestamptz) security invoker;
alter function public.finance_get_recurring_dashboard(date,integer) security invoker;

revoke all on function finance.normalize_recurring_text(text) from public,anon;
grant execute on function finance.normalize_recurring_text(text) to authenticated,service_role;
revoke all on function finance.recurring_rrule(text,integer) from public,anon;
grant execute on function finance.recurring_rrule(text,integer) to authenticated,service_role;
revoke all on function finance.recurring_advance(timestamptz,text,integer) from public,anon;
grant execute on function finance.recurring_advance(timestamptz,text,integer) to authenticated,service_role;
revoke all on function finance.recurring_monthly_equivalent(bigint,text,integer) from public,anon;
grant execute on function finance.recurring_monthly_equivalent(bigint,text,integer) to authenticated,service_role;
revoke all on function finance.transaction_display_amount(uuid) from public,anon;
grant execute on function finance.transaction_display_amount(uuid) to authenticated,service_role;
revoke all on function finance.upsert_recurring_pattern(
  uuid,text,finance.transaction_type,uuid,uuid,uuid,bigint,text,text,integer,
  timestamptz,timestamptz,integer,bigint,text,finance.rule_source,numeric
) from public,anon;
grant execute on function finance.upsert_recurring_pattern(
  uuid,text,finance.transaction_type,uuid,uuid,uuid,bigint,text,text,integer,
  timestamptz,timestamptz,integer,bigint,text,finance.rule_source,numeric
) to authenticated,service_role;
revoke all on function finance.set_recurring_status(uuid,finance.recurring_status) from public,anon;
grant execute on function finance.set_recurring_status(uuid,finance.recurring_status) to authenticated,service_role;
revoke all on function finance.get_recurring_detection_candidates(date,integer,integer) from public,anon;
grant execute on function finance.get_recurring_detection_candidates(date,integer,integer) to authenticated,service_role;
revoke all on function finance.confirm_recurring_candidate(uuid[],text,text,integer,boolean,integer) from public,anon;
grant execute on function finance.confirm_recurring_candidate(uuid[],text,text,integer,boolean,integer) to authenticated,service_role;
revoke all on function finance.sync_recurring_patterns(uuid,timestamptz) from public,anon;
grant execute on function finance.sync_recurring_patterns(uuid,timestamptz) to authenticated,service_role;
revoke all on function finance.get_recurring_dashboard(date,integer) from public,anon;
grant execute on function finance.get_recurring_dashboard(date,integer) to authenticated,service_role;

revoke all on function public.finance_upsert_recurring_pattern(
  uuid,text,finance.transaction_type,uuid,uuid,uuid,bigint,text,text,integer,
  timestamptz,timestamptz,integer,bigint,text,finance.rule_source,numeric
) from public,anon;
grant execute on function public.finance_upsert_recurring_pattern(
  uuid,text,finance.transaction_type,uuid,uuid,uuid,bigint,text,text,integer,
  timestamptz,timestamptz,integer,bigint,text,finance.rule_source,numeric
) to authenticated,service_role;
revoke all on function public.finance_set_recurring_status(uuid,finance.recurring_status) from public,anon;
grant execute on function public.finance_set_recurring_status(uuid,finance.recurring_status) to authenticated,service_role;
revoke all on function public.finance_get_recurring_detection_candidates(date,integer,integer) from public,anon;
grant execute on function public.finance_get_recurring_detection_candidates(date,integer,integer) to authenticated,service_role;
revoke all on function public.finance_confirm_recurring_candidate(uuid[],text,text,integer,boolean,integer) from public,anon;
grant execute on function public.finance_confirm_recurring_candidate(uuid[],text,text,integer,boolean,integer) to authenticated,service_role;
revoke all on function public.finance_sync_recurring_patterns(uuid,timestamptz) from public,anon;
grant execute on function public.finance_sync_recurring_patterns(uuid,timestamptz) to authenticated,service_role;
revoke all on function public.finance_get_recurring_dashboard(date,integer) from public,anon;
grant execute on function public.finance_get_recurring_dashboard(date,integer) to authenticated,service_role;
