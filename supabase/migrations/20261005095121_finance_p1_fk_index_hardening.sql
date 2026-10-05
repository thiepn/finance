
do $$
declare
  r record;
  v_cols text;
  v_index_name text;
  v_covered boolean;
begin
  for r in
    select
      c.oid as constraint_oid,
      c.conname,
      n.nspname as schema_name,
      cl.relname as table_name,
      cl.oid as table_oid,
      c.conkey
    from pg_constraint c
    join pg_class cl on cl.oid = c.conrelid
    join pg_namespace n on n.oid = cl.relnamespace
    where c.contype = 'f'
      and n.nspname = 'finance'
  loop
    select exists (
      select 1
      from pg_index i
      where i.indrelid = r.table_oid
        and i.indisvalid
        and i.indisready
        and i.indnkeyatts >= cardinality(r.conkey)
        and (i.indkey::smallint[])[0:cardinality(r.conkey)-1] = r.conkey
    ) into v_covered;

    if not v_covered then
      select string_agg(quote_ident(a.attname), ', ' order by u.ord)
        into v_cols
      from unnest(r.conkey) with ordinality as u(attnum, ord)
      join pg_attribute a
        on a.attrelid = r.table_oid
       and a.attnum = u.attnum;

      v_index_name := left(r.table_name || '_' || r.conname || '_idx', 63);

      execute format(
        'create index %I on %I.%I (%s)',
        v_index_name,
        r.schema_name,
        r.table_name,
        v_cols
      );
    end if;
  end loop;
end $$;
