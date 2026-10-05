
create or replace function public.finance_get_receipt_review(
  p_receipt_id uuid
)
returns jsonb
language sql
stable
security invoker
set search_path=''
as $$
  select finance.get_receipt_review(p_receipt_id);
$$;

create or replace function public.finance_get_receipt_review_queue(
  p_limit integer default 50
)
returns jsonb
language sql
stable
security invoker
set search_path=''
as $$
  select finance.get_receipt_review_queue(p_limit);
$$;

create or replace function public.finance_start_receipt_review(
  p_receipt_id uuid
)
returns jsonb
language sql
security invoker
set search_path=''
as $$
  select finance.start_receipt_review(p_receipt_id);
$$;

create or replace function public.finance_accept_receipt_header(
  p_receipt_id uuid,
  p_note text default null
)
returns jsonb
language sql
security invoker
set search_path=''
as $$
  select finance.accept_receipt_header(p_receipt_id,p_note);
$$;

create or replace function public.finance_update_receipt_header_review(
  p_receipt_id uuid,
  p_patch jsonb,
  p_note text default null
)
returns jsonb
language sql
security invoker
set search_path=''
as $$
  select finance.update_receipt_header_review(p_receipt_id,p_patch,p_note);
$$;

create or replace function public.finance_accept_receipt_item_review(
  p_receipt_item_id uuid,
  p_note text default null
)
returns jsonb
language sql
security invoker
set search_path=''
as $$
  select finance.accept_receipt_item_review(p_receipt_item_id,p_note);
$$;

create or replace function public.finance_update_receipt_item_review(
  p_receipt_item_id uuid,
  p_patch jsonb,
  p_note text default null
)
returns jsonb
language sql
security invoker
set search_path=''
as $$
  select finance.update_receipt_item_review(p_receipt_item_id,p_patch,p_note);
$$;

create or replace function public.finance_set_receipt_item_excluded(
  p_receipt_item_id uuid,
  p_excluded boolean,
  p_note text default null
)
returns jsonb
language sql
security invoker
set search_path=''
as $$
  select finance.set_receipt_item_excluded(p_receipt_item_id,p_excluded,p_note);
$$;

create or replace function public.finance_skip_receipt_item_product(
  p_receipt_item_id uuid,
  p_note text default null
)
returns jsonb
language sql
security invoker
set search_path=''
as $$
  select finance.skip_receipt_item_product(p_receipt_item_id,p_note);
$$;

create or replace function public.finance_waive_receipt_review_reason(
  p_receipt_id uuid,
  p_reason text,
  p_note text
)
returns jsonb
language sql
security invoker
set search_path=''
as $$
  select finance.waive_receipt_review_reason(p_receipt_id,p_reason,p_note);
$$;

create or replace function public.finance_review_assign_product(
  p_receipt_item_id uuid,
  p_product_id uuid,
  p_learn_merchant_alias boolean default true,
  p_note text default null
)
returns jsonb
language sql
security invoker
set search_path=''
as $$
  select finance.review_assign_product(
    p_receipt_item_id,p_product_id,p_learn_merchant_alias,p_note
  );
$$;

create or replace function public.finance_review_create_product_candidate(
  p_receipt_item_id uuid,
  p_candidate jsonb,
  p_note text default null
)
returns jsonb
language sql
security invoker
set search_path=''
as $$
  select finance.review_create_product_candidate(
    p_receipt_item_id,p_candidate,p_note
  );
$$;

create or replace function public.finance_confirm_receipt_review(
  p_receipt_id uuid
)
returns jsonb
language sql
security invoker
set search_path=''
as $$
  select finance.confirm_receipt_review(p_receipt_id);
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
        'finance_get_receipt_review',
        'finance_get_receipt_review_queue',
        'finance_start_receipt_review',
        'finance_accept_receipt_header',
        'finance_update_receipt_header_review',
        'finance_accept_receipt_item_review',
        'finance_update_receipt_item_review',
        'finance_set_receipt_item_excluded',
        'finance_skip_receipt_item_product',
        'finance_waive_receipt_review_reason',
        'finance_review_assign_product',
        'finance_review_create_product_candidate',
        'finance_confirm_receipt_review'
      )
  loop
    execute format('revoke all on function %s from public,anon',f);
    execute format('grant execute on function %s to authenticated,service_role',f);
  end loop;
end $$;
