CREATE OR REPLACE FUNCTION finance.confirm_receipt_transaction_match(p_match_id uuid, p_matched_amount_minor bigint DEFAULT NULL::bigint, p_note text DEFAULT NULL::text, p_decision_source text DEFAULT 'manual'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid:=auth.uid();
  v_match finance.receipt_transaction_matches%rowtype;
  v_receipt finance.receipts%rowtype;
  v_tx finance.transactions%rowtype;
  v_matchable bigint;
  v_receipt_used bigint:=0;
  v_tx_used bigint:=0;
  v_receipt_remaining bigint;
  v_tx_remaining bigint;
  v_amount bigint;
  v_state jsonb;
  v_allocations jsonb;
  v_other record;
begin
  if v_user_id is null then
    raise exception using errcode='42501',message='authentication required';
  end if;
  if p_decision_source not in ('manual','deterministic') then
    raise exception using errcode='23514',message='invalid match decision source';
  end if;
  if p_note is not null and char_length(p_note)>1000 then
    raise exception using errcode='23514',message='match note is too long';
  end if;

  select *
  into v_match
  from finance.receipt_transaction_matches
  where id=p_match_id and user_id=v_user_id
  for update;

  if not found then
    raise exception using errcode='23503',message='receipt match not found';
  end if;

  select * into v_receipt
  from finance.receipts
  where id=v_match.receipt_id and user_id=v_user_id;

  if not found
     or v_receipt.processing_status<>'confirmed'
     or v_receipt.total_minor is null
     or v_receipt.total_minor<=0 then
    raise exception using errcode='55000',
      message='receipt must be confirmed with a positive total before matching';
  end if;

  select * into v_tx
  from finance.transactions
  where id=v_match.transaction_id
    and user_id=v_user_id
    and status='posted'
    and type='expense';

  if not found then
    raise exception using errcode='55000',
      message='receipt can only match a posted expense transaction';
  end if;

  if exists(
    select 1
    from finance.receipt_transaction_matches other
    join finance.receipts r
      on r.id=other.receipt_id and r.user_id=other.user_id
    where other.user_id=v_user_id
      and other.transaction_id=v_match.transaction_id
      and other.status='confirmed'
      and other.id<>v_match.id
      and r.currency_code<>v_receipt.currency_code
  ) then
    raise exception using errcode='23514',
      message='one transaction cannot combine confirmed receipts in different currencies';
  end if;

  v_matchable:=finance.transaction_matchable_amount(
    v_match.transaction_id,
    v_receipt.currency_code
  );

  if v_matchable is null or v_matchable<=0 then
    raise exception using errcode='23514',
      message='transaction has no matchable amount in receipt currency';
  end if;

  select coalesce(sum(matched_amount_minor),0)::bigint
  into v_receipt_used
  from finance.receipt_transaction_matches
  where user_id=v_user_id
    and receipt_id=v_match.receipt_id
    and status='confirmed'
    and id<>v_match.id;

  select coalesce(sum(rtm.matched_amount_minor),0)::bigint
  into v_tx_used
  from finance.receipt_transaction_matches rtm
  join finance.receipts r
    on r.id=rtm.receipt_id and r.user_id=rtm.user_id
  where rtm.user_id=v_user_id
    and rtm.transaction_id=v_match.transaction_id
    and rtm.status='confirmed'
    and rtm.id<>v_match.id
    and r.currency_code=v_receipt.currency_code;

  v_receipt_remaining:=v_receipt.total_minor-v_receipt_used;
  v_tx_remaining:=v_matchable-v_tx_used;

  if v_receipt_remaining<=0 then
    raise exception using errcode='23514',message='receipt is already fully matched';
  end if;
  if v_tx_remaining<=0 then
    raise exception using errcode='23514',message='transaction is already fully matched';
  end if;

  v_amount:=coalesce(
    p_matched_amount_minor,
    least(v_receipt_remaining,v_tx_remaining)
  );

  if v_amount<=0
     or v_amount>v_receipt_remaining
     or v_amount>v_tx_remaining then
    raise exception using errcode='23514',
      message='matched amount exceeds remaining receipt or transaction amount';
  end if;

  update finance.receipt_transaction_matches
  set
    status='confirmed',
    matched_amount_minor=v_amount,
    confirmed_at=now(),
    rejected_at=null,
    decision_source=p_decision_source,
    decision_note=nullif(btrim(p_note),'')
  where id=v_match.id and user_id=v_user_id;

  if v_receipt_used+v_amount=v_receipt.total_minor then
    update finance.receipt_transaction_matches
    set
      status='rejected',
      rejected_at=now(),
      confirmed_at=null,
      decision_source=coalesce(decision_source,'deterministic'),
      decision_note=coalesce(
        decision_note,
        'Superseded because receipt is fully matched'
      )
    where user_id=v_user_id
      and receipt_id=v_match.receipt_id
      and id<>v_match.id
      and status='suggested';
  end if;

  if v_tx_used+v_amount=v_matchable then
    for v_other in
      update finance.receipt_transaction_matches
      set
        status='rejected',
        rejected_at=now(),
        confirmed_at=null,
        decision_source=coalesce(decision_source,'deterministic'),
        decision_note=coalesce(
          decision_note,
          'Superseded because transaction is fully matched'
        )
      where user_id=v_user_id
        and transaction_id=v_match.transaction_id
        and id<>v_match.id
        and status='suggested'
      returning receipt_id
    loop
      if v_other.receipt_id<>v_match.receipt_id then
        perform finance.refresh_receipt_match_state(v_other.receipt_id);
      end if;
    end loop;
  end if;

  v_state:=finance.refresh_receipt_match_state(v_match.receipt_id);
  v_allocations:=finance.rebuild_receipt_linked_allocations(
      v_match.receipt_id,
      v_match.transaction_id
    );

  return jsonb_build_object(
    'match_id',v_match.id,
    'receipt_id',v_match.receipt_id,
    'transaction_id',v_match.transaction_id,
    'matched_amount_minor',v_amount,
    'decision_source',p_decision_source,
    'receipt_state',v_state,
    'allocation_state',v_allocations
  );
end;
$function$;

CREATE OR REPLACE FUNCTION finance.rebuild_receipt_linked_allocations(p_receipt_id uuid, p_include_transaction_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid:=auth.uid();
  v_tx record;
  v_results jsonb:='[]'::jsonb;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception using errcode='42501',message='authentication required';
  end if;
  if not exists(
    select 1 from finance.receipts
    where id=p_receipt_id and user_id=v_user_id
  ) then
    raise exception using errcode='23503',message='receipt not found';
  end if;

  for v_tx in
    select transaction_id
    from (
      select distinct rtm.transaction_id
      from finance.receipt_transaction_matches rtm
      where rtm.user_id=v_user_id
        and rtm.receipt_id=p_receipt_id
        and rtm.status='confirmed'

      union

      select p_include_transaction_id
      where p_include_transaction_id is not null
    ) q
  loop
    v_result:=finance.rebuild_transaction_receipt_allocations(
      v_tx.transaction_id
    );
    v_results:=v_results||jsonb_build_array(v_result);
  end loop;

  return jsonb_build_object(
    'receipt_id',p_receipt_id,
    'transactions',v_results
  );
end;
$function$;

CREATE OR REPLACE FUNCTION finance.rebuild_transaction_receipt_allocations(p_transaction_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid:=auth.uid();
  v_reporting_currency text;
  v_display_amount bigint;
  v_source_currency text;
  v_matchable_amount bigint;
  v_confirmed_sum bigint;
  v_match_count integer;
  v_valid_item_matches integer;
  v_inserted integer:=0;
begin
  if v_user_id is null then
    raise exception using errcode='42501',message='authentication required';
  end if;

  delete from finance.receipt_match_allocations
  where user_id=v_user_id
    and transaction_id=p_transaction_id;

  select t.reporting_currency,finance.transaction_display_amount(t.id)
  into v_reporting_currency,v_display_amount
  from finance.transactions t
  where t.id=p_transaction_id
    and t.user_id=v_user_id
    and t.status='posted'
    and t.type='expense';

  if not found or coalesce(v_display_amount,0)<=0 then
    return jsonb_build_object(
      'transaction_id',p_transaction_id,
      'applied',false,
      'reason','transaction_not_eligible'
    );
  end if;

  select
    min(r.currency_code),
    case when min(r.currency_code)=max(r.currency_code)
      then min(r.currency_code) else null end,
    coalesce(sum(rtm.matched_amount_minor),0)::bigint,
    count(*)::integer
  into
    v_source_currency,v_source_currency,
    v_confirmed_sum,v_match_count
  from finance.receipt_transaction_matches rtm
  join finance.receipts r
    on r.id=rtm.receipt_id and r.user_id=rtm.user_id
  where rtm.user_id=v_user_id
    and rtm.transaction_id=p_transaction_id
    and rtm.status='confirmed';

  if v_match_count=0 or v_source_currency is null then
    return jsonb_build_object(
      'transaction_id',p_transaction_id,
      'applied',false,
      'reason',case when v_match_count=0
        then 'no_confirmed_matches'
        else 'mixed_receipt_currencies' end
    );
  end if;

  if exists(
    select 1
    from finance.receipt_transaction_matches rtm
    join finance.receipts r
      on r.id=rtm.receipt_id and r.user_id=rtm.user_id
    where rtm.user_id=v_user_id
      and rtm.transaction_id=p_transaction_id
      and rtm.status='confirmed'
      and (
        r.total_minor is null
        or r.match_covered_minor<>r.total_minor
      )
  ) then
    return jsonb_build_object(
      'transaction_id',p_transaction_id,
      'applied',false,
      'reason','receipt_not_fully_reconciled'
    );
  end if;

  v_matchable_amount:=
    finance.transaction_matchable_amount(
      p_transaction_id,
      v_source_currency
    );

  if v_matchable_amount is null
     or v_confirmed_sum<>v_matchable_amount then
    return jsonb_build_object(
      'transaction_id',p_transaction_id,
      'applied',false,
      'reason','transaction_not_fully_covered',
      'matchable_amount_minor',v_matchable_amount,
      'confirmed_amount_minor',v_confirmed_sum
    );
  end if;

  select count(*)::integer
  into v_valid_item_matches
  from (
    select rtm.id
    from finance.receipt_transaction_matches rtm
    join finance.receipts r
      on r.id=rtm.receipt_id and r.user_id=rtm.user_id
    where rtm.user_id=v_user_id
      and rtm.transaction_id=p_transaction_id
      and rtm.status='confirmed'
      and exists(
        select 1
        from finance.receipt_items ri
        where ri.user_id=rtm.user_id
          and ri.receipt_id=rtm.receipt_id
          and not ri.is_excluded
          and ri.effective_total_minor>0
      )
  ) q;

  if v_valid_item_matches<>v_match_count then
    return jsonb_build_object(
      'transaction_id',p_transaction_id,
      'applied',false,
      'reason','receipt_items_unavailable'
    );
  end if;

  with confirmed as (
    select
      rtm.id as match_id,
      rtm.receipt_id,
      rtm.transaction_id,
      rtm.matched_amount_minor,
      r.currency_code,
      row_number() over(order by rtm.id) as match_rank
    from finance.receipt_transaction_matches rtm
    join finance.receipts r
      on r.id=rtm.receipt_id and r.user_id=rtm.user_id
    where rtm.user_id=v_user_id
      and rtm.transaction_id=p_transaction_id
      and rtm.status='confirmed'
  ),
  match_floor as (
    select
      c.*,
      floor(
        v_display_amount::numeric
        * c.matched_amount_minor::numeric
        / nullif(v_confirmed_sum,0)::numeric
      )::bigint as reporting_floor
    from confirmed c
  ),
  match_targets as (
    select
      mf.*,
      mf.reporting_floor
      + case when mf.match_rank=1 then
          v_display_amount
          - sum(mf.reporting_floor) over()
        else 0 end
        as reporting_target_minor
    from match_floor mf
  ),
  category_source as (
    select
      mt.match_id,
      mt.receipt_id,
      mt.transaction_id,
      mt.matched_amount_minor,
      mt.currency_code,
      mt.reporting_target_minor,
      ri.category_id,
      ri.necessity,
      sum(ri.effective_total_minor)::bigint as raw_source_minor,
      sum(sum(ri.effective_total_minor)) over(
        partition by mt.match_id
      )::bigint as raw_source_total,
      row_number() over(
        partition by mt.match_id
        order by
          sum(ri.effective_total_minor) desc,
          ri.category_id nulls last,
          ri.necessity
      ) as category_rank
    from match_targets mt
    join finance.receipt_items ri
      on ri.user_id=v_user_id
     and ri.receipt_id=mt.receipt_id
     and not ri.is_excluded
     and ri.effective_total_minor>0
    group by
      mt.match_id,mt.receipt_id,mt.transaction_id,
      mt.matched_amount_minor,mt.currency_code,
      mt.reporting_target_minor,
      ri.category_id,ri.necessity
  ),
  source_floor as (
    select
      cs.*,
      floor(
        cs.matched_amount_minor::numeric
        * cs.raw_source_minor::numeric
        / nullif(cs.raw_source_total,0)::numeric
      )::bigint as source_floor_minor
    from category_source cs
  ),
  source_targets as (
    select
      sf.*,
      sf.source_floor_minor
      + case when sf.category_rank=1 then
          sf.matched_amount_minor
          - sum(sf.source_floor_minor) over(
              partition by sf.match_id
            )
        else 0 end
        as source_target_minor
    from source_floor sf
  ),
  reporting_floor as (
    select
      st.*,
      floor(
        st.reporting_target_minor::numeric
        * st.source_target_minor::numeric
        / nullif(st.matched_amount_minor,0)::numeric
      )::bigint as reporting_category_floor
    from source_targets st
  ),
  final_allocations as (
    select
      rf.*,
      rf.reporting_category_floor
      + case when rf.category_rank=1 then
          rf.reporting_target_minor
          - sum(rf.reporting_category_floor) over(
              partition by rf.match_id
            )
        else 0 end
        as reporting_category_minor
    from reporting_floor rf
  )
  insert into finance.receipt_match_allocations(
    user_id,match_id,receipt_id,transaction_id,
    category_id,necessity,
    source_currency_code,source_amount_minor,
    reporting_currency,reporting_amount_minor
  )
  select
    v_user_id,
    fa.match_id,
    fa.receipt_id,
    fa.transaction_id,
    fa.category_id,
    fa.necessity,
    fa.currency_code,
    fa.source_target_minor,
    v_reporting_currency,
    fa.reporting_category_minor
  from final_allocations fa
  where fa.source_target_minor>=0
    and fa.reporting_category_minor>=0;

  get diagnostics v_inserted=row_count;

  return jsonb_build_object(
    'transaction_id',p_transaction_id,
    'applied',true,
    'allocation_count',v_inserted,
    'source_currency',v_source_currency,
    'source_amount_minor',v_matchable_amount,
    'reporting_amount_minor',v_display_amount
  );
end;
$function$;

CREATE OR REPLACE FUNCTION finance.reject_receipt_transaction_match(p_match_id uuid, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid:=auth.uid();
  v_match finance.receipt_transaction_matches%rowtype;
  v_was_confirmed boolean:=false;
  v_state jsonb;
  v_allocations jsonb;
begin
  if v_user_id is null then
    raise exception using errcode='42501',message='authentication required';
  end if;
  if p_note is not null and char_length(p_note)>1000 then
    raise exception using errcode='23514',message='match note is too long';
  end if;

  select *
  into v_match
  from finance.receipt_transaction_matches
  where id=p_match_id and user_id=v_user_id
  for update;

  if not found then
    raise exception using errcode='23503',message='receipt match not found';
  end if;

  v_was_confirmed:=v_match.status='confirmed';

  update finance.receipt_transaction_matches
  set
    status='rejected',
    rejected_at=now(),
    confirmed_at=null,
    decision_source='manual',
    decision_note=nullif(btrim(p_note),'')
  where id=p_match_id and user_id=v_user_id;

  v_state:=finance.refresh_receipt_match_state(v_match.receipt_id);
  v_allocations:=finance.rebuild_receipt_linked_allocations(
      v_match.receipt_id,
      v_match.transaction_id
    );

  if v_was_confirmed then
    perform finance.refresh_receipt_match_candidates(
      v_match.receipt_id,
      false
    );
  end if;

  return jsonb_build_object(
    'match_id',p_match_id,
    'receipt_id',v_match.receipt_id,
    'transaction_id',v_match.transaction_id,
    'status','rejected',
    'receipt_state',v_state,
    'allocation_state',v_allocations
  );
end;
$function$;

CREATE OR REPLACE FUNCTION finance.unconfirm_receipt_transaction_match(p_match_id uuid, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid:=auth.uid();
  v_match finance.receipt_transaction_matches%rowtype;
  v_state jsonb;
  v_allocations jsonb;
  v_refresh jsonb;
begin
  if v_user_id is null then
    raise exception using errcode='42501',message='authentication required';
  end if;
  if p_note is not null and char_length(p_note)>1000 then
    raise exception using errcode='23514',message='match note is too long';
  end if;

  select *
  into v_match
  from finance.receipt_transaction_matches
  where id=p_match_id and user_id=v_user_id
  for update;

  if not found then
    raise exception using errcode='23503',message='receipt match not found';
  end if;
  if v_match.status<>'confirmed' then
    raise exception using errcode='55000',
      message='only a confirmed receipt match can be unlinked';
  end if;

  update finance.receipt_transaction_matches
  set
    status='suggested',
    confirmed_at=null,
    rejected_at=null,
    decision_source='manual',
    decision_note=nullif(
      btrim(coalesce(p_note,'Unlinked by user')),
      ''
    ),
    last_scored_at=now()
  where id=p_match_id and user_id=v_user_id;

  v_state:=finance.refresh_receipt_match_state(v_match.receipt_id);
  v_allocations:=finance.rebuild_receipt_linked_allocations(
      v_match.receipt_id,
      v_match.transaction_id
    );

  v_refresh:=finance.refresh_receipt_match_candidates(
    v_match.receipt_id,
    false
  );

  return jsonb_build_object(
    'match_id',p_match_id,
    'receipt_id',v_match.receipt_id,
    'transaction_id',v_match.transaction_id,
    'status','suggested',
    'receipt_state',v_state,
    'allocation_state',v_allocations,
    'candidate_refresh',v_refresh
  );
end;
$function$;

alter function finance.confirm_receipt_transaction_match(p_match_id uuid, p_matched_amount_minor bigint, p_note text, p_decision_source text) security invoker;
revoke all on function finance.confirm_receipt_transaction_match(p_match_id uuid, p_matched_amount_minor bigint, p_note text, p_decision_source text) from public,anon;
grant execute on function finance.confirm_receipt_transaction_match(p_match_id uuid, p_matched_amount_minor bigint, p_note text, p_decision_source text) to authenticated,service_role;

alter function finance.rebuild_receipt_linked_allocations(p_receipt_id uuid, p_include_transaction_id uuid) security invoker;
revoke all on function finance.rebuild_receipt_linked_allocations(p_receipt_id uuid, p_include_transaction_id uuid) from public,anon;
grant execute on function finance.rebuild_receipt_linked_allocations(p_receipt_id uuid, p_include_transaction_id uuid) to authenticated,service_role;

alter function finance.rebuild_transaction_receipt_allocations(p_transaction_id uuid) security invoker;
revoke all on function finance.rebuild_transaction_receipt_allocations(p_transaction_id uuid) from public,anon;
grant execute on function finance.rebuild_transaction_receipt_allocations(p_transaction_id uuid) to authenticated,service_role;

alter function finance.reject_receipt_transaction_match(p_match_id uuid, p_note text) security invoker;
revoke all on function finance.reject_receipt_transaction_match(p_match_id uuid, p_note text) from public,anon;
grant execute on function finance.reject_receipt_transaction_match(p_match_id uuid, p_note text) to authenticated,service_role;

alter function finance.unconfirm_receipt_transaction_match(p_match_id uuid, p_note text) security invoker;
revoke all on function finance.unconfirm_receipt_transaction_match(p_match_id uuid, p_note text) from public,anon;
grant execute on function finance.unconfirm_receipt_transaction_match(p_match_id uuid, p_note text) to authenticated,service_role;