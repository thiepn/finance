CREATE OR REPLACE FUNCTION finance.account_balance_at(p_account_id uuid, p_as_of timestamp with time zone DEFAULT now())
 RETURNS TABLE(account_id uuid, balance_minor bigint, reporting_balance_minor bigint, observation_id uuid, observation_at timestamp with time zone, observation_source text, ledger_delta_minor bigint, reporting_ledger_delta_minor bigint, last_activity_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid:=auth.uid();
  v_obs finance.account_balance_observations%rowtype;
  v_ledger_delta bigint:=0;
  v_reporting_delta bigint:=0;
  v_last_activity timestamptz;
begin
  if v_user_id is null then
    raise exception using errcode='42501',message='authentication required';
  end if;
  if p_as_of is null then
    p_as_of:=now();
  end if;

  if not exists(
    select 1 from finance.accounts
    where id=p_account_id and user_id=v_user_id
  ) then
    raise exception using errcode='23503',message='account not found';
  end if;

  select o.*
  into v_obs
  from finance.account_balance_observations o
  where o.user_id=v_user_id
    and o.account_id=p_account_id
    and o.observed_at<=p_as_of
  order by o.observed_at desc,o.created_at desc,o.id desc
  limit 1;

  select
    coalesce(sum(le.signed_amount_minor),0)::bigint,
    coalesce(sum(le.reporting_amount_minor),0)::bigint,
    max(t.occurred_at)
  into v_ledger_delta,v_reporting_delta,v_last_activity
  from finance.ledger_entries le
  join finance.transactions t
    on t.id=le.transaction_id
   and t.user_id=le.user_id
  where le.user_id=v_user_id
    and le.account_id=p_account_id
    and le.entry_kind='account'
    and t.status='posted'
    and t.occurred_at<=p_as_of
    and (
      v_obs.id is null
      or t.occurred_at>v_obs.observed_at
    );

  account_id:=p_account_id;
  observation_id:=v_obs.id;
  observation_at:=v_obs.observed_at;
  observation_source:=case
    when v_obs.id is null then null
    else v_obs.source::text
  end;
  ledger_delta_minor:=v_ledger_delta;
  reporting_ledger_delta_minor:=v_reporting_delta;
  last_activity_at:=greatest(v_last_activity,v_obs.observed_at);

  if v_obs.id is null then
    balance_minor:=v_ledger_delta;
    reporting_balance_minor:=v_reporting_delta;
  else
    balance_minor:=v_obs.balance_minor+v_ledger_delta;
    reporting_balance_minor:=
      v_obs.reporting_balance_minor+v_reporting_delta;
  end if;

  return next;
end;
$function$;

CREATE OR REPLACE FUNCTION finance.delete_account_balance_observation(p_observation_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null then
    raise exception using errcode='42501',message='authentication required';
  end if;

  delete from finance.account_balance_observations
  where id=p_observation_id and user_id=auth.uid();

  if not found then
    raise exception using errcode='23503',
      message='balance observation not found';
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION finance.get_net_worth_dashboard(p_anchor_date date DEFAULT NULL::date, p_months integer DEFAULT 12)
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
  v_months integer:=greatest(3,least(coalesce(p_months,12),60));

  v_current_net_worth bigint:=0;
  v_assets bigint:=0;
  v_liabilities bigint:=0;
  v_previous_net_worth bigint:=0;
  v_month_change bigint:=0;
  v_month_change_ratio numeric;
  v_year_start_net_worth bigint:=0;
  v_ytd_change bigint:=0;

  v_current_month_income bigint:=0;
  v_current_month_spend bigint:=0;
  v_current_month_savings bigint:=0;
  v_current_month_savings_rate numeric;
  v_ytd_income bigint:=0;
  v_ytd_spend bigint:=0;
  v_ytd_savings bigint:=0;
  v_ytd_savings_rate numeric;

  v_horizon_start date;
  v_horizon_start_at timestamptz;
  v_horizon_opening_net_worth bigint:=0;
  v_horizon_savings bigint:=0;
  v_horizon_net_worth_change bigint:=0;
  v_horizon_other_change bigint:=0;

  v_accounts jsonb:='[]'::jsonb;
  v_history jsonb:='[]'::jsonb;
  v_savings_history jsonb:='[]'::jsonb;
  v_composition jsonb:='[]'::jsonb;
  v_investments jsonb:='[]'::jsonb;
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

  v_anchor:=coalesce(
    p_anchor_date,
    (now() at time zone v_time_zone)::date
  );

  if p_anchor_date is null then
    v_as_of:=now();
  else
    v_as_of:=(v_anchor+1)::timestamp at time zone v_time_zone
      - interval '1 microsecond';
  end if;

  v_horizon_start:=(
    date_trunc('month',v_anchor::timestamp)
      -(v_months-1)*interval '1 month'
  )::date;
  v_horizon_start_at:=
    v_horizon_start::timestamp at time zone v_time_zone;

  with positions as (
    select
      a.id as account_id,
      a.name,
      a.kind::text as kind,
      a.currency_code,
      a.institution_name,
      a.account_last4,
      a.include_in_net_worth,
      a.is_archived,
      a.sort_order,
      b.balance_minor,
      b.reporting_balance_minor,
      b.observation_id,
      b.observation_at,
      b.observation_source,
      b.ledger_delta_minor,
      b.reporting_ledger_delta_minor,
      b.last_activity_at
    from finance.accounts a
    cross join lateral finance.account_balance_at(a.id,v_as_of) b
    where a.user_id=v_user_id
  )
  select
    coalesce(sum(reporting_balance_minor) filter(
      where include_in_net_worth
    ),0)::bigint,
    coalesce(sum(greatest(reporting_balance_minor,0)) filter(
      where include_in_net_worth
    ),0)::bigint,
    coalesce(sum(greatest(-reporting_balance_minor,0)) filter(
      where include_in_net_worth
    ),0)::bigint,
    coalesce(jsonb_agg(jsonb_build_object(
      'account_id',account_id,
      'name',name,
      'kind',kind,
      'currency_code',currency_code,
      'institution_name',institution_name,
      'account_last4',account_last4,
      'include_in_net_worth',include_in_net_worth,
      'is_archived',is_archived,
      'balance_minor',balance_minor,
      'reporting_balance_minor',reporting_balance_minor,
      'position',case
        when reporting_balance_minor<0 then 'liability'
        else 'asset'
      end,
      'display_balance_minor',abs(reporting_balance_minor),
      'observation_id',observation_id,
      'observation_at',observation_at,
      'observation_source',observation_source,
      'ledger_delta_minor',ledger_delta_minor,
      'reporting_ledger_delta_minor',reporting_ledger_delta_minor,
      'last_activity_at',last_activity_at,
      'balance_basis',case
        when observation_id is null then 'ledger'
        when reporting_ledger_delta_minor=0 then 'observation'
        else 'observation_plus_ledger'
      end
    ) order by
      include_in_net_worth desc,
      is_archived,
      sort_order,
      name),'[]'::jsonb)
  into
    v_current_net_worth,v_assets,v_liabilities,v_accounts
  from positions;

  select coalesce(sum(b.reporting_balance_minor),0)::bigint
  into v_previous_net_worth
  from finance.accounts a
  cross join lateral finance.account_balance_at(
    a.id,
    date_trunc('month',v_anchor::timestamp)
      at time zone v_time_zone
      - interval '1 microsecond'
  ) b
  where a.user_id=v_user_id
    and a.include_in_net_worth;

  v_month_change:=v_current_net_worth-v_previous_net_worth;
  if v_previous_net_worth<>0 then
    v_month_change_ratio:=
      v_month_change::numeric/abs(v_previous_net_worth)::numeric;
  end if;

  select coalesce(sum(b.reporting_balance_minor),0)::bigint
  into v_year_start_net_worth
  from finance.accounts a
  cross join lateral finance.account_balance_at(
    a.id,
    date_trunc('year',v_anchor::timestamp)
      at time zone v_time_zone
      - interval '1 microsecond'
  ) b
  where a.user_id=v_user_id
    and a.include_in_net_worth;

  v_ytd_change:=v_current_net_worth-v_year_start_net_worth;

  with month_points as (
    select
      gs::date as month_start,
      least(
        ((gs+interval '1 month')::date-1),
        v_anchor
      )::date as balance_date
    from generate_series(
      v_horizon_start::timestamp,
      date_trunc('month',v_anchor::timestamp),
      interval '1 month'
    ) gs
  ),
  balances as (
    select
      m.month_start,
      m.balance_date,
      coalesce(sum(b.reporting_balance_minor),0)::bigint
        as net_worth_minor,
      coalesce(sum(greatest(b.reporting_balance_minor,0)),0)::bigint
        as assets_minor,
      coalesce(sum(greatest(-b.reporting_balance_minor,0)),0)::bigint
        as liabilities_minor
    from month_points m
    cross join finance.accounts a
    cross join lateral finance.account_balance_at(
      a.id,
      (m.balance_date+1)::timestamp at time zone v_time_zone
        - interval '1 microsecond'
    ) b
    where a.user_id=v_user_id
      and a.include_in_net_worth
    group by m.month_start,m.balance_date
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'month_start',month_start,
    'date',balance_date,
    'net_worth_minor',net_worth_minor,
    'assets_minor',assets_minor,
    'liabilities_minor',liabilities_minor
  ) order by month_start),'[]'::jsonb)
  into v_history
  from balances;

  with months as (
    select
      gs::date as month_start,
      (gs::timestamp at time zone v_time_zone) as start_at,
      (least(
        gs+interval '1 month',
        (v_anchor+1)::timestamp
      ) at time zone v_time_zone) as end_at
    from generate_series(
      v_horizon_start::timestamp,
      date_trunc('month',v_anchor::timestamp),
      interval '1 month'
    ) gs
  ),
  flows as (
    select
      m.month_start,
      coalesce(-sum(le.reporting_amount_minor) filter(
        where t.type='income'
      ),0)::bigint as income_minor,
      coalesce(sum(le.reporting_amount_minor) filter(
        where t.type in ('expense','refund','reimbursement')
      ),0)::bigint as net_spent_minor
    from months m
    left join finance.transactions t
      on t.user_id=v_user_id
     and t.status='posted'
     and t.occurred_at>=m.start_at
     and t.occurred_at<m.end_at
    left join finance.ledger_entries le
      on le.transaction_id=t.id
     and le.user_id=t.user_id
     and le.entry_kind='category'
    group by m.month_start
  ),
  calc as (
    select
      month_start,
      income_minor,
      net_spent_minor,
      income_minor-net_spent_minor as savings_minor,
      case
        when income_minor>0
          then (income_minor-net_spent_minor)::numeric
            /income_minor::numeric
        else null
      end as savings_rate
    from flows
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'month_start',month_start,
    'income_minor',income_minor,
    'net_spent_minor',net_spent_minor,
    'savings_minor',savings_minor,
    'savings_rate',savings_rate
  ) order by month_start),'[]'::jsonb)
  into v_savings_history
  from calc;

  select
    coalesce(-sum(le.reporting_amount_minor) filter(
      where t.type='income'
    ),0)::bigint,
    coalesce(sum(le.reporting_amount_minor) filter(
      where t.type in ('expense','refund','reimbursement')
    ),0)::bigint
  into v_current_month_income,v_current_month_spend
  from finance.transactions t
  join finance.ledger_entries le
    on le.transaction_id=t.id
   and le.user_id=t.user_id
   and le.entry_kind='category'
  where t.user_id=v_user_id
    and t.status='posted'
    and t.occurred_at>=(
      date_trunc('month',v_anchor::timestamp)
        at time zone v_time_zone
    )
    and t.occurred_at<=v_as_of;

  v_current_month_income:=coalesce(v_current_month_income,0);
  v_current_month_spend:=coalesce(v_current_month_spend,0);
  v_current_month_savings:=
    v_current_month_income-v_current_month_spend;
  if v_current_month_income>0 then
    v_current_month_savings_rate:=
      v_current_month_savings::numeric
        /v_current_month_income::numeric;
  end if;

  select
    coalesce(-sum(le.reporting_amount_minor) filter(
      where t.type='income'
    ),0)::bigint,
    coalesce(sum(le.reporting_amount_minor) filter(
      where t.type in ('expense','refund','reimbursement')
    ),0)::bigint
  into v_ytd_income,v_ytd_spend
  from finance.transactions t
  join finance.ledger_entries le
    on le.transaction_id=t.id
   and le.user_id=t.user_id
   and le.entry_kind='category'
  where t.user_id=v_user_id
    and t.status='posted'
    and t.occurred_at>=(
      date_trunc('year',v_anchor::timestamp)
        at time zone v_time_zone
    )
    and t.occurred_at<=v_as_of;

  v_ytd_income:=coalesce(v_ytd_income,0);
  v_ytd_spend:=coalesce(v_ytd_spend,0);
  v_ytd_savings:=v_ytd_income-v_ytd_spend;
  if v_ytd_income>0 then
    v_ytd_savings_rate:=
      v_ytd_savings::numeric/v_ytd_income::numeric;
  end if;

  with current_positions as (
    select
      a.kind::text as kind,
      b.reporting_balance_minor
    from finance.accounts a
    cross join lateral finance.account_balance_at(a.id,v_as_of) b
    where a.user_id=v_user_id
      and a.include_in_net_worth
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'kind',kind,
    'net_minor',net_minor,
    'asset_minor',asset_minor,
    'liability_minor',liability_minor,
    'account_count',account_count
  ) order by abs(net_minor) desc,kind),'[]'::jsonb)
  into v_composition
  from (
    select
      kind,
      sum(reporting_balance_minor)::bigint as net_minor,
      sum(greatest(reporting_balance_minor,0))::bigint
        as asset_minor,
      sum(greatest(-reporting_balance_minor,0))::bigint
        as liability_minor,
      count(*)::integer as account_count
    from current_positions
    group by kind
  ) c;

  select coalesce(sum(b.reporting_balance_minor),0)::bigint
  into v_horizon_opening_net_worth
  from finance.accounts a
  cross join lateral finance.account_balance_at(
    a.id,
    v_horizon_start_at-interval '1 microsecond'
  ) b
  where a.user_id=v_user_id
    and a.include_in_net_worth;

  select coalesce(sum(
    -le.reporting_amount_minor
  ) filter(where t.type='income'),0)::bigint
    -coalesce(sum(
      le.reporting_amount_minor
    ) filter(where t.type in ('expense','refund','reimbursement')),0)::bigint
  into v_horizon_savings
  from finance.transactions t
  join finance.ledger_entries le
    on le.transaction_id=t.id
   and le.user_id=t.user_id
   and le.entry_kind='category'
  where t.user_id=v_user_id
    and t.status='posted'
    and t.occurred_at>=v_horizon_start_at
    and t.occurred_at<=v_as_of;

  v_horizon_savings:=coalesce(v_horizon_savings,0);
  v_horizon_net_worth_change:=
    v_current_net_worth-v_horizon_opening_net_worth;
  v_horizon_other_change:=
    v_horizon_net_worth_change-v_horizon_savings;

  with investment_accounts as (
    select a.*
    from finance.accounts a
    where a.user_id=v_user_id
      and a.kind='investment'
      and a.include_in_net_worth
  ),
  calc as (
    select
      a.id as account_id,
      a.name,
      a.currency_code,
      s.reporting_balance_minor as opening_balance_minor,
      e.reporting_balance_minor as closing_balance_minor,
      coalesce((
        select sum(le.reporting_amount_minor)
        from finance.ledger_entries le
        join finance.transactions t
          on t.id=le.transaction_id
         and t.user_id=le.user_id
        where le.user_id=v_user_id
          and le.account_id=a.id
          and le.entry_kind='account'
          and t.status='posted'
          and t.occurred_at>=v_horizon_start_at
          and t.occurred_at<=v_as_of
      ),0)::bigint as net_transaction_flow_minor
    from investment_accounts a
    cross join lateral finance.account_balance_at(
      a.id,
      v_horizon_start_at-interval '1 microsecond'
    ) s
    cross join lateral finance.account_balance_at(
      a.id,
      v_as_of
    ) e
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'account_id',account_id,
    'name',name,
    'currency_code',currency_code,
    'opening_balance_minor',opening_balance_minor,
    'closing_balance_minor',closing_balance_minor,
    'net_transaction_flow_minor',net_transaction_flow_minor,
    'residual_value_change_minor',
      closing_balance_minor-opening_balance_minor-net_transaction_flow_minor
  ) order by abs(closing_balance_minor) desc,name),'[]'::jsonb)
  into v_investments
  from calc;

  return jsonb_build_object(
    'profile',jsonb_build_object(
      'currency_code',v_currency,
      'locale',v_locale,
      'time_zone',v_time_zone
    ),
    'anchor_date',v_anchor,
    'range',jsonb_build_object(
      'months',v_months,
      'start_date',v_horizon_start,
      'as_of',v_as_of
    ),
    'summary',jsonb_build_object(
      'net_worth_minor',v_current_net_worth,
      'assets_minor',v_assets,
      'liabilities_minor',v_liabilities,
      'previous_month_net_worth_minor',v_previous_net_worth,
      'month_change_minor',v_month_change,
      'month_change_ratio',v_month_change_ratio,
      'year_start_net_worth_minor',v_year_start_net_worth,
      'ytd_change_minor',v_ytd_change
    ),
    'savings',jsonb_build_object(
      'current_month_income_minor',v_current_month_income,
      'current_month_spend_minor',v_current_month_spend,
      'current_month_savings_minor',v_current_month_savings,
      'current_month_savings_rate',v_current_month_savings_rate,
      'ytd_income_minor',v_ytd_income,
      'ytd_spend_minor',v_ytd_spend,
      'ytd_savings_minor',v_ytd_savings,
      'ytd_savings_rate',v_ytd_savings_rate
    ),
    'bridge',jsonb_build_object(
      'opening_net_worth_minor',v_horizon_opening_net_worth,
      'closing_net_worth_minor',v_current_net_worth,
      'net_worth_change_minor',v_horizon_net_worth_change,
      'ledger_savings_minor',v_horizon_savings,
      'valuation_and_other_change_minor',v_horizon_other_change
    ),
    'accounts',v_accounts,
    'history',v_history,
    'savings_history',v_savings_history,
    'composition',v_composition,
    'investment_bridges',v_investments
  );
