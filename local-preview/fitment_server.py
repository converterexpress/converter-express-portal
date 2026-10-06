"""Local preview with a read-only CU CARB API connection. Run: python3 fitment_server.py"""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlsplit,parse_qs,urlencode,unquote
from urllib.request import urlopen,Request
from pathlib import Path
import json, sqlite3, os
from workspace_validation import validate_workspace
ROOT=Path(__file__).resolve().parent
DB=Path(os.environ.get('CONVERTER_PREVIEW_DB',str(Path.home()/'.codex/converter-express/preview.sqlite3')))
DB.parent.mkdir(parents=True,exist_ok=True)
with sqlite3.connect(DB) as conn:
 conn.execute('CREATE TABLE IF NOT EXISTS workspace (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, payload TEXT NOT NULL)')
os.chmod(DB,0o600)
ALLOWED={'year','make','model','engine_size','test_group','page'}
class Handler(SimpleHTTPRequestHandler):
 def end_headers(self):
  self.send_header('X-Content-Type-Options','nosniff')
  self.send_header('Cache-Control','no-store')
  super().end_headers()
 def send_head(self):
  path=unquote(urlsplit(self.path).path)
  if path=='/':self.path='/converter-express_1.html';path=self.path
  if path not in {'/converter-express_1.html','/crm.js','/crm.css','/hero-v2.png'}:
   self.send_error(404);return None
  return super().send_head()
 def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(ROOT),**kwargs)
 def json_response(self,code,payload):
  data=json.dumps(payload).encode();self.send_response(code);self.send_header('Content-Type','application/json');self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
 def local_request(self):
  host=self.headers.get('Host','')
  return host in ('127.0.0.1:8766','localhost:8766') and self.headers.get('Origin','http://'+host)=='http://'+host
 def do_PUT(self):
  if self.path!='/api/workspace':self.send_error(404);return
  if not self.local_request() or self.headers.get('X-Preview-Storage')!='1':self.send_error(403);return
  try:
   size=int(self.headers.get('Content-Length','0'))
   if not 0<size<=12000000:raise ValueError()
   body=json.loads(self.rfile.read(size));payload=body['data'];revision=body['revision']
   if not isinstance(revision,int) or not isinstance(payload,dict):raise ValueError()
   validate_workspace(payload)
   with sqlite3.connect(DB,timeout=10) as conn:
    conn.execute('BEGIN IMMEDIATE')
    row=conn.execute('SELECT revision,payload FROM workspace WHERE id=1').fetchone();current=row[0] if row else 0
    if current!=revision:self.json_response(409,{'error':'Workspace changed in another tab. Reload before saving.'});return
    if row and 'crm' not in payload:
     previous=json.loads(row[1])
     if 'crm' in previous:payload['crm']=previous['crm']
    conn.execute('INSERT OR REPLACE INTO workspace VALUES(1,?,?)',(current+1,json.dumps(payload)));conn.commit()
   self.json_response(200,{'revision':current+1})
  except (ValueError,KeyError,TypeError):self.json_response(400,{'error':'Invalid workspace data'})
  except Exception:self.json_response(500,{'error':'Could not save workspace'})
 def do_GET(self):
  u=urlsplit(self.path)
  if u.path=='/api/workspace':
   if not self.local_request():self.send_error(403);return
   with sqlite3.connect(DB) as conn:row=conn.execute('SELECT revision,payload FROM workspace WHERE id=1').fetchone()
   self.json_response(200,{'revision':row[0] if row else 0,'data':json.loads(row[1]) if row else None});return
  if not u.path.startswith('/api/fitment/'):
   return super().do_GET()
  route={'/api/fitment/filters':'filters/','/api/fitment/search':''}.get(u.path)
  if route is None:self.send_error(404);return
  raw=parse_qs(u.query)
  if set(raw)-ALLOWED or any(len(v)!=1 or len(v[0])>120 for v in raw.values()):self.send_error(400);return
  params={k:v[0] for k,v in raw.items()}
  # Preserve the source's full coverage; catalog matching happens in the UI.
  try:
   request=Request('https://cucarbcats.com/api/converters/'+route+'?'+urlencode(params),headers={'Accept':'application/json','User-Agent':'ConverterExpressFitmentPreview/1.0'})
   with urlopen(request,timeout=20) as response: payload=json.load(response)
   if not isinstance(payload,dict):raise ValueError('Unexpected response')
   code=200
  except Exception:
   code=502;payload={'error':'Fitment source unavailable. Please retry.'}
  data=json.dumps(payload).encode();self.send_response(code);self.send_header('Content-Type','application/json');self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
if __name__=='__main__':
 print('Preview: http://127.0.0.1:8766/converter-express_1.html',flush=True)
 ThreadingHTTPServer(('127.0.0.1',8766),Handler).serve_forever()
