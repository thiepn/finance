
-- Fix composite ownership FKs so SET NULL never attempts to clear user_id.
alter table finance.merchants drop constraint merchants_default_category_fk;
alter table finance.merchants add constraint merchants_default_category_fk
  foreign key (default_category_id, user_id)
  references finance.categories(id, user_id)
  on delete set null (default_category_id);

alter table finance.products drop constraint products_default_category_fk;
alter table finance.products add constraint products_default_category_fk
  foreign key (default_category_id, user_id)
  references finance.categories(id, user_id)
  on delete set null (default_category_id);

alter table finance.product_prices drop constraint product_prices_receipt_item_fk;
alter table finance.product_prices add constraint product_prices_receipt_item_fk
  foreign key (receipt_item_id, user_id)
  references finance.receipt_items(id, user_id)
  on delete set null (receipt_item_id);

alter table finance.goal_contributions drop constraint goal_contributions_transaction_fk;
alter table finance.goal_contributions add constraint goal_contributions_transaction_fk
  foreign key (transaction_id, user_id)
  references finance.transactions(id, user_id)
  on delete set null (transaction_id);

alter table finance.subscriptions drop constraint subscriptions_pattern_fk;
alter table finance.subscriptions add constraint subscriptions_pattern_fk
  foreign key (recurring_pattern_id, user_id)
  references finance.recurring_patterns(id, user_id)
  on delete set null (recurring_pattern_id);

alter table finance.import_records drop constraint import_records_transaction_fk;
alter table finance.import_records add constraint import_records_transaction_fk
  foreign key (transaction_id, user_id)
  references finance.transactions(id, user_id)
  on delete set null (transaction_id);

-- Secure defaults for future Finance objects.
alter default privileges for role postgres in schema finance
  revoke all on tables from public, anon, authenticated;
alter default privileges for role postgres in schema finance
  grant all on tables to service_role;
alter default privileges for role postgres in schema finance
  revoke all on sequences from public, anon, authenticated;
alter default privileges for role postgres in schema finance
  grant all on sequences to service_role;
alter default privileges for role postgres in schema finance
  revoke execute on functions from public, anon, authenticated;
alter default privileges for role postgres in schema finance
  grant execute on functions to service_role;

create or replace function finance_private.touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function finance_private.touch_updated_at() from public, anon, authenticated;

create or replace function finance_private.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb;
  v_user_id uuid;
  v_row_id text;
  v_old jsonb;
  v_new jsonb;
begin
  v_old := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end;
  v_new := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end;
  v_row := coalesce(v_new, v_old);

  v_user_id := nullif(v_row->>'user_id','')::uuid;
  if v_user_id is null then
    return coalesce(new, old);
  end if;

  v_row_id := coalesce(
    v_row->>'id',
    v_row->>'transaction_id',
    v_row->>'user_id',
    'unknown'
  );

  insert into finance.audit_log (
    user_id, actor_user_id, table_name, row_id, operation, old_data, new_data, txid
  )
  values (
    v_user_id,
    auth.uid(),
    tg_table_schema || '.' || tg_table_name,
    v_row_id,
    tg_op,
    v_old,
    v_new,
    txid_current()
  );

  return coalesce(new, old);
end;
$$;

revoke all on function finance_private.audit_row_change() from public, anon, authenticated;

