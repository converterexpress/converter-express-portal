// Publish only the Supabase frontend. Never bundle the legacy SQLite server.
const fs=require('node:fs');const path=require('node:path');
const root=path.resolve(__dirname,'..'),source=path.join(root,'supabase-app'),output=path.join(root,'dist');
fs.rmSync(output,{recursive:true,force:true});fs.mkdirSync(output,{recursive:true});
for(const name of ['converter-express_1.html','crm.js','crm.css','auth.js','config.js','hero-v2.png','vendor/supabase-2.117.2.js']){const target=path.join(output,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(source,name),target);}
fs.copyFileSync(path.join(output,'converter-express_1.html'),path.join(output,'index.html'));
console.log('Built Supabase frontend in dist. Backend/database/source files excluded.');
