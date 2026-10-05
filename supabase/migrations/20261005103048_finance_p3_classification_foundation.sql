
alter table finance.ledger_entries
  add column necessity finance.necessity;

update finance.ledger_entries le
set necessity = c.necessity_default
from finance.categories c
where le.entry_kind = 'category'
  and le.category_id = c.id
  and le.user_id = c.user_id
  and le.necessity is null;

alter table finance.ledger_entries
  add constraint ledger_entries_necessity_check
  check (
    (entry_kind = 'category' and necessity is not null)
    or
    (entry_kind <> 'category' and necessity is null)
  );

alter table finance.merchants
  add column default_necessity finance.necessity not null default 'unclassified';

alter table finance.classification_rules
  add column stop_processing boolean not null default false;

alter table finance.classification_rules
  add constraint classification_rules_scope_check
  check (scope in ('all','transaction','receipt_item','product','merchant'));

create table finance.merchant_aliases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  merchant_id uuid not null,
  raw_name text not null check (char_length(raw_name) between 1 and 300),
  normalized_alias text not null check (char_length(normalized_alias) between 1 and 300),
  source finance.rule_source not null default 'learned',
  confidence numeric(5,4) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  times_confirmed integer not null default 0 check (times_confirmed >= 0),
  last_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, normalized_alias),
  constraint merchant_aliases_merchant_fk
    foreign key (merchant_id, user_id)
    references finance.merchants(id, user_id) on delete cascade
);

create table finance.merchant_tags (
  user_id uuid not null references auth.users(id) on delete cascade,
  merchant_id uuid not null,
  tag_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (merchant_id, tag_id),
  constraint merchant_tags_merchant_fk
    foreign key (merchant_id, user_id)
    references finance.merchants(id, user_id) on delete cascade,
  constraint merchant_tags_tag_fk
    foreign key (tag_id, user_id)
    references finance.tags(id, user_id) on delete cascade
);

create table finance.product_tags (
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null,
  tag_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (product_id, tag_id),
  constraint product_tags_product_fk
    foreign key (product_id, user_id)
    references finance.products(id, user_id) on delete cascade,
  constraint product_tags_tag_fk
    foreign key (tag_id, user_id)
    references finance.tags(id, user_id) on delete cascade
);

create table finance.receipt_item_tags (
  user_id uuid not null references auth.users(id) on delete cascade,
  receipt_item_id uuid not null,
  tag_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (receipt_item_id, tag_id),
  constraint receipt_item_tags_item_fk
    foreign key (receipt_item_id, user_id)
    references finance.receipt_items(id, user_id) on delete cascade,
  constraint receipt_item_tags_tag_fk
    foreign key (tag_id, user_id)
    references finance.tags(id, user_id) on delete cascade
);

create index merchant_aliases_user_merchant_idx
  on finance.merchant_aliases(user_id, merchant_id);
create index merchant_aliases_merchant_fk_idx
  on finance.merchant_aliases(merchant_id, user_id);
create index merchant_tags_merchant_fk_idx
  on finance.merchant_tags(merchant_id, user_id);
create index merchant_tags_tag_fk_idx
  on finance.merchant_tags(tag_id, user_id);
create index product_tags_product_fk_idx
  on finance.product_tags(product_id, user_id);
create index product_tags_tag_fk_idx
  on finance.product_tags(tag_id, user_id);
create index receipt_item_tags_item_fk_idx
  on finance.receipt_item_tags(receipt_item_id, user_id);
create index receipt_item_tags_tag_fk_idx
  on finance.receipt_item_tags(tag_id, user_id);

create unique index categories_active_sibling_name_uq
  on finance.categories(
    user_id,
    coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(name)
  )
  where not is_archived;

