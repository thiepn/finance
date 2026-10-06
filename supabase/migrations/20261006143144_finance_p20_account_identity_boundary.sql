do $$
declare
  c record;
begin
  if exists (select 1 from finance.profiles limit 1)
     or exists (select 1 from finance.transactions limit 1)
     or exists (select 1 from finance.receipts limit 1) then
    raise exception 'FINANCE_P20_IDENTITY_MIGRATION_REQUIRES_EMPTY_NAMESPACE';
  end if;

  for c in
    select conrelid::regclass as table_name, conname
    from pg_constraint
    where contype='f'
      and connamespace='finance'::regnamespace
      and confrelid='auth.users'::regclass
  loop
    execute format('alter table %s drop constraint %I', c.table_name, c.conname);
  end loop;
end $$;

comment on column finance.profiles.user_id is
  'Canonical THIEPN Account UUID. Verified by THIEPN Core Gateway for server-mediated access; not a THIEPN Core auth.users foreign key.';
comment on column finance.transactions.user_id is
  'Canonical THIEPN Account UUID.';
comment on column finance.receipts.user_id is
  'Canonical THIEPN Account UUID.';
comment on column finance.audit_log.actor_user_id is
  'Canonical THIEPN Account UUID when the request is mediated by THIEPN Core Gateway; nullable for system activity.';
