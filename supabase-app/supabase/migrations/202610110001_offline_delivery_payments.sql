-- Cash/check delivery requests stay private and become orders only after staff records full payment.
alter table ce_private.checkout_reservations drop constraint if exists checkout_reservations_status_check;
alter table ce_private.checkout_reservations add constraint checkout_reservations_status_check check(status in ('CREATING','READY','PROCESSING','PAID','EXPIRED','FAILED','REVIEW','AWAITING_OFFLINE_PAYMENT','CANCELLED'));
alter table ce_private.checkout_reservations alter column expires_at drop not null;
alter table ce_private.checkout_reservations
 add column payment_method text not null default 'WHOP' check(payment_method in ('WHOP','CASH','CHECK')),
 add column request_number text unique check(request_number is null or request_number~'^PAY-[A-F0-9]{12}$'),
 add column collected_at timestamptz,
 add column collected_by uuid,
 add column collection_reference text check(collection_reference is null or length(collection_reference)<=120),
 add column cancelled_at timestamptz,
 add column cancelled_by uuid,
 add column cancellation_reason text check(cancellation_reason is null or length(cancellation_reason) between 1 and 500);
create index checkout_reservations_offline_queue on ce_private.checkout_reservations(created_at) where status='AWAITING_OFFLINE_PAYMENT';

create or replace function public.ce_checkout_active() returns jsonb language sql security definer set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) from ce_private.checkout_reservations r
 where status='AWAITING_OFFLINE_PAYMENT' or (status in ('CREATING','READY','PROCESSING') and expires_at>now())
$$;

create function public.ce_offline_checkout_reserve(rid uuid,uid uuid,email text,body jsonb,hash text,method text,request_no text,amount bigint) returns jsonb language plpgsql security definer set search_path='' as $$
 declare r ce_private.checkout_reservations;
 begin
  if method not in ('CASH','CHECK') or request_no!~'^PAY-[A-F0-9]{12}$' or amount<0 then raise exception 'Invalid offline checkout'; end if;
  insert into ce_private.checkout_reservations(id,user_id,shop_email,status,quote,request_hash,payment_reference,amount_cents,expires_at,payment_method,request_number)
  values(rid,uid,lower(email),'AWAITING_OFFLINE_PAYMENT',body,hash,gen_random_uuid()::text,amount,null,method,request_no)
  on conflict(id) do nothing;
  select * into r from ce_private.checkout_reservations where id=rid for update;
  if r.user_id<>uid or r.request_hash<>hash or r.payment_method<>method then raise exception 'Checkout request changed' using errcode='22023'; end if;
  return to_jsonb(r);
 end
$$;

create function public.ce_offline_checkout_list() returns jsonb language sql security definer set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at),'[]'::jsonb)
 from ce_private.checkout_reservations r where r.status='AWAITING_OFFLINE_PAYMENT'
$$;

create function public.ce_offline_checkout_finalize(rid uuid,method text,amount bigint,reference text,actor uuid,paid_order jsonb) returns text language plpgsql security definer set search_path='' as $$
 declare r ce_private.checkout_reservations;oid text;current_revision bigint;clean_reference text;
 begin
  select * into r from ce_private.checkout_reservations where id=rid for update;
  if r.id is null then raise exception 'Delivery payment request not found'; end if;
  if r.confirmed_order_id is not null then return r.confirmed_order_id; end if;
  if r.status<>'AWAITING_OFFLINE_PAYMENT' then raise exception 'Delivery payment request cannot be finalized'; end if;
  if method not in ('CASH','CHECK') or method<>r.payment_method then raise exception 'Payment method mismatch'; end if;
  if amount<>r.amount_cents then raise exception 'Full payment is required'; end if;
  if actor is null then raise exception 'Payment collector is required'; end if;
  clean_reference=left(trim(coalesce(reference,'')),120);
  if jsonb_typeof(paid_order)<>'object' or paid_order->>'id' is null or paid_order->>'paymentStatus'<>'PAID' or (paid_order->>'amountPaidCents')::bigint<>r.amount_cents then raise exception 'Paid order mismatch'; end if;
  oid=paid_order->>'id';
  select revision into current_revision from ce_private.workspace where id=1 for update;
  if exists(select 1 from ce_private.workspace w cross join lateral jsonb_array_elements(w.payload->'orders') o where w.id=1 and o->>'id'=oid) then raise exception 'Order already exists'; end if;
  update ce_private.workspace set payload=jsonb_set(payload,'{orders}',coalesce(payload->'orders','[]'::jsonb)||paid_order),revision=revision+1,updated_at=now() where id=1;
  update ce_private.checkout_reservations set status='PAID',confirmed_order_id=oid,collected_at=now(),collected_by=actor,collection_reference=clean_reference,updated_at=now() where id=rid;
  insert into ce_private.audit(actor,action,revision) values(actor,'offline-payment-collected',current_revision+1);
  return oid;
 end
$$;

create function public.ce_offline_checkout_cancel(rid uuid,actor uuid,reason text) returns jsonb language plpgsql security definer set search_path='' as $$
 declare r ce_private.checkout_reservations;current_revision bigint;clean_reason text;
 begin
  select * into r from ce_private.checkout_reservations where id=rid for update;
  if r.id is null then raise exception 'Delivery payment request not found'; end if;
  if r.status='CANCELLED' then return to_jsonb(r); end if;
  if r.status<>'AWAITING_OFFLINE_PAYMENT' or r.confirmed_order_id is not null then raise exception 'Delivery payment request cannot be cancelled'; end if;
  if actor is null then raise exception 'Cancelling administrator is required'; end if;
  clean_reason=trim(coalesce(reason,''));if length(clean_reason) not between 1 and 500 then raise exception 'Cancellation reason is required'; end if;
  update ce_private.checkout_reservations set status='CANCELLED',cancelled_at=now(),cancelled_by=actor,cancellation_reason=clean_reason,updated_at=now() where id=rid returning * into r;
  select revision into current_revision from ce_private.workspace where id=1;
  insert into ce_private.audit(actor,action,revision) values(actor,'offline-payment-cancelled',current_revision);
  return to_jsonb(r);
 end
$$;

revoke all on function public.ce_offline_checkout_reserve(uuid,uuid,text,jsonb,text,text,text,bigint) from public,anon,authenticated;
revoke all on function public.ce_offline_checkout_list() from public,anon,authenticated;
revoke all on function public.ce_offline_checkout_finalize(uuid,text,bigint,text,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.ce_offline_checkout_cancel(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.ce_offline_checkout_reserve(uuid,uuid,text,jsonb,text,text,text,bigint),public.ce_offline_checkout_list(),public.ce_offline_checkout_finalize(uuid,text,bigint,text,uuid,jsonb),public.ce_offline_checkout_cancel(uuid,uuid,text) to service_role;
