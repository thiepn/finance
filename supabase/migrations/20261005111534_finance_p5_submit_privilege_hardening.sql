
alter function finance.submit_receipt_extraction(uuid,jsonb) security definer;
alter function finance.submit_receipt_extraction(uuid,jsonb) set search_path = '';

revoke all on function finance.submit_receipt_extraction(uuid,jsonb) from public,anon;
grant execute on function finance.submit_receipt_extraction(uuid,jsonb) to authenticated,service_role;
