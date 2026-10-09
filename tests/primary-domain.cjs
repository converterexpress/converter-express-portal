const assert=require('node:assert/strict'),fs=require('node:fs');
const origin='https://www.converterexpress.net',v=JSON.parse(fs.readFileSync('vercel.json'));
assert(v.redirects.every(r=>r.destination===origin+(r.source==='/'?'/':'/:path*')&&r.permanent));
assert(!v.redirects.some(r=>r.has.some(h=>h.value==='www.converterexpress.net')));
const config=fs.readFileSync('supabase-app/supabase/config.toml','utf8');assert(config.includes('site_url = "'+origin+'/"'));
for(const file of ['scripts/build-seo.cjs','scripts/build-email-templates.cjs','supabase-app/supabase/functions/_shared/order-email.mjs']){const s=fs.readFileSync(file,'utf8');assert(s.includes(origin));assert(!s.includes('https://www.converterexpress.co'));}
assert(fs.readFileSync('supabase-app/supabase/functions/_shared/order-email.mjs','utf8').includes('accounts@converterexpress.co'));
console.log('PASS primary domain, alias-only redirects, canonical/email origins and existing email sender');

for(const host of ['converterexpress.co','www.converterexpress.co','converterexpress.net']) assert(v.redirects.some(r=>r.source==='/'&&r.has.some(h=>h.value===host)&&r.destination===origin+'/'));
