import {session,supa} from '@/lib/supabase';
import {databaseUpdateMessage,supportsDatabase} from '@/lib/database-capabilities';
export async function GET(){
 try{
  const auth=await session();if(!auth)return Response.json({error:'Please sign in again.'},{status:401});
  const response=await supa('/rest/v1/rpc/finance_capabilities',{method:'POST',body:'{}'},auth.token);
  if(!response.ok){
   const failure=await response.json() as {code?:string};
   return Response.json({error:failure.code==='PGRST202'?databaseUpdateMessage:'Could not check the database. Please try again.'},{status:503});
  }
  const capabilities=await response.json();
  if(!supportsDatabase(capabilities))return Response.json({error:databaseUpdateMessage},{status:503});
  return Response.json({compatible:true},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Could not check the database. Please try again.'},{status:503});}
}
