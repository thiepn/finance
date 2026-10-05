CREATE OR REPLACE FUNCTION finance.record_account_balance_observation(p_account_id uuid, p_balance_minor bigint, p_observed_at timestamp with time zone DEFAULT now(), p_reporting_balance_minor bigint DEFAULT NULL::bigint, p_exchange_rate numeric DEFAULT NULL::numeric, p_source finance.balance_observation_source DEFAULT 'manual'::finance.balance_observation_source, p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid:=auth.uid();
  v_account finance.accounts%rowtype;
  v_reporting_currency text;
  v_reporting_balance bigint;
  v_rate numeric;
  v_id uuid;
begin
  if v_user_id is null then
    raise exception using errcode='42501',message='authentication required';
  end if;
  if p_observed_at is null then
    p_observed_at:=now();
  end if;

  select *
  into v_account
  from finance.accounts
  where id=p_account_id and user_id=v_user_id;

  if not found then
    raise exception using errcode='23503',message='account not found';
  end if;

  select coalesce(reporting_currency,'EUR')
  into v_reporting_currency
  from finance.profiles
  where user_id=v_user_id;

  if v_account.currency_code=v_reporting_currency then
    v_reporting_balance:=p_balance_minor;
    v_rate:=1;
    if p_reporting_balance_minor is not null
       and p_reporting_balance_minor<>p_balance_minor then
      raise exception using errcode='23514',
        message='reporting balance must equal account balance for reporting-currency accounts';
    end if;
  else
    if p_reporting_balance_minor is not null then
      v_reporting_balance:=p_reporting_balance_minor;
      if p_exchange_rate is not null and p_exchange_rate<=0 then
        raise exception using errcode='23514',message='exchange rate must be positive';
      end if;
      v_rate:=p_exchange_rate;
    elsif p_exchange_rate is not null and p_exchange_rate>0 then
      v_rate:=p_exchange_rate;
      v_reporting_balance:=round(p_balance_minor*p_exchange_rate)::bigint;
    else
      raise exception using errcode='23514',
        message='foreign-currency observations require a reporting balance or exchange rate';
    end if;
  end if;

  insert into finance.account_balance_observations(
    user_id,account_id,observed_at,balance_minor,currency_code,
    reporting_balance_minor,reporting_currency,exchange_rate,
    source,note
  ) values(
    v_user_id,p_account_id,p_observed_at,p_balance_minor,
    v_account.currency_code,v_reporting_balance,v_reporting_currency,
    v_rate,p_source,nullif(btrim(p_note),'')
  )
  on conflict(user_id,account_id,observed_at)
  do update set
    balance_minor=excluded.balance_minor,
    currency_code=excluded.currency_code,
    reporting_balance_minor=excluded.reporting_balance_minor,
    reporting_currency=excluded.reporting_currency,
    exchange_rate=excluded.exchange_rate,
    source=excluded.source,
    note=excluded.note
  returning id into v_id;

  return v_id;
end;
$function$;
alter function finance.record_account_balance_observation(
  uuid,bigint,timestamptz,bigint,numeric,
  finance.balance_observation_source,text
) security invoker;
revoke all on function finance.record_account_balance_observation(
  uuid,bigint,timestamptz,bigint,numeric,
  finance.balance_observation_source,text
) from public,anon;
grant execute on function finance.record_account_balance_observation(
  uuid,bigint,timestamptz,bigint,numeric,
  finance.balance_observation_source,text
) to authenticated,service_role;