create or replace function finance_private.normalize_label(p_value text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select lower(
    regexp_replace(
      regexp_replace(btrim(coalesce(p_value,'')), '[[:space:]]+', ' ', 'g'),
      '^[[:space:]]+|[[:space:]]+$',
      '',
      'g'
    )
  );
$$;

revoke all on function finance_private.normalize_label(text) from public, anon, authenticated;

create or replace function finance_private.normalize_merchant_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.name := btrim(new.name);
  new.normalized_name := finance_private.normalize_label(new.name);
  if new.normalized_name = '' then
    raise exception using errcode='23514', message='merchant name is required';
  end if;
  return new;
end;
$$;

revoke all on function finance_private.normalize_merchant_row() from public, anon, authenticated;

create trigger merchants_normalize_name
before insert or update of name on finance.merchants
for each row execute function finance_private.normalize_merchant_row();

create or replace function finance_private.normalize_merchant_alias_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.raw_name := btrim(new.raw_name);
  new.normalized_alias := finance_private.normalize_label(new.raw_name);
  if new.normalized_alias = '' then
    raise exception using errcode='23514', message='merchant alias is required';
  end if;
  return new;
end;
$$;

revoke all on function finance_private.normalize_merchant_alias_row() from public, anon, authenticated;

create trigger merchant_aliases_normalize_name
before insert or update of raw_name on finance.merchant_aliases
for each row execute function finance_private.normalize_merchant_alias_row();

create or replace function finance_private.normalize_tag_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.name := btrim(new.name);
  new.normalized_name := finance_private.normalize_label(new.name);
  if new.normalized_name = '' then
    raise exception using errcode='23514', message='tag name is required';
  end if;
  return new;
end;
$$;

revoke all on function finance_private.normalize_tag_row() from public, anon, authenticated;

create trigger tags_normalize_name
before insert or update of name on finance.tags
for each row execute function finance_private.normalize_tag_row();

create or replace function finance_private.guard_category_tree()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cycle boolean;
begin
  if new.parent_id is null then
    return new;
  end if;

  if new.parent_id = new.id then
    raise exception using errcode='23514', message='category cannot be its own parent';
  end if;

  if not exists (
    select 1 from finance.categories
    where id=new.parent_id and user_id=new.user_id
  ) then
    raise exception using errcode='23503', message='category parent does not belong to current user';
  end if;

  with recursive descendants as (
    select c.id
    from finance.categories c
    where c.parent_id = new.id and c.user_id = new.user_id
    union all
    select c.id
    from finance.categories c
    join descendants d on c.parent_id=d.id
    where c.user_id=new.user_id
  )
  select exists(select 1 from descendants where id=new.parent_id)
  into v_cycle;

  if v_cycle then
    raise exception using errcode='23514', message='category hierarchy cycle detected';
  end if;

  return new;
end;
$$;

revoke all on function finance_private.guard_category_tree() from public, anon, authenticated;

create trigger categories_tree_guard
before insert or update of parent_id on finance.categories
for each row execute function finance_private.guard_category_tree();

create or replace function finance_private.validate_classification_rule_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text;
  v_id uuid;
  v_tag text;
  v_min bigint;
  v_max bigint;
begin
  for v_key in select jsonb_object_keys(new.condition)
  loop
    if v_key not in (
      'merchant_id','merchant_group','merchant_name_contains',
      'description_contains','raw_name_contains','normalized_name_contains',
      'product_id','transaction_type','min_amount_minor','max_amount_minor',
      'tag_id'
    ) then
      raise exception using errcode='23514',
        message=format('unsupported classification condition key: %s',v_key);
    end if;
  end loop;

  for v_key in select jsonb_object_keys(new.action)
  loop
    if v_key not in ('merchant_id','category_id','necessity','tag_ids') then
      raise exception using errcode='23514',
        message=format('unsupported classification action key: %s',v_key);
    end if;
  end loop;

  if new.action = '{}'::jsonb then
    raise exception using errcode='23514', message='classification rule action cannot be empty';
  end if;

  if new.condition ? 'merchant_id' then
    v_id := (new.condition->>'merchant_id')::uuid;
    if not exists(select 1 from finance.merchants where id=v_id and user_id=new.user_id) then
      raise exception using errcode='23503', message='rule condition merchant does not belong to user';
    end if;
  end if;

  if new.condition ? 'product_id' then
    v_id := (new.condition->>'product_id')::uuid;
    if not exists(select 1 from finance.products where id=v_id and user_id=new.user_id) then
      raise exception using errcode='23503', message='rule condition product does not belong to user';
    end if;
  end if;

  if new.condition ? 'tag_id' then
    v_id := (new.condition->>'tag_id')::uuid;
    if not exists(select 1 from finance.tags where id=v_id and user_id=new.user_id) then
      raise exception using errcode='23503', message='rule condition tag does not belong to user';
    end if;
  end if;

  if new.condition ? 'transaction_type' then
    perform (new.condition->>'transaction_type')::finance.transaction_type;
  end if;

  if new.condition ? 'min_amount_minor' then
    v_min := (new.condition->>'min_amount_minor')::bigint;
    if v_min < 0 then raise exception using errcode='23514', message='minimum amount cannot be negative'; end if;
  end if;

  if new.condition ? 'max_amount_minor' then
    v_max := (new.condition->>'max_amount_minor')::bigint;
    if v_max < 0 then raise exception using errcode='23514', message='maximum amount cannot be negative'; end if;
  end if;

  if new.condition ? 'min_amount_minor' and new.condition ? 'max_amount_minor'
     and v_min > v_max then
    raise exception using errcode='23514', message='classification amount range is invalid';
  end if;

  if new.action ? 'merchant_id' then
    v_id := (new.action->>'merchant_id')::uuid;
    if not exists(select 1 from finance.merchants where id=v_id and user_id=new.user_id) then
      raise exception using errcode='23503', message='rule action merchant does not belong to user';
    end if;
  end if;

  if new.action ? 'category_id' then
    v_id := (new.action->>'category_id')::uuid;
    if not exists(select 1 from finance.categories where id=v_id and user_id=new.user_id and not is_archived) then
      raise exception using errcode='23503', message='rule action category does not belong to user';
    end if;
  end if;

  if new.action ? 'necessity' then
    perform (new.action->>'necessity')::finance.necessity;
  end if;

  if new.action ? 'tag_ids' then
    if jsonb_typeof(new.action->'tag_ids') <> 'array' then
      raise exception using errcode='23514', message='rule action tag_ids must be an array';
    end if;
    for v_tag in select jsonb_array_elements_text(new.action->'tag_ids')
    loop
      v_id := v_tag::uuid;
      if not exists(select 1 from finance.tags where id=v_id and user_id=new.user_id) then
        raise exception using errcode='23503', message='rule action tag does not belong to user';
      end if;
    end loop;
  end if;

  return new;
end;
$$;

revoke all on function finance_private.validate_classification_rule_row() from public, anon, authenticated;

create trigger classification_rules_validate
before insert or update of condition, action, user_id
on finance.classification_rules
for each row execute function finance_private.validate_classification_rule_row();

create or replace function finance_private.rule_condition_matches(
  p_condition jsonb,
  p_context jsonb
)
returns boolean
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_tags jsonb := coalesce(p_context->'tag_ids','[]'::jsonb);
  v_amount bigint;
begin
  if p_condition ? 'merchant_id'
     and coalesce(p_context->>'merchant_id','') <> p_condition->>'merchant_id' then
    return false;
  end if;

  if p_condition ? 'merchant_group'
     and lower(coalesce(p_context->>'merchant_group','')) <> lower(p_condition->>'merchant_group') then
    return false;
  end if;

  if p_condition ? 'merchant_name_contains'
     and position(lower(p_condition->>'merchant_name_contains') in lower(coalesce(p_context->>'merchant_name',''))) = 0 then
    return false;
  end if;

  if p_condition ? 'description_contains'
     and position(lower(p_condition->>'description_contains') in lower(coalesce(p_context->>'description',''))) = 0 then
    return false;
  end if;

  if p_condition ? 'raw_name_contains'
     and position(lower(p_condition->>'raw_name_contains') in lower(coalesce(p_context->>'raw_name',''))) = 0 then
    return false;
  end if;

  if p_condition ? 'normalized_name_contains'
     and position(lower(p_condition->>'normalized_name_contains') in lower(coalesce(p_context->>'normalized_name',''))) = 0 then
    return false;
  end if;

  if p_condition ? 'product_id'
     and coalesce(p_context->>'product_id','') <> p_condition->>'product_id' then
    return false;
  end if;

  if p_condition ? 'transaction_type'
     and coalesce(p_context->>'transaction_type','') <> p_condition->>'transaction_type' then
    return false;
  end if;

  if p_condition ? 'tag_id'
     and not (v_tags ? (p_condition->>'tag_id')) then
    return false;
  end if;

  if p_condition ? 'min_amount_minor' or p_condition ? 'max_amount_minor' then
    if not p_context ? 'amount_minor' then return false; end if;
    v_amount := (p_context->>'amount_minor')::bigint;
    if p_condition ? 'min_amount_minor'
       and v_amount < (p_condition->>'min_amount_minor')::bigint then return false; end if;
    if p_condition ? 'max_amount_minor'
       and v_amount > (p_condition->>'max_amount_minor')::bigint then return false; end if;
  end if;

  return true;
end;
$$;

revoke all on function finance_private.rule_condition_matches(jsonb,jsonb) from public, anon, authenticated;

-- Ownership + update/audit infrastructure for P3 tables.
alter table finance.merchant_aliases enable row level security;
alter table finance.merchant_tags enable row level security;
alter table finance.product_tags enable row level security;
alter table finance.receipt_item_tags enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['merchant_aliases','merchant_tags','product_tags','receipt_item_tags']
  loop
    execute format('revoke all on finance.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on finance.%I to authenticated', t);
    execute format('grant select, insert, update, delete on finance.%I to service_role', t);

    execute format(
      'create policy %I on finance.%I for select to authenticated using ((select auth.uid()) is not null and (select auth.uid())=user_id)',
      t || '_select_own', t
    );
    execute format(
      'create policy %I on finance.%I for insert to authenticated with check ((select auth.uid()) is not null and (select auth.uid())=user_id)',
      t || '_insert_own', t
    );
    execute format(
      'create policy %I on finance.%I for update to authenticated using ((select auth.uid()) is not null and (select auth.uid())=user_id) with check ((select auth.uid()) is not null and (select auth.uid())=user_id)',
      t || '_update_own', t
    );
    execute format(
      'create policy %I on finance.%I for delete to authenticated using ((select auth.uid()) is not null and (select auth.uid())=user_id)',
      t || '_delete_own', t
    );
  end loop;
end $$;

create trigger merchant_aliases_touch_updated_at
before update on finance.merchant_aliases
for each row execute function finance_private.touch_updated_at();

create trigger merchant_aliases_audit_change
after insert or update or delete on finance.merchant_aliases
for each row execute function finance_private.audit_row_change();

create trigger merchant_tags_audit_change
after insert or update or delete on finance.merchant_tags
for each row execute function finance_private.audit_row_change();

create trigger product_tags_audit_change
after insert or update or delete on finance.product_tags
for each row execute function finance_private.audit_row_change();

create trigger receipt_item_tags_audit_change
after insert or update or delete on finance.receipt_item_tags
for each row execute function finance_private.audit_row_change();

create or replace view finance.transaction_splits
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
  le.updated_at,
  le.necessity
from finance.ledger_entries le
where le.entry_kind='category';

create or replace view finance.category_tree
with (security_invoker = true)
as
with recursive tree as (
  select
    c.id, c.user_id, c.parent_id, c.name, c.kind, c.necessity_default,
    c.system_key, c.icon_key, c.sort_order, c.is_archived,
    0::integer as depth,
    array[c.id]::uuid[] as id_path,
    array[c.name]::text[] as name_path
  from finance.categories c
  where c.parent_id is null
  union all
  select
    c.id, c.user_id, c.parent_id, c.name, c.kind, c.necessity_default,
    c.system_key, c.icon_key, c.sort_order, c.is_archived,
    p.depth + 1,
    p.id_path || c.id,
    p.name_path || c.name
  from finance.categories c
  join tree p on c.parent_id=p.id and c.user_id=p.user_id
  where not c.id = any(p.id_path)
)
select * from tree;

create or replace view finance.merchant_summary
with (security_invoker = true)
as
select
  m.id,
  m.user_id,
  m.name,
  m.normalized_name,
  m.merchant_group,
  m.default_category_id,
  m.default_necessity,
  m.website,
  m.is_archived,
  count(distinct t.id) filter (where t.status='posted' and t.type='expense')::integer as purchase_count,
  coalesce(sum(le.reporting_amount_minor) filter (
    where t.status='posted'
      and le.entry_kind='category'
      and t.type in ('expense','refund','reimbursement','adjustment')
  ),0)::bigint as net_spend_minor,
  max(t.occurred_at) filter (where t.status='posted') as last_activity_at,
  m.created_at,
  m.updated_at
from finance.merchants m
left join finance.transactions t
  on t.merchant_id=m.id and t.user_id=m.user_id
left join finance.ledger_entries le
  on le.transaction_id=t.id and le.user_id=t.user_id
group by m.id;

revoke all on finance.transaction_splits, finance.category_tree, finance.merchant_summary from anon, authenticated;
grant select on finance.transaction_splits, finance.category_tree, finance.merchant_summary
  to authenticated, service_role;
