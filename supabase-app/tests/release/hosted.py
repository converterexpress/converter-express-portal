"""Opt-in hosted acceptance test. Uses isolated test identities/parts and removes them.
Requires authenticated Supabase CLI. No credentials are printed or written.
"""
import time,json,subprocess,urllib.request,urllib.error,uuid,concurrent.futures,os
if os.environ.get('CONVERTER_RUN_HOSTED_AUDIT')!='1':raise SystemExit('Set CONVERTER_RUN_HOSTED_AUDIT=1 to authorize temporary hosted test records.')
REF='hjxhaxlthpqqktregwvu';BASE='https://'+REF+'.supabase.co';CLI='/Users/khaledwahby/.local/bin/supabase'
keys=json.loads(subprocess.run([CLI,'projects','api-keys','--project-ref',REF,'--output','json'],capture_output=True,text=True,check=True).stdout)
SECRET=next(x['api_key'] for x in keys if x.get('name')=='service_role')
PUBLIC='sb_publishable_sPtgKiGwqi9Kog2grqAm9g_tozLmobQ';ids=[];tokens=[];stamp=uuid.uuid4().hex[:10];part='AUDIT_'+stamp;password=uuid.uuid4().hex+'!';license_paths=[]
def req(path,body=None,token=None,method=None,service=False,raw=None,extra=None):
 key=SECRET if service else PUBLIC;h={'apikey':key,'Content-Type':'application/json','Origin':'https://converter-express-portal.vercel.app'}
 if service or token:h['Authorization']='Bearer '+(SECRET if service else token)
 h.update(extra or {});data=raw if raw is not None else (None if body is None else json.dumps(body).encode())
 r=urllib.request.Request(BASE+path,data=data,headers=h,method=method);started=time.monotonic()
 try:
  with urllib.request.urlopen(r,timeout=55) as s:
   raw=s.read();print('HTTP',path.split('?')[0],s.status,round(time.monotonic()-started,1),'seconds',flush=True);return s.status,json.loads(raw) if raw else None
 except urllib.error.HTTPError as e:
  raw=e.read()
  try:d=json.loads(raw)
  except:d={'error':'Non-JSON error'}
  return e.code,d

def api(body,token=None):return req('/functions/v1/crm-api',body,token)
def rpc(name,body={}):
 s,d=req('/rest/v1/rpc/'+name,body,service=True);assert s==200,(name,s,d);return d

def commit(change):
 for attempt in range(6):
  row=rpc('ce_workspace_read');change(row['data']);s,d=req('/rest/v1/rpc/ce_workspace_commit',{'expected':row['revision'],'body':row['data'],'actor':None,'event':'release-audit'},service=True)
  if s==200:return
  if d.get('code')!='40001':raise AssertionError((s,d))
 raise AssertionError('Concurrent updates prevented test change')
