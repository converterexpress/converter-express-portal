import {invoiceBalance,checkoutPayload,elementPaymentPayload,reservationPaymentPayload,paymentElementConfig,safeCheckoutUrl,whopRequest,whopPaymentRequest} from '../_shared/whop.mjs';
import {createClient} from 'npm:@supabase/supabase-js@2.117.2';
import {orderEmail,sendOrderEmail} from '../_shared/order-email.mjs';
import {quoteEmail,sendQuoteEmail} from '../_shared/quote-email.mjs';
import {project,command,validate,validateAdminRemovals,principal,AppError} from '../_shared/business.mjs';
import {buildCheckoutReservation,checkoutRequestHash} from '../_shared/checkout.mjs';
const url=Deno.env.get('SUPABASE_URL')!;
const secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
const origins=(Deno.env.get('APP_ORIGINS')||'').split(',').map(x=>x.trim()).filter(Boolean);
async function rpc(name:string,args:Record<string,unknown>={}){const {data,error}=await db.rpc(name,args);if(error){if(error.code==='40001')throw new AppError('Another change was saved. Reload and try again.',409);throw new AppError('Unable to complete the request',503);}return data;}
async function identity(req:Request){
 const bearer=req.headers.get('Authorization');if(!bearer)return null;
 if(!/^Bearer [A-Za-z0-9._-]+$/.test(bearer))throw new AppError('Sign in again',401);
 const token=bearer.slice(7);
 const {data:{user},error}=await db.auth.getUser(token);if(error||!user||!user.email_confirmed_at)throw new AppError('Sign in with a verified email',401);
 const claimsResult=await db.auth.getClaims(token);if(claimsResult.error||!claimsResult.data?.claims)throw new AppError('Sign in again',401);
 const claims=claimsResult.data.claims;if(!claims.session_id||!await rpc('ce_session_live',{uid:user.id,sid:claims.session_id}))throw new AppError('Session expired. Sign in again.',401);
 const staff=await rpc('ce_staff_check',{uid:user.id});return principal(user,staff?[user.id]:[],claims);
}
async function sendMail(orderId:string,kind:string){try{return await sendOrderEmail({rpc,apiKey:Deno.env.get('RESEND_API_KEY'),orderId,kind});}catch{return {status:'unknown',issue:'Order saved. Email could not be confirmed; review its send status.'};}}
Deno.serve(async req=>{
 const origin=req.headers.get('Origin')||'';
 const headers:Record<string,string>={'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Origin'};
 if(origins.includes(origin)){headers['Access-Control-Allow-Origin']=origin;headers['Access-Control-Allow-Headers']='authorization, apikey, content-type, x-client-info';headers['Access-Control-Allow-Methods']='POST, OPTIONS';}
 const respond=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
 if(origin&&!origins.includes(origin))return respond({error:'Origin not allowed'},403);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return respond({error:'Method not allowed'},405);
 try{
  // Bound streamed input too; Content-Length alone can be omitted or forged.
  const reader=req.body?.getReader();if(!reader)throw new AppError('Missing request body');let size=0;const chunks:Uint8Array[]=[];while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>12000000){await reader.cancel();throw new AppError('Request too large',413);}chunks.push(value);}const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}let body;try{body=JSON.parse(new TextDecoder().decode(bytes));}catch{throw new AppError('Invalid JSON');}
  const user=await identity(req);
  if(!user&&!['bootstrap','fitment'].includes(body.action))throw new AppError('Sign in to continue',401);
  if(!await rpc('ce_rate_limit',{subject_key:user?.id||'public-'+body.action,max_hits:user?120:body.action==='fitment'?120:300}))throw new AppError('Too many requests. Try again shortly.',429);
  if(body.action==='fitment'){
   const params=new URLSearchParams(body.query||'');if(!['filters','search'].includes(body.route)||[...params].some(([k,v])=>!['year','make','model','engine_size','test_group','page'].includes(k)||v.length>120))throw new AppError('Invalid fitment lookup');
   const target='https://cucarbcats.com/api/converters/'+(body.route==='filters'?'filters/':'')+'?'+params;
   const response=await fetch(target,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(20000)});if(!response.ok)throw new AppError('Fitment lookup unavailable',502);return respond(await response.json());
  }
  if(body.action==='bootstrap'){
   const row=await rpc('ce_workspace_read');if(!row)throw new AppError('Catalog setup has not been completed',503);
   return respond({...project(row.data,user),revision:row.revision,paymentConfigured:!!(Deno.env.get('WHOP_PAYMENTS_ENABLED')==='true'&&Deno.env.get('WHOP_COMPANY_API_KEY')&&Deno.env.get('WHOP_COMPANY_ID')&&Deno.env.get('WHOP_WEBHOOK_SECRET'))});
  }
  if(body.action==='quote'){const row=await rpc('ce_workspace_read');if(!row)throw new AppError('Workspace unavailable',503);const result=command(row.data,user,{...body,action:'order'});return respond({quote:result.result});}
  if(body.action==='checkout-reserve'){
   if(Object.keys(body).some(k=>!['action','idempotencyKey','items','fulfillment','job','poNumber','notes','discountCode'].includes(k)))throw new AppError('Invalid checkout request');
   const row=await rpc('ce_workspace_read'),active=await rpc('ce_checkout_active');
   const args={idempotencyKey:body.idempotencyKey,items:body.items,fulfillment:body.fulfillment,job:body.job||{},poNumber:body.poNumber||'',notes:body.notes||'',discountCode:body.discountCode||''};
   const reservation=await buildCheckoutReservation(row.data,user,args,active||[]);
   const saved=await rpc('ce_checkout_reserve',{rid:reservation.id,uid:user!.id,email:user!.email,body:reservation.quote,hash:reservation.requestHash,reference:reservation.paymentReference,amount:reservation.amountCents,expires:reservation.expiresAt});
   return respond({reservation:{id:saved.id,status:saved.status,amountCents:saved.amount_cents,expiresAt:saved.expires_at}});
  }
  if(body.action==='checkout-status'){
   if(Object.keys(body).some(k=>!['action','reservationId'].includes(k))||!/^[0-9a-f-]{36}$/i.test(body.reservationId||''))throw new AppError('Invalid checkout request');const r=await rpc('ce_checkout_read',{rid:body.reservationId});
   if(!r||r.user_id!==user!.id)throw new AppError('Checkout not found',404);return respond({reservation:{id:r.id,status:r.status,amountCents:r.amount_cents,expiresAt:r.expires_at,orderId:r.confirmed_order_id||null}});
  }
  if(body.action==='checkout-session'){
   if(Object.keys(body).some(k=>!['action','reservationId'].includes(k)))throw new AppError('Invalid checkout request');const r=await rpc('ce_checkout_read',{rid:body.reservationId});if(!r||r.user_id!==user!.id)throw new AppError('Checkout not found',404);
   if(['PROCESSING','PAID','REVIEW'].includes(r.status))return respond({status:r.status,orderId:r.confirmed_order_id||null});if(new Date(r.expires_at)<=new Date())throw new AppError('Checkout expired. Review current price and availability.',409);
   const companyId=Deno.env.get('WHOP_COMPANY_ID');if(Deno.env.get('WHOP_PAYMENTS_ENABLED')!=='true'||!companyId)throw new AppError('Online payments are not available yet.',503);
   const account=(await rpc('ce_workspace_read'))?.data.accounts.find((a:any)=>a.id===user!.id),billingDetails={email:user!.email,name:account?.contactName||account?.shopName||'',phone:account?.phone||'',address:{line1:account?.addressLine1||'',line2:account?.addressLine2||'',city:account?.city||'',state:account?.state||'',postal_code:account?.postalCode||'',country:'US'}};
   const faux={totalCents:r.amount_cents,amountPaidCents:0,paymentStatus:'UNPAID',cancelled:false};return respond({...paymentElementConfig(faux,companyId),reference:r.payment_reference,reservationId:r.id,billingDetails});
  }
  if(body.action==='checkout-confirm'){
   if(Object.keys(body).some(k=>!['action','reservationId','reference','confirmationToken'].includes(k))||!/^ctok_[A-Za-z0-9]+$/.test(body.confirmationToken||'')||typeof body.reference!=='string')throw new AppError('Invalid payment confirmation');
   const key=Deno.env.get('WHOP_COMPANY_API_KEY'),companyId=Deno.env.get('WHOP_COMPANY_ID');if(Deno.env.get('WHOP_PAYMENTS_ENABLED')!=='true'||!key||!companyId||!Deno.env.get('WHOP_WEBHOOK_SECRET'))throw new AppError('Online payments are not available yet.',503);
   const r=await rpc('ce_checkout_read',{rid:body.reservationId});if(!r||r.user_id!==user!.id)throw new AppError('Checkout not found',404);if(r.status!=='READY'||r.payment_reference!==body.reference)throw new AppError('This checkout can no longer accept payment. Check its status before trying again.',409);if(new Date(r.expires_at)<=new Date())throw new AppError('Checkout expired. Review current price and availability.',409);
   const payment=await whopPaymentRequest('payments',key,reservationPaymentPayload(r,companyId,body.confirmationToken,user!.email));if(!/^pay_[A-Za-z0-9]+$/.test(payment.id||'')||payment.account_id!==companyId||typeof payment.client_secret!=='string'||!payment.client_secret.startsWith(payment.id+'_secret_'))throw new AppError('Whop returned an invalid payment',502);
   const changed=await rpc('ce_checkout_transition',{rid:r.id,expected:'READY',next_state:'PROCESSING',payment_id:payment.id,failure:null});if(!changed)throw new AppError('Checkout changed during payment confirmation. Check its status.',409);return respond({clientSecret:payment.client_secret,status:payment.status||'open'});
  }
  if(body.action==='license'){
   const row=await rpc('ce_workspace_read');if(!row)throw new AppError('Workspace unavailable',503);
   if(!user?.admin)throw new AppError('Administrator sign-in required',403);
   const account=row.data.accounts.find((a:any)=>a.id===body.accountId);if(!account?.licensePath)throw new AppError('License not found',404);
   const {data,error}=await db.storage.from('business-licenses').createSignedUrl(account.licensePath,60,{download:true});if(error)throw new AppError('License unavailable',404);return respond({url:data.signedUrl});
  }
  if(body.action==='email-test'){
   if(!user?.admin)throw new AppError('Administrator sign-in required',403);
   if(Object.keys(body).some(k=>!['action','requestId'].includes(k))||!/^[0-9a-f-]{36}$/i.test(body.requestId||''))throw new AppError('Invalid test request');
   const key=Deno.env.get('RESEND_API_KEY');if(!key)throw new AppError('Order email sending is not configured',503);
   if(!await rpc('ce_rate_limit',{subject_key:'email-test-'+user.id,max_hits:1}))throw new AppError('Wait before sending another test',429);
   const mail=orderEmail({id:'test',invoiceNumber:'TEST — No order created',shopEmail:user.email,shopName:'Converter Express test',paymentStatus:'UNPAID',lines:[{partId:'TEST',name:'Email connection test only',quantity:1,priceCents:0}],subtotalCents:0,totalCents:0},'confirmation');
   mail.subject='[TEST] Converter Express order email';mail.html=mail.html.replace('We received your order','Email connection test').replace('Thank you for ordering with Converter Express. Check your account for the latest order and delivery status.','This is an authorized test. No order was created and no payment is due.').replaceAll('https://www.converterexpress.net/#/orders/test','https://www.converterexpress.net/');mail.text='TEST ONLY — no order created, no payment due. Converter Express order email connection test.';
   const sent=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json','Idempotency-Key':'ce-test-'+body.requestId},body:JSON.stringify(mail),signal:AbortSignal.timeout(12000)});
   const result=await sent.json();if(!sent.ok||!result.id)throw new AppError('Test email could not be accepted by the provider',502);
   return respond({status:'accepted',providerId:result.id});
  }
  if(body.action==='order-email'){
   if(Object.keys(body).some(k=>!['action','orderId','kind','operation'].includes(k))||!['confirmation','invoice'].includes(body.kind)||!['preview','send','status'].includes(body.operation))throw new AppError('Invalid email request');
   const row=await rpc('ce_workspace_read');const order=row?.data.orders.find((o:any)=>o.id===body.orderId);
   if(!order||!user?.admin&&(!row.data.accounts.some((a:any)=>a.id===user?.id&&a.status==='APPROVED')||order.shopEmail.toLowerCase()!==user?.email?.toLowerCase()))throw new AppError('Order not found',404);
   if(body.operation==='send'&&!user?.admin)throw new AppError('Administrator sign-in required',403);
   if(body.operation==='preview'){const queued=await rpc('ce_email_read',{oid:order.id,mail_kind:body.kind});const mail=queued?.payload||orderEmail(queued?.snapshot||order,body.kind);return respond({subject:mail.subject,html:mail.html,to:mail.to[0]});}
   if(body.operation==='send'){if(order.cancelled)throw new AppError('Cancelled orders cannot be emailed');return respond({email:await sendMail(order.id,body.kind)});}
   return respond({emails:await rpc('ce_email_list',{oid:order.id}),configured:!!Deno.env.get('RESEND_API_KEY')});
  }
  if(body.action==='quote-email'){
   if(!user?.admin)throw new AppError('Administrator sign-in required',403);
   if(Object.keys(body).some(k=>!['action','quoteId','operation'].includes(k))||!['preview','send','status'].includes(body.operation)||typeof body.quoteId!=='string')throw new AppError('Invalid quote email request');
   const prepared=await rpc('ce_quote_email_prepare',{qid:body.quoteId});if(!prepared)throw new AppError('Quote not found',404);
   if(body.operation==='preview'){const mail=prepared.payload||quoteEmail(prepared.snapshot.quote,prepared.snapshot.account);return respond({subject:mail.subject,html:mail.html,to:mail.to[0]});}
   if(body.operation==='status')return respond({email:{status:prepared.status,issue:prepared.issue,updatedAt:prepared.updated_at,providerId:prepared.provider_id},configured:!!Deno.env.get('RESEND_API_KEY')});
   return respond({email:await sendQuoteEmail({rpc,apiKey:Deno.env.get('RESEND_API_KEY'),quoteId:body.quoteId})});
  }
  if(body.action==='payment-checkout'){
   if(Object.keys(body).some(k=>!['action','orderId'].includes(k)))throw new AppError('Invalid payment request');
   const key=Deno.env.get('WHOP_COMPANY_API_KEY'),companyId=Deno.env.get('WHOP_COMPANY_ID');if(Deno.env.get('WHOP_PAYMENTS_ENABLED')!=='true'||!key||!companyId||!Deno.env.get('WHOP_WEBHOOK_SECRET'))throw new AppError('Online payments are not available yet. Please contact us.',503);
   if(!user)throw new AppError('Sign in to pay your invoice',401);
   const row=await rpc('ce_workspace_read'),o=row?.data.orders.find((o:any)=>o.id===body.orderId);
   if(!o||!user.admin&&(!row.data.accounts.some((a:any)=>a.id===user.id&&a.status==='APPROVED')||o.shopEmail.toLowerCase()!==user.email.toLowerCase()))throw new AppError('Invoice not found',404);
   const {paid,balance}=invoiceBalance(o);if(o.paymentReview)throw new AppError('Please contact us to reconcile this invoice',409);
   if(o.paymentCheckout?.status==='ready'&&o.paymentCheckout.amountCents===balance&&o.paymentCheckout.beforePaidCents===paid)return respond({url:safeCheckoutUrl(o.paymentCheckout.url)});
   if(o.paymentCheckout)throw new AppError('A checkout is already recorded for this invoice. Please contact us before starting another.',409);
   const reference=crypto.randomUUID();o.paymentCheckout={reference,amountCents:balance,beforePaidCents:paid,status:'creating',createdAt:new Date().toISOString(),actorId:user.id};
   await rpc('ce_workspace_commit',{expected:row.revision,body:row.data,actor:user.id,event:'payment-checkout-reserve'});
   const checkout=await whopRequest('checkout_configurations',key,checkoutPayload(o,companyId,reference));if(!/^ch_[A-Za-z0-9]+$/.test(checkout.id||'')||checkout.account_id!==companyId)throw new AppError('Whop returned an invalid checkout',502);const checkoutUrl=safeCheckoutUrl(checkout.purchase_url);
   for(let attempt=0;attempt<4;attempt++){const saved=await rpc('ce_workspace_read'),current=saved.data.orders.find((x:any)=>x.id===o.id);if(current?.paymentCheckout?.reference!==reference)throw new AppError('Invoice changed during payment setup',409);current.paymentCheckout={...current.paymentCheckout,id:checkout.id,url:checkoutUrl,status:'ready'};try{await rpc('ce_workspace_commit',{expected:saved.revision,body:saved.data,actor:user.id,event:'payment-checkout-ready'});return respond({url:checkoutUrl});}catch(e){if(!(e instanceof AppError)||e.status!==409||attempt===3)throw e;}}
   throw new AppError('Payment setup could not be saved. Please contact us.',503);
  }
  if(body.action==='payment-session'){
   if(Object.keys(body).some(k=>!['action','orderId'].includes(k)))throw new AppError('Invalid payment request');
   const key=Deno.env.get('WHOP_COMPANY_API_KEY'),companyId=Deno.env.get('WHOP_COMPANY_ID');if(Deno.env.get('WHOP_PAYMENTS_ENABLED')!=='true'||!key||!companyId||!Deno.env.get('WHOP_WEBHOOK_SECRET'))throw new AppError('Online payments are not available yet. Please contact us.',503);
   const row=await rpc('ce_workspace_read'),o=row?.data.orders.find((x:any)=>x.id===body.orderId),account=row?.data.accounts.find((a:any)=>a.id===user!.id);
   if(!o||!user||!user.admin&&(!account||account.status!=='APPROVED'||o.shopEmail.toLowerCase()!==user.email.toLowerCase()))throw new AppError('Invoice not found',404);
   const {paid,balance}=invoiceBalance(o);if(o.paymentReview)throw new AppError('Please contact us to reconcile this invoice',409);
   const billingDetails={email:user.email,name:account?.contactName||account?.shopName||'',phone:account?.phone||'',address:{line1:account?.addressLine1||'',line2:account?.addressLine2||'',city:account?.city||'',state:account?.state||'',postal_code:account?.postalCode||'',country:'US'}};
   if(o.paymentCheckout?.mode==='element'&&o.paymentCheckout.amountCents===balance&&o.paymentCheckout.beforePaidCents===paid){if(o.paymentCheckout.status==='ready')return respond({...paymentElementConfig(o,companyId),reference:o.paymentCheckout.reference,billingDetails});return respond({status:'processing'});}
   if(o.paymentCheckout)throw new AppError('A payment is already recorded for this invoice. Please contact us before starting another.',409);
   const reference=crypto.randomUUID();o.paymentCheckout={reference,amountCents:balance,beforePaidCents:paid,mode:'element',status:'ready',createdAt:new Date().toISOString(),actorId:user.id};
   await rpc('ce_workspace_commit',{expected:row.revision,body:row.data,actor:user.id,event:'payment-element-reserve'});
   return respond({...paymentElementConfig(o,companyId),reference,billingDetails});
  }
  if(body.action==='payment-confirm'){
   if(Object.keys(body).some(k=>!['action','orderId','reference','confirmationToken'].includes(k))||!/^ctok_[A-Za-z0-9]+$/.test(body.confirmationToken||'')||typeof body.reference!=='string')throw new AppError('Invalid payment confirmation');
   const key=Deno.env.get('WHOP_COMPANY_API_KEY'),companyId=Deno.env.get('WHOP_COMPANY_ID');if(Deno.env.get('WHOP_PAYMENTS_ENABLED')!=='true'||!key||!companyId||!Deno.env.get('WHOP_WEBHOOK_SECRET'))throw new AppError('Online payments are not available yet. Please contact us.',503);
   const row=await rpc('ce_workspace_read'),o=row?.data.orders.find((x:any)=>x.id===body.orderId),account=row?.data.accounts.find((a:any)=>a.id===user!.id),checkout=o?.paymentCheckout;
   if(!o||!user||!user.admin&&(!account||account.status!=='APPROVED'||o.shopEmail.toLowerCase()!==user.email.toLowerCase()))throw new AppError('Invoice not found',404);
   const {paid,balance}=invoiceBalance(o);if(o.paymentReview||checkout?.mode!=='element'||checkout.status!=='ready'||checkout.reference!==body.reference||checkout.actorId!==user.id||checkout.amountCents!==balance||checkout.beforePaidCents!==paid)throw new AppError('This payment session is no longer valid. Reload the invoice.',409);
   const payment=await whopPaymentRequest('payments',key,elementPaymentPayload(o,companyId,checkout.reference,body.confirmationToken,user.email));
   if(!/^pay_[A-Za-z0-9]+$/.test(payment.id||'')||payment.account_id!==companyId||typeof payment.client_secret!=='string'||payment.client_secret.length>500||!payment.client_secret.startsWith(payment.id+'_secret_'))throw new AppError('Whop returned an invalid payment',502);
   for(let attempt=0;attempt<4;attempt++){const saved=await rpc('ce_workspace_read'),current=saved.data.orders.find((x:any)=>x.id===o.id);if(current?.paymentCheckout?.reference!==checkout.reference||current.paymentCheckout.status!=='ready')throw new AppError('Invoice changed during payment confirmation',409);current.paymentCheckout={...current.paymentCheckout,id:payment.id,status:'processing',confirmedAt:new Date().toISOString()};try{await rpc('ce_workspace_commit',{expected:saved.revision,body:saved.data,actor:user.id,event:'payment-element-confirm'});return respond({clientSecret:payment.client_secret,status:payment.status||'open'});}catch(e){if(!(e instanceof AppError)||e.status!==409||attempt===3)throw e;}}
   throw new AppError('Payment confirmation could not be saved. Please contact us.',503);
  }
  if(body.action==='admin-save'){
   if(!user?.admin)throw new AppError('Administrator sign-in required',403);
   validate(body.data);
   const row=await rpc('ce_workspace_read');if(!row||row.revision!==body.revision)throw new AppError('Another change was saved. Reload and try again.',409);
   validateAdminRemovals(row.data,body.data);
   // Business edits never reassign ownership or delete an authenticated shop.
   if(row.data.accounts.some((a:any)=>!body.data.accounts.some((b:any)=>b.id===a.id&&b.email===a.email))||body.data.accounts.some((a:any)=>!row.data.accounts.some((b:any)=>b.id===a.id)))throw new AppError('Account identity cannot be edited through a workspace save');
   const revision=await rpc('ce_workspace_commit',{expected:body.revision,body:body.data,actor:user.id,event:'admin-save'});const added=body.data.orders.filter((o:any)=>!o.cancelled&&!row.data.orders.some((old:any)=>old.id===o.id));const emails=await Promise.all(added.slice(0,3).map(async(o:any)=>({orderId:o.id,...await sendMail(o.id,'confirmation')})));return respond({revision,emails});
  }
  // Retry only after re-reading and re-running rules. Atomic compare-and-swap prevents overselling.
  for(let attempt=0;attempt<4;attempt++){
   const row=await rpc('ce_workspace_read');if(!row)throw new AppError('Workspace unavailable',503);
   if(body.action==='application'){
    if(!body.licensePath?.startsWith(user!.id+'/'))throw new AppError('Invalid license');
    const {data,error}=await db.storage.from('business-licenses').download(body.licensePath);if(error||!data||data.size>2097152)throw new AppError('Upload your business license first');
    const magic=new Uint8Array(await data.slice(0,16).arrayBuffer());const signature=new TextDecoder().decode(magic);
    const valid=magic[0]===255&&magic[1]===216&&magic[2]===255||magic[0]===137&&signature.slice(1,4)==='PNG'||signature.startsWith('%PDF-')||signature.startsWith('RIFF')&&signature.slice(8,12)==='WEBP';if(!valid)throw new AppError('License file format is not supported');
   }
   const next=command(row.data,user,body);
   try{const revision=await rpc('ce_workspace_commit',{expected:row.revision,body:next.data,actor:user!.id,event:body.action});const email=body.action==='order'?await sendMail(next.result.id,'confirmation'):null;return respond({...project(next.data,user),revision,result:next.result,email});}catch(e){if(!(e instanceof AppError)||e.status!==409||attempt===3)throw e;}
  }
  throw new AppError('Unable to save after concurrent changes. Please retry.',409);
 }catch(e){if(e instanceof AppError)return respond({error:e.message},e.status);console.error('crm-api request failed');return respond({error:'Unable to complete the request. Please retry.'},500);}
});
