
create index receipt_review_events_receipt_fk_idx
  on finance.receipt_review_events(receipt_id,user_id);
