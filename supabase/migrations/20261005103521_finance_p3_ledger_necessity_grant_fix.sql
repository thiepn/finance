
revoke insert on finance.ledger_entries from authenticated;

grant insert (
  id,user_id,transaction_id,entry_kind,account_id,category_id,system_code,
  signed_amount_minor,currency_code,reporting_amount_minor,exchange_rate,memo,necessity
) on finance.ledger_entries to authenticated;
