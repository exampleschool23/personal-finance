import {postgrestFailure,signInAgain} from '@/lib/api-route';
import {session,supa} from '@/lib/supabase';
import {databaseUpdateMessage,supportsDatabase} from '@/lib/database-capabilities';
export async function GET(){
 try{
  const auth=await session();if(!auth)return signInAgain();
  const response=await supa('/rest/v1/rpc/finance_capabilities',{method:'POST',body:'{}'},auth.token);
  if(!response.ok)return postgrestFailure(response,'Could not check the database. Please try again.',{status:503,codes:{PGRST202:databaseUpdateMessage}});
  const capabilities=await response.json();
  if(!supportsDatabase(capabilities))return Response.json({error:databaseUpdateMessage},{status:503});
  return Response.json({compatible:true},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Could not check the database. Please try again.'},{status:503});}
}
