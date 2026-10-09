// Pure business rules. Authentication and revision-checked persistence live in the edge handler.
export class AppError extends Error { constructor(message,status=400){super(message);this.status=status;} }
const fail=(message,status=400)=>{throw new AppError(message,status);};
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const int=(x,min=0)=>Number.isSafeInteger(x)&&x>=min;
const pick=(x,keys)=>Object.fromEntries(keys.filter(k=>Object.hasOwn(x||{},k)).map(k=>[k,x[k]]));
const exact=(x,keys)=>{if(!obj(x)||Object.keys(x).some(k=>!keys.includes(k)))fail('Unexpected fields');};
const str=(v,max=2000,required=false)=>{if(typeof v!=='string'||v.length>max||required&&!v.trim())fail('Invalid text');return v.trim();};
const copy=x=>structuredClone(x);
const emptyCrm=()=>({quotes:[],tasks:[],purchases:[],inventory:{},activities:[]});
const profileKeys=['shopName','contactName','phone','addressLine1','addressLine2','city','state','postalCode','deliveryInstructions'];
const publicSettings=['phone','email','pickupAddress','pickupAvailable','pickupHours','serviceArea','shippingFlatCents','taxRatePercent','customSeries'];
const accountKeys=['id','email','role','status',...profileKeys,'savedParts','paymentTermsDays'];
const orderKeys=['id','invoiceNumber','shopEmail','shopName','subtotalCents','shippingCents','discountCents','discountCodeLabel','taxCents','cardFeeCents','totalCents','job','poNumber','fulfillment','status','fulfillmentStage','paymentStatus','amountPaidCents','dueDate','cancelled','createdAt','emailSent','deliveryDate','deliveryWindow','deliveryNote'];
const sameEmail=(a,b)=>String(a).trim().toLowerCase()===String(b).trim().toLowerCase();
export function principal(authUser,staffIds,claims){return authUser?{id:authUser.id,email:authUser.email,admin:staffIds.includes(authUser.id),aal:claims?.aal||'aal1'}:null;}
function assertAdmin(user){if(!user?.admin)fail('Administrator access required',403);}
function account(data,user,approved=true){if(!user)fail('Sign in to continue',401);const a=data.accounts.find(a=>a.id===user.id&&sameEmail(a.email,user.email));if(!a)fail('Complete your shop application',403);if(approved&&a.status!=='APPROVED')fail('An approved shop account is required',403);return a;}
function available(data,num){const count=data.crm?.inventory?.[num]?.onHand;if(!int(count))return null;return count-data.orders.filter(o=>!o.cancelled&&!o.inventoryIssued&&!['SHIPPED','DELIVERED'].includes(o.fulfillmentStage)).reduce((n,o)=>n+o.lines.filter(l=>l.partId===num).reduce((s,l)=>s+l.quantity,0),0);}
function customerOrder(o){const result=pick(o,orderKeys);result.lines=(o.lines||[]).map(l=>pick(l,['partId','name','quantity','priceCents']));result.deliveryHistory=(o.deliveryHistory||[]).map(h=>pick(h,['stage','date','window','note','at']));result.serviceRequests=(o.serviceRequests||[]).map(r=>pick(r,['id','type','partNumber','message','photos','status','createdAt','updatedAt','response']));return result;}
export function project(data,user){
 if(user?.admin){assertAdmin(user);return {user:{id:user.id,email:user.email,role:'ADMIN',status:'APPROVED',shopName:'Converter Express'},data:copy(data)};}
 const a=user&&data.accounts.find(a=>a.id===user.id&&sameEmail(a.email,user.email));const approved=a?.status==='APPROVED';
 const products=data.products.map(p=>{const price=approved?(a.priceOverrides?.[p.partNumber]??p.priceCents):0;return {...pick(p,['partNumber','name','category','description']),priceCents:price,pricePending:!approved||(a.priceOverrides?.[p.partNumber]==null&&p.pricePending),costCents:null,inStock:approved&&available(data,p.partNumber)>0,stockKnown:approved&&available(data,p.partNumber)!==null,available:approved?available(data,p.partNumber):null};});
 return {user:a?pick(a,accountKeys):user?{id:user.id,email:user.email,role:'CUSTOMER',status:'APPLICATION_REQUIRED'}:null,data:{accounts:a?[pick(a,accountKeys)]:[],orders:approved?data.orders.filter(o=>sameEmail(o.shopEmail,a.email)).map(customerOrder):[],products,storeSettings:pick(data.storeSettings,publicSettings),discountCodes:[],crm:emptyCrm()}};
}
export function validate(data){
 if(new TextEncoder().encode(JSON.stringify(data)).byteLength>9000000)fail('Workspace attachment capacity reached. Contact the administrator.',413);
 exact(data,['accounts','orders','products','storeSettings','discountCodes','crm']);
 for(const k of ['accounts','orders','products','discountCodes'])if(!Array.isArray(data[k])||data[k].some(x=>!obj(x)))fail('Invalid workspace data');
 for(const [items,key]of [[data.accounts,'id'],[data.accounts,'email'],[data.orders,'id'],[data.products,'partNumber'],[data.discountCodes,'code']]){const values=items.map(x=>str(x[key],200,true).toLowerCase());if(new Set(values).size!==values.length)fail('Duplicate identifiers');}
 if(!obj(data.storeSettings))fail('Invalid settings');for(const k of ['shippingFlatCents','actualShippingCostCents'])if(!int(data.storeSettings[k]??0))fail('Invalid money');for(const k of ['taxRatePercent','coreForfeitureRatePercent'])if(!Number.isFinite(data.storeSettings[k]??0)||(data.storeSettings[k]??0)<0||(data.storeSettings[k]??0)>100)fail('Invalid rate');
 for(const a of data.accounts){if(a.role!=='CUSTOMER'||!['PENDING','APPROVED','REJECTED'].includes(a.status))fail('Invalid account role or status');for(const v of Object.values(a.priceOverrides||{}))if(!int(v,1))fail('Invalid negotiated price');}
 for(const p of data.products)if(!/^[A-Za-z0-9_-]{1,40}$/.test(p.partNumber)||!int(p.priceCents)||p.costCents!=null&&!int(p.costCents)||typeof p.pricePending!=='boolean'||typeof p.inStock!=='boolean')fail('Invalid product');
 for(const o of data.orders){if(!Array.isArray(o.lines)||!o.lines.length||o.lines.some(l=>!int(l.quantity,1)||!int(l.priceCents)||l.costCents!=null&&!int(l.costCents)))fail('Invalid order lines');for(const k of ['subtotalCents','shippingCents','discountCents','taxCents','cardFeeCents','merchantFeeCents','totalCents'])if(!int(o[k]))fail('Invalid order total');if(o.lines.reduce((n,l)=>n+l.quantity*l.priceCents,0)!==o.subtotalCents||o.discountCents>o.subtotalCents||o.totalCents!==o.subtotalCents-o.discountCents+o.shippingCents+o.taxCents+o.cardFeeCents)fail('Inconsistent order total');if(o.amountPaidCents!=null&&(!int(o.amountPaidCents)||o.amountPaidCents>o.totalCents))fail('Invalid payment');if(!['PAID','UNPAID','PARTIAL','OVERDUE'].includes(o.paymentStatus)||!['AWAITING_PARTS','PACKAGING','SHIPPED','INVOICED','DELIVERED'].includes(o.fulfillmentStage))fail('Invalid order status');}
 for(const d of data.discountCodes)if(!['PERCENT','AMOUNT'].includes(d.type)||!Number.isFinite(d.value)||d.value<=0||d.type==='PERCENT'&&d.value>100||typeof d.active!=='boolean')fail('Invalid discount');
 exact(data.crm,['quotes','tasks','purchases','inventory','activities']);for(const k of ['quotes','tasks','purchases','activities'])if(!Array.isArray(data.crm[k]))fail('Invalid CRM');if(!obj(data.crm.inventory))fail('Invalid inventory');for(const i of Object.values(data.crm.inventory))if(!int(i.onHand)||!int(i.minimum))fail('Invalid inventory');
 return data;
}
function job(value={}){exact(value,['reference','vehicle','vin']);const r={reference:str(value.reference||'',80),vehicle:str(value.vehicle||'',160),vin:str(value.vin||'',17).toUpperCase()};if(r.vin&&!/^[A-HJ-NPR-Z0-9]{17}$/.test(r.vin))fail('Invalid VIN');return r;}
function ownedOrder(data,a,id){const o=data.orders.find(o=>o.id===id&&sameEmail(o.shopEmail,a.email));if(!o)fail('Order not found',404);return o;}
function assertProductRemovable(data,num){
 if((data.crm?.inventory?.[num]?.onHand??0)>0)fail('This part has stock on hand. Reconcile its stock count before deleting.',409);
 const references=[['orders',data.orders],['quotes',data.crm?.quotes],['purchase orders',data.crm?.purchases]];
 for(const [label,records] of references)if((records||[]).some(r=>(r.lines||[]).some(l=>(l.partId||l.partNumber)===num)))fail('This part is linked to '+label+' and cannot be deleted. Its history must be preserved.',409);
}
export function validateProductRemovals(previous,next){
 const remaining=new Set(next.products.map(p=>p.partNumber));
 for(const p of previous.products)if(!remaining.has(p.partNumber)){assertProductRemovable(previous,p.partNumber);assertProductRemovable(next,p.partNumber);}
}
export function command(source,user,args){
 if(!user)fail('Sign in to continue',401);if(user.admin)assertAdmin(user);
 const data=copy(source);let result;
 if(args.action==='delete-product'){
  assertAdmin(user);exact(args,['action','partNumber']);const num=str(args.partNumber,40,true);
  const p=data.products.find(p=>p.partNumber===num);if(!p)fail('Part not found',404);assertProductRemovable(data,num);
  data.products=data.products.filter(p=>p.partNumber!==num);delete data.crm.inventory[num];
  for(const a of data.accounts){if(a.savedParts)a.savedParts=a.savedParts.filter(n=>n!==num);if(a.priceOverrides)delete a.priceOverrides[num];}
  data.crm.activities.push({id:crypto.randomUUID(),accountId:null,type:'Product',text:'Part '+num+' deleted',at:new Date().toISOString(),actorId:user.id});result={partNumber:num};
 }else if(args.action==='application'){
  exact(args,['action','fields','licensePath']);exact(args.fields,profileKeys);
  if(data.accounts.some(a=>a.id===user.id||sameEmail(a.email,user.email)))fail('Shop application already exists',409);
  if(!user.email)fail('A verified email is required',403);
  const fields=Object.fromEntries(Object.entries(args.fields).map(([k,v])=>[k,str(v,k==='deliveryInstructions'?2000:200)]));for(const k of ['shopName','contactName','phone','addressLine1','city','state','postalCode'])str(fields[k],200,true);
  if(typeof args.licensePath!=='string'||!args.licensePath.startsWith(user.id+'/')||args.licensePath.includes('..'))fail('Business license required');
  result={...fields,id:user.id,email:user.email.toLowerCase(),role:'CUSTOMER',status:'PENDING',savedParts:[],licensePath:args.licensePath,createdAt:new Date().toISOString()};data.accounts.push(result);
 }else{
  const a=account(data,user);
  if(args.action==='profile'){
   exact(args,['action','fields']);exact(args.fields,profileKeys);for(const[k,v]of Object.entries(args.fields))a[k]=str(v,k==='deliveryInstructions'?2000:200);result=pick(a,accountKeys);
  }else if(args.action==='saved-parts'){
   exact(args,['action','parts']);if(!Array.isArray(args.parts)||args.parts.length>500||args.parts.some(n=>!data.products.some(p=>p.partNumber===n)))fail('Invalid saved parts');a.savedParts=[...new Set(args.parts)];result=a.savedParts;
  }else if(args.action==='job'){
   exact(args,['action','orderId','job']);const o=ownedOrder(data,a,args.orderId);o.job=job(args.job);result=customerOrder(o);
  }else if(args.action==='request'){
   exact(args,['action','orderId','request']);const o=ownedOrder(data,a,args.orderId),r=args.request;exact(r,['type','partNumber','message','photos']);if(!['Return','Warranty'].includes(r.type)||!o.lines.some(l=>l.partId===r.partNumber))fail('Invalid request');if(!Array.isArray(r.photos)||r.photos.length>3||r.photos.some(p=>typeof p!=='string'||p.length>2800000||!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(p)))fail('Invalid request photos');result={id:'REQ-'+crypto.randomUUID(),type:r.type,partNumber:r.partNumber,message:str(r.message,4000,true),photos:r.photos,status:'Received',createdAt:new Date().toISOString()};o.serviceRequests=[...(o.serviceRequests||[]),result];
  }else if(args.action==='order'){
   exact(args,['action','idempotencyKey','items','fulfillment','job','poNumber','notes','discountCode']);
   if(!/^[0-9a-f-]{36}$/i.test(args.idempotencyKey||''))fail('Invalid order request identifier');
   // Stable field order makes a retry independent of the JSON key order sent by a client.
   const fingerprint=JSON.stringify([args.items,args.fulfillment,args.job||{},args.poNumber||'',args.notes||'',args.discountCode||'']);
   const existing=data.orders.find(o=>sameEmail(o.shopEmail,a.email)&&o.idempotencyKey===args.idempotencyKey);if(existing){if(existing.requestFingerprint!==fingerprint)fail('Order request identifier already used',409);return {data,result:customerOrder(existing)};}
   if(!Array.isArray(args.items)||!args.items.length||args.items.length>100)fail('Choose parts to order');
   const quantities=new Map();for(const item of args.items){exact(item,['partId','quantity']);if(!int(item.quantity,1)||item.quantity>999)fail('Invalid quantity');quantities.set(item.partId,(quantities.get(item.partId)||0)+item.quantity);}
   const lines=[...quantities].map(([partId,quantity])=>{const p=data.products.find(p=>p.partNumber===partId),override=a.priceOverrides?.[partId];if(!p||p.pricePending&&override==null)fail('Price unavailable');const priceCents=override??p.priceCents;if(!int(priceCents,1))fail('Price unavailable');const free=available(data,partId);if(free===null)fail('Stock has not been counted');if(quantity>999||quantity>free)fail('Requested quantity is not available',409);return {partId,name:p.name,quantity,priceCents,costCents:p.costCents??null};});
   exact(args.fulfillment,['method','address']);const fulfillment=copy(args.fulfillment);if(fulfillment.method==='SHIP'){exact(fulfillment.address,['line1','line2','city','state','postalCode']);for(const k of ['line1','city','state','postalCode'])fulfillment.address[k]=str(fulfillment.address[k],200,true);fulfillment.address.line2=str(fulfillment.address.line2||'',200);}else if(fulfillment.method!=='PICKUP'||!data.storeSettings.pickupAvailable)fail('Invalid delivery method');
   const subtotalCents=lines.reduce((n,l)=>n+l.priceCents*l.quantity,0),shippingCents=fulfillment.method==='SHIP'?data.storeSettings.shippingFlatCents:0;
   const eligible=!data.orders.some(o=>sameEmail(o.shopEmail,a.email)&&!o.cancelled);const requestedCode=sameEmail(args.discountCode||'','WELCOME100')?'WELCOME50':args.discountCode||'';let discount=data.discountCodes.find(d=>d.active&&sameEmail(d.code,requestedCode));if(args.discountCode&&!discount)fail('That promotion code is not available');if(discount?.code.toUpperCase()==='WELCOME50'&&!eligible)discount=null;
   const discountCents=discount?Math.min(subtotalCents,Math.round(discount.type==='PERCENT'?subtotalCents*discount.value/100:discount.value*100)):0;
   const taxCents=Math.round((subtotalCents-discountCents+shippingCents)*data.storeSettings.taxRatePercent/100),now=new Date(),id=crypto.randomUUID();
   const due=new Date(now);due.setUTCDate(due.getUTCDate()+(a.paymentTermsDays||0));
   result={id,invoiceNumber:'INV-'+id.replaceAll('-','').slice(0,12).toUpperCase(),shopEmail:a.email,shopName:a.shopName,lines,subtotalCents,shippingCents,discountCents,discountCodeLabel:discount?.code||'',taxCents,totalCents:subtotalCents-discountCents+shippingCents+taxCents,cardFeeCents:0,merchantFeeCents:0,actualShippingCostCents:fulfillment.method==='SHIP'?data.storeSettings.actualShippingCostCents||0:0,status:'OPEN',paymentStatus:'UNPAID',fulfillmentStage:'AWAITING_PARTS',channel:'ONLINE',cancelled:false,emailSent:false,fulfillment,job:job(args.job),poNumber:str(args.poNumber||'',100),notes:str(args.notes||'',4000),createdAt:now.toISOString(),dueDate:due.toISOString().slice(0,10),idempotencyKey:args.idempotencyKey,requestFingerprint:fingerprint};data.orders.push(result);
  }else fail('Unknown action',404);
 }
 validate(data);return {data,result:args.action==='order'?customerOrder(result):result};
}
