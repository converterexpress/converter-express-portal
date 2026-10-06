const assert=require('node:assert/strict');const fs=require('node:fs');const cp=require('node:child_process');
const result=cp.spawnSync(process.execPath,['scripts/build-static.cjs'],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);
const expected=['about-converter-express.html','catalytic-converters.html','shop-delivery.html','sitemap.xml','robots.txt','auth.js','config.js','converter-express_1.html','crm.css','crm.js','hero-v2.png','index.html','vendor/supabase-2.117.2.js'].sort();
function files(dir,prefix=''){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(dir+'/'+e.name,prefix+e.name+'/'):[prefix+e.name]);}
assert.deepEqual(files('dist').sort(),expected);assert.match(fs.readFileSync('dist/index.html','utf8'),/\.\/auth\.js/);
const config=JSON.parse(fs.readFileSync('vercel.json'));assert.equal(config.framework,null);assert.equal(config.outputDirectory,'dist');assert.equal(config.buildCommand,'node scripts/build-static.cjs');assert.equal(config.functions,undefined);
console.log('PASS static asset allowlist, default homepage, Vercel static configuration; no backend, database, scripts or tests published');
