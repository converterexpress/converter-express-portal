const {PGlite}=await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
import {readFile} from 'node:fs/promises';import assert from 'node:assert/strict';
const db=new PGlite();
await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key);create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);create function auth.uid() returns uuid language sql as $$select null::uuid$$;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid,bucket_id text,name text);create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;`);
await db.exec(await readFile(new URL('../supabase/migrations/202610050001_private_workspace.sql',import.meta.url),'utf8'));
await db.exec(`insert into ce_private.workspace values(1,1,'{"accounts":[],"orders":[],"products":[],"storeSettings":{},"discountCodes":[],"crm":{}}',now());`);
for(const role of ['anon','authenticated']){await db.exec('set role '+role);for(const sql of ['select * from ce_private.workspace','select * from ce_private.staff','select public.ce_workspace_read()',"select public.ce_workspace_commit(1,'{}',null,'hack')"]){await assert.rejects(()=>db.exec(sql),/permission denied/);}await db.exec('reset role');}
await db.exec('set role service_role');const row=(await db.query('select public.ce_workspace_read() as result')).rows[0].result;assert.equal(row.revision,1);
const saved=(await db.query("select public.ce_workspace_commit(1,$1::jsonb,null,'test') as result",[JSON.stringify(row.data)])).rows[0].result;assert.equal(saved,2);await assert.rejects(()=>db.query("select public.ce_workspace_commit(1,$1::jsonb,null,'stale')",[JSON.stringify(row.data)]),/Revision conflict/);
assert.equal((await db.query("select public.ce_rate_limit('test',1) as allowed")).rows[0].allowed,true);assert.equal((await db.query("select public.ce_rate_limit('test',1) as allowed")).rows[0].allowed,false);
await db.exec('reset role');assert.equal((await db.query('select count(*)::int as count from ce_private.audit')).rows[0].count,1);assert.equal((await db.query("select public from storage.buckets where id='business-licenses'")).rows[0].public,false);

await db.exec(await readFile(new URL('../supabase/migrations/202610060001_order_email.sql',import.meta.url),'utf8'));
const order={id:'test-order',shopEmail:'shop@example.test',lines:[]};
await db.query("update ce_private.workspace set payload=jsonb_set(payload,'{orders}',$1::jsonb)",[JSON.stringify([order])]);
assert.equal((await db.query('select count(*)::int as n from ce_private.order_emails')).rows[0].n,1);
await db.query("update ce_private.workspace set payload=payload");
assert.equal((await db.query('select count(*)::int as n from ce_private.order_emails')).rows[0].n,1);
for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(()=>db.query("select public.ce_email_prepare('test-order','invoice')"),/permission denied/);await assert.rejects(()=>db.query('select * from ce_private.order_emails'),/permission denied/);await db.exec('reset role');}
const key='11111111-1111-4111-8111-111111111111';
await db.exec('set role service_role');
await db.query("select public.ce_email_prepare('test-order','invoice')");
let claim=(await db.query("select public.ce_email_claim('test-order','invoice',$1::jsonb,$2::uuid) as e",[JSON.stringify({subject:'Frozen'}),key])).rows[0].e;assert.equal(claim.status,'sending');
assert.equal((await db.query("select public.ce_email_claim('test-order','invoice','{}',$1::uuid) as e",[key])).rows[0].e,null);
await db.query("select public.ce_email_finish('test-order','invoice',$1::uuid,'accepted','provider-id',null)",[key]);
assert.equal((await db.query("select public.ce_email_claim('test-order','invoice','{}',$1::uuid) as e",[key])).rows[0].e,null);
await db.query("select public.ce_email_claim('test-order','confirmation',$1::jsonb,$2::uuid)",[JSON.stringify({subject:'Frozen'}),key]);
await db.query("select public.ce_email_finish('test-order','confirmation',$1::uuid,'unknown',null,'timeout')",[key]);
claim=(await db.query("select public.ce_email_claim('test-order','confirmation','{\"subject\":\"Changed\"}',$1::uuid) as e",[key])).rows[0].e;assert.equal(claim.payload.subject,'Frozen');
await db.query("select public.ce_email_finish('test-order','confirmation',$1::uuid,'unknown',null,'timeout')",[key]);
await db.exec("reset role;update ce_private.order_emails set first_attempt=now()-interval '25 hours' where kind='confirmation';set role service_role");
assert.equal((await db.query("select public.ce_email_claim('test-order','confirmation','{}',$1::uuid) as e",[key])).rows[0].e,null);
await db.close();console.log('PASS email trigger, private grants, frozen retries, concurrency lock, accepted dedupe, and stale uncertain-send lock');
