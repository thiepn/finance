
create or replace function finance.get_overview_dashboard_period(
  p_period_kind text default 'month',
  p_anchor_date date default null,
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
  v_time_zone text := 'Europe/Berlin';
  v_kind text := lower(btrim(coalesce(p_period_kind,'month')));
  v_anchor date;
  v_start_date date;
  v_end_date date;
  v_compare_start_date date;
  v_compare_end_date date;
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_compare_start timestamptz;
  v_compare_end timestamptz;
begin
  if v_user_id is null then
    raise exception using errcode='42501',message='authentication required';
  end if;

  select coalesce(p.time_zone,'Europe/Berlin')
  into v_time_zone
  from finance.profiles p
  where p.user_id=v_user_id;

  v_anchor := coalesce(
    p_anchor_date,
    (coalesce(p_as_of,now()) at time zone v_time_zone)::date
  );

  if v_kind='week' then
    v_start_date := date_trunc('week',v_anchor::timestamp)::date;
    v_end_date := v_start_date+7;
    v_compare_end_date := v_start_date;
    v_compare_start_date := v_compare_end_date-7;
  elsif v_kind='month' then
    v_start_date := date_trunc('month',v_anchor::timestamp)::date;
    v_end_date := (v_start_date+interval '1 month')::date;
    v_compare_end_date := v_start_date;
    v_compare_start_date := (v_compare_end_date-interval '1 month')::date;
  elsif v_kind='quarter' then
    v_start_date := date_trunc('quarter',v_anchor::timestamp)::date;
    v_end_date := (v_start_date+interval '3 months')::date;
    v_compare_end_date := v_start_date;
    v_compare_start_date := (v_compare_end_date-interval '3 months')::date;
  elsif v_kind='year' then
    v_start_date := date_trunc('year',v_anchor::timestamp)::date;
    v_end_date := (v_start_date+interval '1 year')::date;
    v_compare_end_date := v_start_date;
    v_compare_start_date := (v_compare_end_date-interval '1 year')::date;
  else
    raise exception using errcode='23514',
      message='overview period kind must be week, month, quarter, or year';
  end if;

  v_period_start := v_start_date::timestamp at time zone v_time_zone;
  v_period_end := v_end_date::timestamp at time zone v_time_zone;
  v_compare_start := v_compare_start_date::timestamp at time zone v_time_zone;
  v_compare_end := v_compare_end_date::timestamp at time zone v_time_zone;

  return finance.get_overview_dashboard(
    v_period_start,
    v_period_end,
    v_compare_start,
    v_compare_end,
    coalesce(p_as_of,now()),
    p_recent_limit
  ) || jsonb_build_object(
    'period_kind',v_kind,
    'anchor_date',v_anchor
  );
end;
$$;

revoke all on function finance.get_overview_dashboard_period(
  text,date,timestamptz,integer
) from public,anon;
grant execute on function finance.get_overview_dashboard_period(
  text,date,timestamptz,integer
) to authenticated,service_role;

create or replace function public.finance_get_overview_dashboard_period(
  p_period_kind text default 'month',
  p_anchor_date date default null,
  p_as_of timestamptz default now(),
  p_recent_limit integer default 6
)
returns jsonb
language sql
stable
security invoker
set search_path=''
as $$
  select finance.get_overview_dashboard_period(
    p_period_kind,p_anchor_date,p_as_of,p_recent_limit
  );
$$;

revoke all on function public.finance_get_overview_dashboard_period(
  text,date,timestamptz,integer
) from public,anon;
grant execute on function public.finance_get_overview_dashboard_period(
  text,date,timestamptz,integer
) to authenticated,service_role;
