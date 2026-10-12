import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const sql=await readFile(new URL('../supabase/migrations/202610090001_payment_lifecycle.sql',import.meta.url),'utf8');

test('payment lifecycle tables and RPCs remain private and idempotent',()=>{
 for(const name of ['checkout_reservations','payment_events','ce_checkout_reserve','ce_checkout_active','ce_checkout_transition','ce_paid_order_finalize'])assert.match(sql,new RegExp(name));
 assert.match(sql,/revoke all on table ce_private\.checkout_reservations from public,anon,authenticated/i);
 assert.match(sql,/unique\s*\(payment_reference\)/i);
 assert.match(sql,/confirmed_order_id/i);
 assert.match(sql,/for update/i);
});

test('checkout states and expiration are constrained',()=>{
 for(const state of ['CREATING','READY','PROCESSING','PAID','EXPIRED','FAILED','REVIEW'])assert.match(sql,new RegExp("'"+state+"'"));
 assert.match(sql,/expires_at timestamptz not null/i);
});

const offline=await readFile(new URL('../supabase/migrations/202610110001_offline_delivery_payments.sql',import.meta.url),'utf8');
test('offline delivery payment migration is private and atomic',()=>{for(const value of ['AWAITING_OFFLINE_PAYMENT','CANCELLED','payment_method','request_number','ce_offline_checkout_reserve','ce_offline_checkout_list','ce_offline_checkout_finalize','ce_offline_checkout_cancel'])assert.match(offline,new RegExp(value,'i'));assert.match(offline,/for update/i);assert.match(offline,/confirmed_order_id is not null then return/i);assert.match(offline,/revoke all on function public\.ce_offline_checkout_finalize/i);});
