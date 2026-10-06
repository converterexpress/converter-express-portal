const assert=require('node:assert/strict'),fs=require('node:fs');
const pages=require('../seo/pages.json'),origin='https://www.converterexpress.co';
const xml=fs.readFileSync('dist/sitemap.xml','utf8');
const urls=[...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(m=>m[1]);
assert.deepEqual(urls,[origin+'/',...pages.map(p=>origin+'/'+p.slug)]);
assert.equal(new Set(urls).size,urls.length);assert(!xml.includes('#'));
for(const p of pages){const html=fs.readFileSync('dist/'+p.slug+'.html','utf8');assert(html.includes('<h1>'+p.heading+'</h1>'));assert(html.includes('href="'+origin+'/'+p.slug+'"'));assert(html.includes('name="description"'));assert(!html.includes('$100'));assert.equal((html.match(/<h1>/g)||[]).length,1);for(const m of html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g))assert.equal(JSON.parse(m[1]).name,'Converter Express');}
const home=fs.readFileSync('dist/index.html','utf8');assert(!home.includes('Converter Express Demo'));assert(!home.includes('WELCOME100'));assert(!home.includes('$100'));assert(home.includes('Catalytic converters delivered to your shop'));for(const p of pages)assert(home.includes('href="/'+p.slug+'"'));
assert(fs.readFileSync('dist/robots.txt','utf8').includes('Sitemap: '+origin+'/sitemap.xml'));
console.log('PASS canonical sitemap URLs, crawlable page content, metadata/schema, homepage links and $50 copy');
