"""Export a validated workspace as SQL. Writes only the explicitly selected output file.
Run from supabase-app: python3 scripts/prepare_import.py /path/to/preview.sqlite3 /private/path/import.sql
Run generated SQL with a trusted database administrator after applying the migration.
Never put import.sql in a public web root or repository.
"""
import sys,sqlite3,json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'local-preview'))
from workspace_validation import validate_workspace
if len(sys.argv)!=3:raise SystemExit(__doc__)
source=Path(sys.argv[1]).resolve();out=Path(sys.argv[2]).resolve()
if out==source or Path(__file__).resolve().parents[1] in out.parents:raise SystemExit('Choose a private output path outside the web bundle.')
with sqlite3.connect('file:'+str(source)+'?mode=ro',uri=True) as c:row=c.execute('select payload from workspace where id=1').fetchone()
if not row:raise SystemExit('No saved workspace found.')
data=json.loads(row[0]);data.setdefault('crm',{'quotes':[],'tasks':[],'purchases':[],'inventory':{},'activities':[]});validate_workspace(data)
if data['accounts'] or data['orders']:raise SystemExit('Existing accounts/orders require an explicit Auth user-ID mapping before import. Export stopped; no identities guessed.')
encoded=json.dumps(data,ensure_ascii=False).replace("'","''")
sql="BEGIN;\nINSERT INTO ce_private.workspace(id,revision,payload) VALUES(1,1,'"+encoded+"'::jsonb);\nCOMMIT;\n"
with out.open('x',encoding='utf-8') as f:f.write(sql)
out.chmod(0o600)
print('Prepared import:',len(data['products']),'parts; no sample accounts or orders. Existing target workspace is never overwritten.')
