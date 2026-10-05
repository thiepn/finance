
create or replace function public.finance_begin_receipt_processing(
  p_receipt_id uuid,
  p_mode finance.receipt_pipeline_mode,
  p_pipeline_version text,
  p_ocr_provider text,
  p_ocr_model text,
  p_parser_version text,
  p_input_digest text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language sql
security invoker
set search_path=''
as $$
  select finance.begin_receipt_processing(
    p_receipt_id,p_mode,p_pipeline_version,p_ocr_provider,p_ocr_model,
    p_parser_version,p_input_digest,p_metadata
  );
$$;

create or replace function public.finance_submit_receipt_extraction(
  p_run_id uuid,
  p_payload jsonb
)
returns jsonb
language sql
security invoker
set search_path=''
as $$
  select finance.submit_receipt_extraction(p_run_id,p_payload);
$$;

create or replace function public.finance_fail_receipt_processing(
  p_run_id uuid,
  p_error_text text,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language sql
security invoker
set search_path=''
as $$
  select finance.fail_receipt_processing(p_run_id,p_error_text,p_metadata);
$$;

create or replace function public.finance_get_receipt_processing(
  p_receipt_id uuid
)
returns jsonb
language sql
stable
security invoker
set search_path=''
as $$
  select finance.get_receipt_processing(p_receipt_id);
$$;

do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname in (
        'finance_begin_receipt_processing',
        'finance_submit_receipt_extraction',
        'finance_fail_receipt_processing',
        'finance_get_receipt_processing'
      )
  loop
    execute format('revoke all on function %s from public,anon',f);
    execute format('grant execute on function %s to authenticated,service_role',f);
  end loop;
end $$;
