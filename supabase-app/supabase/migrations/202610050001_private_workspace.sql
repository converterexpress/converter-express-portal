-- Business data has no direct browser access. Edge commands authorize every operation.
create schema if not exists ce_private;
revoke all on schema ce_private from public, anon, authenticated;
create table ce_private.workspace (
 id integer primary key check (id=1),
 revision bigint not null default 0,
 payload jsonb not null check (jsonb_typeof(payload)='object'),
 updated_at timestamptz not null default now()
);
create table ce_private.staff (user_id uuid primary key references auth.users(id) on delete cascade, active boolean not null default true);
create table ce_private.audit (id bigint generated always as identity primary key, actor uuid, action text not null, revision bigint not null, created_at timestamptz not null default now());
create table ce_private.rate_limits (subject text primary key, start_at timestamptz not null, hits integer not null);
alter table ce_private.workspace enable row level security;
alter table ce_private.staff enable row level security;
alter table ce_private.audit enable row level security;
alter table ce_private.rate_limits enable row level security;
revoke all on all tables in schema ce_private from public,anon,authenticated;

create function public.ce_workspace_read() returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object('revision',revision,'data',payload) from ce_private.workspace where id=1
$$;
create function public.ce_staff_check(uid uuid) returns boolean language sql security definer set search_path='' as $$
 select exists(select 1 from ce_private.staff where user_id=uid and active)
$$;
create function public.ce_session_live(uid uuid,sid uuid) returns boolean language sql security definer set search_path='' as $$
 select exists(select 1 from auth.sessions where user_id=uid and id=sid and (not_after is null or not_after>now()))
$$;
create function public.ce_workspace_commit(expected bigint,body jsonb,actor uuid,event text) returns bigint language plpgsql security definer set search_path='' as $$
 declare current_revision bigint;
 begin
  if jsonb_typeof(body) <> 'object' or not (body ?& array['accounts','orders','products','storeSettings','discountCodes','crm']) then raise exception 'Invalid workspace'; end if;
  select revision into current_revision from ce_private.workspace where id=1 for update;
  if current_revision is null or current_revision<>expected then raise exception 'Revision conflict' using errcode='40001'; end if;
  update ce_private.workspace set payload=body,revision=revision+1,updated_at=now() where id=1;
  insert into ce_private.audit(actor,action,revision) values(actor,left(event,80),current_revision+1);
  return current_revision+1;
 end
$$;
create function public.ce_rate_limit(subject_key text,max_hits integer) returns boolean language plpgsql security definer set search_path='' as $$
 declare result integer;
 begin
  insert into ce_private.rate_limits(subject,start_at,hits) values(subject_key,now(),1)
  on conflict(subject) do update set hits=case when ce_private.rate_limits.start_at<now()-interval '1 minute' then 1 else ce_private.rate_limits.hits+1 end,
  start_at=case when ce_private.rate_limits.start_at<now()-interval '1 minute' then now() else ce_private.rate_limits.start_at end returning hits into result;
  return result<=max_hits;
 end
$$;
-- SECURITY DEFINER functions are executable by PUBLIC unless explicitly revoked.
revoke all on function public.ce_workspace_read() from public,anon,authenticated;
revoke all on function public.ce_staff_check(uuid) from public,anon,authenticated;
revoke all on function public.ce_session_live(uuid,uuid) from public,anon,authenticated;
revoke all on function public.ce_workspace_commit(bigint,jsonb,uuid,text) from public,anon,authenticated;
revoke all on function public.ce_rate_limit(text,integer) from public,anon,authenticated;
grant execute on function public.ce_workspace_read(),public.ce_staff_check(uuid),public.ce_session_live(uuid,uuid),public.ce_workspace_commit(bigint,jsonb,uuid,text),public.ce_rate_limit(text,integer) to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('business-licenses','business-licenses',false,2097152,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict(id) do nothing;
-- Uploaded paths are bound to auth.uid; downloads require an authorized Edge Function.
create policy "shop_uploads_own_license" on storage.objects for insert to authenticated
with check(bucket_id='business-licenses' and (storage.foldername(name))[1]=(select auth.uid()::text));
-- No browser SELECT/UPDATE/DELETE policies. Never enable public access on this bucket.
