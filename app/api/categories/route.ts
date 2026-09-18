import { z } from 'zod';
import { session, sameOrigin, supa } from '@/lib/supabase';
const id=z.string().uuid();
const deletion=z.object({id,replacement_id:id.nullable().optional(),new_name:z.string().trim().min(1).max(80).optional()}).refine(value=>!(value.replacement_id&&value.new_name));
async function result(response:Response){
 if(response.ok)return Response.json(await response.json(),{headers:{'Cache-Control':'no-store'}});
 const failure=await response.json() as {code?:string;message?:string};
 const message=failure.code==='P0001'?failure.message:failure.code==='23505'?'This name or payment already exists.':'Could not update categories. Please try again.';
 return Response.json({error:message},{status:failure.code==='PGRST202'?503:409});
}
export async function GET(req:Request){
 try{
  const auth=await session();if(!auth)return Response.json({error:'Please sign in again.'},{status:401});
  const parsed=id.safeParse(new URL(req.url).searchParams.get('id'));if(!parsed.success)return Response.json({error:'Category not found.'},{status:400});
  return await result(await supa('/rest/v1/rpc/category_usage',{method:'POST',body:JSON.stringify({p_category:parsed.data})},auth.token));
 }catch{return Response.json({error:'Could not load category usage. Please try again.'},{status:503});}
}
export async function DELETE(req:Request){
 if(!sameOrigin(req))return Response.json({error:'Request rejected.'},{status:403});
 try{
  const auth=await session();if(!auth)return Response.json({error:'Please sign in again.'},{status:401});
  const parsed=deletion.safeParse(await req.json());if(!parsed.success)return Response.json({error:'Check the category name and type.'},{status:400});
  const data=parsed.data;
  return await result(await supa('/rest/v1/rpc/delete_transaction_category',{method:'POST',body:JSON.stringify({p_category:data.id,p_replacement:data.replacement_id??null,p_new_name:data.new_name??null})},auth.token));
 }catch{return Response.json({error:'Could not update categories. Please try again.'},{status:503});}
}
