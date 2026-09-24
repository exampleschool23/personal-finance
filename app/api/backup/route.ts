import { signBackup, verifyBackup } from '@/lib/backup-signature';
import { z } from 'zod';
import { uuid } from '@/lib/api-validation';
import { databaseUpdateMessage } from '@/lib/database-capabilities';
import { session,supa,sameOrigin } from '@/lib/supabase';
import { readOwnerRows } from '@/lib/server-records';
import { exportCSV, FINANCE_RECORD_CSV_COLUMNS } from '@/lib/csv';
export async function GET(req:Request){
 try{const auth=await session();if(!auth)return Response.json({error:'Please sign in again.'},{status:401});
 const query=new URL(req.url).searchParams;
 if(query.get('recoveries')==='1'){
  const page=z.coerce.number().int().min(1).max(1000000).safeParse(query.get('page')??1);if(!page.success)return Response.json({error:'Invalid backup.'},{status:400});
  const params=new URLSearchParams({select:'id,created_at',order:'created_at.desc,id.desc',offset:String((page.data-1)*20),limit:'21'});
  const result=await supa('/rest/v1/backup_recovery_points?'+params,{},auth.token);
  if(!result.ok)return Response.json({error:'Could not load recovery copies.'},{status:503});
  const rows=await result.json() as unknown[];return Response.json({items:rows.slice(0,20),hasMore:rows.length>20},{headers:{'Cache-Control':'no-store'}});
 }
 if(query.get('format')==='csv'){
 const records=await readOwnerRows<Record<string,unknown>>('finance_records',auth.token);
 return new Response(exportCSV(records,FINANCE_RECORD_CSV_COLUMNS),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="finance-records.csv"','Cache-Control':'no-store'}});
 }
 const recovery=new URL(req.url).searchParams.get('recovery');
 if(recovery&&!uuid.safeParse(recovery).success)return Response.json({error:'Invalid backup.'},{status:400});
 const result=await supa(recovery?'/rest/v1/rpc/get_backup_recovery':'/rest/v1/rpc/export_finance_backup',{method:'POST',body:recovery?JSON.stringify({p_id:recovery}):'{}'},auth.token);
 if(!result.ok)throw Error('Incomplete backup');
 const raw=await result.text();if(raw==='null')return Response.json({error:'Backup not found.'},{status:404});
 // Preserve PostgreSQL numeric literals; parsing and reserializing loses precision.
 return new Response(signBackup(raw),{headers:{'Content-Type':'application/json','Content-Disposition':'attachment; filename="finance-backup.json"','Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Could not export all data. No incomplete backup was created.'},{status:503});}
}

const requestSchema=z.object({action:z.enum(['preview','restore']),backup:z.string().min(2).max(28_000_000),expected_state:z.string().regex(/^[a-f0-9]{64}$/).optional(),confirmed:z.literal(true).optional()}).refine(data=>data.action==='preview'||(data.confirmed&&data.expected_state));
export async function POST(req:Request){
 if(!sameOrigin(req))return new Response(null,{status:403});
 try{
  const auth=await session();if(!auth)return Response.json({error:'Please sign in again.'},{status:401});
  // Bound the request while reading, including clients without Content-Length.
  const reader=req.body?.getReader();if(!reader)return Response.json({error:'Invalid backup.'},{status:400});
  const chunks:Uint8Array[]=[];let size=0;
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>56_100_000){await reader.cancel();return Response.json({error:'File is too large.'},{status:413});}chunks.push(value);}
  const buffer=new Uint8Array(size);let offset=0;for(const chunk of chunks){buffer.set(chunk,offset);offset+=chunk.byteLength;}
  let raw:unknown;try{raw=JSON.parse(new TextDecoder().decode(buffer));}catch{return Response.json({error:'Invalid backup.'},{status:400});}
  const parsed=requestSchema.safeParse(raw);if(!parsed.success)return Response.json({error:'Preview and confirm the backup before restoring.'},{status:400});
  const {action,expected_state}=parsed.data;
  let verified:ReturnType<typeof verifyBackup>;
  try{verified=verifyBackup(parsed.data.backup);}catch(error){return Response.json({error:error instanceof Error?error.message:'Invalid backup.'},{status:400});}
  const {backup,portable}=verified;
  if(portable){
   const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
   if(!serviceKey)return Response.json({error:'Portable backup recovery is awaiting server setup.'},{status:503});
   // This privileged call only certifies the already signed artifact for this
   // owner. Preview and restore still run with the owner's normal token.
   const registration=await supa('/rest/v1/rpc/register_verified_finance_backup',{method:'POST',body:JSON.stringify({p_backup:backup,p_owner:auth.user.id})},serviceKey);
   if(!registration.ok)return Response.json({error:'The backup could not be verified for this account.'},{status:409});
  }
  const result=await supa('/rest/v1/rpc/'+(action==='preview'?'preview_finance_restore':'restore_finance_backup'),{method:'POST',body:JSON.stringify({p_backup:backup,...(action==='restore'?{p_expected_state:expected_state}:{})})},auth.token);
  if(!result.ok){const failure=await result.json() as {code?:string;message?:string};return Response.json({error:failure.code==='PGRST202'?databaseUpdateMessage:failure.code==='55P03'?'The database is busy. Please try again.':failure.code==='P0001'?failure.message:'The backup could not be restored. No changes were made.'},{status:failure.code==='PGRST202'||failure.code==='55P03'?503:409});}
  return Response.json(await result.json(),{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Restore could not be confirmed. Retry with the same preview.'},{status:503});}
}
