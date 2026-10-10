import { z } from 'zod';
import { uuid } from '@/lib/api-validation';
import { postgrestFailure, readJson, requestRejected, signInAgain } from '@/lib/api-route';
import { session, sameOrigin, supa } from '@/lib/supabase';
import { expenses, income } from '@/lib/finance';
// A built-in category is named by its kind, an added one by its id (migration 122).
const builtIn=z.enum([...income,...expenses] as [string,...string[]]);
// The records move to an added category (`replacement_id`), a new one (`new_name`) or a built-in one (`replacement_kind`, migration 138).
const deletion=z.object({id:z.union([uuid,builtIn]),replacement_id:uuid.nullable().optional(),new_name:z.string().trim().min(1).max(80).optional(),replacement_kind:builtIn.optional()}).refine(value=>[value.replacement_id,value.new_name,value.replacement_kind].filter(Boolean).length<=1);
async function result(response:Response){
 if(response.ok)return Response.json(await response.json(),{headers:{'Cache-Control':'no-store'}});
 const fallback='Could not update categories. Please try again.';
 return postgrestFailure(response,fallback,{codes:{'23505':'This name or payment already exists.',PGRST202:[fallback,503]}});
}
export async function GET(req:Request){
 try{
  const auth=await session();if(!auth)return signInAgain();
  const id=new URL(req.url).searchParams.get('id'),kind=builtIn.safeParse(id),parsed=uuid.safeParse(id);
  if(kind.success)return await result(await supa('/rest/v1/rpc/built_in_category_usage',{method:'POST',body:JSON.stringify({p_kind:kind.data})},auth.token));
  if(!parsed.success)return Response.json({error:'Category not found.'},{status:400});
  return await result(await supa('/rest/v1/rpc/category_usage',{method:'POST',body:JSON.stringify({p_category:parsed.data})},auth.token));
 }catch{return Response.json({error:'Could not load category usage. Please try again.'},{status:503});}
}
export async function DELETE(req:Request){
 if(!sameOrigin(req))return requestRejected();
 try{
  const auth=await session();if(!auth)return signInAgain();
  const parsed=deletion.safeParse(await readJson(req));if(!parsed.success)return Response.json({error:'Check the category name and type.'},{status:400});
  const data=parsed.data;
  if(data.replacement_kind)return await result(await supa('/rest/v1/rpc/delete_category_into_kind',{method:'POST',body:JSON.stringify({p_from:data.id,p_kind:data.replacement_kind})},auth.token));
  const replacement={p_replacement:data.replacement_id??null,p_new_name:data.new_name??null};
  if(builtIn.safeParse(data.id).success)return await result(await supa('/rest/v1/rpc/delete_built_in_category',{method:'POST',body:JSON.stringify({p_kind:data.id,...replacement})},auth.token));
  return await result(await supa('/rest/v1/rpc/delete_transaction_category',{method:'POST',body:JSON.stringify({p_category:data.id,...replacement})},auth.token));
 }catch{return Response.json({error:'Could not update categories. Please try again.'},{status:503});}
}
