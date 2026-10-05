
create or replace function finance.start_receipt_capture(
  p_client_capture_id uuid,
  p_method finance.receipt_capture_method default 'camera',
  p_device_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_user_id uuid := auth.uid();
  v_receipt finance.receipts%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode='42501', message='authentication required';
  end if;
  if p_client_capture_id is null then
    raise exception using errcode='23514', message='client capture id is required';
  end if;
  if p_metadata is null or jsonb_typeof(p_metadata)<>'object' then
    raise exception using errcode='23514', message='capture metadata must be an object';
  end if;

  select * into v_receipt
  from finance.receipts
  where user_id=v_user_id and client_capture_id=p_client_capture_id;

  if not found then
    insert into finance.receipts(
      user_id,currency_code,total_minor,processing_status,match_status,
      capture_method,capture_status,client_capture_id,capture_device_id,
      capture_started_at,capture_metadata
    )
    values(
      v_user_id,'EUR',null,'captured','unmatched',
      p_method,'draft',p_client_capture_id,nullif(btrim(p_device_id),''),
      now(),p_metadata
    )
    returning * into v_receipt;
  end if;

  return jsonb_build_object(
    'receipt_id',v_receipt.id,
    'client_capture_id',v_receipt.client_capture_id,
    'capture_status',v_receipt.capture_status,
    'processing_status',v_receipt.processing_status,
    'bucket','finance-receipts',
    'storage_prefix',v_user_id::text||'/'||v_receipt.id::text||'/'
  );
end;
$$;

create or replace function finance.register_receipt_page(
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
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_user_id uuid := auth.uid();
  v_status finance.receipt_capture_status;
  v_expected_prefix text;
  v_page_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode='42501', message='authentication required';
  end if;
  if p_client_page_id is null then
    raise exception using errcode='23514', message='client page id is required';
  end if;
  if p_page_index < 0 then
    raise exception using errcode='23514', message='page index cannot be negative';
  end if;
  if p_metadata is null or jsonb_typeof(p_metadata)<>'object' then
    raise exception using errcode='23514', message='page metadata must be an object';
  end if;

  select capture_status into v_status
  from finance.receipts
  where id=p_receipt_id and user_id=v_user_id;

  if not found then raise exception using errcode='P0002', message='receipt capture not found'; end if;
  if v_status in ('ready','cancelled') then
    raise exception using errcode='55000', message='receipt capture is no longer editable';
  end if;

  v_expected_prefix := v_user_id::text||'/'||p_receipt_id::text||'/'||p_client_page_id::text||'.';
  if p_storage_path not like v_expected_prefix||'%' then
    raise exception using errcode='23514', message='storage path does not match capture identity';
  end if;

  if not exists(
    select 1 from storage.objects
    where bucket_id='finance-receipts' and name=p_storage_path
  ) then
    raise exception using errcode='23503', message='uploaded receipt object not found in private storage';
  end if;

  insert into finance.receipt_pages(
    user_id,receipt_id,client_page_id,page_index,storage_path,mime_type,
    byte_size,width_px,height_px,sha256,captured_at,capture_method,status,metadata
  )
  values(
    v_user_id,p_receipt_id,p_client_page_id,p_page_index,p_storage_path,p_mime_type,
    p_byte_size,p_width_px,p_height_px,p_sha256,p_captured_at,p_capture_method,'uploaded',p_metadata
  )
  on conflict(user_id,client_page_id) do update
  set page_index=excluded.page_index,
      storage_path=excluded.storage_path,
      mime_type=excluded.mime_type,
      byte_size=excluded.byte_size,
      width_px=excluded.width_px,
      height_px=excluded.height_px,
      sha256=excluded.sha256,
      captured_at=excluded.captured_at,
      capture_method=excluded.capture_method,
      status='uploaded',
      error_text=null,
      metadata=excluded.metadata,
      updated_at=now()
  returning id into v_page_id;

  update finance.receipts
  set capture_status='uploading'
  where id=p_receipt_id and user_id=v_user_id;

  return v_page_id;
end;
$$;

create or replace function finance.reorder_receipt_pages(
  p_receipt_id uuid,
  p_page_ids uuid[]
)
returns void
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_user_id uuid := auth.uid();
  v_status finance.receipt_capture_status;
  v_count integer;
begin
  if v_user_id is null then raise exception using errcode='42501', message='authentication required'; end if;
  if p_page_ids is null or cardinality(p_page_ids)=0 then
    raise exception using errcode='23514', message='page order cannot be empty';
  end if;

  select capture_status into v_status
  from finance.receipts
  where id=p_receipt_id and user_id=v_user_id;
  if not found then raise exception using errcode='P0002', message='receipt capture not found'; end if;
  if v_status in ('ready','cancelled') then
    raise exception using errcode='55000', message='receipt capture is no longer editable';
  end if;

  select count(*)::integer into v_count
  from finance.receipt_pages
  where receipt_id=p_receipt_id and user_id=v_user_id;

  if v_count<>cardinality(p_page_ids) then
    raise exception using errcode='23514', message='page order must contain every receipt page exactly once';
  end if;

  select count(*)::integer into v_count
  from finance.receipt_pages rp
  join unnest(p_page_ids) x(id) on x.id=rp.id
  where rp.receipt_id=p_receipt_id and rp.user_id=v_user_id;

  if v_count<>cardinality(p_page_ids)
     or cardinality(p_page_ids)<>(select count(distinct x) from unnest(p_page_ids) x) then
    raise exception using errcode='23514', message='page order contains unknown or duplicate pages';
  end if;

  update finance.receipt_pages
  set page_index=page_index+1000000
  where receipt_id=p_receipt_id and user_id=v_user_id;

  update finance.receipt_pages rp
  set page_index=o.ord-1
  from unnest(p_page_ids) with ordinality o(id,ord)
  where rp.id=o.id and rp.user_id=v_user_id and rp.receipt_id=p_receipt_id;
end;
$$;

create or replace function finance.unregister_receipt_page(
  p_page_id uuid
)
returns text
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_user_id uuid := auth.uid();
  v_receipt_id uuid;
  v_status finance.receipt_capture_status;
  v_path text;
begin
  if v_user_id is null then raise exception using errcode='42501', message='authentication required'; end if;

  select rp.receipt_id,rp.storage_path,r.capture_status
  into v_receipt_id,v_path,v_status
  from finance.receipt_pages rp
  join finance.receipts r on r.id=rp.receipt_id and r.user_id=rp.user_id
  where rp.id=p_page_id and rp.user_id=v_user_id;

  if not found then raise exception using errcode='P0002', message='receipt page not found'; end if;
  if v_status in ('ready','cancelled') then
    raise exception using errcode='55000', message='receipt capture is no longer editable';
  end if;

  delete from finance.receipt_pages where id=p_page_id and user_id=v_user_id;

  with ordered as (
    select id,row_number() over(order by page_index,id)-1 as next_index
    from finance.receipt_pages
    where receipt_id=v_receipt_id and user_id=v_user_id
  )
  update finance.receipt_pages rp
  set page_index=o.next_index
  from ordered o
  where rp.id=o.id;

  return v_path;
end;
$$;

create or replace function finance.finalize_receipt_capture(
  p_receipt_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_user_id uuid := auth.uid();
  v_status finance.receipt_capture_status;
  v_count integer;
  v_failed integer;
  v_object_count integer;
  v_min integer;
  v_max integer;
begin
  if v_user_id is null then raise exception using errcode='42501', message='authentication required'; end if;

  select capture_status into v_status
  from finance.receipts
  where id=p_receipt_id and user_id=v_user_id;
  if not found then raise exception using errcode='P0002', message='receipt capture not found'; end if;
  if v_status='cancelled' then raise exception using errcode='55000', message='cancelled receipt cannot be finalized'; end if;
  if v_status='ready' then
    return finance.get_receipt_capture(p_receipt_id);
  end if;

  select count(*)::integer,
         count(*) filter(where status='failed')::integer,
         min(page_index),max(page_index)
  into v_count,v_failed,v_min,v_max
  from finance.receipt_pages
  where receipt_id=p_receipt_id and user_id=v_user_id;

  if v_count=0 then raise exception using errcode='23514', message='receipt requires at least one captured page'; end if;
  if v_failed>0 then raise exception using errcode='23514', message='receipt contains failed pages'; end if;
  if v_min<>0 or v_max<>v_count-1 then
    raise exception using errcode='23514', message='receipt page indexes must be contiguous from zero';
  end if;

  select count(*)::integer into v_object_count
  from finance.receipt_pages rp
  join storage.objects so
    on so.bucket_id='finance-receipts' and so.name=rp.storage_path
  where rp.receipt_id=p_receipt_id and rp.user_id=v_user_id;

  if v_object_count<>v_count then
    raise exception using errcode='23503', message='one or more receipt page files are missing from private storage';
  end if;

  update finance.receipt_pages
  set status='ready',error_text=null
  where receipt_id=p_receipt_id and user_id=v_user_id;

  update finance.receipts
  set capture_status='ready',
      capture_finalized_at=now(),
      processing_status='captured'
  where id=p_receipt_id and user_id=v_user_id;

  return finance.get_receipt_capture(p_receipt_id);
end;
$$;

create or replace function finance.cancel_receipt_capture(
  p_receipt_id uuid
)
returns void
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_user_id uuid := auth.uid();
  v_processing finance.receipt_processing_status;
begin
  if v_user_id is null then raise exception using errcode='42501', message='authentication required'; end if;

  select processing_status into v_processing
  from finance.receipts
  where id=p_receipt_id and user_id=v_user_id;
  if not found then raise exception using errcode='P0002', message='receipt capture not found'; end if;

  if v_processing not in ('captured','incomplete','processing_failed') then
    raise exception using errcode='55000', message='receipt processing has already advanced and cannot be cancelled';
  end if;

  delete from finance.receipt_pages
  where receipt_id=p_receipt_id and user_id=v_user_id;

  update finance.receipts
  set capture_status='cancelled',
      capture_cancelled_at=now(),
      capture_finalized_at=null,
      processing_status='incomplete'
  where id=p_receipt_id and user_id=v_user_id;
end;
$$;

create or replace function finance.get_receipt_capture(
  p_receipt_id uuid
)
returns jsonb
language sql
stable
security invoker
set search_path=''
as $$
  select jsonb_build_object(
    'id',r.id,
    'client_capture_id',r.client_capture_id,
    'capture_method',r.capture_method,
    'capture_status',r.capture_status,
    'processing_status',r.processing_status,
    'capture_device_id',r.capture_device_id,
    'capture_started_at',r.capture_started_at,
    'capture_finalized_at',r.capture_finalized_at,
    'capture_cancelled_at',r.capture_cancelled_at,
    'capture_metadata',r.capture_metadata,
    'merchant_id',r.merchant_id,
    'purchased_at',r.purchased_at,
    'currency_code',r.currency_code,
    'total_minor',r.total_minor,
    'bucket','finance-receipts',
    'pages',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',rp.id,
          'client_page_id',rp.client_page_id,
          'page_index',rp.page_index,
          'storage_path',rp.storage_path,
          'mime_type',rp.mime_type,
          'byte_size',rp.byte_size,
          'width_px',rp.width_px,
          'height_px',rp.height_px,
          'sha256',rp.sha256,
          'captured_at',rp.captured_at,
          'capture_method',rp.capture_method,
          'status',rp.status,
          'error_text',rp.error_text,
          'metadata',rp.metadata,
          'created_at',rp.created_at,
          'updated_at',rp.updated_at
        )
        order by rp.page_index,rp.id
      )
      from finance.receipt_pages rp
      where rp.receipt_id=r.id and rp.user_id=r.user_id
    ),'[]'::jsonb)
  )
  from finance.receipts r
  where r.id=p_receipt_id;