create or replace function finance_private.check_transaction_balance(
  p_transaction_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status finance.transaction_status;
  v_count integer;
  v_sum bigint;
begin
  select status
    into v_status
  from finance.transactions
  where id = p_transaction_id
    and user_id = p_user_id;

  if not found or v_status <> 'posted' then
    return;
  end if;

  select count(*)::integer, coalesce(sum(reporting_amount_minor), 0)::bigint
    into v_count, v_sum
  from finance.ledger_entries
  where transaction_id = p_transaction_id
    and user_id = p_user_id;

  if v_count < 2 then
    raise exception using
      errcode = '23514',
      message = 'posted finance transaction requires at least two ledger entries';
  end if;

  if v_sum <> 0 then
    raise exception using
      errcode = '23514',
      message = format('finance transaction %s is unbalanced by %s reporting minor units', p_transaction_id, v_sum);
  end if;
end;
$$;

revoke all on function finance_private.check_transaction_balance(uuid, uuid) from public, anon, authenticated;

create or replace function finance_private.ledger_balance_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform finance_private.check_transaction_balance(old.transaction_id, old.user_id);
    return old;
  elsif tg_op = 'UPDATE' then
    if old.transaction_id is distinct from new.transaction_id
       or old.user_id is distinct from new.user_id then
      perform finance_private.check_transaction_balance(old.transaction_id, old.user_id);
    end if;
    perform finance_private.check_transaction_balance(new.transaction_id, new.user_id);
    return new;
  else
    perform finance_private.check_transaction_balance(new.transaction_id, new.user_id);
    return new;
  end if;
end;
$$;

revoke all on function finance_private.ledger_balance_guard() from public, anon, authenticated;

create or replace function finance_private.transaction_balance_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    return old;
  end if;
  perform finance_private.check_transaction_balance(new.id, new.user_id);
  return new;
end;
$$;

revoke all on function finance_private.transaction_balance_guard() from public, anon, authenticated;

create or replace function finance_private.validate_ledger_account_currency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_currency text;
begin
  if new.entry_kind = 'account' then
    select currency_code into v_currency
    from finance.accounts
    where id = new.account_id and user_id = new.user_id;

    if not found then
      raise exception using errcode = '23503', message = 'finance account not found for ledger entry';
    end if;

    if v_currency <> new.currency_code then
      raise exception using
        errcode = '23514',
        message = format('ledger currency %s does not match account currency %s', new.currency_code, v_currency);
    end if;
  end if;

  return new;
end;
$$;

revoke all on function finance_private.validate_ledger_account_currency() from public, anon, authenticated;

-- Updated-at triggers.
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles','accounts','merchants','categories','products','product_aliases',
    'transactions','ledger_entries','receipts','receipt_items',
    'receipt_transaction_matches','classification_rules','tags','budgets',
    'budget_periods','budget_allocations','goals','recurring_patterns',
    'subscriptions','imports','import_records','ai_processing_runs'
  ]
  loop
    execute format(
      'create trigger %I before update on finance.%I for each row execute function finance_private.touch_updated_at()',
      t || '_touch_updated_at', t
    );
  end loop;
end $$;

-- Audit all user-owned mutable tables except audit_log itself.
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles','accounts','merchants','categories','products','product_aliases',
    'transactions','ledger_entries','receipts','receipt_items',
    'receipt_transaction_matches','product_prices','classification_rules','tags',
    'transaction_tags','budgets','budget_periods','budget_allocations','goals',
    'goal_contributions','recurring_patterns','subscriptions','imports',
    'import_records','attachments','ai_processing_runs'
  ]
  loop
    execute format(
      'create trigger %I after insert or update or delete on finance.%I for each row execute function finance_private.audit_row_change()',
      t || '_audit_change', t
    );
  end loop;
end $$;

create trigger ledger_entries_currency_guard
before insert or update of entry_kind, account_id, user_id, currency_code
on finance.ledger_entries
for each row execute function finance_private.validate_ledger_account_currency();

create constraint trigger ledger_entries_balance_guard
after insert or update or delete on finance.ledger_entries
deferrable initially deferred
for each row execute function finance_private.ledger_balance_guard();

create constraint trigger transactions_balance_guard
after insert or update on finance.transactions
deferrable initially deferred
for each row execute function finance_private.transaction_balance_guard();

