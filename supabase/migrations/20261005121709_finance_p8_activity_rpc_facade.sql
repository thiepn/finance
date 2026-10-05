
create or replace function public.finance_search_activity(
  p_filters jsonb default '{}'::jsonb,
  p_limit integer default 50,
  p_cursor jsonb default null
)
returns jsonb
language sql
stable
security invoker
set search_path=''
as $$
  select finance.search_activity(p_filters,p_limit,p_cursor);
$$;

create or replace function public.finance_get_activity_filter_catalog(
  p_product_query text default null,
  p_product_limit integer default 50
)
returns jsonb
language sql
stable
security invoker
set search_path=''
as $$
  select finance.get_activity_filter_catalog(p_product_query,p_product_limit);
$$;

create or replace function public.finance_get_activity_detail(
  p_entity_kind text,
  p_entity_id uuid
)
returns jsonb
language sql
stable
security invoker
set search_path=''
as $$
  select finance.get_activity_detail(p_entity_kind,p_entity_id);
$$;

do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname in (
        'finance_search_activity',
        'finance_get_activity_filter_catalog',
        'finance_get_activity_detail'
      )
  loop
    execute format('revoke all on function %s from public,anon',f);
    execute format('grant execute on function %s to authenticated,service_role',f);
  end loop;
end $$;
