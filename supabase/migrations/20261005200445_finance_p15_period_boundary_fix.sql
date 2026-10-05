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
      v_end:=(v_start+interval '1 month'-interval '1 day')::date;
    when 'quarterly' then
      v_start:=date_trunc('quarter',p_anchor_date::timestamp)::date;
      v_end:=(v_start+interval '3 months'-interval '1 day')::date;
    when 'yearly' then
      v_start:=date_trunc('year',p_anchor_date::timestamp)::date;
      v_end:=(v_start+interval '1 year'-interval '1 day')::date;
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
alter function finance.ensure_budget_period(uuid,date,bigint) security invoker;
revoke all on function finance.ensure_budget_period(uuid,date,bigint) from public,anon;
grant execute on function finance.ensure_budget_period(uuid,date,bigint) to authenticated,service_role;
