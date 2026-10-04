import { isoDate,uuid } from '@/lib/api-validation';
import { z } from 'zod';
import {readOwnerRows} from '@/lib/server-records';
import { crossSite,postgrestFailure,readJson,signInAgain } from '@/lib/api-route';
import { session,supa,sameOrigin } from '@/lib/supabase';
import { queueMilestoneCheck } from '@/lib/notify-action';
const schema=z.object({batch_id:uuid,account_id:uuid,rows:z.array(z.object({name:z.string().trim().min(1).max(120),date:isoDate,amount:z.number().finite().min(-1e15).max(1e15).refine(n=>n!==0),notes:z.string().max(2000),sourceId:z.string().trim().min(1).max(200).optional(),selected:z.boolean().optional()})).min(1).max(500)});
export async function POST(req:Request){
 if(!sameOrigin(req))return crossSite();
 try{const auth=await session();if(!auth)return signInAgain();const raw=await req.text();if(raw.length>2_000_000)return Response.json({error:'File is too large.'},{status:413});let body:unknown=null;try{body=JSON.parse(raw);}catch{}const parsed=schema.safeParse(body);if(!parsed.success)return Response.json({error:'Check the import fields.'},{status:400});
 const counts=new Map<string,number>();const rows=[];
 for(const row of parsed.data.rows){const signature=row.sourceId?JSON.stringify(['source',parsed.data.account_id,row.sourceId]):JSON.stringify([parsed.data.account_id,row.date,row.name,row.amount]);const n=counts.get(signature)??0;counts.set(signature,n+1);const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(row.sourceId?signature:signature+':'+n));const key=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');if(row.selected!==false){const {selected,...entry}=row;void selected;rows.push({...entry,key});}}
 if(!rows.length)return Response.json({error:'Select at least one transaction.'},{status:400});
 const r=await supa('/rest/v1/rpc/import_statement',{method:'POST',body:JSON.stringify({p_batch:parsed.data.batch_id,p_account:parsed.data.account_id,p_rows:rows})},auth.token);
 if(!r.ok)return postgrestFailure(r,'Import failed. Check the opening balance and transaction amounts. No rows were imported.');const outcome=await r.json() as {added?:number;skipped?:number};queueMilestoneCheck(auth,{type:'import',added:outcome.added??0,skipped:outcome.skipped??0});return Response.json(outcome);
 }catch{return Response.json({error:'Could not import the file. Retry the same file safely.'},{status:503});}
}

export async function GET(){try{const auth=await session();if(!auth)return signInAgain();return Response.json({batches:await readOwnerRows('import_batches',auth.token,{select:'id,account_id,created_at,undone_at,result',order:'created_at.desc,id.asc'})},{headers:{'Cache-Control':'no-store'}});}catch{return Response.json({error:'Could not load import history.'},{status:503});}}
export async function DELETE(req:Request){if(!sameOrigin(req))return crossSite();try{const auth=await session();if(!auth)return signInAgain();const body=z.object({id:uuid}).safeParse(await readJson(req));if(!body.success)return Response.json({error:'Check the import fields.'},{status:400});const response=await supa('/rest/v1/rpc/undo_statement_import',{method:'POST',body:JSON.stringify({p_batch:body.data.id})},auth.token);if(!response.ok)return postgrestFailure(response,'Could not undo the import.');return Response.json({ok:true});}catch{return Response.json({error:'Could not undo the import.'},{status:503});}}
