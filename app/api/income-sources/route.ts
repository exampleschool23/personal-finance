import { crossSite,postgrestError,readJson,signInAgain } from '@/lib/api-route';
import { session,supa,sameOrigin } from '@/lib/supabase';
import { readOwnerRows } from '@/lib/server-records';
import { earningSourceSchema } from '@/lib/earning-sources';
export async function GET(){
 try{const auth=await session();if(!auth)return signInAgain();
 return Response.json(await readOwnerRows('income_sources',auth.token),{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Could not load income sources.'},{status:503});}
}
export async function POST(request:Request){
 if(!sameOrigin(request))return crossSite();
 try{const auth=await session();if(!auth)return signInAgain();
 const parsed=earningSourceSchema.safeParse(await readJson(request));if(!parsed.success)return Response.json({error:'Check the income source fields.'},{status:400});
 const response=await supa('/rest/v1/rpc/save_income_source',{method:'POST',body:JSON.stringify({p_data:parsed.data})},auth.token);
 if(!response.ok){const {message=''}=await postgrestError(response);const known=['Income source not found.','Keep the type, currency and schedule compatible with recorded payments.','Choose a matching income source.'];return Response.json({error:known.includes(message)?message:'Could not save the income source.'},{status:409});}
 return Response.json(await response.json());
 }catch{return Response.json({error:'Could not save the income source.'},{status:503});}
}
