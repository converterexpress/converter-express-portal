"""Validate local workspace snapshots before replacing the last good copy.
This is data-integrity validation, not authentication or production authorization.
"""
import math,re

def validate_workspace(payload):
 def require(ok):
  if not ok:raise ValueError('Invalid workspace data')
 def integer(v,minimum=0):return type(v) is int and minimum<=v<=9007199254740991
 def text(v):return isinstance(v,str)
 def records(v):return isinstance(v,list) and all(isinstance(x,dict) for x in v)
 def unique(items,key):
  values=[str(x.get(key,'')).strip().lower() for x in items]
  require(all(values) and len(values)==len(set(values)))
 def finite_tree(value):
  if isinstance(value,float):require(math.isfinite(value))
  elif isinstance(value,dict):
   for v in value.values():finite_tree(v)
  elif isinstance(value,list):
   for v in value:finite_tree(v)
 require(isinstance(payload,dict));finite_tree(payload)
 required={'accounts','orders','storeSettings','discountCodes','products'}
 require(required.issubset(payload) and not set(payload)-required-{'crm'})
 for key in ('accounts','orders','discountCodes','products'):require(records(payload[key]))
 settings=payload['storeSettings'];require(isinstance(settings,dict))
 for key in ('shippingFlatCents','actualShippingCostCents'):require(integer(settings.get(key,0)))
 for key in ('taxRatePercent','coreForfeitureRatePercent'):
  value=settings.get(key,0);require(type(value) in (int,float) and 0<=value<=100)
 require(isinstance(settings.get('customSeries',[]),list) and all(text(x) and x.strip() for x in settings.get('customSeries',[])))
 unique(payload['accounts'],'id');unique(payload['accounts'],'email');unique(payload['products'],'partNumber');unique(payload['orders'],'id');unique(payload['discountCodes'],'code')
 for a in payload['accounts']:
  require(all(text(a.get(k)) for k in ('id','email','shopName','contactName','addressLine1','city','state','postalCode')))
  require(a.get('role')=='CUSTOMER' and a.get('status') in ('PENDING','APPROVED','REJECTED'))
  require(isinstance(a.get('priceOverrides',{}),dict))
  for value in a.get('priceOverrides',{}).values():require(integer(value,1))
 for p in payload['products']:
  require(bool(re.fullmatch(r'[A-Za-z0-9_-]{1,40}',p['partNumber'])))
  require(all(text(p.get(k)) for k in ('name','category','description')))
  require(integer(p.get('priceCents')) and isinstance(p.get('pricePending'),bool) and isinstance(p.get('inStock'),bool))
  require(p.get('costCents') is None or integer(p['costCents']))
 for o in payload['orders']:
  require(all(text(o.get(k)) for k in ('id','invoiceNumber','shopEmail','shopName','createdAt')))
  require(records(o.get('lines')) and len(o['lines'])>0 and isinstance(o.get('fulfillment'),dict))
  require(o['fulfillment'].get('method') in ('SHIP','PICKUP'))
  if o['fulfillment']['method']=='SHIP':require(isinstance(o['fulfillment'].get('address'),dict))
  require(o.get('paymentStatus') in ('PAID','PARTIAL','UNPAID','OVERDUE'))
  require(o.get('fulfillmentStage') in ('AWAITING_PARTS','PACKAGING','SHIPPED','INVOICED','DELIVERED'))
  for key in ('totalCents','subtotalCents','discountCents','shippingCents','taxCents','cardFeeCents','merchantFeeCents'):require(integer(o.get(key)))
  if o.get('amountPaidCents') is not None:require(integer(o['amountPaidCents']) and o['amountPaidCents']<=o['totalCents'])
  for line in o['lines']:
   require(text(line.get('partId')) and text(line.get('name')) and integer(line.get('quantity'),1) and integer(line.get('priceCents')))
   require(line.get('costCents') is None or integer(line['costCents']))
  require(sum(l['priceCents']*l['quantity'] for l in o['lines'])==o['subtotalCents'])
  require(o['discountCents']<=o['subtotalCents'])
  require(o['totalCents']==o['subtotalCents']-o['discountCents']+o['shippingCents']+o['taxCents']+o['cardFeeCents'])
 for d in payload['discountCodes']:
  require(d.get('type') in ('PERCENT','AMOUNT') and type(d.get('value')) in (int,float) and d['value']>0 and isinstance(d.get('active'),bool))
  require(d['type']!='PERCENT' or d['value']<=100)
 if 'crm' not in payload:return
 crm=payload['crm'];require(isinstance(crm,dict) and set(crm)=={'quotes','tasks','purchases','inventory','activities'})
 for key in ('quotes','tasks','purchases','activities'):require(records(crm[key]));unique(crm[key],'id')
 require(isinstance(crm['inventory'],dict))
 for item in crm['inventory'].values():require(isinstance(item,dict) and integer(item.get('onHand')) and integer(item.get('minimum')))
 for q in crm['quotes']:
  require(text(q.get('accountId')) and records(q.get('lines')) and bool(q['lines']))
  for line in q['lines']:require(text(line.get('partNumber')) and integer(line.get('quantity'),1) and integer(line.get('priceCents'),1))
 for po in crm['purchases']:
  require(po.get('status') in ('Open','Received','Cancelled') and records(po.get('lines')) and bool(po['lines']))
  for line in po['lines']:require(text(line.get('partNumber')) and integer(line.get('quantity'),1) and integer(line.get('received',0)) and line.get('received',0)<=line['quantity'])
 for task in crm['tasks']:require(all(text(task.get(k)) for k in ('title','owner','due')) and isinstance(task.get('done'),bool))
