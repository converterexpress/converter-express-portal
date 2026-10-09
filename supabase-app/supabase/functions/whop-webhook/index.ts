import {createClient} from 'npm:@supabase/supabase-js@2.117.2';
import {verifyWhopWebhook,whopRequest,applyWhopPayment} from '../_shared/whop.mjs';
import {AppError,validate} from '../_shared/business.mjs';
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
Deno.serve(async(req)=>{const reply=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});if(req.method!=='POST')return reply(405,{error:'Use POST'});
 try{const event=await verifyWhopWebhook(await req.text(),req.headers,Deno.env.get('WHOP_WEBHOOK_SECRET'));if(event.type!=='payment.succeeded')return reply(200,{received:true});if(!/^pay_[A-Za-z0-9]+$/.test(event.data?.id||''))return reply(400,{error:'Invalid payment event'});
  const payment=await whopRequest('payments/'+event.data.id,Deno.env.get('WHOP_COMPANY_API_KEY'));if(typeof payment.metadata?.ce_order_id!=='string')return reply(200,{received:true});
  for(let attempt=0;attempt<5;attempt++){const {data:row,error}=await db.rpc('ce_workspace_read');if(error||!row)throw Error('Workspace unavailable');const next=applyWhopPayment(row.data,payment,Deno.env.get('WHOP_COMPANY_ID'));if(next.duplicate)return reply(200,{received:true});validate(next.data);const order=next.data.orders.find((o:any)=>o.id===payment.metadata.ce_order_id);const committed=await db.rpc('ce_workspace_commit',{expected:row.revision,body:next.data,actor:order.paymentCheckout.actorId,event:next.review?'whop-payment-review':'whop-payment-paid'});if(!committed.error)return reply(200,{received:true});if(committed.error.code!=='40001')throw Error('Payment could not be saved');}
  return reply(409,{error:'Retry payment notification'});
 }catch(e){if(e instanceof AppError)return reply(e.status,{error:e.message});return reply(500,{error:'Payment notification could not be saved'});}
});