end;
$function$;

CREATE OR REPLACE FUNCTION finance.record_account_balance_observation(p_account_id uuid, p_balance_minor bigint, p_observed_at timestamp with time zone DEFAULT now(), p_reporting_balance_minor bigint DEFAULT NULL::bigint, p_exchange_rate numeric DEFAULT NULL::numeric, p_source finance.balance_observation_source DEFAULT 'manual'::finance.balance_observation_source, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid:=auth.uid();
  v_account finance.accounts%rowtype;
  v_reporting_currency text;
  v_reporting_balance bigint;
  v_rate numeric;
  v_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode='42501',message='authentication required';
  end if;
  if p_observed_at is null then
    raise exception using errcode='23514',message='observation time is required';
  end if;

  select *
  into v_account
  from finance.accounts
  where id=p_account_id and user_id=v_user_id;

  if not found then
    raise exception using errcode='23503',message='account not found';
  end if;

  select coalesce(reporting_currency,'EUR')
  into v_reporting_currency
  from finance.profiles
  where user_id=v_user_id;

  if v_account.currency_code=v_reporting_currency then
    v_reporting_balance:=p_balance_minor;
    v_rate:=1;
    if p_reporting_balance_minor is not null
       and p_reporting_balance_minor<>p_balance_minor then
      raise exception using errcode='23514',
        message='reporting balance must equal account balance for reporting-currency accounts';
    end if;
  else
    if p_reporting_balance_minor is not null then
      v_reporting_balance:=p_reporting_balance_minor;
      if p_exchange_rate is not null and p_exchange_rate<=0 then
        raise exception using errcode='23514',message='exchange rate must be positive';
      end if;
      v_rate:=p_exchange_rate;
    elsif p_exchange_rate is not null and p_exchange_rate>0 then
      v_rate:=p_exchange_rate;
      v_reporting_balance:=round(p_balance_minor*p_exchange_rate)::bigint;
    else
      raise exception using errcode='23514',
        message='foreign-currency observations require a reporting balance or exchange rate';
    end if;
  end if;

  insert into finance.account_balance_observations(
    user_id,account_id,observed_at,balance_minor,currency_code,
    reporting_balance_minor,reporting_currency,exchange_rate,
    source,note
  ) values(
    v_user_id,p_account_id,p_observed_at,p_balance_minor,
    v_account.currency_code,v_reporting_balance,v_reporting_currency,
    v_rate,p_source,nullif(btrim(p_note),'')
  )
  on conflict(user_id,account_id,observed_at)
  do update set
    balance_minor=excluded.balance_minor,
    currency_code=excluded.currency_code,
    reporting_balance_minor=excluded.reporting_balance_minor,
    reporting_currency=excluded.reporting_currency,
    exchange_rate=excluded.exchange_rate,
    source=excluded.source,
    note=excluded.note
  returning id into v_id;

  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION finance.set_account_net_worth_inclusion(p_account_id uuid, p_include boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null then
    raise exception using errcode='42501',message='authentication required';
  end if;

  update finance.accounts
  set include_in_net_worth=coalesce(p_include,false)
  where id=p_account_id and user_id=auth.uid();

  if not found then
    raise exception using errcode='23503',message='account not found';
  end if;

  return jsonb_build_object(
    'account_id',p_account_id,
    'include_in_net_worth',coalesce(p_include,false)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.finance_delete_account_balance_observation(p_observation_id uuid)
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select finance.delete_account_balance_observation(p_observation_id);
$function$;

CREATE OR REPLACE FUNCTION public.finance_get_account_wealth_history(p_account_id uuid, p_anchor_date date DEFAULT NULL::date, p_months integer DEFAULT 12)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid:=auth.uid();
  v_time_zone text:='Europe/Berlin';
  v_locale text:='de-DE';
  v_reporting_currency text:='EUR';
  v_anchor date;
  v_months integer:=greatest(3,least(coalesce(p_months,12),60));
  v_account record;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception using errcode='42501',message='authentication required';
  end if;

  select
    coalesce(time_zone,'Europe/Berlin'),
    coalesce(locale,'de-DE'),
    coalesce(reporting_currency,'EUR')
  into v_time_zone,v_locale,v_reporting_currency
  from finance.profiles
  where user_id=v_user_id;

  v_anchor:=coalesce(
    p_anchor_date,
    (now() at time zone v_time_zone)::date
  );

  select
    a.id,a.name,a.kind,a.currency_code,a.institution_name,
    a.include_in_net_worth,a.is_archived
  into v_account
  from finance.accounts a
  where a.user_id=v_user_id and a.id=p_account_id;

  if v_account.id is null then
    raise exception using errcode='23503',message='account not found';
  end if;

  with month_points as (
    select
      gs::date as point_date,
      least(
        ((gs+interval '1 month')::date-1),
        v_anchor
      )::date as balance_date
    from generate_series(
      date_trunc('month',v_anchor::timestamp)
        -(v_months-1)*interval '1 month',
      date_trunc('month',v_anchor::timestamp),
      interval '1 month'
    ) gs
  ),
  balances as (
    select
      m.point_date,
      m.balance_date,
      b.balance_minor,
      b.reporting_balance_minor
    from month_points m
    cross join lateral finance.account_balance_at(
      p_account_id,
      (m.balance_date+1)::timestamp at time zone v_time_zone
        - interval '1 microsecond'
    ) b
  )
  select jsonb_build_object(
    'profile',jsonb_build_object(
      'currency_code',v_reporting_currency,
      'locale',v_locale,
      'time_zone',v_time_zone
    ),
    'account',jsonb_build_object(
      'account_id',v_account.id,
      'name',v_account.name,
      'kind',v_account.kind,
      'currency_code',v_account.currency_code,
      'institution_name',v_account.institution_name,
      'include_in_net_worth',v_account.include_in_net_worth,
      'is_archived',v_account.is_archived
    ),
    'history',coalesce((
      select jsonb_agg(jsonb_build_object(
        'date',balance_date,
        'balance_minor',balance_minor,
        'reporting_balance_minor',reporting_balance_minor
      ) order by balance_date)
      from balances
    ),'[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.finance_get_net_worth_dashboard(p_anchor_date date DEFAULT NULL::date, p_months integer DEFAULT 12)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select finance.get_net_worth_dashboard(p_anchor_date,p_months);
$function$;

CREATE OR REPLACE FUNCTION public.finance_record_account_balance_observation(p_account_id uuid, p_balance_minor bigint, p_observed_at timestamp with time zone DEFAULT now(), p_reporting_balance_minor bigint DEFAULT NULL::bigint, p_exchange_rate numeric DEFAULT NULL::numeric, p_source finance.balance_observation_source DEFAULT 'manual'::finance.balance_observation_source, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select finance.record_account_balance_observation(
    p_account_id,p_balance_minor,p_observed_at,
    p_reporting_balance_minor,p_exchange_rate,p_source,p_note
  );
$function$;

CREATE OR REPLACE FUNCTION public.finance_set_account_net_worth_inclusion(p_account_id uuid, p_include boolean)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select finance.set_account_net_worth_inclusion(
    p_account_id,p_include
  );
$function$;

alter function finance.account_balance_at(p_account_id uuid, p_as_of timestamp with time zone) security invoker;
revoke all on function finance.account_balance_at(p_account_id uuid, p_as_of timestamp with time zone) from public,anon;
grant execute on function finance.account_balance_at(p_account_id uuid, p_as_of timestamp with time zone) to authenticated,service_role;

alter function finance.delete_account_balance_observation(p_observation_id uuid) security invoker;
revoke all on function finance.delete_account_balance_observation(p_observation_id uuid) from public,anon;
grant execute on function finance.delete_account_balance_observation(p_observation_id uuid) to authenticated,service_role;

alter function finance.get_net_worth_dashboard(p_anchor_date date, p_months integer) security invoker;
revoke all on function finance.get_net_worth_dashboard(p_anchor_date date, p_months integer) from public,anon;
grant execute on function finance.get_net_worth_dashboard(p_anchor_date date, p_months integer) to authenticated,service_role;

alter function finance.record_account_balance_observation(p_account_id uuid, p_balance_minor bigint, p_observed_at timestamp with time zone, p_reporting_balance_minor bigint, p_exchange_rate numeric, p_source finance.balance_observation_source, p_note text) security invoker;
revoke all on function finance.record_account_balance_observation(p_account_id uuid, p_balance_minor bigint, p_observed_at timestamp with time zone, p_reporting_balance_minor bigint, p_exchange_rate numeric, p_source finance.balance_observation_source, p_note text) from public,anon;
grant execute on function finance.record_account_balance_observation(p_account_id uuid, p_balance_minor bigint, p_observed_at timestamp with time zone, p_reporting_balance_minor bigint, p_exchange_rate numeric, p_source finance.balance_observation_source, p_note text) to authenticated,service_role;

alter function finance.set_account_net_worth_inclusion(p_account_id uuid, p_include boolean) security invoker;
revoke all on function finance.set_account_net_worth_inclusion(p_account_id uuid, p_include boolean) from public,anon;
grant execute on function finance.set_account_net_worth_inclusion(p_account_id uuid, p_include boolean) to authenticated,service_role;

alter function public.finance_delete_account_balance_observation(p_observation_id uuid) security invoker;
revoke all on function public.finance_delete_account_balance_observation(p_observation_id uuid) from public,anon;
grant execute on function public.finance_delete_account_balance_observation(p_observation_id uuid) to authenticated,service_role;

alter function public.finance_get_account_wealth_history(p_account_id uuid, p_anchor_date date, p_months integer) security invoker;
revoke all on function public.finance_get_account_wealth_history(p_account_id uuid, p_anchor_date date, p_months integer) from public,anon;
grant execute on function public.finance_get_account_wealth_history(p_account_id uuid, p_anchor_date date, p_months integer) to authenticated,service_role;

alter function public.finance_get_net_worth_dashboard(p_anchor_date date, p_months integer) security invoker;
revoke all on function public.finance_get_net_worth_dashboard(p_anchor_date date, p_months integer) from public,anon;
grant execute on function public.finance_get_net_worth_dashboard(p_anchor_date date, p_months integer) to authenticated,service_role;

alter function public.finance_record_account_balance_observation(p_account_id uuid, p_balance_minor bigint, p_observed_at timestamp with time zone, p_reporting_balance_minor bigint, p_exchange_rate numeric, p_source finance.balance_observation_source, p_note text) security invoker;
revoke all on function public.finance_record_account_balance_observation(p_account_id uuid, p_balance_minor bigint, p_observed_at timestamp with time zone, p_reporting_balance_minor bigint, p_exchange_rate numeric, p_source finance.balance_observation_source, p_note text) from public,anon;
grant execute on function public.finance_record_account_balance_observation(p_account_id uuid, p_balance_minor bigint, p_observed_at timestamp with time zone, p_reporting_balance_minor bigint, p_exchange_rate numeric, p_source finance.balance_observation_source, p_note text) to authenticated,service_role;

alter function public.finance_set_account_net_worth_inclusion(p_account_id uuid, p_include boolean) security invoker;
revoke all on function public.finance_set_account_net_worth_inclusion(p_account_id uuid, p_include boolean) from public,anon;
grant execute on function public.finance_set_account_net_worth_inclusion(p_account_id uuid, p_include boolean) to authenticated,service_role;