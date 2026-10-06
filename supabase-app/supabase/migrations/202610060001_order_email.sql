-- Durable sending records, separate from client-editable workspace JSON.
create table ce_private.order_emails (
 order_id text not null, kind text not null check(kind in ('confirmation','invoice')),
 snapshot jsonb not null, payload jsonb, status text not null default 'queued' check(status in ('queued','sending','accepted','failed','unknown')),
 provider_id text, issue text, claim uuid, first_attempt timestamptz, updated_at timestamptz not null default now(),
 primary key(order_id,kind)
);
alter table ce_private.order_emails enable row level security;
revoke all on ce_private.order_emails from public,anon,authenticated;
-- Atomically queue confirmations only for newly saved orders. Installing this trigger does not backfill old orders.
create function ce_private.queue_new_order_emails() returns trigger language plpgsql security definer set search_path='' as $$
declare o jsonb;
begin
 for o in select value from jsonb_array_elements(new.payload->'orders') loop
  if not exists(select 1 from jsonb_array_elements(old.payload->'orders') p where p->>'id'=o->>'id') then
   insert into ce_private.order_emails(order_id,kind,snapshot) values(o->>'id','confirmation',o) on conflict do nothing;
  end if;
 end loop;
 return new;
end $$;
create trigger queue_new_order_emails after update of payload on ce_private.workspace for each row execute function ce_private.queue_new_order_emails();
create function public.ce_email_prepare(oid text, mail_kind text) returns jsonb language plpgsql security definer set search_path='' as $$
declare o jsonb; result jsonb;
begin
 if mail_kind not in ('confirmation','invoice') then raise exception 'Invalid email kind'; end if;
 select value into o from ce_private.workspace w, jsonb_array_elements(w.payload->'orders') where value->>'id'=oid;
 if o is null then raise exception 'Order not found'; end if;
 insert into ce_private.order_emails(order_id,kind,snapshot) values(oid,mail_kind,o) on conflict do nothing;
 select to_jsonb(e) into result from ce_private.order_emails e where order_id=oid and kind=mail_kind;
 return result;
end $$;
create function public.ce_email_claim(oid text, mail_kind text, content jsonb, claim_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare e ce_private.order_emails;
begin
 select * into e from ce_private.order_emails where order_id=oid and kind=mail_kind for update;
 if e.order_id is null or e.status='accepted' or (e.status='sending' and e.updated_at>now()-interval '2 minutes') then return null; end if;
 -- Never blindly resend an ambiguous attempt after the provider's 24h deduplication period.
 if e.status in ('sending','unknown') and e.first_attempt<now()-interval '23 hours' then return null; end if;
 update ce_private.order_emails set payload=coalesce(payload,content),status='sending',claim=claim_id,first_attempt=coalesce(first_attempt,now()),updated_at=now(),issue=null where order_id=oid and kind=mail_kind returning * into e;
 return to_jsonb(e);
end $$;
create function public.ce_email_finish(oid text, mail_kind text, claim_id uuid, outcome text, provider text, problem text) returns void language plpgsql security definer set search_path='' as $$
begin
 if outcome not in ('accepted','failed','unknown') then raise exception 'Invalid outcome'; end if;
 update ce_private.order_emails set status=outcome,provider_id=provider,issue=left(problem,250),updated_at=now() where order_id=oid and kind=mail_kind and claim=claim_id and status='sending';
end $$;
create function public.ce_email_list(oid text) returns jsonb language sql security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('kind',kind,'status',status,'issue',issue,'updatedAt',updated_at,'providerId',provider_id)),'[]') from ce_private.order_emails where order_id=oid
$$;
revoke all on function public.ce_email_prepare(text,text),public.ce_email_claim(text,text,jsonb,uuid),public.ce_email_finish(text,text,uuid,text,text,text),public.ce_email_list(text) from public,anon,authenticated;
grant execute on function public.ce_email_prepare(text,text),public.ce_email_claim(text,text,jsonb,uuid),public.ce_email_finish(text,text,uuid,text,text,text),public.ce_email_list(text) to service_role;
create function public.ce_email_read(oid text,mail_kind text) returns jsonb language sql security definer set search_path='' as $$
 select to_jsonb(e) from ce_private.order_emails e where order_id=oid and kind=mail_kind
$$;
revoke all on function public.ce_email_read(text,text) from public,anon,authenticated;
grant execute on function public.ce_email_read(text,text) to service_role;
