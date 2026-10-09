const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');

(async()=>{
 const {project}=await import('../supabase/functions/_shared/business.mjs');
 const user={id:'user-a',email:'shop@example.test',admin:false,aal:'aal1'};
 const order={id:'order-a',invoiceNumber:'INV-201',shopEmail:user.email,shopName:'Shop A',createdAt:'2026-10-09T12:00:00Z',subtotalCents:12500,shippingCents:0,discountCents:0,taxCents:0,cardFeeCents:0,merchantFeeCents:0,totalCents:12500,amountPaidCents:0,paymentStatus:'UNPAID',fulfillmentStage:'INVOICED',fulfillment:{method:'DELIVERY',address:null},lines:[{partId:'201010',name:'Converter',quantity:1,priceCents:12500}]};
 const db={accounts:[{id:user.id,email:user.email,role:'CUSTOMER',status:'APPROVED',shopName:'Shop A',contactName:'Alex Shop',phone:'4089178099',addressLine1:'1 Main St',city:'San Jose',state:'CA',postalCode:'95113'}],orders:[order],products:[{partNumber:'201010',manufacturer:'Walker',name:'Converter',category:'201 Series',description:'Converter',priceCents:12500,pricePending:false,costCents:8000,inStock:true}],discountCodes:[],storeSettings:{shippingFlatCents:0,taxRatePercent:0,actualShippingCostCents:0,pickupAvailable:false},crm:{quotes:[],tasks:[],purchases:[],inventory:{},activities:[]}};
 const apiCalls=[];
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:390,height:900}}),errors=[];
  page.setDefaultTimeout(5000);
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/config.js',route=>route.fulfill({contentType:'text/javascript',body:"window.CE_CONFIG={supabaseUrl:'https://mock.supabase.co',publishableKey:'sb_publishable_mock'};"}));
  await page.route('**/vendor/supabase-2.117.2.js',route=>route.fulfill({contentType:'text/javascript',body:`window.supabase={createClient(){return {auth:{async getSession(){return {data:{session:{access_token:'mock-token'}}}},async getUser(){return {data:{user:{id:'user-a',email:'shop@example.test'}}}},onAuthStateChange(){return {}},async signOut(){return {error:null}}}}}};`}));
  await page.route('https://cdn.whop.com/elements/amber/elements.js',route=>route.fulfill({contentType:'text/javascript',body:`window.__whopCalls=[];window.WhopElements=()=>({payments:{create(options){window.__whopCalls.push(['payments',options]);return {create(type,events={}){window.__whopCalls.push(['element',type]);return {mount(target){document.querySelector(target).dataset.mockMounted='true';if(type==='payment')queueMicrotask(()=>events.onChange?.({complete:true}));},destroy(){}}},async createConfirmationToken(){window.__whopCalls.push(['token']);return {confirmationToken:'ctok_ABC123',type:'card'}},destroy(){}}},async handleNextAction(input){window.__whopCalls.push(['next',input]);return {status:'paid',redirected:false,lastPaymentError:null}}}});`}));
  await page.route('https://mock.supabase.co/functions/v1/crm-api',async route=>{const body=route.request().postDataJSON();apiCalls.push(body);if(body.action==='bootstrap')return route.fulfill({json:{...project(db,user),revision:1,paymentConfigured:true}});if(body.action==='payment-session')return route.fulfill({json:{accountId:'biz_123',currency:'usd',amount:12500,reference:'reference-123',billingDetails:{email:user.email,name:'Alex Shop',phone:'4089178099',address:{line1:'1 Main St',line2:'',city:'San Jose',state:'CA',postal_code:'95113',country:'US'}}}});if(body.action==='payment-confirm')return route.fulfill({json:{clientSecret:'pay_123_secret_test',status:'open'}});return route.fulfill({status:400,json:{error:'Unexpected action'}});});
  await page.goto('http://127.0.0.1:8778/converter-express_1.html#/orders/order-a/invoice');
  await page.locator('.whop-payment-element[data-mock-mounted=true]').waitFor();
  const pay=page.getByRole('button',{name:'Pay $125.00'});await pay.waitFor();assert.equal(await pay.isDisabled(),false);
  assert.equal(await page.locator('.whop-branding-element[data-mock-mounted=true]').count(),1);
  await pay.click();await page.getByText('Payment received. Confirming your invoice…').waitFor();
  assert.deepEqual(apiCalls.filter(call=>call.action.startsWith('payment-')).map(call=>call.action),['payment-session','payment-confirm']);
  assert.equal(apiCalls.find(call=>call.action==='payment-confirm').confirmationToken,'ctok_ABC123');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.deepEqual(errors,[]);
  console.log('PASS embedded Whop payment mounts required elements, confirms server-side, handles next action, and fits mobile');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1)});
