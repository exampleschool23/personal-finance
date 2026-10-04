import { z } from 'zod';
import { uuid } from '@/lib/api-validation';
import { postgrestFailure, readJson, requestRejected, signInAgain } from '@/lib/api-route';
import { session, sameOrigin, supa } from '@/lib/supabase';
const deletion=z.object({id:uuid,replacement_id:uuid.nullable().optional(),new_name:z.string().trim().min(1).max(80).optional()}).refine(value=>!(value.replacement_id&&value.new_name));
async function result(response:Response){
 if(response.ok)return Response.json(await response.json(),{headers:{'Cache-Control':'no-store'}});
 const fallback='Could not update categories. Please try again.';
 return postgrestFailure(response,fallback,{codes:{'23505':'This name or payment already exists.',PGRST202:[fallback,503]}});
}
export async function GET(req:Request){
 try{
  const auth=await session();if(!auth)return signInAgain();
  const parsed=uuid.safeParse(new URL(req.url).searchParams.get('id'));if(!parsed.success)return Response.json({error:'Category not found.'},{status:400});
  return await result(await supa('/rest/v1/rpc/category_usage',{method:'POST',body:JSON.stringify({p_category:parsed.data})},auth.token));
 }catch{return Response.json({error:'Could not load category usage. Please try again.'},{status:503});}
}
export async function DELETE(req:Request){
 if(!sameOrigin(req))return requestRejected();
 try{
  const auth=await session();if(!auth)return signInAgain();
  const parsed=deletion.safeParse(await readJson(req));if(!parsed.success)return Response.json({error:'Check the category name and type.'},{status:400});
  const data=parsed.data;
  return await result(await supa('/rest/v1/rpc/delete_transaction_category',{method:'POST',body:JSON.stringify({p_category:data.id,p_replacement:data.replacement_id??null,p_new_name:data.new_name??null})},auth.token));
 }catch{return Response.json({error:'Could not update categories. Please try again.'},{status:503});}
}
