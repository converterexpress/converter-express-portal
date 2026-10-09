const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const path=require('node:path');

(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setContent('<main id="app"></main>');
  await page.addScriptTag({content:`
window.state={user:{id:'admin',role:'ADMIN'},crm:{quotes:[{id:'q1',number:'Q-100',accountId:'a1',expires:'2099-12-31',notes:'',status:'Draft',createdAt:new Date().toISOString(),lines:[{partNumber:'201010',quantity:1,priceCents:10000}]}],tasks:[],purchases:[],inventory:{},activities:[]},accounts:[{id:'a1',shopName:'Test Shop',email:'buyer@example.test'}],orders:[],products:[]};
window.requireAdmin=()=>true;window.crmToday=()=>new Date().toISOString().slice(0,10);window.crmDateDays=d=>d;window.esc=v=>String(v??'');window.fmt=n=>'$'+(n/100).toFixed(2);window.manualDeleteButton=()=>'';window.crmAccount=id=>state.accounts.find(a=>a.id===id);window.crmAccountSelect=()=>'<select></select>';window.crmFormFooter=x=>x;window.crmActivity=()=>{};window.saveWorkspace=()=>{};window.nav=()=>{};window.api=async body=>body.operation==='preview'?{to:'buyer@example.test',subject:'Quote',html:'<h1>Quote preview</h1>'}:body.operation==='status'?{configured:true,email:{status:'queued'}}:{email:{status:'accepted'}};
`});
  await page.addScriptTag({path:path.resolve(__dirname,'../crm.js')});
  await page.evaluate(()=>{window.crmShell=(_tab,html)=>document.getElementById('app').innerHTML=html;window.crmActivity=()=>{};renderCrmQuotes();});
  await page.getByRole('button',{name:'Email quote'}).click();
  await page.getByText('To: buyer@example.test · Not sent.').waitFor();
  assert.equal(await page.locator('#quoteEmailFrame').getAttribute('sandbox'),'');
  await page.getByRole('button',{name:'Send quote email'}).click();
  await page.getByText('Accepted by the email provider.').waitFor();
  const decision=page.getByLabel('Customer decision for Q-100');await decision.selectOption('Accepted');
  await page.waitForFunction(()=>state.crm.quotes[0].status==='Accepted');
  await page.evaluate(()=>renderCrmQuotes());
  assert.match(await page.locator('#app').innerText(),/Accepted recorded by staff/);
  assert.deepEqual(errors,[]);console.log('PASS quote preview/send status and staff-recorded acceptance');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
