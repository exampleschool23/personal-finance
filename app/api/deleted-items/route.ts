import { z } from 'zod';
import { session, supa, sameOrigin } from '@/lib/supabase';
export async function GET(req:Request) {
 try {
  const auth=await session();if(!auth)return Response.json({error:'Please sign in again.'},{status:401});
  const page=z.coerce.number().int().min(1).max(1000000).safeParse(new URL(req.url).searchParams.get('page')||1);
  if(!page.success)return Response.json({error:'Invalid pagination parameters.'},{status:400});
  const result=await supa(`/rest/v1/deleted_items?select=id,source,data,deleted_at&order=deleted_at.desc,id.desc&limit=11&offset=${(page.data-1)*10}`,{},auth.token);
  if(!result.ok)throw Error();
  const items=await result.json() as unknown[];
  return Response.json({items:items.slice(0,10),hasMore:items.length>10});
 } catch {return Response.json({error:'Could not load deleted items. Please try again.'},{status:503});}
}
export async function POST(req:Request) {
 if(!sameOrigin(req))return new Response(null,{status:403});
 try {
  const auth=await session();if(!auth)return Response.json({error:'Please sign in again.'},{status:401});
  const parsed=z.object({id:z.string().uuid()}).safeParse(await req.json());
  if(!parsed.success)return Response.json({error:'Check the record fields.'},{status:400});
  const result=await supa('/rest/v1/rpc/restore_deleted_item',{method:'POST',body:JSON.stringify({p_id:parsed.data.id})},auth.token);
  if(!result.ok)return Response.json({error:'Could not restore this item. Restore its linked plan or business first, and check that its original dates and currency are still allowed.'},{status:409});
  return Response.json({ok:true});
 } catch {return Response.json({error:'Connection unavailable. Please try again.'},{status:503});}
}

export async function DELETE(req:Request) {
 if(!sameOrigin(req))return new Response(null,{status:403});
 try {
  const auth=await session();if(!auth)return Response.json({error:'Please sign in again.'},{status:401});
  const parsed=z.object({id:z.string().uuid()}).safeParse(await req.json());
  if(!parsed.success)return Response.json({error:'Check the record fields.'},{status:400});
  const result=await supa('/rest/v1/rpc/permanently_delete_item',{method:'POST',body:JSON.stringify({p_id:parsed.data.id})},auth.token);
  if(!result.ok)return Response.json({error:'Could not permanently delete this item. Check that database update 048 is installed and try again.'},{status:409});
  return Response.json({ok:true});
 } catch {return Response.json({error:'Connection unavailable. Please try again.'},{status:503});}
}
