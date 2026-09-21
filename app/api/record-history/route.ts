import {session,supa} from '@/lib/supabase';
import {uuid} from '@/lib/api-validation';
import {z} from 'zod';
export async function GET(req:Request){
 try{
  const auth=await session();if(!auth)return Response.json({error:'Please sign in again.'},{status:401});
  const query=new URL(req.url).searchParams;
  const parsed=z.object({id:uuid,page:z.coerce.number().int().min(1).max(1000000)}).safeParse({id:query.get('id'),page:query.get('page')??1});
  if(!parsed.success)return Response.json({error:'Invalid history request.'},{status:400});
  const params=new URLSearchParams({select:'id,changed_at,before_record,after_record',record_id:'eq.'+parsed.data.id,order:'changed_at.desc,id.desc',offset:String((parsed.data.page-1)*20),limit:'21'});
  const response=await supa('/rest/v1/record_edit_history?'+params,{},auth.token);
  if(!response.ok)throw Error();
  const rows=await response.json() as unknown[];return Response.json({items:rows.slice(0,20),hasMore:rows.length>20},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Could not load record history.'},{status:503});}
}
