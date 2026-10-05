CREATE OR REPLACE FUNCTION finance.sync_recurring_patterns(p_pattern_id uuid DEFAULT NULL::uuid, p_as_of timestamp with time zone DEFAULT now())
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid:=auth.uid();
  v_pattern finance.recurring_patterns%rowtype;
  v_expected timestamptz;
  v_candidate record;
  v_synced integer:=0;
  v_patterns integer:=0;
  v_iterations integer;
  v_amount_limit bigint;
  v_confidence numeric;
begin
  if v_user_id is null then
    raise exception using errcode='42501',message='authentication required';
  end if;

  p_as_of:=coalesce(p_as_of,now());

  if p_pattern_id is not null and not exists(
    select 1 from finance.recurring_patterns
    where id=p_pattern_id and user_id=v_user_id
  ) then
    raise exception using errcode='23503',message='recurring pattern not found';
  end if;

  for v_pattern in
    select *
    from finance.recurring_patterns rp
    where rp.user_id=v_user_id
      and rp.status='active'
      and rp.cadence is not null
      and (p_pattern_id is null or rp.id=p_pattern_id)
    order by rp.created_at,rp.id
  loop
    v_patterns:=v_patterns+1;
    v_expected:=v_pattern.next_expected_at;

    if v_expected is null then
      select finance.recurring_advance(
        coalesce(
          max(a.occurred_at),
          v_pattern.anchor_at
        ),
        v_pattern.cadence,
        v_pattern.cadence_interval
      )
      into v_expected
      from finance.recurring_transaction_links l
      join finance.activity_transactions a
        on a.transaction_id=l.transaction_id
       and a.user_id=l.user_id
      where l.user_id=v_user_id
        and l.recurring_pattern_id=v_pattern.id;
    end if;

    if v_expected is null then
      continue;
    end if;

    v_iterations:=0;
    loop
      exit when v_expected >
        p_as_of + make_interval(days=>v_pattern.tolerance_days);
      exit when v_iterations>=24;
      v_iterations:=v_iterations+1;

      v_amount_limit:=case
        when v_pattern.expected_amount_minor is null then null
        else greatest(
          v_pattern.amount_tolerance_minor,
          round(v_pattern.expected_amount_minor*0.50)::bigint,
          100::bigint
        )
      end;

      select
        a.transaction_id,
        a.occurred_at,
        a.amount_minor,
        abs(extract(epoch from (a.occurred_at-v_expected))/86400) as abs_days,
        case
          when v_pattern.expected_amount_minor is null then null
          else a.amount_minor-v_pattern.expected_amount_minor
        end as amount_delta
      into v_candidate
      from finance.activity_transactions a
      where a.user_id=v_user_id
        and a.status='posted'
        and a.financial_effect
        and a.transaction_type=v_pattern.transaction_type::text
        and a.occurred_at >=
          v_expected-make_interval(days=>v_pattern.tolerance_days)
        and a.occurred_at <= least(
          p_as_of,
          v_expected+make_interval(days=>v_pattern.tolerance_days)
        )
        and (
          v_pattern.merchant_id is null
          or a.merchant_id=v_pattern.merchant_id
        )
        and (
          v_pattern.account_id is null
          or v_pattern.account_id=any(a.account_ids)
        )
        and (
          v_pattern.category_id is null
          or v_pattern.category_id=any(a.category_ids)
        )
        and (
          v_pattern.match_description is null
          or finance.normalize_recurring_text(a.description)
             =v_pattern.match_description
        )
        and (
          v_amount_limit is null
          or abs(a.amount_minor-v_pattern.expected_amount_minor)<=v_amount_limit
        )
        and not exists(
          select 1
          from finance.recurring_transaction_links l
          where l.user_id=v_user_id
            and l.transaction_id=a.transaction_id
        )
      order by
        abs(extract(epoch from (a.occurred_at-v_expected))) asc,
        case
          when v_pattern.expected_amount_minor is null then 0
          else abs(a.amount_minor-v_pattern.expected_amount_minor)
        end asc,
        a.occurred_at,
        a.transaction_id
      limit 1;

      if not found then
        exit;
      end if;

      v_confidence:=greatest(
        0::numeric,
        least(
          1::numeric,
          0.70 * greatest(
            0::numeric,
            1 - v_candidate.abs_days /
              greatest(v_pattern.tolerance_days::numeric,1)
          )
          + 0.30 * case
            when v_pattern.expected_amount_minor is null
              or v_pattern.expected_amount_minor=0 then 1
            else greatest(
              0::numeric,
              1 - abs(v_candidate.amount_delta)::numeric /
                greatest(v_pattern.expected_amount_minor::numeric,1)
            )
          end
        )
      );

      insert into finance.recurring_transaction_links(
        user_id,recurring_pattern_id,transaction_id,expected_at,
        matched_amount_minor,amount_delta_minor,timing_delta_days,
        match_source,confidence
      ) values(
        v_user_id,v_pattern.id,v_candidate.transaction_id,v_expected,
        v_candidate.amount_minor,v_candidate.amount_delta,
        (extract(epoch from (v_candidate.occurred_at-v_expected))/86400)::numeric,
        'learned',v_confidence
      )
      on conflict(user_id,transaction_id) do nothing;

      if found then
        v_synced:=v_synced+1;

        update finance.subscriptions
        set amount_minor=v_candidate.amount_minor
        where user_id=v_user_id
          and recurring_pattern_id=v_pattern.id
          and status='active';
      end if;

      v_expected:=finance.recurring_advance(
        v_expected,v_pattern.cadence,v_pattern.cadence_interval
      );
    end loop;

    update finance.recurring_patterns
    set next_expected_at=v_expected
    where id=v_pattern.id and user_id=v_user_id;

    update finance.subscriptions
    set next_charge_at=v_expected
    where user_id=v_user_id
      and recurring_pattern_id=v_pattern.id
      and status='active';
  end loop;

  return jsonb_build_object(
    'patterns_processed',v_patterns,
    'transactions_linked',v_synced,
    'as_of',p_as_of
  );
end;
$function$;
alter function finance.sync_recurring_patterns(uuid,timestamptz) security invoker;
revoke all on function finance.sync_recurring_patterns(uuid,timestamptz) from public,anon;
grant execute on function finance.sync_recurring_patterns(uuid,timestamptz) to authenticated,service_role;
