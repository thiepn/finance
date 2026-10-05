
alter table finance.receipt_review_events
  add column processing_run_id uuid;

alter table finance.receipt_review_events
  add constraint receipt_review_events_processing_run_fk
  foreign key(processing_run_id,user_id)
  references finance.receipt_processing_runs(id,user_id)
  on delete set null (processing_run_id);

create index receipt_review_events_processing_run_fk_idx
  on finance.receipt_review_events(processing_run_id,user_id)
  where processing_run_id is not null;

create or replace function finance_private.prepare_receipt_review_event()
returns trigger
language plpgsql
security invoker
set search_path=''
as $$
begin
  if new.processing_run_id is null then
    select current_processing_run_id
    into new.processing_run_id
    from finance.receipts
    where id=new.receipt_id and user_id=new.user_id;
  end if;
  return new;
end;
$$;

revoke all on function finance_private.prepare_receipt_review_event()
from public,anon;

create trigger receipt_review_events_prepare
before insert on finance.receipt_review_events
for each row execute function finance_private.prepare_receipt_review_event();

create or replace function finance_private.reset_receipt_review_on_new_run()
returns trigger
language plpgsql
security invoker
set search_path=''
as $$
begin
  if old.current_processing_run_id is distinct from new.current_processing_run_id
     and new.current_processing_run_id is not null then
    new.review_started_at := null;
    new.header_reviewed_at := null;
    new.last_reviewed_at := null;
    new.confirmed_at := null;
    new.review_waivers := '{}'::jsonb;
    new.review_revision := old.review_revision + 1;
  end if;
  return new;
end;
$$;

revoke all on function finance_private.reset_receipt_review_on_new_run()
from public,anon;

create trigger receipts_reset_review_on_new_processing_run
before update of current_processing_run_id on finance.receipts
for each row execute function finance_private.reset_receipt_review_on_new_run();
