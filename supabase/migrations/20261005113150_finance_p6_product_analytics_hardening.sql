
create or replace view finance.product_intelligence_summary
with (security_invoker=true)
as
select
  p.id,
  p.user_id,
  p.name,
  p.normalized_name,
  p.brand,
  p.normalized_brand,
  p.family_id,
  pf.name as family_name,
  p.variant_name,
  p.product_type,
  p.barcode,
  p.size_value,
  p.size_unit,
  p.default_category_id,
  p.default_necessity,
  p.source,
  p.confidence,
  p.is_archived,
  coalesce(purchases.purchase_count,0)::bigint as purchase_count,
  coalesce(purchases.total_spend_minor,0)::bigint as total_spend_minor,
  coalesce(purchases.total_quantity,0)::numeric as total_quantity,
  purchases.first_purchase_at,
  purchases.last_purchase_at,
  prices.min_unit_price_minor,
  prices.max_unit_price_minor,
  prices.avg_unit_price_minor
from finance.products p
left join finance.product_families pf
  on pf.id=p.family_id and pf.user_id=p.user_id
left join lateral (
  select
    count(*)::bigint as purchase_count,
    coalesce(sum(ri.effective_total_minor),0)::bigint as total_spend_minor,
    coalesce(sum(ri.quantity),0)::numeric as total_quantity,
    min(r.purchased_at) as first_purchase_at,
    max(r.purchased_at) as last_purchase_at
  from finance.receipt_items ri
  join finance.receipts r
    on r.id=ri.receipt_id and r.user_id=ri.user_id
  where ri.product_id=p.id and ri.user_id=p.user_id
) purchases on true
left join lateral (
  select
    min(pp.effective_unit_price_minor) as min_unit_price_minor,
    max(pp.effective_unit_price_minor) as max_unit_price_minor,
    avg(pp.effective_unit_price_minor)::numeric as avg_unit_price_minor
  from finance.product_prices pp
  where pp.product_id=p.id and pp.user_id=p.user_id
) prices on true;

revoke all on finance.product_intelligence_summary from anon,authenticated;
grant select on finance.product_intelligence_summary to authenticated,service_role;

create or replace function finance.get_product_detail(p_product_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path=''
as $$
  select jsonb_build_object(
    'product',jsonb_build_object(
      'id',p.id,
      'name',p.name,
      'normalized_name',p.normalized_name,
      'brand',p.brand,
      'family_id',p.family_id,
      'family_name',p.family_name,
      'variant_name',p.variant_name,
      'product_type',p.product_type,
      'barcode',p.barcode,
      'size_value',p.size_value,
      'size_unit',p.size_unit,
      'default_category_id',p.default_category_id,
      'default_necessity',p.default_necessity,
      'source',p.source,
      'confidence',p.confidence,
      'purchase_count',p.purchase_count,
      'total_spend_minor',p.total_spend_minor,
      'total_quantity',p.total_quantity,
      'first_purchase_at',p.first_purchase_at,
      'last_purchase_at',p.last_purchase_at,
      'min_unit_price_minor',p.min_unit_price_minor,
      'max_unit_price_minor',p.max_unit_price_minor,
      'avg_unit_price_minor',p.avg_unit_price_minor
    ),
    'aliases',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',pa.id,
        'merchant_id',pa.merchant_id,
        'merchant_name',m.name,
        'raw_alias',pa.raw_alias,
        'normalized_alias',pa.normalized_alias,
        'source',pa.source,
        'confidence',pa.confidence,
        'times_confirmed',pa.times_confirmed,
        'use_count',pa.use_count,
        'last_used_at',pa.last_used_at,
        'is_active',pa.is_active
      ) order by
        case pa.source
          when 'user' then 10 when 'learned' then 20 when 'merchant' then 30
          when 'global' then 40 when 'ai' then 50 end,
        pa.use_count desc,pa.created_at)
      from finance.product_aliases pa
      left join finance.merchants m
        on m.id=pa.merchant_id and m.user_id=pa.user_id
      where pa.product_id=p.id and pa.user_id=p.user_id
    ),'[]'::jsonb),
    'price_history',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',pp.id,
        'merchant_id',pp.merchant_id,
        'merchant_name',m.name,
        'receipt_item_id',pp.receipt_item_id,
        'observed_at',pp.observed_at,
        'currency_code',pp.currency_code,
        'list_unit_price_minor',pp.list_unit_price_minor,
        'effective_unit_price_minor',pp.effective_unit_price_minor,
        'quantity',pp.quantity
      ) order by pp.observed_at,pp.id)
      from finance.product_prices pp
      left join finance.merchants m
        on m.id=pp.merchant_id and m.user_id=pp.user_id
      where pp.product_id=p.id and pp.user_id=p.user_id
    ),'[]'::jsonb),
    'recent_purchases',coalesce((
      select jsonb_agg(x.data order by x.observed_at desc)
      from (
        select
          coalesce(r.purchased_at,r.capture_finalized_at,r.created_at) as observed_at,
          jsonb_build_object(
            'receipt_item_id',ri.id,
            'receipt_id',ri.receipt_id,
            'merchant_id',r.merchant_id,
            'merchant_name',m.name,
            'purchased_at',r.purchased_at,
            'quantity',ri.quantity,
            'line_total_minor',ri.line_total_minor,
            'discount_minor',ri.discount_minor,
            'deposit_minor',ri.deposit_minor,
            'effective_total_minor',ri.effective_total_minor,
            'currency_code',r.currency_code,
            'raw_name',ri.raw_name
          ) as data
        from finance.receipt_items ri
        join finance.receipts r
          on r.id=ri.receipt_id and r.user_id=ri.user_id
        left join finance.merchants m
          on m.id=r.merchant_id and m.user_id=r.user_id
        where ri.product_id=p.id and ri.user_id=p.user_id
        order by coalesce(r.purchased_at,r.capture_finalized_at,r.created_at) desc
        limit 50
      ) x
    ),'[]'::jsonb)
  )
  from finance.product_intelligence_summary p
  where p.id=p_product_id;
$$;

revoke all on function finance.get_product_detail(uuid) from public,anon;
grant execute on function finance.get_product_detail(uuid) to authenticated,service_role;
