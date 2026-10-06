from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit,unquote
ROOT=Path(__file__).resolve().parents[1]
class Handler(SimpleHTTPRequestHandler):
 def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(ROOT),**kwargs)
 def send_head(self):
  path=unquote(urlsplit(self.path).path)
  if path=='/':self.path='/converter-express_1.html';path=self.path
  if path not in {'/converter-express_1.html','/crm.js','/crm.css','/auth.js','/config.js','/hero-v2.png','/vendor/supabase-2.117.2.js'}:self.send_error(404);return None
  return super().send_head()
 def end_headers(self):
  self.send_header('Cache-Control','no-store');self.send_header('X-Content-Type-Options','nosniff');self.send_header('X-Frame-Options','DENY');super().end_headers()
print('Supabase staging preview: http://127.0.0.1:8772',flush=True)
ThreadingHTTPServer(('127.0.0.1',8772),Handler).serve_forever()
