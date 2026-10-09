-- Lock the workspace before email rows, matching order deletion's lock order.
-- A deleted unnotified order must never be claimed for sending later.
create or replace function public.ce_email_prepare(oid text, mail_kind text) returns jsonb language plpgsql security definer set search_path='' as $$
declare o jsonb; result jsonb;
begin
 if mail_kind not in ('confirmation','invoice') then raise exception 'Invalid email kind'; end if;
 perform 1 from ce_private.workspace where id=1 for share;
 select value into o from ce_private.workspace w, jsonb_array_elements(w.payload->'orders') where value->>'id'=oid;
 if o is null then raise exception 'Order not found'; end if;
 insert into ce_private.order_emails(order_id,kind,snapshot) values(oid,mail_kind,o) on conflict do nothing;
 select to_jsonb(e) into result from ce_private.order_emails e where order_id=oid and kind=mail_kind;
 return result;
end $$;
create or replace function public.ce_email_claim(oid text, mail_kind text, content jsonb, claim_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare e ce_private.order_emails;
begin
 perform 1 from ce_private.workspace where id=1 for share;
 if not exists(select 1 from ce_private.workspace w,jsonb_array_elements(w.payload->'orders') o where o->>'id'=oid) then return null; end if;
 select * into e from ce_private.order_emails where order_id=oid and kind=mail_kind for update;
 if e.order_id is null or e.status='accepted' or (e.status='sending' and e.updated_at>now()-interval '2 minutes') then return null; end if;
 if e.status in ('sending','unknown') and e.first_attempt<now()-interval '23 hours' then return null; end if;
 update ce_private.order_emails set payload=coalesce(payload,content),status='sending',claim=claim_id,first_attempt=coalesce(first_attempt,now()),updated_at=now(),issue=null where order_id=oid and kind=mail_kind returning * into e;
 return to_jsonb(e);
end $$;
create function ce_private.protect_notified_orders() returns trigger language plpgsql security definer set search_path='' as $$
declare oid text; e ce_private.order_emails;
begin
 for oid in select o->>'id' from jsonb_array_elements(old.payload->'orders') o where not exists(select 1 from jsonb_array_elements(new.payload->'orders') n where n->>'id'=o->>'id') loop
  for e in select * from ce_private.order_emails where order_id=oid for update loop
   if e.status in ('sending','accepted','unknown') then raise exception 'This order has active or sent email history and cannot be deleted. Use Cancel order instead.'; end if;
  end loop;
  delete from ce_private.order_emails where order_id=oid;
 end loop;
 return new;
end $$;
revoke all on function ce_private.protect_notified_orders() from public,anon,authenticated;
create trigger protect_notified_orders before update of payload on ce_private.workspace for each row execute function ce_private.protect_notified_orders();
