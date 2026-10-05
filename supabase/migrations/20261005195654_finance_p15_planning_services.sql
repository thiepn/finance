CREATE OR REPLACE FUNCTION finance.add_goal_movement(p_goal_id uuid, p_amount_minor bigint, p_movement_kind finance.goal_movement_kind DEFAULT 'contribution'::finance.goal_movement_kind, p_occurred_at timestamp with time zone DEFAULT now(), p_transaction_id uuid DEFAULT NULL::uuid, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid:=auth.uid();
  v_currency text;
  v_id uuid:=gen_random_uuid();
  v_balance bigint;
begin
  if v_user_id is null then
    raise exception using errcode='42501',message='authentication required';
  end if;
  if p_amount_minor is null or p_amount_minor<=0 then
    raise exception using errcode='23514',message='goal movement amount must be positive';
  end if;

  select currency_code
  into v_currency
  from finance.goals
  where id=p_goal_id and user_id=v_user_id;

  if v_currency is null then
    raise exception using errcode='23503',message='goal not found';
  end if;

  if p_transaction_id is not null and not exists(
    select 1 from finance.transactions
    where id=p_transaction_id and user_id=v_user_id
  ) then
    raise exception using errcode='23503',message='goal transaction not found';
  end if;

  select coalesce(sum(
    case movement_kind
      when 'withdrawal' then -amount_minor
      else amount_minor
    end
  ),0)::bigint
  into v_balance
  from finance.goal_contributions
  where user_id=v_user_id and goal_id=p_goal_id;

  if p_movement_kind='withdrawal' and p_amount_minor>v_balance then
    raise exception using errcode='23514',
      message='goal withdrawal exceeds funded balance';
  end if;

  insert into finance.goal_contributions(
    id,user_id,goal_id,transaction_id,amount_minor,currency_code,
    occurred_at,note,movement_kind
  ) values(
    v_id,v_user_id,p_goal_id,p_transaction_id,p_amount_minor,v_currency,
    coalesce(p_occurred_at,now()),p_note,p_movement_kind
  );

  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION finance.budget_rollover_balance(p_budget_id uuid, p_period_id uuid, p_category_id uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid:=auth.uid();
  v_target finance.budget_periods%rowtype;
  v_period record;
  v_balance bigint:=0;
  v_spend bigint:=0;
  v_start timestamptz;
  v_end timestamptz;
  v_time_zone text:='Europe/Berlin';
begin
  if v_user_id is null then
    raise exception using errcode='42501',message='authentication required';
  end if;

  select *
  into v_target
  from finance.budget_periods
  where id=p_period_id
    and budget_id=p_budget_id
    and user_id=v_user_id;

  if not found then
    raise exception using errcode='23503',message='budget period not found';
  end if;

  select coalesce(time_zone,'Europe/Berlin')
  into v_time_zone
  from finance.profiles
  where user_id=v_user_id;

  for v_period in
    select
      bp.id,
      bp.starts_on,
      bp.ends_on,
      ba.planned_minor,
      ba.rollover
    from finance.budget_periods bp
    join finance.budget_allocations ba
      on ba.budget_period_id=bp.id
     and ba.user_id=bp.user_id
     and ba.category_id=p_category_id
    where bp.user_id=v_user_id
      and bp.budget_id=p_budget_id
      and bp.starts_on<v_target.starts_on
    order by bp.starts_on,bp.id
  loop
    v_start:=v_period.starts_on::timestamp at time zone v_time_zone;
    v_end:=(v_period.ends_on+1)::timestamp at time zone v_time_zone;
    v_spend:=finance.category_period_spend(
      p_category_id,v_start,v_end
    );

    if v_period.rollover then
      v_balance:=v_balance+v_period.planned_minor-v_spend;
    else
      v_balance:=0;
    end if;
  end loop;

  return v_balance;
end;
$function$;

CREATE OR REPLACE FUNCTION finance.category_period_spend(p_category_id uuid, p_start timestamp with time zone, p_end timestamp with time zone)
 RETURNS bigint
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select coalesce(sum(le.reporting_amount_minor),0)::bigint
  from finance.transactions t
  join finance.ledger_entries le
    on le.transaction_id=t.id
   and le.user_id=t.user_id
   and le.entry_kind='category'
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

CREATE OR REPLACE FUNCTION finance.delete_budget_allocation(p_allocation_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null then
    raise exception using errcode='42501',message='authentication required';
  end if;

  delete from finance.budget_allocations
  where id=p_allocation_id and user_id=auth.uid();

  if not found then
    raise exception using errcode='23503',message='budget allocation not found';
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION finance.ensure_budget_period(p_budget_id uuid, p_anchor_date date DEFAULT CURRENT_DATE, p_planned_income_minor bigint DEFAULT NULL::bigint)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid:=auth.uid();
  v_kind finance.budget_period_kind;
  v_start date;
  v_end date;
  v_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode='42501',message='authentication required';
  end if;

  select period_kind
  into v_kind
  from finance.budgets
  where id=p_budget_id and user_id=v_user_id;

  if v_kind is null then
    raise exception using errcode='23503',message='budget not found';
  end if;

  case v_kind
    when 'weekly' then
      v_start:=(date_trunc('week',p_anchor_date::timestamp))::date;
      v_end:=v_start+6;
    when 'monthly' then
      v_start:=date_trunc('month',p_anchor_date::timestamp)::date;
      v_end:=(v_start+interval '1 month-1 day')::date;
    when 'quarterly' then
      v_start:=date_trunc('quarter',p_anchor_date::timestamp)::date;
      v_end:=(v_start+interval '3 months-1 day')::date;
    when 'yearly' then
      v_start:=date_trunc('year',p_anchor_date::timestamp)::date;
      v_end:=(v_start+interval '1 year-1 day')::date;
    else
      raise exception using errcode='23514',
        message='custom budget periods must be created with explicit dates';
  end case;

  select id
  into v_id
  from finance.budget_periods
  where user_id=v_user_id
    and budget_id=p_budget_id
    and starts_on=v_start
    and ends_on=v_end;

  if v_id is null then
    v_id:=finance.upsert_budget_period(
      null,p_budget_id,v_start,v_end,p_planned_income_minor,null
    );
  elsif p_planned_income_minor is not null then
    update finance.budget_periods
    set planned_income_minor=p_planned_income_minor
    where id=v_id and user_id=v_user_id;
  end if;

  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION finance.get_planning_dashboard(p_anchor_date date DEFAULT NULL::date)
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

  v_budget_id uuid;
  v_budget_name text;
  v_period_kind finance.budget_period_kind;
  v_period_id uuid;
  v_starts_on date;
  v_ends_on date;
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_planned_income bigint;
  v_period_days integer:=0;
  v_elapsed_ratio numeric:=0;

  v_income bigint:=0;
  v_actual_spend bigint:=0;
  v_recurring_actual bigint:=0;
  v_variable_actual bigint:=0;
  v_future_recurring_expense bigint:=0;
  v_future_recurring_income bigint:=0;

  v_base_planned bigint:=0;
  v_carry_in bigint:=0;
  v_effective_planned bigint:=0;
  v_allocated_spend bigint:=0;
  v_unallocated_spend bigint:=0;
  v_budget_remaining bigint:=0;
  v_projected_variable bigint:=0;
  v_projected_spend bigint:=0;
  v_pace_ratio numeric;
  v_resource_plan bigint;
  v_goal_period_target bigint:=0;
  v_goal_period_contributed bigint:=0;
  v_goal_funding_remaining bigint:=0;
  v_safe_to_spend bigint;
  v_unallocated_plan bigint;
  v_projected_surplus bigint;
  v_budget_status text:='unconfigured';

  v_allocations jsonb:='[]'::jsonb;
  v_goals jsonb:='[]'::jsonb;
  v_forecast jsonb:='[]'::jsonb;
  v_commitments jsonb:='[]'::jsonb;
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

  select b.id,b.name,b.period_kind
  into v_budget_id,v_budget_name,v_period_kind
  from finance.budgets b
  where b.user_id=v_user_id and b.is_active
  order by b.updated_at desc,b.id
  limit 1;

  if v_budget_id is not null then
    select
      bp.id,bp.starts_on,bp.ends_on,bp.planned_income_minor
    into
      v_period_id,v_starts_on,v_ends_on,v_planned_income
    from finance.budget_periods bp
    where bp.user_id=v_user_id
      and bp.budget_id=v_budget_id
      and v_anchor between bp.starts_on and bp.ends_on
    order by bp.starts_on desc,bp.id
    limit 1;
  end if;

  if v_period_id is not null then
    v_period_start:=v_starts_on::timestamp at time zone v_time_zone;
    v_period_end:=(v_ends_on+1)::timestamp at time zone v_time_zone;
    v_as_of:=least(greatest(v_as_of,v_period_start),v_period_end);
    v_period_days:=v_ends_on-v_starts_on+1;
    v_elapsed_ratio:=greatest(
      0::numeric,
      least(
        1::numeric,
        extract(epoch from (v_as_of-v_period_start))
          / greatest(extract(epoch from (v_period_end-v_period_start)),1)
      )
    );

    select
      coalesce(-sum(le.reporting_amount_minor) filter(
        where t.type='income'
      ),0)::bigint,
      greatest(
        coalesce(sum(le.reporting_amount_minor) filter(
          where t.type in ('expense','refund','reimbursement')
        ),0),
        0
      )::bigint
    into v_income,v_actual_spend
    from finance.transactions t
    join finance.ledger_entries le
      on le.transaction_id=t.id
     and le.user_id=t.user_id
     and le.entry_kind='category'
    where t.user_id=v_user_id
      and t.status='posted'
      and t.occurred_at>=v_period_start
      and t.occurred_at<v_as_of;

    select coalesce(sum(a.amount_minor),0)::bigint
    into v_recurring_actual
    from finance.recurring_transaction_links l
    join finance.recurring_patterns rp
      on rp.id=l.recurring_pattern_id
     and rp.user_id=l.user_id
    join finance.activity_transactions a
      on a.transaction_id=l.transaction_id
     and a.user_id=l.user_id
    where l.user_id=v_user_id
      and rp.transaction_type='expense'
      and a.status='posted'
      and a.financial_effect
      and a.occurred_at>=v_period_start
      and a.occurred_at<v_as_of;

    v_variable_actual:=greatest(v_actual_spend-v_recurring_actual,0);

    with recursive pattern_amounts as (
      select
        rp.id as pattern_id,
        rp.transaction_type::text as transaction_type,
        rp.category_id,
        rp.currency_code,
        rp.cadence,
        rp.cadence_interval,
        rp.next_expected_at,
        coalesce(
          (
            select a.amount_minor
            from finance.recurring_transaction_links l
            join finance.activity_transactions a
              on a.transaction_id=l.transaction_id
             and a.user_id=l.user_id
            where l.user_id=v_user_id
              and l.recurring_pattern_id=rp.id
              and a.status='posted'
              and a.financial_effect
            order by a.occurred_at desc,a.transaction_id desc
            limit 1
          ),
          s.amount_minor,
          rp.expected_amount_minor,
          0
        )::bigint as amount_minor
      from finance.recurring_patterns rp
      left join finance.subscriptions s
        on s.recurring_pattern_id=rp.id
       and s.user_id=rp.user_id
       and s.status='active'
      where rp.user_id=v_user_id
        and rp.status='active'
        and rp.cadence is not null
        and rp.next_expected_at is not null
        and rp.transaction_type in ('expense','income')
    ),
    expected(pattern_id,transaction_type,category_id,currency_code,cadence,cadence_interval,amount_minor,expected_at,n) as (
      select
        pa.pattern_id,pa.transaction_type,pa.category_id,pa.currency_code,
        pa.cadence,pa.cadence_interval,pa.amount_minor,
        pa.next_expected_at,1
      from pattern_amounts pa

      union all

      select
        e.pattern_id,e.transaction_type,e.category_id,e.currency_code,
        e.cadence,e.cadence_interval,e.amount_minor,
        finance.recurring_advance(
          e.expected_at,e.cadence,e.cadence_interval
        ),
        e.n+1
      from expected e
      where e.expected_at<v_period_end
        and e.n<120
    ),
    remaining as (
      select *
      from expected
      where expected_at>=v_period_start
        and expected_at<v_period_end
        and expected_at>=v_as_of
    )
    select
      coalesce(sum(amount_minor) filter(
        where transaction_type='expense'
      ),0)::bigint,
      coalesce(sum(amount_minor) filter(
        where transaction_type='income'
      ),0)::bigint,
      coalesce(jsonb_agg(jsonb_build_object(
        'pattern_id',pattern_id,
        'transaction_type',transaction_type,
        'category_id',category_id,
        'currency_code',currency_code,
        'amount_minor',amount_minor,
        'expected_at',expected_at
      ) order by expected_at,pattern_id),'[]'::jsonb)
    into
      v_future_recurring_expense,
      v_future_recurring_income,
      v_commitments
    from remaining;

    with allocation_base as (
      select
        ba.id as allocation_id,
        ba.category_id,
        ct.name as category_name,
        ct.name_path,
        ba.planned_minor,
        ba.rollover,
        finance.budget_rollover_balance(
          v_budget_id,v_period_id,ba.category_id
        ) as carry_in_minor,
        finance.category_period_spend(
          ba.category_id,v_period_start,v_as_of
        ) as spent_minor
      from finance.budget_allocations ba
      join finance.category_tree ct
        on ct.id=ba.category_id and ct.user_id=ba.user_id
      where ba.user_id=v_user_id
        and ba.budget_period_id=v_period_id
    ),
    expected_by_allocation as (
      select
        a.allocation_id,
        coalesce(sum((x->>'amount_minor')::bigint),0)::bigint
          as future_recurring_minor
      from allocation_base a
      left join lateral jsonb_array_elements(v_commitments) x
        on x->>'transaction_type'='expense'
       and x->>'category_id' is not null
       and exists(
         select 1
         from finance.category_tree ct
         where ct.user_id=v_user_id
           and ct.id=(x->>'category_id')::uuid
           and a.category_id=any(ct.id_path)
       )
      group by a.allocation_id
    ),
    recurring_actual_by_allocation as (
      select
        a.allocation_id,
        coalesce(sum(act.amount_minor),0)::bigint
          as recurring_actual_minor
      from allocation_base a
      left join finance.recurring_patterns rp
        on rp.user_id=v_user_id
       and rp.transaction_type='expense'
       and rp.category_id is not null
       and exists(
         select 1
         from finance.category_tree ct
         where ct.user_id=v_user_id
           and ct.id=rp.category_id
           and a.category_id=any(ct.id_path)
       )
      left join finance.recurring_transaction_links l
        on l.user_id=v_user_id
       and l.recurring_pattern_id=rp.id
      left join finance.activity_transactions act
        on act.user_id=l.user_id
       and act.transaction_id=l.transaction_id
       and act.status='posted'
       and act.financial_effect
       and act.occurred_at>=v_period_start
       and act.occurred_at<v_as_of
      group by a.allocation_id
    ),
    calc as (
      select
        a.*,
        a.planned_minor+a.carry_in_minor as effective_planned_minor,
        greatest(
          a.spent_minor-coalesce(r.recurring_actual_minor,0),
          0
        )::bigint as variable_spent_minor,
        coalesce(r.recurring_actual_minor,0)::bigint
          as recurring_spent_minor,
        coalesce(e.future_recurring_minor,0)::bigint
          as future_recurring_minor
      from allocation_base a
      left join recurring_actual_by_allocation r
        on r.allocation_id=a.allocation_id
      left join expected_by_allocation e
        on e.allocation_id=a.allocation_id
    ),
    projected as (
      select
        c.*,
        case
          when v_elapsed_ratio>0 then
            greatest(
              c.variable_spent_minor,
              round(c.variable_spent_minor/v_elapsed_ratio)::bigint
            )
          else c.variable_spent_minor
        end
        +c.recurring_spent_minor+c.future_recurring_minor
          as projected_spend_minor
      from calc c
    )
    select
      coalesce(sum(planned_minor),0)::bigint,
      coalesce(sum(carry_in_minor),0)::bigint,
      coalesce(sum(effective_planned_minor),0)::bigint,
      coalesce(sum(spent_minor),0)::bigint,
      coalesce(jsonb_agg(jsonb_build_object(
        'allocation_id',allocation_id,
        'category_id',category_id,
        'category_name',category_name,
        'category_path',to_jsonb(name_path),
        'planned_minor',planned_minor,
        'rollover',rollover,
        'carry_in_minor',carry_in_minor,
        'effective_planned_minor',effective_planned_minor,
        'spent_minor',spent_minor,
        'remaining_minor',effective_planned_minor-spent_minor,
        'utilization_ratio',case
          when effective_planned_minor<>0
            then spent_minor::numeric/effective_planned_minor::numeric
          else null
        end,
        'projected_spend_minor',projected_spend_minor,
        'future_recurring_minor',future_recurring_minor,
        'status',case
          when spent_minor>effective_planned_minor then 'over'
          when projected_spend_minor>effective_planned_minor then 'at_risk'
          when effective_planned_minor=0 and spent_minor=0 then 'empty'
          when effective_planned_minor<>0
           and spent_minor::numeric/effective_planned_minor::numeric
             <=v_elapsed_ratio+0.08 then 'on_track'
          else 'watch'
        end
      ) order by
        case
          when spent_minor>effective_planned_minor then 1
          when projected_spend_minor>effective_planned_minor then 2
          else 3
        end,
        effective_planned_minor desc,
        category_name),'[]'::jsonb)
    into
      v_base_planned,v_carry_in,v_effective_planned,
      v_allocated_spend,v_allocations
    from projected;

    v_unallocated_spend:=greatest(
      v_actual_spend-v_allocated_spend,
      0
    );
    v_budget_remaining:=v_effective_planned-v_allocated_spend;

    if v_elapsed_ratio>0 then
      v_projected_variable:=greatest(
        v_variable_actual,
        round(v_variable_actual/v_elapsed_ratio)::bigint
      );
    else
      v_projected_variable:=v_variable_actual;
    end if;

    v_projected_spend:=
      v_projected_variable
      +v_recurring_actual
      +v_future_recurring_expense;

    if v_effective_planned<>0 then
      v_pace_ratio:=v_projected_spend::numeric
        /v_effective_planned::numeric;
    end if;

    with movement_totals as (
      select
        g.id as goal_id,
        coalesce(sum(
          case gc.movement_kind
            when 'withdrawal' then -gc.amount_minor
            else gc.amount_minor
          end
        ),0)::bigint as funded_minor,
        coalesce(sum(gc.amount_minor) filter(
          where gc.movement_kind='contribution'
            and gc.occurred_at>=v_period_start
            and gc.occurred_at<v_as_of
        ),0)::bigint as period_contributed_minor
      from finance.goals g
      left join finance.goal_contributions gc
        on gc.goal_id=g.id
       and gc.user_id=g.user_id
       and gc.occurred_at<v_as_of
      where g.user_id=v_user_id
      group by g.id
    ),
    goal_calc as (
      select
        g.id as goal_id,
        g.name,
        g.kind::text as kind,
        g.target_minor,
        g.currency_code,
        g.target_date,
        g.linked_account_id,
        a.name as linked_account_name,
        g.planned_contribution_minor,
        g.note,
        g.status::text as status,
        coalesce(m.funded_minor,0)::bigint as funded_minor,
        coalesce(m.period_contributed_minor,0)::bigint
          as period_contributed_minor,
        greatest(g.target_minor-coalesce(m.funded_minor,0),0)::bigint
          as remaining_minor,
        case
          when g.target_date is not null
           and g.target_date>v_anchor
           and g.target_minor>coalesce(m.funded_minor,0)
          then ceil(
            greatest(g.target_minor-coalesce(m.funded_minor,0),0)::numeric
            /greatest(
              1::numeric,
              ceil((g.target_date-v_anchor)::numeric/30.4375)
            )
          )::bigint
          else 0::bigint
        end as required_monthly_minor
      from finance.goals g
      left join movement_totals m on m.goal_id=g.id
      left join finance.accounts a
        on a.id=g.linked_account_id and a.user_id=g.user_id
      where g.user_id=v_user_id
    ),
    target_calc as (
      select
        gc.*,
        case
          when gc.status<>'active' then 0::bigint
          else least(
            gc.remaining_minor,
            case v_period_kind
              when 'weekly' then round(
                coalesce(
                  gc.planned_contribution_minor,
                  gc.required_monthly_minor,
                  0
                )::numeric*12/52
              )::bigint
              when 'monthly' then coalesce(
                gc.planned_contribution_minor,
                gc.required_monthly_minor,
                0
              )::bigint
              when 'quarterly' then coalesce(
                gc.planned_contribution_minor,
                gc.required_monthly_minor,
                0
              )::bigint*3
              when 'yearly' then coalesce(
                gc.planned_contribution_minor,
                gc.required_monthly_minor,
                0
              )::bigint*12
              else round(
                coalesce(
                  gc.planned_contribution_minor,
                  gc.required_monthly_minor,
                  0
                )::numeric
                *v_period_days::numeric/30.4375
              )::bigint
            end
          )
        end as period_target_minor
      from goal_calc gc
    ),
    final_goal as (
      select
        tc.*,
        greatest(
          tc.period_target_minor-tc.period_contributed_minor,
          0
        )::bigint as period_remaining_minor,
        case
          when tc.funded_minor>=tc.target_minor then 'funded'
          when tc.status<>'active' then tc.status
          when tc.target_date is not null
           and tc.target_date<v_anchor then 'overdue'
          when tc.target_date is not null
           and coalesce(tc.planned_contribution_minor,tc.required_monthly_minor,0)
             <tc.required_monthly_minor then 'needs_more'
          when tc.target_date is null
           and tc.planned_contribution_minor is null then 'no_schedule'
          else 'on_track'
        end as health
      from target_calc tc
    )
    select
      coalesce(sum(period_target_minor) filter(
        where status='active'
      ),0)::bigint,
      coalesce(sum(period_contributed_minor) filter(
        where status='active'
      ),0)::bigint,
      coalesce(sum(period_remaining_minor) filter(
        where status='active'
      ),0)::bigint,
      coalesce(jsonb_agg(jsonb_build_object(
        'goal_id',goal_id,
        'name',name,
        'kind',kind,
        'target_minor',target_minor,
        'currency_code',currency_code,
        'target_date',target_date,
        'linked_account_id',linked_account_id,
        'linked_account_name',linked_account_name,
        'planned_contribution_minor',planned_contribution_minor,
        'required_monthly_minor',required_monthly_minor,
        'period_target_minor',period_target_minor,
        'period_contributed_minor',period_contributed_minor,
        'period_remaining_minor',period_remaining_minor,
        'funded_minor',funded_minor,
        'remaining_minor',remaining_minor,
        'progress_ratio',least(
          1::numeric,
          funded_minor::numeric/greatest(target_minor,1)::numeric
        ),
        'status',status,
        'health',health,
        'note',note
      ) order by
        case health
          when 'overdue' then 1
          when 'needs_more' then 2
          when 'on_track' then 3
          when 'no_schedule' then 4
          when 'funded' then 5
          else 6
        end,
        target_date nulls last,
        name),'[]'::jsonb)
    into
      v_goal_period_target,
      v_goal_period_contributed,
      v_goal_funding_remaining,
      v_goals
    from final_goal;

    v_resource_plan:=coalesce(
      v_planned_income,
      nullif(v_effective_planned,0),
      0
    );

    v_safe_to_spend:=
      v_resource_plan
      -v_actual_spend
      -v_future_recurring_expense
      -v_goal_funding_remaining;

    v_unallocated_plan:=
      v_resource_plan
      -v_base_planned
      -v_goal_period_target;

    v_projected_surplus:=
      v_resource_plan
      +v_future_recurring_income
      -v_projected_spend
      -v_goal_funding_remaining;

    v_budget_status:=case
      when v_allocated_spend>v_effective_planned
        and v_effective_planned>0 then 'over'
      when v_projected_spend>v_resource_plan
        and v_resource_plan>0 then 'at_risk'
      when v_safe_to_spend<0 then 'at_risk'
      when v_effective_planned=0 then 'needs_allocations'
      when v_unallocated_plan<0 then 'overplanned'
      else 'on_track'
    end;

    with bounds as (
      select
        case when v_period_days<=62
          then interval '1 day'
          else interval '1 week'
        end as step
    ),
    buckets as (
      select
        row_number() over(order by gs)::integer as bucket_index,
        gs as bucket_start,
        least(gs+b.step,v_period_end) as bucket_end
      from bounds b
      cross join lateral generate_series(
        v_period_start,
        v_period_end-interval '1 microsecond',
        b.step
      ) gs
    ),
    actual_by_bucket as (
      select
        b.bucket_index,
        coalesce(sum(le.reporting_amount_minor),0)::bigint as spend_minor
      from buckets b
      left join finance.transactions t
        on t.user_id=v_user_id
       and t.status='posted'
       and t.type in ('expense','refund','reimbursement')
       and t.occurred_at>=b.bucket_start
       and t.occurred_at<least(b.bucket_end,v_as_of)
      left join finance.ledger_entries le
        on le.transaction_id=t.id
       and le.user_id=t.user_id
       and le.entry_kind='category'
      group by b.bucket_index
    ),
    actual_cumulative as (
      select
        bucket_index,
        sum(spend_minor) over(order by bucket_index)::bigint
          as actual_cumulative_minor
      from actual_by_bucket
    ),
    future_recurring_by_bucket as (
      select
        b.bucket_index,
        coalesce(sum((x->>'amount_minor')::bigint) filter(
          where x->>'transaction_type'='expense'
            and (x->>'expected_at')::timestamptz<b.bucket_end
        ),0)::bigint as recurring_cumulative_minor
      from buckets b
      left join lateral jsonb_array_elements(v_commitments) x on true
      group by b.bucket_index
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'bucket_index',b.bucket_index,
      'bucket_start',b.bucket_start,
      'bucket_end',b.bucket_end,
      'actual_cumulative_minor',case
        when b.bucket_start<v_as_of
          then a.actual_cumulative_minor
        else null
      end,
      'forecast_cumulative_minor',case
        when b.bucket_end<=v_as_of
          then a.actual_cumulative_minor
        else
          v_actual_spend
          +round(
            case
              when extract(epoch from (v_as_of-v_period_start))>0
                then v_variable_actual::numeric
                  /extract(epoch from (v_as_of-v_period_start))
                  *greatest(
                    extract(epoch from (
                      least(b.bucket_end,v_period_end)-v_as_of
                    )),
                    0
                  )
              else 0
            end
          )::bigint
          +fr.recurring_cumulative_minor
      end,
      'planned_cumulative_minor',round(
        v_effective_planned::numeric
        *greatest(
          0::numeric,
          least(
            1::numeric,
            extract(epoch from (b.bucket_end-v_period_start))
            /greatest(extract(epoch from (v_period_end-v_period_start)),1)
          )
        )
      )::bigint
    ) order by b.bucket_index),'[]'::jsonb)
    into v_forecast
    from buckets b
    left join actual_cumulative a on a.bucket_index=b.bucket_index
    left join future_recurring_by_bucket fr
      on fr.bucket_index=b.bucket_index;
  else
    with movement_totals as (
      select
        g.id as goal_id,
        coalesce(sum(
          case gc.movement_kind
            when 'withdrawal' then -gc.amount_minor
            else gc.amount_minor
          end
        ),0)::bigint as funded_minor
      from finance.goals g
      left join finance.goal_contributions gc
        on gc.goal_id=g.id
       and gc.user_id=g.user_id
       and gc.occurred_at<v_as_of
      where g.user_id=v_user_id
      group by g.id
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'goal_id',g.id,
      'name',g.name,
      'kind',g.kind,
      'target_minor',g.target_minor,
      'currency_code',g.currency_code,
      'target_date',g.target_date,
      'linked_account_id',g.linked_account_id,
      'linked_account_name',a.name,
      'planned_contribution_minor',g.planned_contribution_minor,
      'required_monthly_minor',case
        when g.target_date is not null
         and g.target_date>v_anchor
         and g.target_minor>coalesce(m.funded_minor,0)
        then ceil(
          greatest(g.target_minor-coalesce(m.funded_minor,0),0)::numeric
          /greatest(
            1::numeric,
            ceil((g.target_date-v_anchor)::numeric/30.4375)
          )
        )::bigint
        else 0
      end,
      'period_target_minor',0,
      'period_contributed_minor',0,
      'period_remaining_minor',0,
      'funded_minor',coalesce(m.funded_minor,0),
      'remaining_minor',greatest(
        g.target_minor-coalesce(m.funded_minor,0),0
      ),
      'progress_ratio',least(
        1::numeric,
        coalesce(m.funded_minor,0)::numeric
          /greatest(g.target_minor,1)::numeric
      ),
      'status',g.status,
      'health',case
        when coalesce(m.funded_minor,0)>=g.target_minor then 'funded'
        when g.status<>'active' then g.status::text
        when g.target_date is not null and g.target_date<v_anchor then 'overdue'
        when g.target_date is null
         and g.planned_contribution_minor is null then 'no_schedule'
        else 'on_track'
      end,
      'note',g.note
    ) order by g.target_date nulls last,g.name),'[]'::jsonb)
    into v_goals
    from finance.goals g
    left join movement_totals m on m.goal_id=g.id
    left join finance.accounts a
      on a.id=g.linked_account_id and a.user_id=g.user_id
    where g.user_id=v_user_id;
  end if;

  return jsonb_build_object(
    'profile',jsonb_build_object(
      'currency_code',v_currency,
      'locale',v_locale,
      'time_zone',v_time_zone
    ),
    'anchor_date',v_anchor,
    'budget',jsonb_build_object(
      'configured',v_period_id is not null,
      'budget_id',v_budget_id,
      'budget_name',v_budget_name,
      'period_kind',v_period_kind,
      'period_id',v_period_id,
      'starts_on',v_starts_on,
      'ends_on',v_ends_on,
      'planned_income_minor',v_planned_income,
      'actual_income_minor',v_income,
      'base_planned_minor',case
        when v_period_id is null then null else v_base_planned end,
      'carry_in_minor',case
        when v_period_id is null then null else v_carry_in end,
      'effective_planned_minor',case
        when v_period_id is null then null else v_effective_planned end,
      'actual_spend_minor',case
        when v_period_id is null then null else v_actual_spend end,
      'allocated_spend_minor',case
        when v_period_id is null then null else v_allocated_spend end,
      'unallocated_spend_minor',case
        when v_period_id is null then null else v_unallocated_spend end,
      'remaining_minor',case
        when v_period_id is null then null else v_budget_remaining end,
      'elapsed_ratio',case
        when v_period_id is null then null else v_elapsed_ratio end,
      'pace_ratio',v_pace_ratio,
      'projected_spend_minor',case
        when v_period_id is null then null else v_projected_spend end,
      'future_recurring_expense_minor',case
        when v_period_id is null then null else v_future_recurring_expense end,
      'future_recurring_income_minor',case
        when v_period_id is null then null else v_future_recurring_income end,
      'goal_period_target_minor',case
        when v_period_id is null then null else v_goal_period_target end,
      'goal_period_contributed_minor',case
        when v_period_id is null then null else v_goal_period_contributed end,
      'goal_funding_remaining_minor',case
        when v_period_id is null then null else v_goal_funding_remaining end,
      'safe_to_spend_minor',case
        when v_period_id is null then null else v_safe_to_spend end,
      'unallocated_plan_minor',case
        when v_period_id is null then null else v_unallocated_plan end,
      'projected_surplus_minor',case
        when v_period_id is null then null else v_projected_surplus end,
      'status',v_budget_status
    ),
    'allocations',v_allocations,
    'goals',v_goals,
    'forecast',v_forecast,
    'commitments',v_commitments
  );
