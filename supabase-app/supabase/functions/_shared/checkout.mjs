import {command,AppError} from './business.mjs';

const ordered=x=>Array.isArray(x)?x.map(ordered):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,ordered(x[k])])):x;
const canonical=x=>JSON.stringify(ordered(x));
export async function checkoutRequestHash(input){const bytes=new TextEncoder().encode(canonical(input));const hash=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join('');}
const active=(r,now)=>r.status==='AWAITING_OFFLINE_PAYMENT'||['CREATING','READY','PROCESSING'].includes(r.status)&&new Date(r.expiresAt||r.expires_at)>now;
export function reservationAvailability(data,reservations,partNumber,now=new Date()){
 const stock=data.crm?.inventory?.[partNumber]?.onHand;if(!Number.isSafeInteger(stock))return null;
 const ordered=data.orders.filter(o=>!o.cancelled&&!o.inventoryIssued&&!['SHIPPED','DELIVERED'].includes(o.fulfillmentStage)).flatMap(o=>o.lines).filter(l=>l.partId===partNumber).reduce((n,l)=>n+l.quantity,0);
 const held=reservations.filter(r=>active(r,now)).flatMap(r=>r.quote?.lines||[]).filter(l=>l.partId===partNumber).reduce((n,l)=>n+l.quantity,0);
 return stock-ordered-held;
}
export async function buildCheckoutReservation(data,user,args,reservations=[],now=new Date()){
 const paymentMethod=args.paymentMethod||'WHOP';if(!['WHOP','CASH','CHECK'].includes(paymentMethod))throw new AppError('Invalid payment method');
 const orderArgs={...args};delete orderArgs.paymentMethod;const shadow=structuredClone(data);for(const r of reservations.filter(r=>active(r,now)))shadow.orders.push({id:'reservation-'+r.id,shopEmail:'reserved@example.invalid',cancelled:false,inventoryIssued:false,fulfillmentStage:'AWAITING_PARTS',lines:r.quote.lines});
 const next=command(shadow,user,{...orderArgs,action:'order'}),draft=next.result;
 return {id:args.idempotencyKey,userId:user.id,shopEmail:user.email,paymentMethod,requestNumber:'PAY-'+args.idempotencyKey.replaceAll('-','').slice(0,12).toUpperCase(),status:paymentMethod==='WHOP'?'READY':'AWAITING_OFFLINE_PAYMENT',requestHash:await checkoutRequestHash(args),paymentReference:crypto.randomUUID(),amountCents:draft.totalCents,expiresAt:paymentMethod==='WHOP'?new Date(now.getTime()+15*60*1000).toISOString():null,quote:{...draft,id:null,invoiceNumber:null,paymentStatus:null,createdAt:now.toISOString()}};
}
export function buildPaidOrder(reservation,payment,orderId=crypto.randomUUID()){
 if(payment.status!=='paid'||payment.currency!=='usd'||payment.amountCents!==reservation.amountCents)throw new AppError('Payment mismatch',409);
 const q=structuredClone(reservation.quote),now=new Date().toISOString();return {...q,id:orderId,invoiceNumber:'INV-'+orderId.replaceAll('-','').slice(0,12).toUpperCase(),paymentStatus:'PAID',amountPaidCents:reservation.amountCents,paymentMethod:'Whop',paymentReference:payment.id,invoiceClosedAt:now,createdAt:now,idempotencyKey:reservation.id,requestFingerprint:reservation.requestHash,paymentHistory:[{id:payment.id,at:now,amountPaidCents:reservation.amountCents,method:'Whop',reference:payment.id}]};
}

export function buildOfflinePaidOrder(reservation,collection,orderId=crypto.randomUUID()){
 const method=String(collection?.method||'').toUpperCase();if(!['CASH','CHECK'].includes(method)||method!==reservation.paymentMethod)throw new AppError('Payment method does not match the delivery request',409);if(collection.amountCents!==reservation.amountCents)throw new AppError('Full payment must be collected before confirmation',409);if(!collection.actorId||!collection.collectedAt)throw new AppError('Payment collection audit details are required',409);const reference=String(collection.reference||'').trim().slice(0,120),actorEmail=String(collection.actorEmail||'').trim().slice(0,254),q=structuredClone(reservation.quote),now=collection.collectedAt,paymentId='offline-'+reservation.id;return {...q,id:orderId,invoiceNumber:'INV-'+orderId.replaceAll('-','').slice(0,12).toUpperCase(),paymentStatus:'PAID',amountPaidCents:reservation.amountCents,paymentMethod:method==='CASH'?'Cash':'Check',paymentReference:reference,paymentCollectedAt:now,paymentCollectedBy:collection.actorId,paymentCollectedByEmail:actorEmail,invoiceClosedAt:now,createdAt:now,idempotencyKey:reservation.id,requestFingerprint:reservation.requestHash,paymentHistory:[{id:paymentId,at:now,amountPaidCents:reservation.amountCents,method:method==='CASH'?'Cash':'Check',reference,actorId:collection.actorId,actorEmail}]};
}
