import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const sql=await readFile(new URL('../supabase/migrations/202610090001_payment_lifecycle.sql',import.meta.url),'utf8');

test('payment lifecycle tables and RPCs remain private and idempotent',()=>{
 for(const name of ['checkout_reservations','payment_events','ce_checkout_reserve','ce_checkout_transition','ce_paid_order_finalize'])assert.match(sql,new RegExp(name));
 assert.match(sql,/revoke all on table ce_private\.checkout_reservations from public,anon,authenticated/i);
 assert.match(sql,/unique\s*\(payment_reference\)/i);
 assert.match(sql,/confirmed_order_id/i);
 assert.match(sql,/for update/i);
});

test('checkout states and expiration are constrained',()=>{
 for(const state of ['CREATING','READY','PROCESSING','PAID','EXPIRED','FAILED','REVIEW'])assert.match(sql,new RegExp("'"+state+"'"));
 assert.match(sql,/expires_at timestamptz not null/i);
});