end;
$function$;

CREATE OR REPLACE FUNCTION finance.set_goal_status(p_goal_id uuid, p_status finance.goal_status)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null then
    raise exception using errcode='42501',message='authentication required';
  end if;

  update finance.goals
  set status=p_status
  where id=p_goal_id and user_id=auth.uid();

  if not found then
    raise exception using errcode='23503',message='goal not found';
  end if;

  return jsonb_build_object(
    'goal_id',p_goal_id,
    'status',p_status
  );
end;
$function$;

CREATE OR REPLACE FUNCTION finance.upsert_budget(p_budget_id uuid, p_name text, p_period_kind finance.budget_period_kind DEFAULT 'monthly'::finance.budget_period_kind, p_is_active boolean DEFAULT true)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid:=auth.uid();
  v_id uuid:=coalesce(p_budget_id,gen_random_uuid());
  v_name text:=nullif(btrim(p_name),'');
begin
  if v_user_id is null then
    raise exception using errcode='42501',message='authentication required';
  end if;
  if v_name is null then
    raise exception using errcode='23514',message='budget name is required';
  end if;

  if p_is_active then
    update finance.budgets
    set is_active=false
    where user_id=v_user_id
      and is_active
      and id<>v_id;
  end if;

  if p_budget_id is null then
    insert into finance.budgets(
      id,user_id,name,period_kind,is_active
    ) values(
      v_id,v_user_id,v_name,p_period_kind,p_is_active
    );
  else
    update finance.budgets
    set name=v_name,
        period_kind=p_period_kind,
        is_active=p_is_active
    where id=p_budget_id and user_id=v_user_id;

    if not found then
      raise exception using errcode='23503',message='budget not found';
    end if;
  end if;

  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION finance.upsert_budget_allocation(p_allocation_id uuid, p_budget_period_id uuid, p_category_id uuid, p_planned_minor bigint, p_rollover boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid:=auth.uid();
  v_id uuid:=coalesce(p_allocation_id,gen_random_uuid());
  v_category_path uuid[];
begin
  if v_user_id is null then
    raise exception using errcode='42501',message='authentication required';
  end if;
  if p_planned_minor is null or p_planned_minor<0 then
    raise exception using errcode='23514',message='planned amount cannot be negative';
  end if;
  if not exists(
    select 1 from finance.budget_periods
    where id=p_budget_period_id and user_id=v_user_id
  ) then
    raise exception using errcode='23503',message='budget period not found';
  end if;

  select id_path
  into v_category_path
  from finance.category_tree
  where id=p_category_id
    and user_id=v_user_id
    and not is_archived
    and kind in ('expense','both');

  if v_category_path is null then
    raise exception using errcode='23503',
      message='expense budget category not found';
  end if;

  if exists(
    select 1
    from finance.budget_allocations ba
    join finance.category_tree existing
      on existing.id=ba.category_id
     and existing.user_id=ba.user_id
    where ba.user_id=v_user_id
      and ba.budget_period_id=p_budget_period_id
      and ba.id<>v_id
      and (
        ba.category_id=any(v_category_path)
        or p_category_id=any(existing.id_path)
      )
  ) then
    raise exception using errcode='23514',
      message='budget allocation categories cannot overlap by ancestry';
  end if;

  if p_allocation_id is null then
    insert into finance.budget_allocations(
      id,user_id,budget_period_id,category_id,planned_minor,rollover
    ) values(
      v_id,v_user_id,p_budget_period_id,p_category_id,p_planned_minor,p_rollover
    )
    on conflict(budget_period_id,category_id)
    do update set
      planned_minor=excluded.planned_minor,
      rollover=excluded.rollover
    returning id into v_id;
  else
    update finance.budget_allocations
    set category_id=p_category_id,
        planned_minor=p_planned_minor,
        rollover=p_rollover
    where id=p_allocation_id
      and user_id=v_user_id
      and budget_period_id=p_budget_period_id;

    if not found then
      raise exception using errcode='23503',message='budget allocation not found';
    end if;
  end if;

  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION finance.upsert_budget_period(p_period_id uuid, p_budget_id uuid, p_starts_on date, p_ends_on date, p_planned_income_minor bigint DEFAULT NULL::bigint, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid:=auth.uid();
  v_id uuid:=coalesce(p_period_id,gen_random_uuid());
begin
  if v_user_id is null then
    raise exception using errcode='42501',message='authentication required';
  end if;
  if p_starts_on is null or p_ends_on is null or p_ends_on<p_starts_on then
    raise exception using errcode='23514',message='invalid budget period dates';
  end if;
  if p_planned_income_minor is not null and p_planned_income_minor<0 then
    raise exception using errcode='23514',message='planned income cannot be negative';
  end if;
  if not exists(
    select 1 from finance.budgets
    where id=p_budget_id and user_id=v_user_id
  ) then
    raise exception using errcode='23503',message='budget not found';
  end if;
  if exists(
    select 1
    from finance.budget_periods bp
    where bp.user_id=v_user_id
      and bp.budget_id=p_budget_id
      and bp.id<>v_id
      and daterange(bp.starts_on,bp.ends_on,'[]')
          && daterange(p_starts_on,p_ends_on,'[]')
  ) then
    raise exception using errcode='23514',
      message='budget periods cannot overlap';
  end if;

  if p_period_id is null then
    insert into finance.budget_periods(
      id,user_id,budget_id,starts_on,ends_on,
      planned_income_minor,notes
    ) values(
      v_id,v_user_id,p_budget_id,p_starts_on,p_ends_on,
      p_planned_income_minor,p_notes
    );
  else
    update finance.budget_periods
    set starts_on=p_starts_on,
        ends_on=p_ends_on,
        planned_income_minor=p_planned_income_minor,
        notes=p_notes
    where id=p_period_id and user_id=v_user_id
      and budget_id=p_budget_id;

    if not found then
      raise exception using errcode='23503',message='budget period not found';
    end if;
  end if;

  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION finance.upsert_goal(p_goal_id uuid, p_name text, p_kind finance.goal_kind DEFAULT 'savings'::finance.goal_kind, p_target_minor bigint DEFAULT NULL::bigint, p_currency_code text DEFAULT 'EUR'::text, p_target_date date DEFAULT NULL::date, p_linked_account_id uuid DEFAULT NULL::uuid, p_planned_contribution_minor bigint DEFAULT NULL::bigint, p_note text DEFAULT NULL::text, p_status finance.goal_status DEFAULT 'active'::finance.goal_status)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid:=auth.uid();
  v_id uuid:=coalesce(p_goal_id,gen_random_uuid());
  v_name text:=nullif(btrim(p_name),'');
  v_currency text:=upper(btrim(coalesce(p_currency_code,'')));
begin
  if v_user_id is null then
    raise exception using errcode='42501',message='authentication required';
  end if;
  if v_name is null then
    raise exception using errcode='23514',message='goal name is required';
  end if;
  if p_target_minor is null or p_target_minor<=0 then
    raise exception using errcode='23514',message='goal target must be positive';
  end if;
  if v_currency !~ '^[A-Z]{3}$' then
    raise exception using errcode='23514',message='invalid goal currency code';
  end if;
  if p_planned_contribution_minor is not null
    and p_planned_contribution_minor<0 then
    raise exception using errcode='23514',
      message='planned contribution cannot be negative';
  end if;
  if p_linked_account_id is not null and not exists(
    select 1 from finance.accounts
    where id=p_linked_account_id
      and user_id=v_user_id
      and not is_archived
  ) then
    raise exception using errcode='23503',message='linked account not found';
  end if;

  if p_goal_id is null then
    insert into finance.goals(
      id,user_id,name,kind,target_minor,currency_code,target_date,
      linked_account_id,planned_contribution_minor,note,status
    ) values(
      v_id,v_user_id,v_name,p_kind,p_target_minor,v_currency,p_target_date,
      p_linked_account_id,p_planned_contribution_minor,p_note,p_status
    );
  else
    update finance.goals
    set name=v_name,
        kind=p_kind,
        target_minor=p_target_minor,
        currency_code=v_currency,
        target_date=p_target_date,
        linked_account_id=p_linked_account_id,
        planned_contribution_minor=p_planned_contribution_minor,
        note=p_note,
        status=p_status
    where id=p_goal_id and user_id=v_user_id;

    if not found then
      raise exception using errcode='23503',message='goal not found';
    end if;
  end if;

  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.finance_add_goal_movement(p_goal_id uuid, p_amount_minor bigint, p_movement_kind finance.goal_movement_kind DEFAULT 'contribution'::finance.goal_movement_kind, p_occurred_at timestamp with time zone DEFAULT now(), p_transaction_id uuid DEFAULT NULL::uuid, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select finance.add_goal_movement(
    p_goal_id,p_amount_minor,p_movement_kind,p_occurred_at,
    p_transaction_id,p_note
  );
$function$;

CREATE OR REPLACE FUNCTION public.finance_delete_budget_allocation(p_allocation_id uuid)
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select finance.delete_budget_allocation(p_allocation_id);
$function$;

CREATE OR REPLACE FUNCTION public.finance_ensure_budget_period(p_budget_id uuid, p_anchor_date date DEFAULT CURRENT_DATE, p_planned_income_minor bigint DEFAULT NULL::bigint)
 RETURNS uuid
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select finance.ensure_budget_period(
    p_budget_id,p_anchor_date,p_planned_income_minor
  );
$function$;

CREATE OR REPLACE FUNCTION public.finance_get_planning_dashboard(p_anchor_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select finance.get_planning_dashboard(p_anchor_date);
$function$;

CREATE OR REPLACE FUNCTION public.finance_set_goal_status(p_goal_id uuid, p_status finance.goal_status)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select finance.set_goal_status(p_goal_id,p_status);
$function$;

CREATE OR REPLACE FUNCTION public.finance_upsert_budget(p_budget_id uuid DEFAULT NULL::uuid, p_name text DEFAULT 'Monthly plan'::text, p_period_kind finance.budget_period_kind DEFAULT 'monthly'::finance.budget_period_kind, p_is_active boolean DEFAULT true)
 RETURNS uuid
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select finance.upsert_budget(
    p_budget_id,p_name,p_period_kind,p_is_active
  );
$function$;

CREATE OR REPLACE FUNCTION public.finance_upsert_budget_allocation(p_allocation_id uuid DEFAULT NULL::uuid, p_budget_period_id uuid DEFAULT NULL::uuid, p_category_id uuid DEFAULT NULL::uuid, p_planned_minor bigint DEFAULT 0, p_rollover boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select finance.upsert_budget_allocation(
    p_allocation_id,p_budget_period_id,p_category_id,
    p_planned_minor,p_rollover
  );
$function$;

CREATE OR REPLACE FUNCTION public.finance_upsert_budget_period(p_period_id uuid DEFAULT NULL::uuid, p_budget_id uuid DEFAULT NULL::uuid, p_starts_on date DEFAULT NULL::date, p_ends_on date DEFAULT NULL::date, p_planned_income_minor bigint DEFAULT NULL::bigint, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select finance.upsert_budget_period(
    p_period_id,p_budget_id,p_starts_on,p_ends_on,
    p_planned_income_minor,p_notes
  );
$function$;

CREATE OR REPLACE FUNCTION public.finance_upsert_goal(p_goal_id uuid DEFAULT NULL::uuid, p_name text DEFAULT NULL::text, p_kind finance.goal_kind DEFAULT 'savings'::finance.goal_kind, p_target_minor bigint DEFAULT NULL::bigint, p_currency_code text DEFAULT 'EUR'::text, p_target_date date DEFAULT NULL::date, p_linked_account_id uuid DEFAULT NULL::uuid, p_planned_contribution_minor bigint DEFAULT NULL::bigint, p_note text DEFAULT NULL::text, p_status finance.goal_status DEFAULT 'active'::finance.goal_status)
 RETURNS uuid
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select finance.upsert_goal(
    p_goal_id,p_name,p_kind,p_target_minor,p_currency_code,p_target_date,
    p_linked_account_id,p_planned_contribution_minor,p_note,p_status
  );
$function$;

alter function finance.add_goal_movement(p_goal_id uuid, p_amount_minor bigint, p_movement_kind finance.goal_movement_kind, p_occurred_at timestamp with time zone, p_transaction_id uuid, p_note text) security invoker;
revoke all on function finance.add_goal_movement(p_goal_id uuid, p_amount_minor bigint, p_movement_kind finance.goal_movement_kind, p_occurred_at timestamp with time zone, p_transaction_id uuid, p_note text) from public,anon;
grant execute on function finance.add_goal_movement(p_goal_id uuid, p_amount_minor bigint, p_movement_kind finance.goal_movement_kind, p_occurred_at timestamp with time zone, p_transaction_id uuid, p_note text) to authenticated,service_role;

alter function finance.budget_rollover_balance(p_budget_id uuid, p_period_id uuid, p_category_id uuid) security invoker;
revoke all on function finance.budget_rollover_balance(p_budget_id uuid, p_period_id uuid, p_category_id uuid) from public,anon;
grant execute on function finance.budget_rollover_balance(p_budget_id uuid, p_period_id uuid, p_category_id uuid) to authenticated,service_role;

alter function finance.category_period_spend(p_category_id uuid, p_start timestamp with time zone, p_end timestamp with time zone) security invoker;
revoke all on function finance.category_period_spend(p_category_id uuid, p_start timestamp with time zone, p_end timestamp with time zone) from public,anon;
grant execute on function finance.category_period_spend(p_category_id uuid, p_start timestamp with time zone, p_end timestamp with time zone) to authenticated,service_role;

alter function finance.delete_budget_allocation(p_allocation_id uuid) security invoker;
revoke all on function finance.delete_budget_allocation(p_allocation_id uuid) from public,anon;
grant execute on function finance.delete_budget_allocation(p_allocation_id uuid) to authenticated,service_role;

alter function finance.ensure_budget_period(p_budget_id uuid, p_anchor_date date, p_planned_income_minor bigint) security invoker;
revoke all on function finance.ensure_budget_period(p_budget_id uuid, p_anchor_date date, p_planned_income_minor bigint) from public,anon;
grant execute on function finance.ensure_budget_period(p_budget_id uuid, p_anchor_date date, p_planned_income_minor bigint) to authenticated,service_role;

alter function finance.get_planning_dashboard(p_anchor_date date) security invoker;
revoke all on function finance.get_planning_dashboard(p_anchor_date date) from public,anon;
grant execute on function finance.get_planning_dashboard(p_anchor_date date) to authenticated,service_role;

alter function finance.set_goal_status(p_goal_id uuid, p_status finance.goal_status) security invoker;
revoke all on function finance.set_goal_status(p_goal_id uuid, p_status finance.goal_status) from public,anon;
grant execute on function finance.set_goal_status(p_goal_id uuid, p_status finance.goal_status) to authenticated,service_role;

alter function finance.upsert_budget(p_budget_id uuid, p_name text, p_period_kind finance.budget_period_kind, p_is_active boolean) security invoker;
revoke all on function finance.upsert_budget(p_budget_id uuid, p_name text, p_period_kind finance.budget_period_kind, p_is_active boolean) from public,anon;
grant execute on function finance.upsert_budget(p_budget_id uuid, p_name text, p_period_kind finance.budget_period_kind, p_is_active boolean) to authenticated,service_role;

alter function finance.upsert_budget_allocation(p_allocation_id uuid, p_budget_period_id uuid, p_category_id uuid, p_planned_minor bigint, p_rollover boolean) security invoker;
revoke all on function finance.upsert_budget_allocation(p_allocation_id uuid, p_budget_period_id uuid, p_category_id uuid, p_planned_minor bigint, p_rollover boolean) from public,anon;
grant execute on function finance.upsert_budget_allocation(p_allocation_id uuid, p_budget_period_id uuid, p_category_id uuid, p_planned_minor bigint, p_rollover boolean) to authenticated,service_role;

alter function finance.upsert_budget_period(p_period_id uuid, p_budget_id uuid, p_starts_on date, p_ends_on date, p_planned_income_minor bigint, p_notes text) security invoker;
revoke all on function finance.upsert_budget_period(p_period_id uuid, p_budget_id uuid, p_starts_on date, p_ends_on date, p_planned_income_minor bigint, p_notes text) from public,anon;
grant execute on function finance.upsert_budget_period(p_period_id uuid, p_budget_id uuid, p_starts_on date, p_ends_on date, p_planned_income_minor bigint, p_notes text) to authenticated,service_role;

alter function finance.upsert_goal(p_goal_id uuid, p_name text, p_kind finance.goal_kind, p_target_minor bigint, p_currency_code text, p_target_date date, p_linked_account_id uuid, p_planned_contribution_minor bigint, p_note text, p_status finance.goal_status) security invoker;
revoke all on function finance.upsert_goal(p_goal_id uuid, p_name text, p_kind finance.goal_kind, p_target_minor bigint, p_currency_code text, p_target_date date, p_linked_account_id uuid, p_planned_contribution_minor bigint, p_note text, p_status finance.goal_status) from public,anon;
grant execute on function finance.upsert_goal(p_goal_id uuid, p_name text, p_kind finance.goal_kind, p_target_minor bigint, p_currency_code text, p_target_date date, p_linked_account_id uuid, p_planned_contribution_minor bigint, p_note text, p_status finance.goal_status) to authenticated,service_role;

alter function public.finance_add_goal_movement(p_goal_id uuid, p_amount_minor bigint, p_movement_kind finance.goal_movement_kind, p_occurred_at timestamp with time zone, p_transaction_id uuid, p_note text) security invoker;
revoke all on function public.finance_add_goal_movement(p_goal_id uuid, p_amount_minor bigint, p_movement_kind finance.goal_movement_kind, p_occurred_at timestamp with time zone, p_transaction_id uuid, p_note text) from public,anon;
grant execute on function public.finance_add_goal_movement(p_goal_id uuid, p_amount_minor bigint, p_movement_kind finance.goal_movement_kind, p_occurred_at timestamp with time zone, p_transaction_id uuid, p_note text) to authenticated,service_role;

alter function public.finance_delete_budget_allocation(p_allocation_id uuid) security invoker;
revoke all on function public.finance_delete_budget_allocation(p_allocation_id uuid) from public,anon;
grant execute on function public.finance_delete_budget_allocation(p_allocation_id uuid) to authenticated,service_role;

alter function public.finance_ensure_budget_period(p_budget_id uuid, p_anchor_date date, p_planned_income_minor bigint) security invoker;
revoke all on function public.finance_ensure_budget_period(p_budget_id uuid, p_anchor_date date, p_planned_income_minor bigint) from public,anon;
grant execute on function public.finance_ensure_budget_period(p_budget_id uuid, p_anchor_date date, p_planned_income_minor bigint) to authenticated,service_role;

alter function public.finance_get_planning_dashboard(p_anchor_date date) security invoker;
revoke all on function public.finance_get_planning_dashboard(p_anchor_date date) from public,anon;
grant execute on function public.finance_get_planning_dashboard(p_anchor_date date) to authenticated,service_role;

alter function public.finance_set_goal_status(p_goal_id uuid, p_status finance.goal_status) security invoker;
revoke all on function public.finance_set_goal_status(p_goal_id uuid, p_status finance.goal_status) from public,anon;
grant execute on function public.finance_set_goal_status(p_goal_id uuid, p_status finance.goal_status) to authenticated,service_role;

alter function public.finance_upsert_budget(p_budget_id uuid, p_name text, p_period_kind finance.budget_period_kind, p_is_active boolean) security invoker;
revoke all on function public.finance_upsert_budget(p_budget_id uuid, p_name text, p_period_kind finance.budget_period_kind, p_is_active boolean) from public,anon;
grant execute on function public.finance_upsert_budget(p_budget_id uuid, p_name text, p_period_kind finance.budget_period_kind, p_is_active boolean) to authenticated,service_role;

alter function public.finance_upsert_budget_allocation(p_allocation_id uuid, p_budget_period_id uuid, p_category_id uuid, p_planned_minor bigint, p_rollover boolean) security invoker;
revoke all on function public.finance_upsert_budget_allocation(p_allocation_id uuid, p_budget_period_id uuid, p_category_id uuid, p_planned_minor bigint, p_rollover boolean) from public,anon;
grant execute on function public.finance_upsert_budget_allocation(p_allocation_id uuid, p_budget_period_id uuid, p_category_id uuid, p_planned_minor bigint, p_rollover boolean) to authenticated,service_role;

alter function public.finance_upsert_budget_period(p_period_id uuid, p_budget_id uuid, p_starts_on date, p_ends_on date, p_planned_income_minor bigint, p_notes text) security invoker;
revoke all on function public.finance_upsert_budget_period(p_period_id uuid, p_budget_id uuid, p_starts_on date, p_ends_on date, p_planned_income_minor bigint, p_notes text) from public,anon;
grant execute on function public.finance_upsert_budget_period(p_period_id uuid, p_budget_id uuid, p_starts_on date, p_ends_on date, p_planned_income_minor bigint, p_notes text) to authenticated,service_role;

alter function public.finance_upsert_goal(p_goal_id uuid, p_name text, p_kind finance.goal_kind, p_target_minor bigint, p_currency_code text, p_target_date date, p_linked_account_id uuid, p_planned_contribution_minor bigint, p_note text, p_status finance.goal_status) security invoker;
revoke all on function public.finance_upsert_goal(p_goal_id uuid, p_name text, p_kind finance.goal_kind, p_target_minor bigint, p_currency_code text, p_target_date date, p_linked_account_id uuid, p_planned_contribution_minor bigint, p_note text, p_status finance.goal_status) from public,anon;
grant execute on function public.finance_upsert_goal(p_goal_id uuid, p_name text, p_kind finance.goal_kind, p_target_minor bigint, p_currency_code text, p_target_date date, p_linked_account_id uuid, p_planned_contribution_minor bigint, p_note text, p_status finance.goal_status) to authenticated,service_role;