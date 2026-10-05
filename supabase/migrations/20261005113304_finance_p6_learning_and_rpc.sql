
create or replace function finance_private.refresh_receipt_normalization_state()
returns trigger
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_receipt_id uuid := coalesce(new.receipt_id,old.receipt_id);
  v_user_id uuid := coalesce(new.user_id,old.user_id);
  v_unresolved integer;
  v_reasons jsonb;
  v_non_product_reasons jsonb;
begin
  select count(*)::integer into v_unresolved
  from finance.receipt_items
  where receipt_id=v_receipt_id and user_id=v_user_id
    and normalization_status in ('pending','review_required');

  select review_reasons into v_reasons
  from finance.receipts
  where id=v_receipt_id and user_id=v_user_id;

  select coalesce(jsonb_agg(x),'[]'::jsonb)
  into v_non_product_reasons
  from jsonb_array_elements(coalesce(v_reasons,'[]'::jsonb)) x
  where x <> '"product_normalization_required"'::jsonb;

  if v_unresolved>0 then
    update finance.receipts
    set processing_status='review_required',
        review_reasons=v_non_product_reasons||jsonb_build_array('product_normalization_required')
    where id=v_receipt_id and user_id=v_user_id
      and processing_status in ('normalizing','classifying','review_required');
  else
    update finance.receipts
    set processing_status=case
          when jsonb_array_length(v_non_product_reasons)=0
            then 'classifying'::finance.receipt_processing_status
          else 'review_required'::finance.receipt_processing_status
        end,
        review_reasons=v_non_product_reasons
    where id=v_receipt_id and user_id=v_user_id
      and processing_status in ('normalizing','classifying','review_required');
  end if;

  return coalesce(new,old);
end;
$$;

revoke all on function finance_private.refresh_receipt_normalization_state()
from public,anon;

drop trigger if exists receipt_items_refresh_normalization_state
on finance.receipt_items;

create trigger receipt_items_refresh_normalization_state
after update of normalization_status,normalization_review_required
on finance.receipt_items
for each row
when (
  old.normalization_status is distinct from new.normalization_status
  or old.normalization_review_required is distinct from new.normalization_review_required
)
execute function finance_private.refresh_receipt_normalization_state();

