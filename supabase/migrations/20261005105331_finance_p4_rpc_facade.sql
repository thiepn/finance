
create or replace function public.finance_start_receipt_capture(
  p_client_capture_id uuid,
  p_method finance.receipt_capture_method default 'camera',
  p_device_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language sql
security invoker
set search_path=''
as $$
  select finance.start_receipt_capture(
    p_client_capture_id,p_method,p_device_id,p_metadata
  );
$$;

create or replace function public.finance_register_receipt_page(
  p_receipt_id uuid,
  p_client_page_id uuid,
  p_page_index integer,
  p_storage_path text,
  p_mime_type text,
  p_byte_size bigint,
  p_width_px integer default null,
  p_height_px integer default null,
  p_sha256 text default null,
  p_captured_at timestamptz default null,
  p_capture_method finance.receipt_capture_method default 'camera',
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language sql
security invoker
set search_path=''
as $$
  select finance.register_receipt_page(
    p_receipt_id,p_client_page_id,p_page_index,p_storage_path,p_mime_type,
    p_byte_size,p_width_px,p_height_px,p_sha256,p_captured_at,p_capture_method,p_metadata
  );
$$;

create or replace function public.finance_reorder_receipt_pages(
  p_receipt_id uuid,
  p_page_ids uuid[]
)
returns void
language sql
security invoker
set search_path=''
as $$
  select finance.reorder_receipt_pages(p_receipt_id,p_page_ids);
$$;

create or replace function public.finance_unregister_receipt_page(p_page_id uuid)
returns text
language sql
security invoker
set search_path=''
as $$
  select finance.unregister_receipt_page(p_page_id);
$$;

create or replace function public.finance_finalize_receipt_capture(p_receipt_id uuid)
returns jsonb
language sql
security invoker
set search_path=''
as $$
  select finance.finalize_receipt_capture(p_receipt_id);
$$;

create or replace function public.finance_cancel_receipt_capture(p_receipt_id uuid)
returns void
language sql
security invoker
set search_path=''
as $$
  select finance.cancel_receipt_capture(p_receipt_id);
$$;

create or replace function public.finance_get_receipt_capture(p_receipt_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path=''
as $$
  select finance.get_receipt_capture(p_receipt_id);
$$;

create or replace function public.finance_get_receipt_capture_queue(p_limit integer default 50)
returns jsonb
language sql
stable
security invoker
set search_path=''
as $$
  select finance.get_receipt_capture_queue(p_limit);
$$;

do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname in (
        'finance_start_receipt_capture','finance_register_receipt_page',
        'finance_reorder_receipt_pages','finance_unregister_receipt_page',
        'finance_finalize_receipt_capture','finance_cancel_receipt_capture',
        'finance_get_receipt_capture','finance_get_receipt_capture_queue'
      )
  loop
    execute format('revoke all on function %s from public,anon',f);
    execute format('grant execute on function %s to authenticated,service_role',f);
  end loop;
end $$;
