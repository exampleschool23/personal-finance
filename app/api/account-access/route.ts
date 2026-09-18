import {cookies} from 'next/headers';
import {z} from 'zod';
import {accountAccessSchema,recoveryCookie,recoveryOptions,accountOrigin} from '@/lib/account-access';
import {config,supa,session,saveSession,sameOrigin} from '@/lib/supabase';
const authSession=z.object({access_token:z.string().min(1),refresh_token:z.string().min(1),expires_in:z.number().positive(),user:z.object({id:z.string().uuid()})});
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
export async function GET(){return reply({signup:process.env.PUBLIC_SIGNUP_ENABLED==='true',deletion:!!process.env.SUPABASE_SERVICE_ROLE_KEY});}
export async function POST(req:Request){
 if(!sameOrigin(req)||req.headers.get('sec-fetch-site')==='cross-site')return reply({error:'Request rejected.'},403);
 try{
 const parsed=accountAccessSchema.safeParse(await req.json().catch(()=>null));if(!parsed.success)return reply({error:'Check the account fields. Passwords need at least 12 characters.'},400);
 const data=parsed.data;const origin=accountOrigin();
 if((data.action==='signup'||data.action==='recover')&&!origin)return reply({error:'Account service is unavailable. Please try again.'},503);
 if(data.action==='signup'){
 if(process.env.PUBLIC_SIGNUP_ENABLED!=='true')return reply({error:'Registration is by invitation.'},403);
 const response=await supa('/auth/v1/signup?redirect_to='+encodeURIComponent(origin+'/auth/confirm'),{method:'POST',body:JSON.stringify({email:data.email,password:data.password})});
 if(!response.ok)return reply({error:response.status===429?'Too many attempts. Please try again later.':'Could not start registration. Please try again.'},response.status===429?429:400);
 // Never log in an unverified signup even if the provider is misconfigured.
 return reply({message:'Check your email to verify your account.'});
 }
 if(data.action==='recover'){
 const response=await supa('/auth/v1/recover?redirect_to='+encodeURIComponent(origin+'/auth/confirm'),{method:'POST',body:JSON.stringify({email:data.email})});
 if(response.status===429)return reply({error:'Too many attempts. Please try again later.'},429);
 if(response.status>=500)return reply({error:'Email service is unavailable. Please try again.'},503);
 return reply({message:'If this account exists, a recovery email has been sent.'});
 }
 const jar=await cookies();
 if(data.action==='verify'){
 const response=await supa('/auth/v1/verify',{method:'POST',body:JSON.stringify({token_hash:data.token_hash,type:data.type})});
 if(!response.ok)return reply({error:'This link is invalid or expired. Request a new email.'},400);
 const verified=authSession.safeParse(await response.json());if(!verified.success)return reply({error:'Could not verify the account.'},503);
 if(data.type==='recovery')jar.set(recoveryCookie,verified.data.access_token,recoveryOptions);else await saveSession(verified.data);
 return reply({next:data.type==='recovery'?'reset':'signed_in'});
 }
 if(data.action==='reset'){
 const token=jar.get(recoveryCookie)?.value;if(!token)return reply({error:'Request a new recovery link.'},401);
 const response=await supa('/auth/v1/user',{method:'PUT',body:JSON.stringify({password:data.password})},token);
 if(!response.ok)return reply({error:'Could not change the password. Request a new link or try another password.'},400);
 jar.set(recoveryCookie,'',{...recoveryOptions,maxAge:0});await supa('/auth/v1/logout?scope=global',{method:'POST'},token);
 jar.delete('hf_access');jar.delete('hf_refresh');return reply({message:'Password changed. Sign in with your new password.'});
 }
 const auth=await session();if(!auth)return reply({error:'Please sign in again.'},401);
 // Credential changes and deletion require fresh password verification.
 const check=await supa('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email:auth.user.email,password:data.current_password})});
 if(!check.ok)return reply({error:'Current password is incorrect.'},403);
 const fresh=authSession.safeParse(await check.json());if(!fresh.success||fresh.data.user.id!==auth.user.id)return reply({error:'Request rejected.'},403);
 if(data.action==='change_password'){
 const response=await supa('/auth/v1/user',{method:'PUT',body:JSON.stringify({password:data.password})},fresh.data.access_token);if(!response.ok)return reply({error:'Could not change the password.'},400);
 await supa('/auth/v1/logout?scope=global',{method:'POST'},fresh.data.access_token);jar.delete('hf_access');jar.delete('hf_refresh');return reply({message:'Password changed. Sign in with your new password.'});
 }
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!key)return reply({error:'Account deletion is awaiting server setup.'},503);
 const response=await fetch(config().url+'/auth/v1/admin/users/'+auth.user.id,{method:'DELETE',headers:{apikey:key,Authorization:'Bearer '+key},cache:'no-store',signal:AbortSignal.timeout(15000)});
 if(!response.ok)return reply({error:'Could not delete the account. Please try again.'},503);
 jar.delete('hf_access');jar.delete('hf_refresh');return reply({message:'Account deleted.'});
 }catch{return reply({error:'Account service is unavailable. Please try again.'},503);}
}
