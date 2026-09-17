import { z } from 'zod';
import { session,supa,sameOrigin } from '@/lib/supabase';
const schema=z.object({account_id:z.string().uuid(),rows:z.array(z.object({name:z.string().trim().min(1).max(120),date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v),amount:z.number().finite().min(-1e15).max(1e15).refine(n=>n!==0),notes:z.string().max(2000),selected:z.boolean().optional()})).min(1).max(500)});
export async function POST(req:Request){
 if(!sameOrigin(req))return new Response(null,{status:403});
 try{const auth=await session();if(!auth)return Response.json({error:'Please sign in again.'},{status:401});const raw=await req.text();if(raw.length>2_000_000)return Response.json({error:'File is too large.'},{status:413});const parsed=schema.safeParse(JSON.parse(raw));if(!parsed.success)return Response.json({error:'Check the import fields.'},{status:400});
 const counts=new Map<string,number>();const rows=[];
 for(const row of parsed.data.rows){const signature=JSON.stringify([parsed.data.account_id,row.date,row.name,row.amount]);const n=counts.get(signature)??0;counts.set(signature,n+1);const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(signature+':'+n));const key=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');if(row.selected!==false){const {selected,...entry}=row;void selected;rows.push({...entry,key});}}
 if(!rows.length)return Response.json({error:'Select at least one transaction.'},{status:400});
 const r=await supa('/rest/v1/rpc/import_account_transactions',{method:'POST',body:JSON.stringify({p_account:parsed.data.account_id,p_rows:rows})},auth.token);
 if(!r.ok){const e=await r.json() as {code?:string;message?:string};return Response.json({error:e.code==='P0001'?e.message:'Import failed. Check the opening balance and transaction amounts. No rows were imported.'},{status:409});}return Response.json(await r.json());
 }catch{return Response.json({error:'Could not import the file. Retry the same file safely.'},{status:503});}
}