-- RLS + explicit grants. New Supabase behavior increasingly requires deliberate grants.
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles','accounts','merchants','categories','products','product_aliases',
    'transactions','ledger_entries','receipts','receipt_items',
    'receipt_transaction_matches','product_prices','classification_rules','tags',
    'transaction_tags','budgets','budget_periods','budget_allocations','goals',
    'goal_contributions','recurring_patterns','subscriptions','imports',
    'import_records','attachments','ai_processing_runs'
  ]
  loop
    execute format('alter table finance.%I enable row level security', t);
    execute format('revoke all on table finance.%I from anon, authenticated', t);
    execute format('grant select, insert, update on table finance.%I to authenticated', t);
    execute format('grant select, insert, update, delete on table finance.%I to service_role', t);

    execute format(
      'create policy %I on finance.%I for select to authenticated using ((select auth.uid()) is not null and (select auth.uid()) = user_id)',
      t || '_select_own', t
    );
    execute format(
      'create policy %I on finance.%I for insert to authenticated with check ((select auth.uid()) is not null and (select auth.uid()) = user_id)',
      t || '_insert_own', t
    );
    execute format(
      'create policy %I on finance.%I for update to authenticated using ((select auth.uid()) is not null and (select auth.uid()) = user_id) with check ((select auth.uid()) is not null and (select auth.uid()) = user_id)',
      t || '_update_own', t
    );
  end loop;
end $$;

-- Safe direct deletes only for non-authoritative planning/configuration entities.
do $$
declare
  t text;
begin
  foreach t in array array[
    'classification_rules','tags','transaction_tags','budgets','budget_periods',
    'budget_allocations','goals','goal_contributions','recurring_patterns','subscriptions'
  ]
  loop
    execute format('grant delete on table finance.%I to authenticated', t);
    execute format(
      'create policy %I on finance.%I for delete to authenticated using ((select auth.uid()) is not null and (select auth.uid()) = user_id)',
      t || '_delete_own', t
    );
  end loop;
end $$;

alter table finance.audit_log enable row level security;
revoke all on table finance.audit_log from anon, authenticated;
grant select on table finance.audit_log to authenticated;
grant select, insert, update, delete on table finance.audit_log to service_role;
create policy audit_log_select_own
on finance.audit_log for select to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

alter table finance.category_templates enable row level security;
revoke all on table finance.category_templates from anon, authenticated;
grant select on table finance.category_templates to authenticated;
grant select, insert, update, delete on table finance.category_templates to service_role;
create policy category_templates_read_authenticated
on finance.category_templates for select to authenticated
using ((select auth.uid()) is not null);

-- Canonical split view: no duplicated split table/source of truth.
create view finance.transaction_splits
with (security_invoker = true)
as
select
  le.id,
  le.user_id,
  le.transaction_id,
  le.category_id,
  le.signed_amount_minor,
  le.currency_code,
  le.reporting_amount_minor,
  le.memo,
  le.created_at,
  le.updated_at
from finance.ledger_entries le
where le.entry_kind = 'category';

revoke all on finance.transaction_splits from anon, authenticated;
grant select on finance.transaction_splits to authenticated, service_role;

create view finance.account_balances
with (security_invoker = true)
as
select
  a.id as account_id,
  a.user_id,
  a.name,
  a.kind,
  a.currency_code,
  coalesce(sum(le.signed_amount_minor) filter (where t.status = 'posted'), 0)::bigint as balance_minor,
  max(t.occurred_at) filter (where t.status = 'posted') as last_activity_at
from finance.accounts a
left join finance.ledger_entries le
  on le.account_id = a.id
 and le.user_id = a.user_id
left join finance.transactions t
  on t.id = le.transaction_id
 and t.user_id = le.user_id
where not a.is_archived
group by a.id, a.user_id, a.name, a.kind, a.currency_code;

revoke all on finance.account_balances from anon, authenticated;
grant select on finance.account_balances to authenticated, service_role;

