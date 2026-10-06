from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
import os
from urllib.parse import urlsplit,unquote,parse_qsl,urlencode
from urllib.request import Request,urlopen
import json
ROOT=Path(__file__).resolve().parents[1]
class Handler(SimpleHTTPRequestHandler):
 def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(ROOT),**kwargs)
 def do_GET(self):
  u=urlsplit(self.path)
  if not u.path.startswith('/api/fitment/'):
   return super().do_GET()
  if u.path not in {'/api/fitment/filters','/api/fitment/search'}:
   self.send_error(404);return
  params=parse_qsl(u.query,keep_blank_values=True)
  allowed={'year','make','model','engine_size','test_group','page'}
  if len({k for k,v in params})!=len(params) or any(k not in allowed or len(v)>120 for k,v in params):
   self.send_error(400);return
  try:
   target='https://converter-express-portal.vercel.app'+u.path+'?'+urlencode(params)
   with urlopen(Request(target,headers={'Accept':'application/json'}),timeout=20) as response:payload=json.load(response)
   code=200
  except Exception:
   code=502;payload={'error':'Vehicle lookup is unavailable. Please try again.'}
  data=json.dumps(payload).encode();self.send_response(code);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)
 def send_head(self):
  path=unquote(urlsplit(self.path).path)
  if path=='/':self.path='/converter-express_1.html';path=self.path
  if path not in {'/converter-express_1.html','/crm.js','/crm.css','/auth.js','/config.js','/hero-v2.png','/vendor/supabase-2.117.2.js'}:self.send_error(404);return None
  return super().send_head()
 def end_headers(self):
  self.send_header('Cache-Control','no-store');self.send_header('X-Content-Type-Options','nosniff');self.send_header('X-Frame-Options','DENY');super().end_headers()
PORT=int(os.environ.get('CONVERTER_PREVIEW_PORT','8772'))
print(f'Supabase staging preview: http://127.0.0.1:{PORT}',flush=True)
ThreadingHTTPServer(('127.0.0.1',PORT),Handler).serve_forever()
