import {command,AppError} from './business.mjs';

const ordered=x=>Array.isArray(x)?x.map(ordered):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,ordered(x[k])])):x;
const canonical=x=>JSON.stringify(ordered(x));
export async function checkoutRequestHash(input){const bytes=new TextEncoder().encode(canonical(input));const hash=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join('');}
const active=(r,now)=>['CREATING','READY','PROCESSING'].includes(r.status)&&new Date(r.expiresAt)>now;
export function reservationAvailability(data,reservations,partNumber,now=new Date()){
 const stock=data.crm?.inventory?.[partNumber]?.onHand;if(!Number.isSafeInteger(stock))return null;
 const ordered=data.orders.filter(o=>!o.cancelled&&!o.inventoryIssued&&!['SHIPPED','DELIVERED'].includes(o.fulfillmentStage)).flatMap(o=>o.lines).filter(l=>l.partId===partNumber).reduce((n,l)=>n+l.quantity,0);
 const held=reservations.filter(r=>active(r,now)).flatMap(r=>r.quote?.lines||[]).filter(l=>l.partId===partNumber).reduce((n,l)=>n+l.quantity,0);
 return stock-ordered-held;
}
export async function buildCheckoutReservation(data,user,args,reservations=[],now=new Date()){
 const shadow=structuredClone(data);for(const r of reservations.filter(r=>active(r,now)))shadow.orders.push({id:'reservation-'+r.id,shopEmail:'reserved@example.invalid',cancelled:false,inventoryIssued:false,fulfillmentStage:'AWAITING_PARTS',lines:r.quote.lines});
 const next=command(shadow,user,{...args,action:'order'}),draft=next.result;
 return {id:args.idempotencyKey,userId:user.id,shopEmail:user.email,status:'READY',requestHash:await checkoutRequestHash(args),paymentReference:crypto.randomUUID(),amountCents:draft.totalCents,expiresAt:new Date(now.getTime()+15*60*1000).toISOString(),quote:{...draft,id:null,invoiceNumber:null,paymentStatus:null,createdAt:now.toISOString()}};
}
export function buildPaidOrder(reservation,payment,orderId=crypto.randomUUID()){
 if(payment.status!=='paid'||payment.currency!=='usd'||payment.amountCents!==reservation.amountCents)throw new AppError('Payment mismatch',409);
 const q=structuredClone(reservation.quote),now=new Date().toISOString();return {...q,id:orderId,invoiceNumber:'INV-'+orderId.replaceAll('-','').slice(0,12).toUpperCase(),paymentStatus:'PAID',amountPaidCents:reservation.amountCents,paymentMethod:'Whop',paymentReference:payment.id,invoiceClosedAt:now,createdAt:now,idempotencyKey:reservation.id,requestFingerprint:reservation.requestHash,paymentHistory:[{id:payment.id,at:now,amountPaidCents:reservation.amountCents,method:'Whop',reference:payment.id}]};
}
