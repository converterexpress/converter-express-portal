-- Payment-first customer checkout. Browser roles have no direct access.
create table ce_private.checkout_reservations (
 id uuid primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 shop_email text not null,
 status text not null check(status in ('CREATING','READY','PROCESSING','PAID','EXPIRED','FAILED','REVIEW')),
 quote jsonb not null check(jsonb_typeof(quote)='object'),
 request_hash text not null,
 payment_reference text not null,
 whop_payment_id text,
 amount_cents bigint not null check(amount_cents>0),
 expires_at timestamptz not null,
 confirmed_order_id text,
 failure_code text,
 failure_message text check(length(failure_message)<=500),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(payment_reference), unique(whop_payment_id)
);
create index checkout_reservations_user_status on ce_private.checkout_reservations(user_id,status);
create index checkout_reservations_expiry on ce_private.checkout_reservations(expires_at) where status in ('CREATING','READY');
create table ce_private.payment_events (
 provider_event_id text primary key,
 event_type text not null,
 business_reference text,
 payment_id text,
 outcome text not null,
 payload jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
alter table ce_private.checkout_reservations enable row level security;
alter table ce_private.payment_events enable row level security;
revoke all on table ce_private.checkout_reservations from public,anon,authenticated;
revoke all on table ce_private.payment_events from public,anon,authenticated;

create function public.ce_checkout_read(rid uuid) returns jsonb language sql security definer set search_path='' as $$
 select to_jsonb(r) from ce_private.checkout_reservations r where id=rid
$$;
create function public.ce_checkout_active() returns jsonb language sql security definer set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from ce_private.checkout_reservations r where status in ('CREATING','READY','PROCESSING') and expires_at>now()
$$;
create function public.ce_checkout_reserve(rid uuid,uid uuid,email text,body jsonb,hash text,reference text,amount bigint,expires timestamptz) returns jsonb language plpgsql security definer set search_path='' as $$
 declare r ce_private.checkout_reservations;
 begin
  insert into ce_private.checkout_reservations(id,user_id,shop_email,status,quote,request_hash,payment_reference,amount_cents,expires_at)
  values(rid,uid,lower(email),'CREATING',body,hash,reference,amount,expires)
  on conflict(id) do nothing;
  select * into r from ce_private.checkout_reservations where id=rid for update;
  if r.user_id<>uid or r.request_hash<>hash then raise exception 'Checkout request changed' using errcode='22023'; end if;
  return to_jsonb(r);
 end
$$;
create function public.ce_checkout_transition(rid uuid,expected text,next_state text,payment_id text default null,failure text default null) returns jsonb language plpgsql security definer set search_path='' as $$
 declare r ce_private.checkout_reservations;
 begin
  update ce_private.checkout_reservations set status=next_state,whop_payment_id=coalesce(payment_id,whop_payment_id),failure_message=failure,updated_at=now()
  where id=rid and status=expected returning * into r;
  if r.id is null then raise exception 'Checkout state changed' using errcode='40001'; end if;
  return to_jsonb(r);
 end
$$;
create function public.ce_checkout_expire() returns integer language plpgsql security definer set search_path='' as $$
 declare n integer;
 begin update ce_private.checkout_reservations set status='EXPIRED',updated_at=now() where status in ('CREATING','READY') and expires_at<=now();get diagnostics n=row_count;return n;end
$$;
create function public.ce_paid_order_finalize(rid uuid,payment jsonb,expected_revision bigint) returns text language plpgsql security definer set search_path='' as $$
 declare r ce_private.checkout_reservations; oid text; current_revision bigint;
 begin
  select * into r from ce_private.checkout_reservations where id=rid for update;
  if r.confirmed_order_id is not null then return r.confirmed_order_id; end if;
  if r.status not in ('PROCESSING','READY') then raise exception 'Checkout cannot be finalized'; end if;
  if (payment->>'id') is null or (payment->>'amount_cents')::bigint<>r.amount_cents then raise exception 'Payment mismatch'; end if;
  select revision into current_revision from ce_private.workspace where id=1 for update;
  if current_revision<>expected_revision then raise exception 'Revision conflict' using errcode='40001'; end if;
  oid=payment->'order'->>'id';
  if oid is null or jsonb_typeof(payment->'order')<>'object' then raise exception 'Paid order missing'; end if;
  update ce_private.workspace set payload=jsonb_set(payload,'{orders}',(payload->'orders')||(payment->'order')),revision=revision+1,updated_at=now() where id=1;
  insert into ce_private.audit(actor,action,revision) values(r.user_id,'payment-order-confirmed',current_revision+1);
  update ce_private.checkout_reservations set status='PAID',whop_payment_id=payment->>'id',confirmed_order_id=oid,updated_at=now() where id=rid;
  insert into ce_private.payment_events(provider_event_id,event_type,business_reference,payment_id,outcome,payload)
   values(payment->>'event_id','payment.succeeded',oid,payment->>'id','applied',jsonb_build_object('amount_cents',r.amount_cents)) on conflict do nothing;
  return oid;
 end
$$;
revoke all on function public.ce_checkout_read(uuid) from public,anon,authenticated;
revoke all on function public.ce_checkout_active() from public,anon,authenticated;
revoke all on function public.ce_checkout_reserve(uuid,uuid,text,jsonb,text,text,bigint,timestamptz) from public,anon,authenticated;
revoke all on function public.ce_checkout_transition(uuid,text,text,text,text) from public,anon,authenticated;
revoke all on function public.ce_checkout_expire() from public,anon,authenticated;
revoke all on function public.ce_paid_order_finalize(uuid,jsonb,bigint) from public,anon,authenticated;
grant execute on function public.ce_checkout_read(uuid),public.ce_checkout_active(),public.ce_checkout_reserve(uuid,uuid,text,jsonb,text,text,bigint,timestamptz),public.ce_checkout_transition(uuid,text,text,text,text),public.ce_checkout_expire(),public.ce_paid_order_finalize(uuid,jsonb,bigint) to service_role;
