
grant delete on finance.receipt_items to authenticated;

create policy receipt_items_delete_own
on finance.receipt_items for delete to authenticated
using ((select auth.uid()) is not null and (select auth.uid())=user_id);
