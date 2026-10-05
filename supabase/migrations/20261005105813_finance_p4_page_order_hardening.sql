
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
  v_existing_index integer;
  v_store_index integer;
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

  select id,page_index
  into v_page_id,v_existing_index
  from finance.receipt_pages
  where user_id=v_user_id and client_page_id=p_client_page_id;

  if found then
    if not exists(
      select 1 from finance.receipt_pages
      where id=v_page_id and receipt_id=p_receipt_id and user_id=v_user_id
    ) then
      raise exception using errcode='23514', message='client page id already belongs to another receipt';
    end if;

    update finance.receipt_pages
    set storage_path=p_storage_path,
        mime_type=p_mime_type,
        byte_size=p_byte_size,
        width_px=p_width_px,
        height_px=p_height_px,
        sha256=p_sha256,
        captured_at=p_captured_at,
        capture_method=p_capture_method,
        status='uploaded',
        error_text=null,
        metadata=p_metadata,
        updated_at=now()
    where id=v_page_id and user_id=v_user_id;
  else
    if exists(
      select 1 from finance.receipt_pages
      where receipt_id=p_receipt_id and user_id=v_user_id and page_index=p_page_index
    ) then
      select coalesce(max(page_index),-1)+1
      into v_store_index
      from finance.receipt_pages
      where receipt_id=p_receipt_id and user_id=v_user_id;
    else
      v_store_index := p_page_index;
    end if;

    insert into finance.receipt_pages(
      user_id,receipt_id,client_page_id,page_index,storage_path,mime_type,
      byte_size,width_px,height_px,sha256,captured_at,capture_method,status,metadata
    )
    values(
      v_user_id,p_receipt_id,p_client_page_id,v_store_index,p_storage_path,p_mime_type,
      p_byte_size,p_width_px,p_height_px,p_sha256,p_captured_at,p_capture_method,'uploaded',p_metadata
    )
    returning id into v_page_id;
  end if;

  update finance.receipts
  set capture_status='uploading'
  where id=p_receipt_id and user_id=v_user_id;

  return v_page_id;
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

  update finance.receipt_pages
  set page_index=page_index+1000000
  where receipt_id=v_receipt_id and user_id=v_user_id;

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
