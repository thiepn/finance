CREATE OR REPLACE FUNCTION finance.cancel_import(p_import_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null then
    raise exception using errcode='42501',message='authentication required';
  end if;

  if exists(
    select 1 from finance.import_records
    where import_id=p_import_id
      and user_id=auth.uid()
      and status='imported'
  ) then
    raise exception using errcode='55000',
      message='import with committed transactions cannot be cancelled';
  end if;

  update finance.imports
  set status='cancelled',completed_at=now()
  where id=p_import_id
    and user_id=auth.uid()
    and status<>'completed';

  if not found then
    raise exception using errcode='23503',message='import not found or already completed';
  end if;

  update finance.import_records
  set status='ignored',decision='ignore'
  where import_id=p_import_id
    and user_id=auth.uid()
    and status='pending';

  return jsonb_build_object(
    'import_id',p_import_id,
    'status','cancelled'
  );
end;
$function$;

CREATE OR REPLACE FUNCTION finance.commit_import(p_import_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid:=auth.uid();
  v_import finance.imports%rowtype;
  v_row record;
  v_tx_id uuid;
  v_imported integer:=0;
  v_duplicates integer:=0;
  v_ignored integer:=0;
  v_failed integer:=0;
  v_review integer:=0;
  v_status finance.import_status;
  v_account_currency text;
  v_reporting_currency text;
  v_before_balance bigint;
  v_variance bigint;
  v_reconciliation jsonb:='{}'::jsonb;
begin
  if v_user_id is null then
    raise exception using errcode='42501',message='authentication required';
  end if;

  select * into v_import
  from finance.imports
  where id=p_import_id and user_id=v_user_id
  for update;

  if not found then
    raise exception using errcode='23503',message='import not found';
  end if;
  if v_import.status='cancelled' then
    raise exception using errcode='55000',message='cancelled import cannot be committed';
  end if;

  update finance.imports
  set status='processing'
  where id=p_import_id and user_id=v_user_id;

  for v_row in
    select *
    from finance.import_records
    where import_id=p_import_id and user_id=v_user_id
    order by row_number
  loop
    if v_row.status='imported' then
      v_imported:=v_imported+1;
      continue;
    end if;

    if v_row.decision='ignore' then
      update finance.import_records
      set status='ignored',error_text=null
      where id=v_row.id and user_id=v_user_id;
      v_ignored:=v_ignored+1;
      continue;
    end if;

    if v_row.decision='duplicate' then
      update finance.import_records
      set status='duplicate',error_text=null
      where id=v_row.id and user_id=v_user_id;
      v_duplicates:=v_duplicates+1;
      continue;
    end if;

    if v_row.decision='review' then
      v_review:=v_review+1;
      continue;
    end if;

    begin
      v_tx_id:=finance.commit_import_record(v_row.id);
      v_imported:=v_imported+1;
    exception
      when unique_violation then
        update finance.import_records
        set
          status='duplicate',
          decision='duplicate',
          duplicate_reason=coalesce(
            duplicate_reason,
            'source_id'::finance.import_duplicate_reason
          ),
          error_text=null
        where id=v_row.id and user_id=v_user_id;
        v_duplicates:=v_duplicates+1;
      when others then
        update finance.import_records
        set status='failed',error_text=sqlerrm
        where id=v_row.id and user_id=v_user_id;
        v_failed:=v_failed+1;
    end;
  end loop;

  select
    count(*) filter(where status='imported'),
    count(*) filter(where status='duplicate'),
    count(*) filter(where status='ignored'),
    count(*) filter(where status='failed'),
    count(*) filter(where decision='review' and status='pending')
  into v_imported,v_duplicates,v_ignored,v_failed,v_review
  from finance.import_records
  where import_id=p_import_id and user_id=v_user_id;

  v_status:=case
    when v_failed>0 or v_review>0
      then 'review_required'::finance.import_status
    else 'completed'::finance.import_status
  end;

  select a.currency_code,p.reporting_currency
  into v_account_currency,v_reporting_currency
  from finance.accounts a
  join finance.profiles p on p.user_id=a.user_id
  where a.id=v_import.account_id and a.user_id=v_user_id;

  if v_status='completed'
     and v_import.closing_balance_minor is not null
     and v_import.closing_balance_at is not null then
    select balance_minor
    into v_before_balance
    from finance.account_balance_at(
      v_import.account_id,
      v_import.closing_balance_at
    );

    v_variance:=v_import.closing_balance_minor-coalesce(v_before_balance,0);

    if v_account_currency=v_reporting_currency then
      perform finance.record_account_balance_observation(
        v_import.account_id,
        v_import.closing_balance_minor,
        v_import.closing_balance_at,
        null,
        null,
        'import',
        'Closing balance from import '||p_import_id::text
      );

      v_reconciliation:=jsonb_build_object(
        'status',case when v_variance=0 then 'balanced' else 'anchored_with_variance' end,
        'ledger_balance_before_anchor_minor',coalesce(v_before_balance,0),
        'statement_closing_balance_minor',v_import.closing_balance_minor,
        'variance_minor',v_variance,
        'anchored',true,
        'anchored_at',v_import.closing_balance_at
      );
    else
      v_reconciliation:=jsonb_build_object(
        'status','requires_fx',
        'ledger_balance_before_anchor_minor',coalesce(v_before_balance,0),
        'statement_closing_balance_minor',v_import.closing_balance_minor,
        'variance_minor',v_variance,
        'anchored',false
      );
    end if;
  end if;

  update finance.imports
  set
    status=v_status,
    imported_count=v_imported,
    duplicate_count=v_duplicates,
    failed_count=v_failed,
    completed_at=case when v_status='completed' then now() else null end,
    committed_at=case when v_status='completed' then now() else committed_at end,
    metadata=case
      when v_reconciliation='{}'::jsonb then metadata
      else jsonb_set(
        metadata,'{reconciliation}',v_reconciliation,true
      )
    end
  where id=p_import_id and user_id=v_user_id;

  return jsonb_build_object(
    'import_id',p_import_id,
    'status',v_status,
    'imported_count',v_imported,
    'duplicate_count',v_duplicates,
    'ignored_count',v_ignored,
    'failed_count',v_failed,
    'review_count',v_review,
    'reconciliation',v_reconciliation
  );
end;
$function$;

CREATE OR REPLACE FUNCTION finance.commit_import_record(p_record_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid:=auth.uid();
  v_record finance.import_records%rowtype;
  v_import finance.imports%rowtype;
  v_account_currency text;
  v_other_currency text;
  v_reporting_currency text;
  v_tx_id uuid:=gen_random_uuid();
  v_tx_external text;
  v_reporting_signed bigint;
  v_abs_reporting bigint;
  v_abs_account bigint;
  v_category_kind finance.category_kind;
  v_necessity finance.necessity;
  v_from uuid;
  v_to uuid;
begin
  if v_user_id is null then
    raise exception using errcode='42501',message='authentication required';
  end if;

  select * into v_record
  from finance.import_records
  where id=p_record_id and user_id=v_user_id;

  if not found then
    raise exception using errcode='23503',message='import record not found';
  end if;
  if v_record.status='imported' and v_record.transaction_id is not null then
    return v_record.transaction_id;
  end if;
  if v_record.decision<>'import' then
    raise exception using errcode='55000',message='import record is not selected for import';
  end if;

  select * into v_import
  from finance.imports
  where id=v_record.import_id and user_id=v_user_id;

  if not found or v_import.status='cancelled' then
    raise exception using errcode='55000',message='import is unavailable';
  end if;

  select a.currency_code
  into v_account_currency
  from finance.accounts a
  where a.id=v_import.account_id
    and a.user_id=v_user_id
    and not a.is_archived;

  if v_account_currency is null then
    raise exception using errcode='23503',message='active import account not found';
  end if;

  select reporting_currency
  into v_reporting_currency
  from finance.profiles
  where user_id=v_user_id;

  if v_record.amount_minor is null or v_record.amount_minor=0 then
    raise exception using errcode='23514',message='import amount is invalid';
  end if;
  if v_record.currency_code<>v_account_currency then
    raise exception using errcode='23514',message='import currency does not match account';
  end if;

  v_reporting_signed:=case
    when v_record.currency_code=v_reporting_currency
      then v_record.amount_minor
    else v_record.reporting_amount_minor
  end;

  if v_reporting_signed is null then
    raise exception using errcode='23514',
      message='foreign-currency import requires reporting amount or exchange rate';
  end if;

  if sign(v_reporting_signed)<>sign(v_record.amount_minor) then
    raise exception using errcode='23514',
      message='reporting amount direction must match account amount';
  end if;

  v_abs_reporting:=abs(v_reporting_signed);
  v_abs_account:=abs(v_record.amount_minor);

  if v_record.source_hash is null then
    raise exception using errcode='23514',message='import source hash is required';
  end if;

  v_tx_external:=v_record.source_hash;
  if exists(
    select 1 from finance.transactions
    where user_id=v_user_id
      and source='import'
      and source_external_id=v_tx_external
  ) then
    v_tx_external:=v_record.source_hash||':'||v_record.id::text;
  end if;

  if v_record.proposed_type in ('expense','income') then
    if v_record.proposed_type='expense' and v_record.amount_minor>=0 then
      raise exception using errcode='23514',
        message='expense import requires a debit amount';
    end if;
    if v_record.proposed_type='income' and v_record.amount_minor<=0 then
      raise exception using errcode='23514',
        message='income import requires a credit amount';
    end if;

    if v_record.category_id is null then
      raise exception using errcode='23514',message='import category is required';
    end if;

    select kind,necessity_default
    into v_category_kind,v_necessity
    from finance.categories
    where id=v_record.category_id
      and user_id=v_user_id
      and not is_archived;

    if not found then
      raise exception using errcode='23503',message='import category not found';
    end if;
    if v_record.proposed_type='expense'
       and v_category_kind not in ('expense','both') then
      raise exception using errcode='23514',message='invalid expense category';
    end if;
    if v_record.proposed_type='income'
       and v_category_kind not in ('income','both') then
      raise exception using errcode='23514',message='invalid income category';
    end if;

    if v_record.necessity is not null then
      v_necessity:=v_record.necessity;
    end if;

    insert into finance.transactions(
      id,user_id,type,status,occurred_at,merchant_id,
      description,note,source,source_external_id,
      reporting_currency,metadata
    ) values(
      v_tx_id,v_user_id,v_record.proposed_type,'draft',
      v_record.booked_at,v_record.merchant_id,
      coalesce(v_record.description,v_record.counterparty_name),
      nullif(v_record.reference,''),
      'import',v_tx_external,v_reporting_currency,
      jsonb_build_object(
        'import_id',v_import.id,
        'import_record_id',v_record.id,
        'import_format',v_import.format,
        'import_source',v_import.source,
        'import_external_id',v_record.external_id,
        'import_source_hash',v_record.source_hash,
        'import_fingerprint',v_record.fingerprint,
        'counterparty_name',v_record.counterparty_name,
        'counterparty_iban',v_record.counterparty_iban,
        'value_date',v_record.value_date
      )
    );

    insert into finance.ledger_entries(
      user_id,transaction_id,entry_kind,account_id,
      signed_amount_minor,currency_code,reporting_amount_minor,
      exchange_rate,necessity,memo
    ) values(
      v_user_id,v_tx_id,'account',v_import.account_id,
      v_record.amount_minor,v_record.currency_code,
      v_reporting_signed,
      case
        when v_record.currency_code=v_reporting_currency then 1
        else coalesce(
          v_record.exchange_rate,
          abs(v_reporting_signed::numeric/v_record.amount_minor::numeric)
        )
      end,
      null,
      'Imported bank movement'
    );

    insert into finance.ledger_entries(
      user_id,transaction_id,entry_kind,category_id,
      signed_amount_minor,currency_code,reporting_amount_minor,
      necessity,memo
    ) values(
      v_user_id,v_tx_id,'category',v_record.category_id,
      case when v_record.proposed_type='expense'
        then v_abs_reporting else -v_abs_reporting end,
      v_reporting_currency,
      case when v_record.proposed_type='expense'
        then v_abs_reporting else -v_abs_reporting end,
      case when v_record.proposed_type='expense'
        then coalesce(v_necessity,'unclassified'::finance.necessity)
        else 'unclassified'::finance.necessity end,
      'Imported classification'
    );

  elsif v_record.proposed_type='transfer' then
    if v_record.transfer_account_id is null then
      raise exception using errcode='23514',message='transfer account is required';
    end if;

    select currency_code
    into v_other_currency
    from finance.accounts
    where id=v_record.transfer_account_id
      and user_id=v_user_id
      and not is_archived
      and id<>v_import.account_id;

    if v_other_currency is null then
      raise exception using errcode='23503',message='transfer account not found';
    end if;
    if v_account_currency<>v_other_currency
       or v_account_currency<>v_reporting_currency then
      raise exception using errcode='0A000',
        message='imported transfers currently require same reporting currency';
    end if;

    if v_record.amount_minor<0 then
      v_from:=v_import.account_id;
      v_to:=v_record.transfer_account_id;
    else
      v_from:=v_record.transfer_account_id;
      v_to:=v_import.account_id;
    end if;

    insert into finance.transactions(
      id,user_id,type,status,occurred_at,description,note,
      source,source_external_id,reporting_currency,metadata
    ) values(
      v_tx_id,v_user_id,'transfer','draft',v_record.booked_at,
      coalesce(v_record.description,'Imported transfer'),
      nullif(v_record.reference,''),
      'import',v_tx_external,v_reporting_currency,
      jsonb_build_object(
        'import_id',v_import.id,
        'import_record_id',v_record.id,
        'import_format',v_import.format,
        'import_source',v_import.source,
        'import_external_id',v_record.external_id,
        'import_source_hash',v_record.source_hash,
        'import_fingerprint',v_record.fingerprint,
        'counterparty_name',v_record.counterparty_name,
        'counterparty_iban',v_record.counterparty_iban,
        'value_date',v_record.value_date
      )
    );

    insert into finance.ledger_entries(
      user_id,transaction_id,entry_kind,account_id,
      signed_amount_minor,currency_code,reporting_amount_minor,memo
    ) values
      (
        v_user_id,v_tx_id,'account',v_from,
        -v_abs_account,v_reporting_currency,-v_abs_reporting,
        'Imported transfer source'
      ),
      (
        v_user_id,v_tx_id,'account',v_to,
        v_abs_account,v_reporting_currency,v_abs_reporting,
        'Imported transfer destination'
      );
  else
    raise exception using errcode='23514',
      message='import transaction type is unresolved';
  end if;

  update finance.transactions
  set status='posted',posted_at=now()
  where id=v_tx_id and user_id=v_user_id;

  update finance.import_records
  set status='imported',
      transaction_id=v_tx_id,
      error_text=null
  where id=p_record_id and user_id=v_user_id;

  return v_tx_id;
end;
$function$;

CREATE OR REPLACE FUNCTION finance.get_import_dashboard()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid:=auth.uid();
begin
  if v_user_id is null then
    raise exception using errcode='42501',message='authentication required';
  end if;

  return jsonb_build_object(
    'imports',coalesce((
      select jsonb_agg(jsonb_build_object(
        'import_id',i.id,
        'account_id',i.account_id,
        'account_name',a.name,
        'source',i.source,
        'format',i.format,
        'file_name',i.file_name,
        'status',i.status,
        'row_count',i.row_count,
        'imported_count',i.imported_count,
        'duplicate_count',i.duplicate_count,
        'failed_count',i.failed_count,
        'statement_from',i.statement_from,
        'statement_to',i.statement_to,
        'created_at',i.created_at,
        'committed_at',i.committed_at,
        'reconciliation',i.metadata->'reconciliation'
      ) order by i.created_at desc)
      from (
        select * from finance.imports
        where user_id=v_user_id
        order by created_at desc
        limit 50
      ) i
      left join finance.accounts a
        on a.id=i.account_id and a.user_id=i.user_id
    ),'[]'::jsonb),
    'profiles',coalesce((
      select jsonb_agg(jsonb_build_object(
        'profile_id',p.id,
        'name',p.name,
        'format',p.format,
        'institution_key',p.institution_key,
        'account_id',p.account_id,
        'header_signature',p.header_signature,
        'mapping',p.mapping,
        'is_default',p.is_default
      ) order by p.is_default desc,p.name)
      from finance.import_profiles p
      where p.user_id=v_user_id
    ),'[]'::jsonb),
    'accounts',coalesce((
      select jsonb_agg(jsonb_build_object(
        'account_id',a.id,
        'name',a.name,
        'kind',a.kind,
        'currency_code',a.currency_code,
        'institution_name',a.institution_name
      ) order by a.sort_order,a.name)
      from finance.accounts a
      where a.user_id=v_user_id and not a.is_archived
    ),'[]'::jsonb)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION finance.get_import_preview(p_import_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid:=auth.uid();
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception using errcode='42501',message='authentication required';
  end if;
  if not exists(
    select 1 from finance.imports
    where id=p_import_id and user_id=v_user_id
  ) then
    raise exception using errcode='23503',message='import not found';
  end if;

  select jsonb_build_object(
    'import',jsonb_build_object(
      'import_id',i.id,
      'account_id',i.account_id,
      'source',i.source,
      'format',i.format,
      'file_name',i.file_name,
      'file_sha256',i.file_sha256,
      'storage_path',i.storage_path,
      'status',i.status,
      'row_count',i.row_count,
      'imported_count',i.imported_count,
      'duplicate_count',i.duplicate_count,
      'failed_count',i.failed_count,
      'account_identifier',i.account_identifier,
      'statement_currency',i.statement_currency,
      'statement_from',i.statement_from,
      'statement_to',i.statement_to,
      'closing_balance_minor',i.closing_balance_minor,
      'closing_balance_at',i.closing_balance_at,
      'mapping',i.mapping,
      'detected_metadata',i.detected_metadata,
      'metadata',i.metadata,
      'created_at',i.created_at,
      'previewed_at',i.previewed_at,
      'committed_at',i.committed_at
    ),
    'account',jsonb_build_object(
      'account_id',a.id,
      'name',a.name,
      'kind',a.kind,
      'currency_code',a.currency_code,
      'institution_name',a.institution_name
    ),
    'summary',jsonb_build_object(
      'ready_count',(
        select count(*) from finance.import_records r
        where r.user_id=v_user_id and r.import_id=i.id
          and r.decision='import' and r.status='pending'
      ),
      'review_count',(
        select count(*) from finance.import_records r
        where r.user_id=v_user_id and r.import_id=i.id
          and r.decision='review'
      ),
      'duplicate_count',(
        select count(*) from finance.import_records r
        where r.user_id=v_user_id and r.import_id=i.id
          and r.decision='duplicate'
      ),
      'ignored_count',(
        select count(*) from finance.import_records r
        where r.user_id=v_user_id and r.import_id=i.id
          and r.decision='ignore'
      ),
      'debit_minor',coalesce((
        select sum(abs(r.reporting_amount_minor))
        from finance.import_records r
        where r.user_id=v_user_id and r.import_id=i.id
          and r.reporting_amount_minor<0
      ),0),
      'credit_minor',coalesce((
        select sum(r.reporting_amount_minor)
        from finance.import_records r
        where r.user_id=v_user_id and r.import_id=i.id
          and r.reporting_amount_minor>0
      ),0)
    ),
    'records',coalesce((
      select jsonb_agg(jsonb_build_object(
        'record_id',r.id,
        'row_number',r.row_number,
        'status',r.status,
        'decision',r.decision,
        'external_id',r.external_id,
        'booked_at',r.booked_at,
        'value_date',r.value_date,
        'amount_minor',r.amount_minor,
        'reporting_amount_minor',r.reporting_amount_minor,
        'exchange_rate',r.exchange_rate,
        'currency_code',r.currency_code,
        'description',r.description,
        'counterparty_name',r.counterparty_name,
        'counterparty_iban',r.counterparty_iban,
        'reference',r.reference,
        'source_hash',r.source_hash,
        'fingerprint',r.fingerprint,
        'duplicate_reason',r.duplicate_reason,
        'duplicate_transaction_id',r.duplicate_transaction_id,
        'duplicate_record_id',r.duplicate_record_id,
        'proposed_type',r.proposed_type,
        'category_id',r.category_id,
        'necessity',r.necessity,
        'transfer_account_id',r.transfer_account_id,
        'merchant_id',r.merchant_id,
        'classification_result',r.classification_result,
        'transaction_id',r.transaction_id,
        'error_text',r.error_text
      ) order by r.row_number)
      from finance.import_records r
      where r.user_id=v_user_id and r.import_id=i.id
    ),'[]'::jsonb),
    'categories',coalesce((
      select jsonb_agg(jsonb_build_object(
        'category_id',ct.id,
        'name',ct.name,
        'kind',ct.kind,
        'necessity_default',ct.necessity_default,
        'depth',ct.depth,
        'path',to_jsonb(ct.name_path)
      ) order by ct.name_path)
      from finance.category_tree ct
      where ct.user_id=v_user_id and not ct.is_archived
    ),'[]'::jsonb),
    'accounts',coalesce((
      select jsonb_agg(jsonb_build_object(
        'account_id',x.id,
        'name',x.name,
        'kind',x.kind,
        'currency_code',x.currency_code,
        'institution_name',x.institution_name
      ) order by x.sort_order,x.name)
      from finance.accounts x
      where x.user_id=v_user_id and not x.is_archived
    ),'[]'::jsonb)
  )
  into v_result
  from finance.imports i
  join finance.accounts a
    on a.id=i.account_id and a.user_id=i.user_id
  where i.id=p_import_id and i.user_id=v_user_id;

  return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION finance.register_import_file(p_import_id uuid, p_storage_path text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid:=auth.uid();
  v_import finance.imports%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode='42501',message='authentication required';
  end if;

  select *
  into v_import
  from finance.imports
  where id=p_import_id and user_id=v_user_id;

  if not found then
    raise exception using errcode='23503',message='import not found';
  end if;
  if v_import.status in ('completed','cancelled') then
    raise exception using errcode='55000',message='import is no longer editable';
  end if;
  if p_storage_path is null
     or p_storage_path not like v_user_id::text||'/'||p_import_id::text||'/%' then
    raise exception using errcode='23514',message='invalid import storage path';
  end if;
  if not exists(
    select 1 from storage.objects
    where bucket_id='finance-imports' and name=p_storage_path
  ) then
    raise exception using errcode='23503',message='import storage object not found';
  end if;

  update finance.imports
  set storage_path=p_storage_path
  where id=p_import_id and user_id=v_user_id;

  return jsonb_build_object(
    'import_id',p_import_id,
    'storage_path',p_storage_path
  );
end;
$function$;

CREATE OR REPLACE FUNCTION finance.stage_import_records(p_import_id uuid, p_rows jsonb, p_statement jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid:=auth.uid();
  v_import finance.imports%rowtype;
  v_account_currency text;
  v_reporting_currency text;
  v_time_zone text:='Europe/Berlin';
  v_item jsonb;
  v_row_number integer:=0;
  v_external_id text;
  v_booked_at timestamptz;
  v_value_date date;
  v_amount bigint;
  v_currency text;
  v_reporting_amount bigint;
  v_exchange_rate numeric;
  v_description text;
  v_counterparty text;
  v_counterparty_iban text;
  v_reference text;
  v_fingerprint text;
  v_source_hash text;
  v_type finance.transaction_type;
  v_classification jsonb;
  v_category_id uuid;
  v_necessity finance.necessity;
  v_merchant_id uuid;
  v_decision finance.import_record_decision;
  v_dup_reason finance.import_duplicate_reason;
  v_dup_tx uuid;
  v_dup_record uuid;
  v_candidate_tx uuid;
  v_fallback_key text;
  v_record_id uuid;
  v_review_count integer:=0;
  v_duplicate_count integer:=0;
  v_import_count integer:=0;
begin
  if v_user_id is null then
    raise exception using errcode='42501',message='authentication required';
  end if;
  if jsonb_typeof(p_rows)<>'array' then
    raise exception using errcode='23514',message='import rows must be an array';
  end if;
  if jsonb_typeof(coalesce(p_statement,'{}'::jsonb))<>'object' then
    raise exception using errcode='23514',message='statement metadata must be an object';
  end if;

  select *
  into v_import
  from finance.imports
  where id=p_import_id and user_id=v_user_id;

  if not found then
    raise exception using errcode='23503',message='import not found';
  end if;
  if v_import.status in ('completed','cancelled') then
    raise exception using errcode='55000',message='import is no longer editable';
  end if;
  if exists(
    select 1 from finance.import_records
    where import_id=p_import_id and user_id=v_user_id
      and status='imported'
  ) then
    raise exception using errcode='55000',
      message='an import with committed records cannot be restaged';
  end if;

  select a.currency_code
  into v_account_currency
  from finance.accounts a
  where a.id=v_import.account_id
    and a.user_id=v_user_id
    and not a.is_archived;

  if v_account_currency is null then
    raise exception using errcode='23503',message='active import account not found';
  end if;

  select
    coalesce(reporting_currency,'EUR'),
    coalesce(time_zone,'Europe/Berlin')
  into v_reporting_currency,v_time_zone
  from finance.profiles
  where user_id=v_user_id;

  delete from finance.import_records
  where import_id=p_import_id and user_id=v_user_id;

  for v_item in
    select value from jsonb_array_elements(p_rows)
  loop
    v_row_number:=v_row_number+1;

    if jsonb_typeof(v_item)<>'object' then
      raise exception using errcode='23514',
        message=format('import row %s must be an object',v_row_number);
    end if;

    v_external_id:=nullif(btrim(v_item->>'external_id'),'');
    v_booked_at:=(v_item->>'booked_at')::timestamptz;
    v_value_date:=nullif(v_item->>'value_date','')::date;
    v_amount:=(v_item->>'amount_minor')::bigint;
    v_currency:=upper(nullif(btrim(v_item->>'currency_code'),''));
    v_reporting_amount:=nullif(v_item->>'reporting_amount_minor','')::bigint;
    v_exchange_rate:=nullif(v_item->>'exchange_rate','')::numeric;
    v_description:=nullif(btrim(v_item->>'description'),'');
    v_counterparty:=nullif(btrim(v_item->>'counterparty_name'),'');
    v_counterparty_iban:=nullif(
      upper(regexp_replace(coalesce(v_item->>'counterparty_iban',''),'\s','','g')),
      ''
    );
    v_reference:=nullif(btrim(v_item->>'reference'),'');

    if v_booked_at is null then
      raise exception using errcode='23514',
        message=format('import row %s is missing booked_at',v_row_number);
    end if;
    if v_amount is null or v_amount=0 then
      raise exception using errcode='23514',
        message=format('import row %s has invalid amount',v_row_number);
    end if;
    if v_currency is null or v_currency !~ '^[A-Z]{3}$' then
      raise exception using errcode='23514',
        message=format('import row %s has invalid currency',v_row_number);
    end if;
    if v_currency<>v_account_currency then
      raise exception using errcode='23514',
        message=format(
          'import row %s currency %s does not match account currency %s',
          v_row_number,v_currency,v_account_currency
        );
    end if;

    if v_currency=v_reporting_currency then
      v_reporting_amount:=v_amount;
      v_exchange_rate:=1;
    elsif v_reporting_amount is null then
      if v_exchange_rate is null or v_exchange_rate<=0 then
        v_reporting_amount:=null;
      else
        v_reporting_amount:=round(v_amount*v_exchange_rate)::bigint;
      end if;
    elsif v_exchange_rate is null and v_amount<>0 then
      v_exchange_rate:=abs(v_reporting_amount::numeric/v_amount::numeric);
    end if;

    v_type:=case when v_amount<0 then 'expense'::finance.transaction_type
                 else 'income'::finance.transaction_type end;

    v_fallback_key:=concat_ws('|',
      (v_booked_at at time zone v_time_zone)::date::text,
      v_amount::text,
      v_currency,
      lower(coalesce(v_counterparty,'')),
      lower(coalesce(v_counterparty_iban,'')),
      lower(coalesce(v_reference,'')),
      lower(coalesce(v_description,''))
    );
    v_fingerprint:=encode(
      extensions.digest(v_fallback_key,'sha256'),
      'hex'
    );

    v_source_hash:=encode(
      extensions.digest(
        case
          when v_external_id is not null then
            'external|'||v_import.account_id::text||'|'||
            v_import.format::text||'|'||v_external_id
          else
            'fingerprint|'||v_import.account_id::text||'|'||
            v_fingerprint
        end,
        'sha256'
      ),
      'hex'
    );

    v_dup_reason:=null;
    v_dup_tx:=null;
    v_dup_record:=null;
    v_decision:='import';

    select r.id
    into v_dup_record
    from finance.import_records r
    where r.user_id=v_user_id
      and r.import_id=p_import_id
      and r.source_hash=v_source_hash
    order by r.row_number
    limit 1;

    if v_dup_record is not null then
      v_dup_reason:='within_file';
      v_decision:='review';
    else
      select t.id
      into v_dup_tx
      from finance.transactions t
      where t.user_id=v_user_id
        and t.source='import'
        and t.source_external_id=v_source_hash
        and t.status in ('posted','void')
      order by t.created_at desc
      limit 1;

      if v_dup_tx is not null then
        if v_external_id is not null then
          v_dup_reason:='source_id';
          v_decision:='duplicate';
        else
          v_dup_reason:='fingerprint';
          v_decision:='review';
        end if;
      else
        select t.id
        into v_candidate_tx
        from finance.transactions t
        join finance.ledger_entries le
          on le.transaction_id=t.id
         and le.user_id=t.user_id
         and le.entry_kind='account'
         and le.account_id=v_import.account_id
        where t.user_id=v_user_id
          and t.status='posted'
          and t.source<>'import'
          and le.signed_amount_minor=v_amount
          and (t.occurred_at at time zone v_time_zone)::date=
              (v_booked_at at time zone v_time_zone)::date
        order by t.created_at desc
        limit 1;

        if v_candidate_tx is not null then
          v_dup_tx:=v_candidate_tx;
          v_dup_reason:='existing_transaction';
          v_decision:='review';
        end if;
      end if;
    end if;

    v_classification:=finance.resolve_classification(
      'transaction',
      jsonb_strip_nulls(jsonb_build_object(
        'transaction_type',v_type::text,
        'description',v_description,
        'raw_name',v_counterparty,
        'merchant_name',v_counterparty,
        'amount_minor',abs(v_reporting_amount)
      ))
    );

    v_category_id:=nullif(v_classification->>'category_id','')::uuid;
    v_merchant_id:=nullif(v_classification->>'merchant_id','')::uuid;
    v_necessity:=nullif(v_classification->>'necessity','')::finance.necessity;

    if v_category_id is null then
      select c.id,c.necessity_default
      into v_category_id,v_necessity
      from finance.categories c
      where c.user_id=v_user_id
        and c.system_key=case when v_type='expense'
          then 'other' else 'income_other' end
        and not c.is_archived
      limit 1;
    elsif v_necessity is null then
      select c.necessity_default
      into v_necessity
      from finance.categories c
      where c.user_id=v_user_id and c.id=v_category_id;
    end if;

    v_record_id:=gen_random_uuid();
    insert into finance.import_records(
      id,user_id,import_id,row_number,status,
      source_hash,raw_payload,normalized_payload,
      external_id,booked_at,value_date,amount_minor,
      reporting_amount_minor,exchange_rate,currency_code,
      description,counterparty_name,counterparty_iban,reference,
      fingerprint,decision,duplicate_reason,
      duplicate_transaction_id,duplicate_record_id,
      proposed_type,category_id,necessity,merchant_id,
      classification_result
    ) values(
      v_record_id,v_user_id,p_import_id,v_row_number,
      case when v_decision='duplicate'
        then 'duplicate'::finance.import_record_status
        else 'pending'::finance.import_record_status end,
      v_source_hash,v_item,
      jsonb_strip_nulls(jsonb_build_object(
        'external_id',v_external_id,
        'booked_at',v_booked_at,
        'value_date',v_value_date,
        'amount_minor',v_amount,
        'reporting_amount_minor',v_reporting_amount,
        'exchange_rate',v_exchange_rate,
        'currency_code',v_currency,
        'description',v_description,
        'counterparty_name',v_counterparty,
        'counterparty_iban',v_counterparty_iban,
        'reference',v_reference
      )),
      v_external_id,v_booked_at,v_value_date,v_amount,
      v_reporting_amount,v_exchange_rate,v_currency,
      v_description,v_counterparty,v_counterparty_iban,v_reference,
      v_fingerprint,v_decision,v_dup_reason,
      v_dup_tx,v_dup_record,
      v_type,v_category_id,v_necessity,v_merchant_id,
      v_classification
    );

    if v_decision='import' then
      v_import_count:=v_import_count+1;
    elsif v_decision='duplicate' then
      v_duplicate_count:=v_duplicate_count+1;
    else
      v_review_count:=v_review_count+1;
    end if;
  end loop;

  update finance.imports
  set
    status='review_required',
    row_count=v_row_number,
    duplicate_count=v_duplicate_count,
    imported_count=0,
    failed_count=0,
    account_identifier=nullif(
      btrim(coalesce(p_statement->>'account_identifier','')),
      ''
    ),
    statement_currency=upper(nullif(
      btrim(coalesce(p_statement->>'currency_code','')),
      ''
    )),
    statement_from=nullif(p_statement->>'statement_from','')::date,
    statement_to=nullif(p_statement->>'statement_to','')::date,
    closing_balance_minor=
      nullif(p_statement->>'closing_balance_minor','')::bigint,
    closing_balance_at=
      nullif(p_statement->>'closing_balance_at','')::timestamptz,
    mapping=case
      when jsonb_typeof(p_statement->'mapping')='object'
        then p_statement->'mapping'
      else mapping
    end,
    detected_metadata=coalesce(
      p_statement->'metadata','{}'::jsonb
    ),
    previewed_at=now()
  where id=p_import_id and user_id=v_user_id;

  return jsonb_build_object(
    'import_id',p_import_id,
    'row_count',v_row_number,
    'ready_count',v_import_count,
    'review_count',v_review_count,
    'duplicate_count',v_duplicate_count
  );
end;
$function$;

CREATE OR REPLACE FUNCTION finance.start_import(p_account_id uuid, p_source text, p_format finance.import_format, p_client_import_id uuid, p_file_name text DEFAULT NULL::text, p_file_sha256 text DEFAULT NULL::text, p_mime_type text DEFAULT NULL::text, p_file_size bigint DEFAULT NULL::bigint, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid:=auth.uid();
  v_id uuid;
  v_status finance.import_status;
begin
  if v_user_id is null then
    raise exception using errcode='42501',message='authentication required';
  end if;
  if nullif(btrim(p_source),'') is null then
    raise exception using errcode='23514',message='import source is required';
  end if;
  if p_client_import_id is null then
    raise exception using errcode='23514',message='client import id is required';
  end if;
  if p_file_sha256 is not null and p_file_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception using errcode='23514',message='invalid file SHA-256';
  end if;
  if p_file_size is not null and (p_file_size<0 or p_file_size>20971520) then
    raise exception using errcode='23514',message='import file exceeds 20 MiB limit';
  end if;
  if jsonb_typeof(coalesce(p_metadata,'{}'::jsonb))<>'object' then
    raise exception using errcode='23514',message='import metadata must be an object';
  end if;

  if not exists(
    select 1 from finance.accounts
    where id=p_account_id and user_id=v_user_id and not is_archived
  ) then
    raise exception using errcode='23503',message='active import account not found';
  end if;

  select id,status
  into v_id,v_status
  from finance.imports
  where user_id=v_user_id
    and client_import_id=p_client_import_id;

  if v_id is null then
    v_id:=gen_random_uuid();
    insert into finance.imports(
      id,user_id,account_id,source,file_name,status,
      format,client_import_id,file_sha256,mime_type,file_size,
      metadata,started_at
    ) values(
      v_id,v_user_id,p_account_id,btrim(p_source),
      nullif(btrim(p_file_name),''),'pending',
      p_format,p_client_import_id,p_file_sha256,
      nullif(btrim(p_mime_type),''),p_file_size,
      coalesce(p_metadata,'{}'::jsonb),now()
    );
    v_status:='pending';
  end if;

  return jsonb_build_object(
    'import_id',v_id,
    'status',v_status,
    'bucket','finance-imports',
    'storage_prefix',
      v_user_id::text||'/'||v_id::text||'/'
  );
end;
$function$;

CREATE OR REPLACE FUNCTION finance.update_import_record(p_record_id uuid, p_decision finance.import_record_decision DEFAULT NULL::finance.import_record_decision, p_proposed_type finance.transaction_type DEFAULT NULL::finance.transaction_type, p_category_id uuid DEFAULT NULL::uuid, p_necessity finance.necessity DEFAULT NULL::finance.necessity, p_transfer_account_id uuid DEFAULT NULL::uuid, p_reporting_amount_minor bigint DEFAULT NULL::bigint, p_exchange_rate numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid:=auth.uid();
  v_record finance.import_records%rowtype;
  v_import finance.imports%rowtype;
  v_kind finance.category_kind;
begin
  if v_user_id is null then
    raise exception using errcode='42501',message='authentication required';
  end if;

  select * into v_record
  from finance.import_records
  where id=p_record_id and user_id=v_user_id;

  if not found then
    raise exception using errcode='23503',message='import record not found';
  end if;

  select * into v_import
  from finance.imports
  where id=v_record.import_id and user_id=v_user_id;

  if v_import.status in ('completed','cancelled') or v_record.status='imported' then
    raise exception using errcode='55000',message='import record is not editable';
  end if;

  if p_proposed_type is not null
     and p_proposed_type not in ('expense','income','transfer') then
    raise exception using errcode='23514',message='unsupported imported transaction type';
  end if;

  if p_category_id is not null then
    select kind into v_kind
    from finance.categories
    where id=p_category_id and user_id=v_user_id and not is_archived;
    if not found then
      raise exception using errcode='23503',message='category not found';
    end if;
    if coalesce(p_proposed_type,v_record.proposed_type)='expense'
       and v_kind not in ('expense','both') then
      raise exception using errcode='23514',message='expense requires expense category';
    end if;
    if coalesce(p_proposed_type,v_record.proposed_type)='income'
       and v_kind not in ('income','both') then
      raise exception using errcode='23514',message='income requires income category';
    end if;
  end if;

  if coalesce(p_proposed_type,v_record.proposed_type)='transfer' then
    if p_transfer_account_id is null
       and v_record.transfer_account_id is null then
      raise exception using errcode='23514',message='transfer target account is required';
    end if;
    if not exists(
      select 1 from finance.accounts
      where id=coalesce(p_transfer_account_id,v_record.transfer_account_id)
        and user_id=v_user_id
        and not is_archived
        and id<>v_import.account_id
    ) then
      raise exception using errcode='23503',message='transfer target account not found';
    end if;
  end if;

  if p_exchange_rate is not null and p_exchange_rate<=0 then
    raise exception using errcode='23514',message='exchange rate must be positive';
  end if;

  update finance.import_records
  set
    decision=coalesce(p_decision,decision),
    proposed_type=coalesce(p_proposed_type,proposed_type),
    category_id=case
      when p_category_id is not null then p_category_id
      else category_id
    end,
    necessity=coalesce(p_necessity,necessity),
    transfer_account_id=case
      when p_transfer_account_id is not null
        then p_transfer_account_id
      else transfer_account_id
    end,
    reporting_amount_minor=coalesce(
      p_reporting_amount_minor,
      case
        when p_exchange_rate is not null
          then round(amount_minor*p_exchange_rate)::bigint
        else reporting_amount_minor
      end
    ),
    exchange_rate=coalesce(p_exchange_rate,exchange_rate),
    status=case
      when coalesce(p_decision,decision)='duplicate'
        then 'duplicate'::finance.import_record_status
      when status='duplicate'
        then 'pending'::finance.import_record_status
      else status
    end
  where id=p_record_id and user_id=v_user_id;

  return jsonb_build_object(
    'record_id',p_record_id,
    'decision',coalesce(p_decision,v_record.decision),
    'proposed_type',coalesce(p_proposed_type,v_record.proposed_type)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION finance.upsert_import_profile(p_profile_id uuid, p_name text, p_format finance.import_format, p_institution_key text DEFAULT NULL::text, p_account_id uuid DEFAULT NULL::uuid, p_header_signature text DEFAULT NULL::text, p_mapping jsonb DEFAULT '{}'::jsonb, p_is_default boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid:=auth.uid();
  v_id uuid:=coalesce(p_profile_id,gen_random_uuid());
begin
  if v_user_id is null then
    raise exception using errcode='42501',message='authentication required';
  end if;
  if nullif(btrim(p_name),'') is null then
    raise exception using errcode='23514',message='profile name is required';
  end if;
  if jsonb_typeof(coalesce(p_mapping,'{}'::jsonb))<>'object' then
    raise exception using errcode='23514',message='profile mapping must be an object';
  end if;
  if p_account_id is not null and not exists(
    select 1 from finance.accounts
    where id=p_account_id and user_id=v_user_id
  ) then
    raise exception using errcode='23503',message='profile account not found';
  end if;

  if p_is_default then
    update finance.import_profiles
    set is_default=false
    where user_id=v_user_id
      and format=p_format
      and coalesce(institution_key,'')=
          coalesce(nullif(btrim(p_institution_key),''),'')
      and id<>v_id;
  end if;

  if p_profile_id is null then
    insert into finance.import_profiles(
      id,user_id,name,format,institution_key,account_id,
      header_signature,mapping,is_default
    ) values(
      v_id,v_user_id,btrim(p_name),p_format,
      nullif(btrim(p_institution_key),''),
      p_account_id,nullif(btrim(p_header_signature),''),
      coalesce(p_mapping,'{}'::jsonb),p_is_default
    );
  else
    update finance.import_profiles
    set name=btrim(p_name),
        format=p_format,
        institution_key=nullif(btrim(p_institution_key),''),
        account_id=p_account_id,
        header_signature=nullif(btrim(p_header_signature),''),
        mapping=coalesce(p_mapping,'{}'::jsonb),
        is_default=p_is_default
    where id=p_profile_id and user_id=v_user_id;

    if not found then
      raise exception using errcode='23503',message='import profile not found';
    end if;
  end if;

  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.finance_cancel_import(p_import_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select finance.cancel_import(p_import_id);
$function$;

CREATE OR REPLACE FUNCTION public.finance_commit_import(p_import_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select finance.commit_import(p_import_id);
$function$;

CREATE OR REPLACE FUNCTION public.finance_get_import_dashboard()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select finance.get_import_dashboard();
$function$;

CREATE OR REPLACE FUNCTION public.finance_get_import_preview(p_import_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select finance.get_import_preview(p_import_id);
$function$;

CREATE OR REPLACE FUNCTION public.finance_register_import_file(p_import_id uuid, p_storage_path text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select finance.register_import_file(p_import_id,p_storage_path);
$function$;

CREATE OR REPLACE FUNCTION public.finance_stage_import_records(p_import_id uuid, p_rows jsonb, p_statement jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select finance.stage_import_records(
    p_import_id,p_rows,p_statement
  );
$function$;

CREATE OR REPLACE FUNCTION public.finance_start_import(p_account_id uuid, p_source text, p_format finance.import_format, p_client_import_id uuid, p_file_name text DEFAULT NULL::text, p_file_sha256 text DEFAULT NULL::text, p_mime_type text DEFAULT NULL::text, p_file_size bigint DEFAULT NULL::bigint, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select finance.start_import(
    p_account_id,p_source,p_format,p_client_import_id,
    p_file_name,p_file_sha256,p_mime_type,p_file_size,p_metadata
  );
$function$;

CREATE OR REPLACE FUNCTION public.finance_update_import_record(p_record_id uuid, p_decision finance.import_record_decision DEFAULT NULL::finance.import_record_decision, p_proposed_type finance.transaction_type DEFAULT NULL::finance.transaction_type, p_category_id uuid DEFAULT NULL::uuid, p_necessity finance.necessity DEFAULT NULL::finance.necessity, p_transfer_account_id uuid DEFAULT NULL::uuid, p_reporting_amount_minor bigint DEFAULT NULL::bigint, p_exchange_rate numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select finance.update_import_record(
    p_record_id,p_decision,p_proposed_type,p_category_id,p_necessity,
    p_transfer_account_id,p_reporting_amount_minor,p_exchange_rate
  );
$function$;

CREATE OR REPLACE FUNCTION public.finance_upsert_import_profile(p_profile_id uuid DEFAULT NULL::uuid, p_name text DEFAULT NULL::text, p_format finance.import_format DEFAULT 'csv'::finance.import_format, p_institution_key text DEFAULT NULL::text, p_account_id uuid DEFAULT NULL::uuid, p_header_signature text DEFAULT NULL::text, p_mapping jsonb DEFAULT '{}'::jsonb, p_is_default boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select finance.upsert_import_profile(
    p_profile_id,p_name,p_format,p_institution_key,p_account_id,
    p_header_signature,p_mapping,p_is_default
  );
$function$;

alter function finance.cancel_import(p_import_id uuid) security invoker;
revoke all on function finance.cancel_import(p_import_id uuid) from public,anon;
grant execute on function finance.cancel_import(p_import_id uuid) to authenticated,service_role;

alter function finance.commit_import(p_import_id uuid) security invoker;
revoke all on function finance.commit_import(p_import_id uuid) from public,anon;
grant execute on function finance.commit_import(p_import_id uuid) to authenticated,service_role;

alter function finance.commit_import_record(p_record_id uuid) security invoker;
revoke all on function finance.commit_import_record(p_record_id uuid) from public,anon;
grant execute on function finance.commit_import_record(p_record_id uuid) to authenticated,service_role;

alter function finance.get_import_dashboard() security invoker;
revoke all on function finance.get_import_dashboard() from public,anon;
grant execute on function finance.get_import_dashboard() to authenticated,service_role;

alter function finance.get_import_preview(p_import_id uuid) security invoker;
revoke all on function finance.get_import_preview(p_import_id uuid) from public,anon;
grant execute on function finance.get_import_preview(p_import_id uuid) to authenticated,service_role;

alter function finance.register_import_file(p_import_id uuid, p_storage_path text) security invoker;
revoke all on function finance.register_import_file(p_import_id uuid, p_storage_path text) from public,anon;
grant execute on function finance.register_import_file(p_import_id uuid, p_storage_path text) to authenticated,service_role;

alter function finance.stage_import_records(p_import_id uuid, p_rows jsonb, p_statement jsonb) security invoker;
revoke all on function finance.stage_import_records(p_import_id uuid, p_rows jsonb, p_statement jsonb) from public,anon;
grant execute on function finance.stage_import_records(p_import_id uuid, p_rows jsonb, p_statement jsonb) to authenticated,service_role;

alter function finance.start_import(p_account_id uuid, p_source text, p_format finance.import_format, p_client_import_id uuid, p_file_name text, p_file_sha256 text, p_mime_type text, p_file_size bigint, p_metadata jsonb) security invoker;
revoke all on function finance.start_import(p_account_id uuid, p_source text, p_format finance.import_format, p_client_import_id uuid, p_file_name text, p_file_sha256 text, p_mime_type text, p_file_size bigint, p_metadata jsonb) from public,anon;
grant execute on function finance.start_import(p_account_id uuid, p_source text, p_format finance.import_format, p_client_import_id uuid, p_file_name text, p_file_sha256 text, p_mime_type text, p_file_size bigint, p_metadata jsonb) to authenticated,service_role;

alter function finance.update_import_record(p_record_id uuid, p_decision finance.import_record_decision, p_proposed_type finance.transaction_type, p_category_id uuid, p_necessity finance.necessity, p_transfer_account_id uuid, p_reporting_amount_minor bigint, p_exchange_rate numeric) security invoker;
revoke all on function finance.update_import_record(p_record_id uuid, p_decision finance.import_record_decision, p_proposed_type finance.transaction_type, p_category_id uuid, p_necessity finance.necessity, p_transfer_account_id uuid, p_reporting_amount_minor bigint, p_exchange_rate numeric) from public,anon;
grant execute on function finance.update_import_record(p_record_id uuid, p_decision finance.import_record_decision, p_proposed_type finance.transaction_type, p_category_id uuid, p_necessity finance.necessity, p_transfer_account_id uuid, p_reporting_amount_minor bigint, p_exchange_rate numeric) to authenticated,service_role;

alter function finance.upsert_import_profile(p_profile_id uuid, p_name text, p_format finance.import_format, p_institution_key text, p_account_id uuid, p_header_signature text, p_mapping jsonb, p_is_default boolean) security invoker;
revoke all on function finance.upsert_import_profile(p_profile_id uuid, p_name text, p_format finance.import_format, p_institution_key text, p_account_id uuid, p_header_signature text, p_mapping jsonb, p_is_default boolean) from public,anon;
grant execute on function finance.upsert_import_profile(p_profile_id uuid, p_name text, p_format finance.import_format, p_institution_key text, p_account_id uuid, p_header_signature text, p_mapping jsonb, p_is_default boolean) to authenticated,service_role;

alter function public.finance_cancel_import(p_import_id uuid) security invoker;
revoke all on function public.finance_cancel_import(p_import_id uuid) from public,anon;
grant execute on function public.finance_cancel_import(p_import_id uuid) to authenticated,service_role;

alter function public.finance_commit_import(p_import_id uuid) security invoker;
revoke all on function public.finance_commit_import(p_import_id uuid) from public,anon;
grant execute on function public.finance_commit_import(p_import_id uuid) to authenticated,service_role;

alter function public.finance_get_import_dashboard() security invoker;
revoke all on function public.finance_get_import_dashboard() from public,anon;
grant execute on function public.finance_get_import_dashboard() to authenticated,service_role;

alter function public.finance_get_import_preview(p_import_id uuid) security invoker;
revoke all on function public.finance_get_import_preview(p_import_id uuid) from public,anon;
grant execute on function public.finance_get_import_preview(p_import_id uuid) to authenticated,service_role;

alter function public.finance_register_import_file(p_import_id uuid, p_storage_path text) security invoker;
revoke all on function public.finance_register_import_file(p_import_id uuid, p_storage_path text) from public,anon;
grant execute on function public.finance_register_import_file(p_import_id uuid, p_storage_path text) to authenticated,service_role;

alter function public.finance_stage_import_records(p_import_id uuid, p_rows jsonb, p_statement jsonb) security invoker;
revoke all on function public.finance_stage_import_records(p_import_id uuid, p_rows jsonb, p_statement jsonb) from public,anon;
grant execute on function public.finance_stage_import_records(p_import_id uuid, p_rows jsonb, p_statement jsonb) to authenticated,service_role;

alter function public.finance_start_import(p_account_id uuid, p_source text, p_format finance.import_format, p_client_import_id uuid, p_file_name text, p_file_sha256 text, p_mime_type text, p_file_size bigint, p_metadata jsonb) security invoker;
revoke all on function public.finance_start_import(p_account_id uuid, p_source text, p_format finance.import_format, p_client_import_id uuid, p_file_name text, p_file_sha256 text, p_mime_type text, p_file_size bigint, p_metadata jsonb) from public,anon;
grant execute on function public.finance_start_import(p_account_id uuid, p_source text, p_format finance.import_format, p_client_import_id uuid, p_file_name text, p_file_sha256 text, p_mime_type text, p_file_size bigint, p_metadata jsonb) to authenticated,service_role;

alter function public.finance_update_import_record(p_record_id uuid, p_decision finance.import_record_decision, p_proposed_type finance.transaction_type, p_category_id uuid, p_necessity finance.necessity, p_transfer_account_id uuid, p_reporting_amount_minor bigint, p_exchange_rate numeric) security invoker;
revoke all on function public.finance_update_import_record(p_record_id uuid, p_decision finance.import_record_decision, p_proposed_type finance.transaction_type, p_category_id uuid, p_necessity finance.necessity, p_transfer_account_id uuid, p_reporting_amount_minor bigint, p_exchange_rate numeric) from public,anon;
grant execute on function public.finance_update_import_record(p_record_id uuid, p_decision finance.import_record_decision, p_proposed_type finance.transaction_type, p_category_id uuid, p_necessity finance.necessity, p_transfer_account_id uuid, p_reporting_amount_minor bigint, p_exchange_rate numeric) to authenticated,service_role;

alter function public.finance_upsert_import_profile(p_profile_id uuid, p_name text, p_format finance.import_format, p_institution_key text, p_account_id uuid, p_header_signature text, p_mapping jsonb, p_is_default boolean) security invoker;
revoke all on function public.finance_upsert_import_profile(p_profile_id uuid, p_name text, p_format finance.import_format, p_institution_key text, p_account_id uuid, p_header_signature text, p_mapping jsonb, p_is_default boolean) from public,anon;
grant execute on function public.finance_upsert_import_profile(p_profile_id uuid, p_name text, p_format finance.import_format, p_institution_key text, p_account_id uuid, p_header_signature text, p_mapping jsonb, p_is_default boolean) to authenticated,service_role;