-- Reference category taxonomy. User categories are instantiated from these templates.
insert into finance.category_templates (template_key, parent_key, name, kind, necessity_default, sort_order) values
  ('housing', null, 'Housing', 'expense', 'essential', 10),
  ('food_drink', null, 'Food & Drink', 'expense', 'flexible', 20),
  ('household', null, 'Household', 'expense', 'flexible', 30),
  ('transport', null, 'Transport', 'expense', 'flexible', 40),
  ('health_fitness', null, 'Health & Fitness', 'expense', 'flexible', 50),
  ('education', null, 'Education', 'expense', 'flexible', 60),
  ('technology', null, 'Technology', 'expense', 'flexible', 70),
  ('clothing', null, 'Clothing', 'expense', 'flexible', 80),
  ('personal_care', null, 'Personal Care', 'expense', 'flexible', 90),
  ('entertainment_hobbies', null, 'Entertainment & Hobbies', 'expense', 'discretionary', 100),
  ('travel', null, 'Travel', 'expense', 'discretionary', 110),
  ('gifts_giving', null, 'Gifts & Giving', 'expense', 'flexible', 120),
  ('fees_admin', null, 'Fees & Administration', 'expense', 'flexible', 130),
  ('insurance_finance', null, 'Insurance & Finance', 'expense', 'essential', 140),
  ('income', null, 'Income', 'income', 'unclassified', 150),
  ('other', null, 'Other', 'both', 'unclassified', 999),

  ('food_groceries', 'food_drink', 'Groceries', 'expense', 'essential', 201),
  ('food_produce', 'food_groceries', 'Produce', 'expense', 'essential', 202),
  ('food_dairy', 'food_groceries', 'Dairy', 'expense', 'essential', 203),
  ('food_protein', 'food_groceries', 'Protein', 'expense', 'essential', 204),
  ('food_staples', 'food_groceries', 'Staples', 'expense', 'essential', 205),
  ('food_other_groceries', 'food_groceries', 'Other groceries', 'expense', 'flexible', 206),
  ('food_snacks', 'food_drink', 'Snacks', 'expense', 'discretionary', 210),
  ('food_chocolate', 'food_snacks', 'Chocolate', 'expense', 'discretionary', 211),
  ('food_sweets', 'food_snacks', 'Sweets', 'expense', 'discretionary', 212),
  ('food_chips', 'food_snacks', 'Chips', 'expense', 'discretionary', 213),
  ('food_other_snacks', 'food_snacks', 'Other snacks', 'expense', 'discretionary', 214),
  ('food_drinks', 'food_drink', 'Drinks', 'expense', 'flexible', 220),
  ('food_eating_out', 'food_drink', 'Eating out', 'expense', 'discretionary', 230),
  ('food_delivery', 'food_drink', 'Delivery', 'expense', 'discretionary', 240),

  ('household_cleaning', 'household', 'Cleaning', 'expense', 'essential', 301),
  ('household_paper', 'household', 'Paper products', 'expense', 'essential', 302),
  ('household_kitchen', 'household', 'Kitchen supplies', 'expense', 'flexible', 303),
  ('household_home', 'household', 'Home supplies', 'expense', 'flexible', 304),
  ('household_furniture', 'household', 'Furniture', 'expense', 'flexible', 305),

  ('transport_public', 'transport', 'Public transport', 'expense', 'essential', 401),
  ('transport_bike', 'transport', 'Cycling', 'expense', 'flexible', 402),
  ('transport_car', 'transport', 'Car', 'expense', 'flexible', 403),
  ('transport_taxi', 'transport', 'Taxi & rideshare', 'expense', 'discretionary', 404),

  ('income_salary', 'income', 'Salary', 'income', 'unclassified', 1501),
  ('income_other', 'income', 'Other income', 'income', 'unclassified', 1502)
on conflict (template_key) do nothing;

create or replace function finance.initialize_user()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'authentication required';
  end if;

  insert into finance.profiles (user_id)
  values (v_user_id)
  on conflict (user_id) do nothing;

  insert into finance.categories (
    id, user_id, parent_id, name, kind, necessity_default, system_key, sort_order
  )
  select
    md5(v_user_id::text || ':' || ct.template_key)::uuid,
    v_user_id,
    case
      when ct.parent_key is null then null
      else md5(v_user_id::text || ':' || ct.parent_key)::uuid
    end,
    ct.name,
    ct.kind,
    ct.necessity_default,
    ct.template_key,
    ct.sort_order
  from finance.category_templates ct
  order by case when ct.parent_key is null then 0 else 1 end, ct.sort_order
  on conflict (id) do nothing;
end;
$$;

revoke all on function finance.initialize_user() from public, anon;
grant execute on function finance.initialize_user() to authenticated, service_role;