try:
 for i in range(2):
  email=f'ce-audit-{stamp}-{i}@example.invalid';s,u=req('/auth/v1/admin/users',{'email':email,'password':password,'email_confirm':True,'user_metadata':{'role':'ADMIN'}},service=True);assert s==200,(s,u);ids.append(u['id'])
  s,t=req('/auth/v1/token?grant_type=password',{'email':email,'password':password});assert s==200,(s,t);tokens.append(t['access_token'])
  s,d=api({'action':'bootstrap'},tokens[-1]);assert s==200 and d['user']['role']=='CUSTOMER'
  path=u['id']+'/release-audit.pdf';s,d=req('/storage/v1/object/business-licenses/'+path,token=tokens[-1],method='POST',raw=b'%PDF-1.4\n%%EOF',extra={'Content-Type':'application/pdf'});assert s==200,(s,d);license_paths.append(path)
  s,d=api({'action':'application','licensePath':path,'fields':{'shopName':'RELEASE TEST '+stamp,'contactName':'Test only','phone':'5550100000','addressLine1':'1 Test Street','city':'Sacramento','state':'CA','postalCode':'95814'}},tokens[-1]);assert s==200,(s,d);assert d['user']['status']=='PENDING'
  assert api({'action':'saved-parts','parts':['201010']},tokens[-1])[0]==403
 print('PASS real Auth, metadata role forgery rejected, private license upload, pending application restrictions',flush=True)
 # Cross-user storage isolation and direct privileged RPC protection.
 assert req('/storage/v1/object/business-licenses/'+license_paths[0],token=tokens[1])[0] in (400,403,404)
 assert req('/rest/v1/rpc/ce_workspace_read',{},tokens[0])[0] in (401,403)
 assert api({'action':'admin-save','revision':1,'data':{}},tokens[0])[0]==403
 def prepare(d):
  for a in d['accounts']:
   if a['id'] in ids:a['status']='APPROVED'
  d['products'].append({'partNumber':part,'name':'RELEASE TEST '+stamp,'category':'Release audit','description':'Temporary automated test','priceCents':15000,'pricePending':False,'costCents':5000,'inStock':True})
  d['crm']['inventory'][part]={'onHand':1,'minimum':0}
 commit(prepare)
 def order():return {'action':'order','idempotencyKey':str(uuid.uuid4()),'items':[{'partId':part,'quantity':1}],'fulfillment':{'method':'SHIP','address':{'line1':'1 Test Street','line2':'','city':'Sacramento','state':'CA','postalCode':'95814'}},'job':{},'poNumber':'RELEASE TEST','notes':'Temporary acceptance test','discountCode':''}
 orders=[order(),order()]
 with concurrent.futures.ThreadPoolExecutor() as ex:results=list(ex.map(lambda i:api(orders[i],tokens[i]),range(2)))
 assert sorted(r[0] for r in results)==[200,409],[(r[0],r[1].get('error')) for r in results]
 winner=next(i for i,r in enumerate(results) if r[0]==200);created=results[winner][1]['result'];assert created['paymentStatus']=='UNPAID' and 'costCents' not in created['lines'][0]
 s,d=api(orders[winner],tokens[winner]);assert s==200 and d['result']['id']==created['id']
 assert api({'action':'job','orderId':created['id'],'job':{'reference':'unauthorized'}},tokens[1-winner])[0]==404
 s,d=api({'action':'bootstrap'},tokens[1-winner]);assert not any(o['id']==created['id'] for o in d['data']['orders'])
 for action in [{'action':'job','orderId':created['id'],'job':{'reference':'TEST RO','vehicle':'Test vehicle','vin':''}},{'action':'saved-parts','parts':[part]},{'action':'profile','fields':{'deliveryInstructions':'Audit delivery note'}},{'action':'request','orderId':created['id'],'request':{'type':'Warranty','partNumber':part,'message':'Test only','photos':[]}}]:
  s,d=api(action,tokens[winner]);assert s==200,(action['action'],s,d)
 print('PASS concurrent stock race, idempotent retry, order ownership, private price fields, job, saved part, profile and warranty persistence',flush=True)
 token=tokens[winner];assert req('/auth/v1/logout?scope=global',token=token,method='POST')[0]==204
 assert api({'action':'bootstrap'},token)[0]==401
 print('PASS signed-out token immediately rejected by backend',flush=True)
finally:
 if ids:
  def cleanup(d):
   d['accounts']=[a for a in d['accounts'] if a['id'] not in ids];d['orders']=[o for o in d['orders'] if not any(l['partId']==part for l in o['lines'])];d['products']=[p for p in d['products'] if p['partNumber']!=part];d['crm']['inventory'].pop(part,None)
  commit(cleanup)
 if license_paths:
  s,d=req('/storage/v1/object/business-licenses',{'prefixes':license_paths},method='DELETE',service=True);assert s==200,(s,d)
 for uid in ids:
  s,d=req('/auth/v1/admin/users/'+uid,method='DELETE',service=True);assert s==200,(s,d)
 print('CLEANUP verified: temporary accounts, orders, inventory, product, licenses and Auth users removed',flush=True)