create or replace function finance.create_and_assign_product_candidate(
  p_receipt_item_id uuid,
  p_name text,
  p_brand text default null,
  p_family_name text default null,
  p_variant_name text default null,
  p_product_type text default null,
  p_barcode text default null,
  p_size_value numeric default null,
  p_size_unit text default null,
  p_confidence numeric default null,
  p_normalization_version text default 'deterministic-1',
  p_user_confirmed boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_user_id uuid := auth.uid();
  v_item finance.receipt_items%rowtype;
  v_receipt finance.receipts%rowtype;
  v_family_id uuid;
  v_product_id uuid;
  v_source finance.rule_source;
  v_default_category uuid;
  v_default_necessity finance.necessity := 'unclassified';
begin
  if v_user_id is null then raise exception using errcode='42501',message='authentication required'; end if;
  if p_user_confirmed then
    v_source := 'user';
  else
    v_source := 'learned';
    if p_confidence is null or p_confidence<0.92 then
      raise exception using errcode='23514',
        message='automatic product creation requires confidence of at least 0.92';
    end if;
  end if;

  select * into v_item
  from finance.receipt_items
  where id=p_receipt_item_id and user_id=v_user_id
  for update;
  if not found then raise exception using errcode='P0002',message='receipt item not found'; end if;

  select * into v_receipt
  from finance.receipts
  where id=v_item.receipt_id and user_id=v_user_id;

  if p_family_name is not null and nullif(btrim(p_family_name),'') is not null then
    v_family_id := finance.upsert_product_family(
      p_family_name,p_brand,p_product_type,null,'unclassified',
      jsonb_build_object(
        'created_from','receipt_normalization',
        'normalization_version',p_normalization_version
      )
    );
  end if;

  if v_family_id is not null then
    select default_category_id,default_necessity
    into v_default_category,v_default_necessity
    from finance.product_families
    where id=v_family_id and user_id=v_user_id;
  end if;

  v_product_id := finance.upsert_product(
    p_name,p_brand,v_family_id,p_variant_name,p_product_type,p_barcode,
    p_size_value,p_size_unit,v_default_category,v_default_necessity,
    v_source,case when p_user_confirmed then 1 else p_confidence end,
    jsonb_build_object(
      'created_from','receipt_normalization',
      'first_raw_name',v_item.raw_name,
      'first_merchant_id',v_receipt.merchant_id,
      'normalization_version',p_normalization_version
    )
  );

  return finance.apply_receipt_item_product(
    v_item.id,v_product_id,v_source,
    case when p_user_confirmed then 1 else p_confidence end,
    p_normalization_version,null,true,p_user_confirmed
  )||jsonb_build_object(
    'created_or_upserted',true,
    'family_id',v_family_id
  );
end;
$$;

create or replace function finance.normalize_receipt_products_by_alias(
  p_receipt_id uuid,
  p_normalization_version text default 'alias-1'
)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_user_id uuid := auth.uid();
  v_item record;
  v_result jsonb;
  v_matched integer := 0;
  v_review integer := 0;
begin
  if v_user_id is null then raise exception using errcode='42501',message='authentication required'; end if;
  if not exists(
    select 1 from finance.receipts where id=p_receipt_id and user_id=v_user_id
  ) then raise exception using errcode='P0002',message='receipt not found'; end if;

  for v_item in
    select id
    from finance.receipt_items
    where receipt_id=p_receipt_id and user_id=v_user_id
      and normalization_status in ('pending','review_required')
    order by line_index,id
  loop
    v_result := finance.normalize_receipt_item_by_alias(
      v_item.id,p_normalization_version
    );
    if v_result->>'normalization_status'='matched' then
      v_matched := v_matched+1;
    else
      v_review := v_review+1;
    end if;
  end loop;

  return jsonb_build_object(
    'receipt_id',p_receipt_id,
    'matched_count',v_matched,
    'review_count',v_review,
    'queue',finance.get_product_normalization_queue(p_receipt_id,500)
  );
end;
$$;

create or replace function public.finance_upsert_product_family(
  p_name text,
  p_brand text default null,
  p_product_type text default null,
  p_default_category_id uuid default null,
  p_default_necessity finance.necessity default 'unclassified',
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language sql
security invoker
set search_path=''
as $$
  select finance.upsert_product_family(
    p_name,p_brand,p_product_type,p_default_category_id,
    p_default_necessity,p_metadata
  );
$$;

create or replace function public.finance_upsert_product(
  p_name text,
  p_brand text default null,
  p_family_id uuid default null,
  p_variant_name text default null,
  p_product_type text default null,
  p_barcode text default null,
  p_size_value numeric default null,
  p_size_unit text default null,
  p_default_category_id uuid default null,
  p_default_necessity finance.necessity default 'unclassified',
  p_source finance.rule_source default 'user',
  p_confidence numeric default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language sql
security invoker
set search_path=''
as $$
  select finance.upsert_product(
    p_name,p_brand,p_family_id,p_variant_name,p_product_type,p_barcode,
    p_size_value,p_size_unit,p_default_category_id,p_default_necessity,
    p_source,p_confidence,p_metadata
  );
$$;

create or replace function public.finance_add_product_alias(
  p_product_id uuid,
  p_raw_alias text,
  p_merchant_id uuid default null,
  p_source finance.rule_source default 'user',
  p_confidence numeric default null,
  p_confirm boolean default true
)
returns uuid
language sql
security invoker
set search_path=''
as $$
  select finance.add_product_alias(
    p_product_id,p_raw_alias,p_merchant_id,p_source,p_confidence,p_confirm
  );
$$;

create or replace function public.finance_resolve_product_alias(
  p_raw_name text,
  p_merchant_id uuid default null
)
returns jsonb
language sql
stable
security invoker
set search_path=''
as $$
  select finance.resolve_product_alias(p_raw_name,p_merchant_id);
$$;

create or replace function public.finance_normalize_receipt_item_by_alias(
  p_receipt_item_id uuid,
  p_normalization_version text default 'alias-1'
)
returns jsonb
language sql
security invoker
set search_path=''
as $$
  select finance.normalize_receipt_item_by_alias(
    p_receipt_item_id,p_normalization_version
  );
$$;

create or replace function public.finance_normalize_receipt_products_by_alias(
  p_receipt_id uuid,
  p_normalization_version text default 'alias-1'
)
returns jsonb
language sql
security invoker
set search_path=''
as $$
  select finance.normalize_receipt_products_by_alias(
    p_receipt_id,p_normalization_version
  );
$$;

create or replace function public.finance_correct_receipt_item_product(
  p_receipt_item_id uuid,
  p_product_id uuid,
  p_learn_merchant_alias boolean default true,
  p_normalization_version text default 'user-correction-1'
)
returns jsonb
language sql
security invoker
set search_path=''
as $$
  select finance.correct_receipt_item_product(
    p_receipt_item_id,p_product_id,p_learn_merchant_alias,p_normalization_version
  );
$$;

create or replace function public.finance_create_and_assign_product_candidate(
  p_receipt_item_id uuid,
  p_name text,
  p_brand text default null,
  p_family_name text default null,
  p_variant_name text default null,
  p_product_type text default null,
  p_barcode text default null,
  p_size_value numeric default null,
  p_size_unit text default null,
  p_confidence numeric default null,
  p_normalization_version text default 'deterministic-1',
  p_user_confirmed boolean default false
)
returns jsonb
language sql
security invoker
set search_path=''
as $$
  select finance.create_and_assign_product_candidate(
    p_receipt_item_id,p_name,p_brand,p_family_name,p_variant_name,p_product_type,
    p_barcode,p_size_value,p_size_unit,p_confidence,p_normalization_version,
    p_user_confirmed
  );
$$;

create or replace function public.finance_get_product_normalization_queue(
  p_receipt_id uuid default null,
  p_limit integer default 100
)
returns jsonb
language sql
stable
security invoker
set search_path=''
as $$
  select finance.get_product_normalization_queue(p_receipt_id,p_limit);
$$;

create or replace function public.finance_get_products()
returns jsonb
language sql
stable
security invoker
set search_path=''
as $$
  select finance.get_products();
$$;

create or replace function public.finance_get_product_families()
returns jsonb
language sql
stable
security invoker
set search_path=''
as $$
  select finance.get_product_families();
$$;

create or replace function public.finance_get_product_detail(p_product_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path=''
as $$
  select finance.get_product_detail(p_product_id);
$$;

do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('finance','public')
      and p.proname in (
        'create_and_assign_product_candidate','normalize_receipt_products_by_alias',
        'finance_upsert_product_family','finance_upsert_product',
        'finance_add_product_alias','finance_resolve_product_alias',
        'finance_normalize_receipt_item_by_alias',
        'finance_normalize_receipt_products_by_alias',
        'finance_correct_receipt_item_product',
        'finance_create_and_assign_product_candidate',
        'finance_get_product_normalization_queue',
        'finance_get_products','finance_get_product_families',
        'finance_get_product_detail'
      )
  loop
    execute format('revoke all on function %s from public,anon',f);
    execute format('grant execute on function %s to authenticated,service_role',f);
  end loop;
end $$;
