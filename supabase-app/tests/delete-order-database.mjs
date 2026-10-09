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

const {existsSync}=await import('node:fs');
const migration=new URL('../supabase/migrations/202610080001_manual_record_deletion.sql',import.meta.url);
if(existsSync(migration))await db.exec(await readFile(migration,'utf8'));
for(const status of ['queued','failed','sending','accepted','unknown']){
 await db.exec("reset role;update ce_private.order_emails set status='queued';update ce_private.workspace set payload=jsonb_set(payload,'{orders}','[]');");
 const id='delete-'+status;await db.query("update ce_private.workspace set payload=jsonb_set(payload,'{orders}',$1::jsonb)",[JSON.stringify([{id,lines:[]}])]);
 await db.query('update ce_private.order_emails set status=$1 where order_id=$2',[status,id]);await db.exec('set role service_role');
 const row=(await db.query('select public.ce_workspace_read() as r')).rows[0].r;row.data.orders=[];
 const remove=()=>db.query("select public.ce_workspace_commit($1,$2::jsonb,null,'delete-record')",[row.revision,JSON.stringify(row.data)]);
 if(['sending','accepted','unknown'].includes(status)){
  await assert.rejects(remove,/email|history/i);assert.equal((await db.query('select public.ce_workspace_read() as r')).rows[0].r.data.orders.length,1);
 }else{
  await remove();assert.deepEqual((await db.query('select public.ce_email_list($1) as r',[id])).rows[0].r,[]);
  assert.equal((await db.query("select public.ce_email_claim($1,'confirmation','{}','11111111-1111-4111-8111-111111111111') as r",[id])).rows[0].r,null);
  await assert.rejects(()=>db.query("select public.ce_email_prepare($1,'invoice')",[id]),/not found/i);
 }
}
await db.close();console.log('PASS atomic order deletion, queued/failed cleanup, active/accepted/unknown email protection, and no send after deletion');
