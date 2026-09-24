import {session,sameOrigin,supa} from '@/lib/supabase';
import {corporateEventSchema} from '@/lib/corporate-events';
import {uuid} from '@/lib/api-validation';
export async function GET(req:Request){try{
 const auth=await session();if(!auth)return Response.json({error:'Please sign in again.'},{status:401});
 const id=new URL(req.url).searchParams.get('record');if(!uuid.safeParse(id).success)return Response.json({error:'Investment not found.'},{status:400});
 const result=await supa(`/rest/v1/corporate_events?record_id=eq.${id}&select=*&order=occurred_on.desc,id&limit=100`,{},auth.token);
 if(!result.ok)throw Error();return Response.json(await result.json(),{headers:{'Cache-Control':'no-store'}});
}catch{return Response.json({error:'Could not load investment events.'},{status:503});}}
export async function POST(req:Request){if(!sameOrigin(req))return new Response(null,{status:403});try{
 const auth=await session();if(!auth)return Response.json({error:'Please sign in again.'},{status:401});
 const parsed=corporateEventSchema.safeParse(await req.json());if(!parsed.success)return Response.json({error:'Check the investment event fields.'},{status:400});
 const result=await supa('/rest/v1/rpc/record_corporate_event',{method:'POST',body:JSON.stringify({p_data:parsed.data})},auth.token);
 if(!result.ok){const e=await result.json() as {code?:string;message?:string};return Response.json({error:e.code==='P0001'?e.message:'Could not save the investment event.'},{status:409});}
 return Response.json(await result.json());
}catch{return Response.json({error:'Update could not be confirmed. Retry with the same details.'},{status:503});}}
