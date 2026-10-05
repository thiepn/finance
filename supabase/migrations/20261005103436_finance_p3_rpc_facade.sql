
create or replace function public.finance_get_categories()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',ct.id,
        'parent_id',ct.parent_id,
        'name',ct.name,
        'kind',ct.kind,
        'necessity_default',ct.necessity_default,
        'system_key',ct.system_key,
        'icon_key',ct.icon_key,
        'sort_order',ct.sort_order,
        'is_archived',ct.is_archived,
        'depth',ct.depth,
        'id_path',ct.id_path,
        'name_path',ct.name_path
      )
      order by ct.name_path
    ),
    '[]'::jsonb
  )
  from finance.category_tree ct;
$$;

create or replace function public.finance_create_category(
  p_name text,
  p_parent_id uuid default null,
  p_kind finance.category_kind default 'expense',
  p_necessity_default finance.necessity default 'unclassified',
  p_icon_key text default null,
  p_sort_order integer default 0
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select finance.create_category(
    p_name,p_parent_id,p_kind,p_necessity_default,p_icon_key,p_sort_order
  );
$$;

create or replace function public.finance_update_category(
  p_category_id uuid,
  p_name text,
  p_parent_id uuid,
  p_necessity_default finance.necessity,
  p_icon_key text default null,
  p_sort_order integer default 0
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select finance.update_category(
    p_category_id,p_name,p_parent_id,p_necessity_default,p_icon_key,p_sort_order
  );
$$;

create or replace function public.finance_archive_category(
  p_category_id uuid,
  p_recursive boolean default false
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select finance.archive_category(p_category_id,p_recursive);
$$;

create or replace function public.finance_restore_category(p_category_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  select finance.restore_category(p_category_id);
$$;

create or replace function public.finance_upsert_merchant(
  p_name text,
  p_merchant_group text default null,
  p_default_category_id uuid default null,
  p_default_necessity finance.necessity default 'unclassified',
  p_website text default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select finance.upsert_merchant(
    p_name,p_merchant_group,p_default_category_id,p_default_necessity,p_website
  );
$$;

create or replace function public.finance_add_merchant_alias(
  p_merchant_id uuid,
  p_raw_name text
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select finance.add_merchant_alias(p_merchant_id,p_raw_name);
$$;

create or replace function public.finance_resolve_merchant(p_raw_name text)
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select finance.resolve_merchant(p_raw_name);
$$;

create or replace function public.finance_get_merchants()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',m.id,
        'name',m.name,
        'normalized_name',m.normalized_name,
        'merchant_group',m.merchant_group,
        'default_category_id',m.default_category_id,
        'default_necessity',m.default_necessity,
        'website',m.website,
        'is_archived',m.is_archived,
        'purchase_count',m.purchase_count,
        'net_spend_minor',m.net_spend_minor,
        'last_activity_at',m.last_activity_at,
        'aliases',coalesce((
          select jsonb_agg(jsonb_build_object(
            'id',ma.id,'raw_name',ma.raw_name,'source',ma.source,
            'confidence',ma.confidence,'times_confirmed',ma.times_confirmed
          ) order by ma.raw_name)
          from finance.merchant_aliases ma
          where ma.merchant_id=m.id and ma.user_id=m.user_id
        ),'[]'::jsonb),
        'tag_ids',coalesce((
          select jsonb_agg(mt.tag_id order by mt.tag_id)
          from finance.merchant_tags mt
          where mt.merchant_id=m.id and mt.user_id=m.user_id
        ),'[]'::jsonb)
      )
      order by m.name
    ),
    '[]'::jsonb
  )
  from finance.merchant_summary m;
$$;

create or replace function public.finance_create_tag(p_name text)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select finance.create_tag(p_name);
$$;

create or replace function public.finance_assign_tag(
  p_entity_type text,
  p_entity_id uuid,
  p_tag_id uuid
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select finance.assign_tag(p_entity_type,p_entity_id,p_tag_id);
$$;

create or replace function public.finance_unassign_tag(
  p_entity_type text,
  p_entity_id uuid,
  p_tag_id uuid
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select finance.unassign_tag(p_entity_type,p_entity_id,p_tag_id);
$$;

create or replace function public.finance_get_tags()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',t.id,
        'name',t.name,
        'normalized_name',t.normalized_name,
        'created_at',t.created_at
      )
      order by t.name
    ),
    '[]'::jsonb
  )
  from finance.tags t;
$$;

create or replace function public.finance_create_classification_rule(
  p_name text,
  p_scope text,
  p_condition jsonb,
  p_action jsonb,
  p_priority integer default 1000,
  p_stop_processing boolean default false
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select finance.create_classification_rule(
    p_name,p_scope,p_condition,p_action,p_priority,p_stop_processing
  );
$$;

create or replace function public.finance_update_classification_rule(
  p_rule_id uuid,
  p_name text,
  p_scope text,
  p_condition jsonb,
  p_action jsonb,
  p_priority integer,
  p_enabled boolean,
  p_stop_processing boolean
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select finance.update_classification_rule(
    p_rule_id,p_name,p_scope,p_condition,p_action,p_priority,p_enabled,p_stop_processing
  );
$$;

create or replace function public.finance_delete_classification_rule(p_rule_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  select finance.delete_classification_rule(p_rule_id);
$$;

create or replace function public.finance_get_classification_rules()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',r.id,'name',r.name,'priority',r.priority,'enabled',r.enabled,
        'source',r.source,'scope',r.scope,'condition',r.condition,
        'action',r.action,'stop_processing',r.stop_processing,
        'match_count',r.match_count,'last_matched_at',r.last_matched_at,
        'created_at',r.created_at,'updated_at',r.updated_at
      )
      order by
        case r.source
          when 'user' then 10 when 'learned' then 20 when 'merchant' then 30
          when 'global' then 40 when 'ai' then 50
        end,
        r.priority,r.created_at,r.id
    ),
    '[]'::jsonb
  )
  from finance.classification_rules r;
$$;

create or replace function public.finance_resolve_classification(
  p_scope text,
  p_context jsonb
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select finance.resolve_classification(p_scope,p_context);
$$;

create or replace function public.finance_get_transaction_detail(p_transaction_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'transaction',jsonb_build_object(
      'id',ts.id,'type',ts.type,'status',ts.status,'occurred_at',ts.occurred_at,
      'merchant_id',ts.merchant_id,'description',ts.description,'note',ts.note,
      'source',ts.source,'reporting_currency',ts.reporting_currency,
      'display_amount_minor',ts.display_amount_minor,
      'related_transaction_id',ts.related_transaction_id,
      'relation_kind',ts.relation_kind,'posted_at',ts.posted_at,
      'voided_at',ts.voided_at,'void_reason',ts.void_reason
    ),
    'splits',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',s.id,'category_id',s.category_id,'category_name',c.name,
          'amount_minor',s.reporting_amount_minor,'necessity',s.necessity,
          'memo',s.memo
        ) order by abs(s.reporting_amount_minor) desc,s.id
      )
      from finance.transaction_splits s
      join finance.categories c on c.id=s.category_id and c.user_id=s.user_id
      where s.transaction_id=ts.id and s.user_id=ts.user_id
    ),'[]'::jsonb),
    'tag_ids',coalesce((
      select jsonb_agg(tt.tag_id order by tt.tag_id)
      from finance.transaction_tags tt
      where tt.transaction_id=ts.id and tt.user_id=ts.user_id
    ),'[]'::jsonb)
  )
  from finance.transaction_summary ts
  where ts.id=p_transaction_id;
$$;

do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in (
      'finance_get_categories','finance_create_category','finance_update_category',
      'finance_archive_category','finance_restore_category',
      'finance_upsert_merchant','finance_add_merchant_alias','finance_resolve_merchant',
      'finance_get_merchants','finance_create_tag','finance_assign_tag','finance_unassign_tag',
      'finance_get_tags','finance_create_classification_rule','finance_update_classification_rule',
      'finance_delete_classification_rule','finance_get_classification_rules',
      'finance_resolve_classification','finance_get_transaction_detail'
    )
  loop
    execute format('revoke all on function %s from public, anon',f);
    execute format('grant execute on function %s to authenticated, service_role',f);
  end loop;
end $$;
