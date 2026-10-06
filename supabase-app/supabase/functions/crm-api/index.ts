import {createClient} from 'npm:@supabase/supabase-js@2.117.2';
import {project,command,validate,principal,AppError} from '../_shared/business.mjs';
const url=Deno.env.get('SUPABASE_URL')!;
const secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
const origins=(Deno.env.get('APP_ORIGINS')||'').split(',').map(x=>x.trim()).filter(Boolean);
async function rpc(name:string,args:Record<string,unknown>={}){const {data,error}=await db.rpc(name,args);if(error){if(error.code==='40001')throw new AppError('Another change was saved. Reload and try again.',409);throw new AppError('Unable to complete the request',503);}return data;}
async function identity(req:Request){
 const bearer=req.headers.get('Authorization');if(!bearer)return null;
 if(!/^Bearer [A-Za-z0-9._-]+$/.test(bearer))throw new AppError('Sign in again',401);
 const token=bearer.slice(7);
 const {data:{user},error}=await db.auth.getUser(token);if(error||!user||!user.email_confirmed_at)throw new AppError('Sign in with a verified email',401);
 const claimsResult=await db.auth.getClaims(token);if(claimsResult.error||!claimsResult.data?.claims)throw new AppError('Sign in again',401);
 const claims=claimsResult.data.claims;if(!claims.session_id||!await rpc('ce_session_live',{uid:user.id,sid:claims.session_id}))throw new AppError('Session expired. Sign in again.',401);
 const staff=await rpc('ce_staff_check',{uid:user.id});return principal(user,staff?[user.id]:[],claims);
}
Deno.serve(async req=>{
 const origin=req.headers.get('Origin')||'';
 const headers:Record<string,string>={'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Origin'};
 if(origins.includes(origin)){headers['Access-Control-Allow-Origin']=origin;headers['Access-Control-Allow-Headers']='authorization, apikey, content-type, x-client-info';headers['Access-Control-Allow-Methods']='POST, OPTIONS';}
 const respond=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
 if(origin&&!origins.includes(origin))return respond({error:'Origin not allowed'},403);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return respond({error:'Method not allowed'},405);
 try{
  // Bound streamed input too; Content-Length alone can be omitted or forged.
  const reader=req.body?.getReader();if(!reader)throw new AppError('Missing request body');let size=0;const chunks:Uint8Array[]=[];while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>12000000){await reader.cancel();throw new AppError('Request too large',413);}chunks.push(value);}const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}let body;try{body=JSON.parse(new TextDecoder().decode(bytes));}catch{throw new AppError('Invalid JSON');}
  const user=await identity(req);
  if(!user&&!['bootstrap','fitment'].includes(body.action))throw new AppError('Sign in to continue',401);
  if(!await rpc('ce_rate_limit',{subject_key:user?.id||'public-'+body.action,max_hits:user?120:body.action==='fitment'?120:300}))throw new AppError('Too many requests. Try again shortly.',429);
  if(body.action==='fitment'){
   const params=new URLSearchParams(body.query||'');if(!['filters','search'].includes(body.route)||[...params].some(([k,v])=>!['year','make','model','engine_size','test_group','page'].includes(k)||v.length>120))throw new AppError('Invalid fitment lookup');
   const target='https://cucarbcats.com/api/converters/'+(body.route==='filters'?'filters/':'')+'?'+params;
   const response=await fetch(target,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(20000)});if(!response.ok)throw new AppError('Fitment lookup unavailable',502);return respond(await response.json());
  }
  if(body.action==='bootstrap'){
   // Staff must finish MFA before any workspace projection can be returned.
   if(user?.admin&&user.aal!=='aal2')return respond({mfaRequired:true});
   const row=await rpc('ce_workspace_read');if(!row)throw new AppError('Catalog setup has not been completed',503);
   return respond({...project(row.data,user),revision:row.revision});
  }
  if(body.action==='quote'){const row=await rpc('ce_workspace_read');if(!row)throw new AppError('Workspace unavailable',503);const result=command(row.data,user,{...body,action:'order'});return respond({quote:result.result});}
  if(body.action==='license'){
   const row=await rpc('ce_workspace_read');if(!row)throw new AppError('Workspace unavailable',503);
   if(!user?.admin||user.aal!=='aal2')throw new AppError('Administrator two-factor sign-in required',403);
   const account=row.data.accounts.find((a:any)=>a.id===body.accountId);if(!account?.licensePath)throw new AppError('License not found',404);
   const {data,error}=await db.storage.from('business-licenses').createSignedUrl(account.licensePath,60,{download:true});if(error)throw new AppError('License unavailable',404);return respond({url:data.signedUrl});
  }
  if(body.action==='admin-save'){
   if(!user?.admin||user.aal!=='aal2')throw new AppError('Administrator two-factor sign-in required',403);
   validate(body.data);
   const row=await rpc('ce_workspace_read');if(!row||row.revision!==body.revision)throw new AppError('Another change was saved. Reload and try again.',409);
   // Business edits never reassign ownership or delete an authenticated shop.
   if(row.data.accounts.some((a:any)=>!body.data.accounts.some((b:any)=>b.id===a.id&&b.email===a.email))||body.data.accounts.some((a:any)=>!row.data.accounts.some((b:any)=>b.id===a.id)))throw new AppError('Account identity cannot be edited through a workspace save');
   const revision=await rpc('ce_workspace_commit',{expected:body.revision,body:body.data,actor:user.id,event:'admin-save'});return respond({revision});
  }
  // Retry only after re-reading and re-running rules. Atomic compare-and-swap prevents overselling.
  for(let attempt=0;attempt<4;attempt++){
   const row=await rpc('ce_workspace_read');if(!row)throw new AppError('Workspace unavailable',503);
   if(body.action==='application'){
    if(!body.licensePath?.startsWith(user!.id+'/'))throw new AppError('Invalid license');
    const {data,error}=await db.storage.from('business-licenses').download(body.licensePath);if(error||!data||data.size>2097152)throw new AppError('Upload your business license first');
    const magic=new Uint8Array(await data.slice(0,16).arrayBuffer());const signature=new TextDecoder().decode(magic);
    const valid=magic[0]===255&&magic[1]===216&&magic[2]===255||magic[0]===137&&signature.slice(1,4)==='PNG'||signature.startsWith('%PDF-')||signature.startsWith('RIFF')&&signature.slice(8,12)==='WEBP';if(!valid)throw new AppError('License file format is not supported');
   }
   const next=command(row.data,user,body);
   try{const revision=await rpc('ce_workspace_commit',{expected:row.revision,body:next.data,actor:user!.id,event:body.action});return respond({...project(next.data,user),revision,result:next.result});}catch(e){if(!(e instanceof AppError)||e.status!==409||attempt===3)throw e;}
  }
  throw new AppError('Unable to save after concurrent changes. Please retry.',409);
 }catch(e){if(e instanceof AppError)return respond({error:e.message},e.status);console.error('crm-api request failed');return respond({error:'Unable to complete the request. Please retry.'},500);}
});
