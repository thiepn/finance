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
  v_category_id uuid;
  v_account_id uuid;
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
    case
      when count(*) filter(where cardinality(category_ids)=1)=count(*)
       and count(distinct category_ids[1])=1
      then max(category_ids[1]::text)::uuid
      else null
    end,
    case
      when count(*) filter(where cardinality(account_ids)=1)=count(*)
       and count(distinct account_ids[1])=1
      then max(account_ids[1]::text)::uuid
      else null
    end,
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
    v_count,v_type,v_merchant_id,v_merchant_name,v_category_id,v_account_id,
    v_currency,v_first_at,v_last_at,v_latest_amount,v_avg_amount,v_stddev,
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
    null,v_name,v_type,v_merchant_id,v_category_id,v_account_id,
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
  category_breakdown as (
    select
      p.category_id,
      coalesce(p.category_name,'Uncategorized') as category_name,
      sum(p.monthly_equivalent_minor)::bigint as monthly_minor,
      count(*)::integer as pattern_count
    from pattern_calc p
    where p.status='active'
      and p.transaction_type='expense'
    group by p.category_id,coalesce(p.category_name,'Uncategorized')
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
    'categories',coalesce((
      select jsonb_agg(jsonb_build_object(
        'category_id',c.category_id,
        'category_name',c.category_name,
        'monthly_minor',c.monthly_minor,
        'annualized_minor',c.monthly_minor*12,
        'pattern_count',c.pattern_count,
        'share',case
          when s.monthly_expense_minor<>0
            then c.monthly_minor::numeric/s.monthly_expense_minor::numeric
          else null
        end
      ) order by c.monthly_minor desc,c.category_name)
      from category_breakdown c
      cross join summary s
    ),'[]'::jsonb),
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
alter function finance.confirm_recurring_candidate(uuid[],text,text,integer,boolean,integer) security invoker;
alter function finance.get_recurring_dashboard(date,integer) security invoker;
revoke all on function finance.confirm_recurring_candidate(uuid[],text,text,integer,boolean,integer) from public,anon;
grant execute on function finance.confirm_recurring_candidate(uuid[],text,text,integer,boolean,integer) to authenticated,service_role;
revoke all on function finance.get_recurring_dashboard(date,integer) from public,anon;
grant execute on function finance.get_recurring_dashboard(date,integer) to authenticated,service_role;
