import { isoDate,uuid } from '@/lib/api-validation';
import { z } from 'zod';
import {readOwnerRows} from '@/lib/server-records';
import { session,supa,sameOrigin } from '@/lib/supabase';
const schema=z.object({batch_id:uuid,account_id:uuid,rows:z.array(z.object({name:z.string().trim().min(1).max(120),date:isoDate,amount:z.number().finite().min(-1e15).max(1e15).refine(n=>n!==0),notes:z.string().max(2000),sourceId:z.string().trim().min(1).max(200).optional(),selected:z.boolean().optional()})).min(1).max(500)});
export async function POST(req:Request){
 if(!sameOrigin(req))return new Response(null,{status:403});
 try{const auth=await session();if(!auth)return Response.json({error:'Please sign in again.'},{status:401});const raw=await req.text();if(raw.length>2_000_000)return Response.json({error:'File is too large.'},{status:413});const parsed=schema.safeParse(JSON.parse(raw));if(!parsed.success)return Response.json({error:'Check the import fields.'},{status:400});
 const counts=new Map<string,number>();const rows=[];
 for(const row of parsed.data.rows){const signature=row.sourceId?JSON.stringify(['source',parsed.data.account_id,row.sourceId]):JSON.stringify([parsed.data.account_id,row.date,row.name,row.amount]);const n=counts.get(signature)??0;counts.set(signature,n+1);const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(row.sourceId?signature:signature+':'+n));const key=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');if(row.selected!==false){const {selected,...entry}=row;void selected;rows.push({...entry,key});}}
 if(!rows.length)return Response.json({error:'Select at least one transaction.'},{status:400});
 const r=await supa('/rest/v1/rpc/import_statement',{method:'POST',body:JSON.stringify({p_batch:parsed.data.batch_id,p_account:parsed.data.account_id,p_rows:rows})},auth.token);
 if(!r.ok){const e=await r.json() as {code?:string;message?:string};return Response.json({error:e.code==='P0001'?e.message:'Import failed. Check the opening balance and transaction amounts. No rows were imported.'},{status:409});}return Response.json(await r.json());
 }catch{return Response.json({error:'Could not import the file. Retry the same file safely.'},{status:503});}
}

export async function GET(){try{const auth=await session();if(!auth)return Response.json({error:'Please sign in again.'},{status:401});return Response.json({batches:await readOwnerRows('import_batches',auth.token,{select:'id,account_id,created_at,undone_at,result',order:'created_at.desc,id.asc'})},{headers:{'Cache-Control':'no-store'}});}catch{return Response.json({error:'Could not load import history.'},{status:503});}}
export async function DELETE(req:Request){if(!sameOrigin(req))return new Response(null,{status:403});try{const auth=await session();if(!auth)return Response.json({error:'Please sign in again.'},{status:401});const body=z.object({id:uuid}).safeParse(await req.json());if(!body.success)return Response.json({error:'Check the import fields.'},{status:400});const response=await supa('/rest/v1/rpc/undo_statement_import',{method:'POST',body:JSON.stringify({p_batch:body.data.id})},auth.token);if(!response.ok){const error=await response.json() as {code?:string;message?:string};return Response.json({error:error.code==='P0001'?error.message:'Could not undo the import.'},{status:409});}return Response.json({ok:true});}catch{return Response.json({error:'Could not undo the import.'},{status:503});}}
