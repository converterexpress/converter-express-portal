const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
// The public finder must reach its own endpoint even before Supabase is configured.
const source = fs.readFileSync('supabase-app/auth.js', 'utf8');
const start = source.indexOf('window.fetch=async function');
const end = source.indexOf('\nfunction clearPrivateState', start);
let calls = 0;
const options = {signal: new AbortController().signal};
const context = {window:{},nativeFetch:async (input,opts)=>{calls++;assert.equal(input,'/api/fitment/filters?year=2020');assert.equal(opts,options);return new Response('{"years":[2020]}');},api:()=>{throw Error('Supabase is not connected yet.');},URL,location:{origin:'https://example.com'},Response};
vm.runInNewContext(source.slice(start,end),context);
(async()=>{
 const result=await context.window.fetch('/api/fitment/filters?year=2020',options);
 assert.equal(result.status,200,'Public lookup must not depend on Supabase');assert.equal(calls,1);
 const proxy=require('../lib/fitment.cjs');
 function response(){return {headers:{},setHeader(k,v){this.headers[k]=v;},end(s){this.body=JSON.parse(s);}};}
 const payload={years:[2025,2020,2017],results:[{part_number:'92371'}],next:'https://cucarbcats.com/api/converters/?page=2'};
 let requests=[];const upstream=async (url,opts)=>{requests.push(url);assert.equal(opts.redirect,'error');return new Response(JSON.stringify(payload));};
 for(const route of ['filters','search']){const res=response();await proxy(route,{method:'GET',url:'/api/fitment/'+route+'?year=2020&make=GMC&page=2'},res,upstream);assert.equal(res.statusCode,200);assert.deepEqual(res.body,payload);assert.match(requests.at(-1),/^https:\/\/cucarbcats.com\/api\/converters\//);}
 for(const query of ['url=https://evil.com','year=2020&year=2017','page=0','year='+ 'x'.repeat(121)]){const n=requests.length,res=response();await proxy('filters',{method:'GET',url:'/?'+query},res,upstream);assert.equal(res.statusCode,400);assert.equal(requests.length,n);}
 let res=response();await proxy('filters',{method:'POST',url:'/'},res,upstream);assert.equal(res.statusCode,405);
 for(const fail of [async()=>{throw Error('secret internal failure');},async()=>new Response('bad',{status:500}),async()=>new Response('[]')]){res=response();await proxy('filters',{method:'GET',url:'/'},res,fail);assert.equal(res.statusCode,502);assert.equal(res.headers['Cache-Control'],'no-store');assert.doesNotMatch(JSON.stringify(res.body),/secret/);}
 console.log('PASS public lookup without Supabase, parameter guards, unchanged source data, upstream failures');
})().catch(e=>{console.error(e);process.exit(1);});
