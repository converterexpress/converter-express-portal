import {AppError} from './business.mjs';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format((n||0)/100);

export function quoteEmail(quote,account){
 if(!quote||!Array.isArray(quote.lines)||!quote.lines.length||!account)throw new AppError('Invalid quote email');
 if(!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(account.email||''))throw new AppError('The saved shop has an invalid recipient email');
 const number=String(quote.number||'').replace(/[\r\n]/g,''),total=quote.lines.reduce((n,l)=>n+l.quantity*l.priceCents,0),href='https://www.converterexpress.net/#/contact';
 const rows=quote.lines.map(l=>`<tr><td style="border-bottom:1px solid #e5e7e1">${esc(l.partNumber)}</td><td align="right">${esc(l.quantity)}</td><td align="right">${money(l.quantity*l.priceCents)}</td></tr>`).join('');
 const content=`<p style="color:#b23815;font-size:11px;letter-spacing:1.5px;font-weight:bold">YOUR QUOTE</p><h1 style="font-size:28px">Parts quote ${esc(number)}</h1><p style="line-height:1.7;color:#535e67">Hello ${esc(account.contactName||account.shopName)},<br>Here is the quote prepared for ${esc(account.shopName)}.</p><p><strong>Valid through:</strong> ${esc(quote.expires)}</p><table width="100%" cellpadding="8" cellspacing="0" style="border-collapse:collapse;font-size:13px"><thead><tr style="background:#f1f2ee"><th align="left">Part</th><th align="right">Qty</th><th align="right">Amount</th></tr></thead><tbody>${rows}</tbody></table><p style="text-align:right;font-size:18px"><strong>Parts subtotal: ${money(total)}</strong></p>${quote.notes?`<p style="line-height:1.7"><strong>Notes</strong><br>${esc(quote.notes)}</p>`:''}<p style="font-size:12px;color:#69727b">Delivery, tax, and any applicable fees are calculated when an order is created. Reply or contact Converter Express to accept or decline this quote.</p><p><a href="${href}" style="display:inline-block;padding:15px 22px;background:#ce4018;color:#fff;font-weight:bold;border-radius:6px;text-decoration:none">Contact Converter Express →</a></p>`;
 const subject=`Quote ${number} · Converter Express`;
 const html=`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head><body style="margin:0;background:#efefeb;font-family:Arial,Helvetica,sans-serif;color:#1b2024"><table role="presentation" width="100%"><tr><td align="center" style="padding:28px 12px"><table role="presentation" width="100%" style="max-width:580px"><tr><td style="padding:28px;background:#171d21;color:white;border-bottom:4px solid #e24c23;font-size:21px;font-weight:bold">CONVERTER <span style="color:#ff8a60">EXPRESS</span></td></tr><tr><td style="padding:28px;background:white">${content}</td></tr></table></td></tr></table></body></html>`;
 const text=[`Quote ${number}`,`Shop: ${account.shopName}`,`Valid through: ${quote.expires}`,...quote.lines.map(l=>`${l.partNumber} | ${l.quantity} × ${money(l.priceCents)} | ${money(l.quantity*l.priceCents)}`),`Parts subtotal: ${money(total)}`,quote.notes?`Notes: ${quote.notes}`:'','Contact: '+href].filter(Boolean).join('\n');
 return {from:'Converter Express <accounts@converterexpress.co>',to:[account.email],subject,html,text};
}

export async function sendQuoteEmail({rpc,apiKey,quoteId,fetcher=fetch}){
 if(!apiKey)return {status:'not_configured',issue:'Quote email sending is not configured.'};
 const prepared=await rpc('ce_quote_email_prepare',{qid:quoteId});
 if(prepared.status==='accepted')return {status:'accepted',providerId:prepared.provider_id,issue:'Accepted by the email provider.'};
 const claim=crypto.randomUUID(),snapshot=prepared.snapshot||{},content=prepared.payload||quoteEmail(snapshot.quote,snapshot.account);
 const row=await rpc('ce_quote_email_claim',{qid:quoteId,content,claim_id:claim});
 if(!row)return {status:'pending_review',issue:'Another send is running, or an earlier attempt needs review before retrying.'};
 let status='unknown',provider=null,issue='Sending could not be confirmed. Check Resend before retrying.';
 try{const response=await fetcher('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json','Idempotency-Key':'ce-quote-'+quoteId},body:JSON.stringify(row.payload),signal:AbortSignal.timeout(12000)});const result=await response.json();if(response.ok&&typeof result.id==='string'){status='accepted';provider=result.id;issue='Accepted by the email provider.';}else if(response.status>=400&&response.status<500&&![408,409,429].includes(response.status)){status='failed';issue='Email provider rejected the request. Check sender verification and configuration, then retry.';}}catch{}
 await rpc('ce_quote_email_finish',{qid:quoteId,claim_id:claim,outcome:status,provider,problem:issue});
 return {status,providerId:provider,issue};
}
