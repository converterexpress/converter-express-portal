create table ce_private.quote_emails (
 quote_id text primary key,
 snapshot jsonb not null,
 payload jsonb,
 status text not null default 'queued' check(status in ('queued','sending','accepted','failed','unknown')),
 provider_id text,
 issue text,
 claim uuid,
 first_attempt timestamptz,
 updated_at timestamptz not null default now()
);
alter table ce_private.quote_emails enable row level security;
revoke all on ce_private.quote_emails from public,anon,authenticated;

create function public.ce_quote_email_prepare(qid text) returns jsonb language plpgsql security definer set search_path='' as $$
declare q jsonb; a jsonb; result jsonb;
begin
 perform 1 from ce_private.workspace where id=1 for share;
 select value into q from ce_private.workspace w,jsonb_array_elements(w.payload->'crm'->'quotes') where value->>'id'=qid;
 if q is null then raise exception 'Quote not found'; end if;
 select value into a from ce_private.workspace w,jsonb_array_elements(w.payload->'accounts') where value->>'id'=q->>'accountId';
 if a is null then raise exception 'Quote shop not found'; end if;
 insert into ce_private.quote_emails(quote_id,snapshot) values(qid,jsonb_build_object('quote',q,'account',a)) on conflict do nothing;
 select to_jsonb(e) into result from ce_private.quote_emails e where quote_id=qid;
 return result;
end $$;

create function public.ce_quote_email_claim(qid text,content jsonb,claim_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare e ce_private.quote_emails;
begin
 perform 1 from ce_private.workspace where id=1 for share;
 if not exists(select 1 from ce_private.workspace w,jsonb_array_elements(w.payload->'crm'->'quotes') q where q->>'id'=qid) then return null; end if;
 select * into e from ce_private.quote_emails where quote_id=qid for update;
 if e.quote_id is null or e.status='accepted' or (e.status='sending' and e.updated_at>now()-interval '2 minutes') then return null; end if;
 if e.status in ('sending','unknown') and e.first_attempt<now()-interval '23 hours' then return null; end if;
 update ce_private.quote_emails set payload=coalesce(payload,content),status='sending',claim=claim_id,first_attempt=coalesce(first_attempt,now()),updated_at=now(),issue=null where quote_id=qid returning * into e;
 return to_jsonb(e);
end $$;

create function public.ce_quote_email_finish(qid text,claim_id uuid,outcome text,provider text,problem text) returns void language plpgsql security definer set search_path='' as $$
begin
 if outcome not in ('accepted','failed','unknown') then raise exception 'Invalid outcome'; end if;
 update ce_private.quote_emails set status=outcome,provider_id=provider,issue=left(problem,250),updated_at=now() where quote_id=qid and claim=claim_id and status='sending';
end $$;

create function public.ce_quote_email_read(qid text) returns jsonb language sql security definer set search_path='' as $$
 select to_jsonb(e) from ce_private.quote_emails e where quote_id=qid
$$;

revoke all on function public.ce_quote_email_prepare(text),public.ce_quote_email_claim(text,jsonb,uuid),public.ce_quote_email_finish(text,uuid,text,text,text),public.ce_quote_email_read(text) from public,anon,authenticated;
grant execute on function public.ce_quote_email_prepare(text),public.ce_quote_email_claim(text,jsonb,uuid),public.ce_quote_email_finish(text,uuid,text,text,text),public.ce_quote_email_read(text) to service_role;

create function ce_private.protect_emailed_quotes() returns trigger language plpgsql security definer set search_path='' as $$
declare qid text; e ce_private.quote_emails;
begin
 for qid in select q->>'id' from jsonb_array_elements(old.payload->'crm'->'quotes') q where not exists(select 1 from jsonb_array_elements(new.payload->'crm'->'quotes') n where n->>'id'=q->>'id') loop
  select * into e from ce_private.quote_emails where quote_id=qid for update;
  if e.quote_id is not null and e.status in ('sending','accepted','unknown') then raise exception 'This quote has email history and cannot be deleted.'; end if;
  delete from ce_private.quote_emails where quote_id=qid;
 end loop;
 return new;
end $$;
revoke all on function ce_private.protect_emailed_quotes() from public,anon,authenticated;
create trigger protect_emailed_quotes before update of payload on ce_private.workspace for each row execute function ce_private.protect_emailed_quotes();
