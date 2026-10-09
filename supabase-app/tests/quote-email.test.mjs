import test from 'node:test';
import assert from 'node:assert/strict';
import {quoteEmail,sendQuoteEmail} from '../supabase/functions/_shared/quote-email.mjs';

const quote={id:'q1',number:'Q-100',accountId:'a1',expires:'2026-11-01',notes:'Call <script>alert(1)</script>',lines:[{partNumber:'201010',quantity:2,priceCents:10000}]};
const account={id:'a1',email:'buyer@example.test',shopName:'Repair & Sons',contactName:'Sam'};

test('quote email uses saved recipient and escaped quote snapshot',()=>{const mail=quoteEmail(quote,account);assert.deepEqual(mail.to,[account.email]);assert.match(mail.subject,/Q-100/);assert.match(mail.html,/\$200\.00/);assert(!mail.html.includes('<script>'));assert.match(mail.text,/Valid through: 2026-11-01/);});
test('quote email rejects invalid recipients and malformed quotes',()=>{assert.throws(()=>quoteEmail(quote,{...account,email:'bad\r\nBcc:x@test'}));assert.throws(()=>quoteEmail({...quote,lines:[]},account));});
const transport=(status='queued')=>{const calls=[];return {calls,rpc:async(name,args)=>{calls.push([name,args]);if(name==='ce_quote_email_prepare')return {status,snapshot:{quote,account},provider_id:'existing'};if(name==='ce_quote_email_claim')return {payload:args.content};}};};
test('accepted quote email is not sent twice',async()=>{const t=transport('accepted');const result=await sendQuoteEmail({...t,apiKey:'key',quoteId:'q1',fetcher:()=>{throw Error('must not send')}});assert.equal(result.status,'accepted');assert.equal(t.calls.length,1);});
test('provider acceptance is recorded without claiming inbox delivery',async()=>{const t=transport();const result=await sendQuoteEmail({...t,apiKey:'key',quoteId:'q1',fetcher:async(_url,options)=>{assert.equal(options.headers['Idempotency-Key'],'ce-quote-q1');return {ok:true,status:200,json:async()=>({id:'email_1'})};}});assert.equal(result.status,'accepted');assert.match(result.issue||'Accepted by email provider',/Accepted|provider/i);assert.equal(t.calls.at(-1)[0],'ce_quote_email_finish');});
test('timeout remains unknown and explicit rejection is retryable',async()=>{for(const code of [null,500,403]){const t=transport();const result=await sendQuoteEmail({...t,apiKey:'key',quoteId:'q1',fetcher:async()=>{if(code===null)throw Error('timeout');return {ok:false,status:code,json:async()=>({message:'private'})};}});assert.equal(result.status,code===403?'failed':'unknown');assert(!String(result.issue).includes('private'));}});