$$;

create or replace function finance.get_receipt_capture_queue(
  p_limit integer default 50
)
returns jsonb
language sql
stable
security invoker
set search_path=''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',x.id,
        'client_capture_id',x.client_capture_id,
        'capture_method',x.capture_method,
        'capture_status',x.capture_status,
        'processing_status',x.processing_status,
        'page_count',x.page_count,
        'failed_page_count',x.failed_page_count,
        'total_bytes',x.total_bytes,
        'capture_started_at',x.capture_started_at,
        'capture_finalized_at',x.capture_finalized_at,
        'last_page_at',x.last_page_at
      )
      order by x.capture_started_at desc
    ),
    '[]'::jsonb
  )
  from (
    select *
    from finance.receipt_capture_summary
    where capture_status <> 'cancelled'
    order by capture_started_at desc
    limit greatest(1,least(coalesce(p_limit,50),200))
  ) x;
$$;

do $$
declare f regprocedure;
begin
  for f in
    select p.oid::regprocedure
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='finance'
      and p.proname in (
        'start_receipt_capture','register_receipt_page','reorder_receipt_pages',
        'unregister_receipt_page','finalize_receipt_capture','cancel_receipt_capture',
        'get_receipt_capture','get_receipt_capture_queue'
      )
  loop
    execute format('revoke all on function %s from public,anon',f);
    execute format('grant execute on function %s to authenticated,service_role',f);
  end loop;
end $$;
