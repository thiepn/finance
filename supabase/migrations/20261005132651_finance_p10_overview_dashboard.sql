
create or replace function finance.get_overview_dashboard(
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_compare_start timestamptz default null,
  p_compare_end timestamptz default null,
  p_as_of timestamptz default now(),
  p_recent_limit integer default 6
)
returns jsonb
language plpgsql
stable
security invoker
set search_path=''
as $$
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
    join finance.ledger_entries le
      on le.transaction_id=t.id
     and le.user_id=t.user_id
     and le.entry_kind='category'
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
        join finance.ledger_entries le
          on le.transaction_id=t.id
         and le.user_id=t.user_id
         and le.entry_kind='category'
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
  join finance.ledger_entries le
    on le.transaction_id=t.id
   and le.user_id=t.user_id
   and le.entry_kind='category'
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
    join finance.ledger_entries le
      on le.transaction_id=t.id and le.user_id=t.user_id and le.entry_kind='category'
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
    join finance.ledger_entries le
      on le.transaction_id=t.id and le.user_id=t.user_id and le.entry_kind='category'
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
$$;

revoke all on function finance.get_overview_dashboard(
  timestamptz,timestamptz,timestamptz,timestamptz,timestamptz,integer
) from public,anon;
grant execute on function finance.get_overview_dashboard(
  timestamptz,timestamptz,timestamptz,timestamptz,timestamptz,integer
) to authenticated,service_role;

create or replace function public.finance_get_overview_dashboard(
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_compare_start timestamptz default null,
  p_compare_end timestamptz default null,
  p_as_of timestamptz default now(),
  p_recent_limit integer default 6
)
returns jsonb
language sql
stable
security invoker
set search_path=''
as $$
  select finance.get_overview_dashboard(
    p_period_start,p_period_end,p_compare_start,p_compare_end,p_as_of,p_recent_limit
  );
$$;

revoke all on function public.finance_get_overview_dashboard(
  timestamptz,timestamptz,timestamptz,timestamptz,timestamptz,integer
) from public,anon;
grant execute on function public.finance_get_overview_dashboard(
  timestamptz,timestamptz,timestamptz,timestamptz,timestamptz,integer
) to authenticated,service_role;

create index if not exists budget_periods_user_dates_idx
  on finance.budget_periods(user_id,starts_on,ends_on,budget_id);

create index if not exists budget_allocations_user_period_category_idx
  on finance.budget_allocations(user_id,budget_period_id,category_id);
