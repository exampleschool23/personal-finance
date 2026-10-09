import { cookies } from 'next/headers';
import { z } from 'zod';
import { authSession,uuid } from '@/lib/api-validation';
import { workspaceCookie } from '@/lib/household';
import { crossSite,readJson,requestRejected,tooManyAttempts } from '@/lib/api-route';
import { limits,rateLimited } from '@/lib/rate-limit';
import { config,saveSession,session,supa,sameOrigin } from '@/lib/supabase';
import { connectCookie,connectPage,isConnectToken } from '@/lib/telegram-connect';
/** Where to go after signing in: a Telegram chat waiting to be connected returns to its confirmation page, whichever sign-in method was used. */
async function afterSignIn(){return isConnectToken((await cookies()).get(connectCookie)?.value)?{next:connectPage}:{};}
export async function GET(){try{config();const s=await session();if(s)await supa('/rest/v1/rpc/mark_app_started',{method:'POST',body:'{}'},s.token).catch(()=>null);return Response.json({configured:true,user:s?.user?{email:s.user.email||s.user.phone||''}:null,...(s?await afterSignIn():{})});}catch{return Response.json({configured:false,user:null});}}
const credentials=z.object({email:z.string().max(254),password:z.string().max(1024)});
/** The token answer, checked before anything from it is saved: a session with the account's email. */
const passwordSession=authSession.extend({user:z.object({id:uuid,email:z.string().max(254)})});
export async function POST(req:Request){if(!sameOrigin(req))return requestRejected();try{const parsed=credentials.safeParse(await readJson(req));if(!parsed.success)return Response.json({error:'Enter a valid email and password.'},{status:400});const {email,password}=parsed.data;
 // Counted per address and per account, so guessing one password is slow and one visitor cannot lock others out.
 if(await rateLimited(req,'signin',limits.signIn,email))return tooManyAttempts();
 const r=await supa('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email,password})});if(r.status===429)return tooManyAttempts();if(!r.ok)return Response.json({error:'Sign-in failed. Check your email and password.'},{status:401});
 // An answer without a usable session is the provider failing, not the person: nothing is saved.
 const s=passwordSession.safeParse(await r.json().catch(()=>null));if(!s.success)throw Error('Unexpected sign-in answer.');
 await saveSession(s.data);return Response.json({user:{email:s.data.user.email},...await afterSignIn()});}catch{return Response.json({error:'Sign-in is unavailable. Check the Supabase connection.'},{status:503});}}
export async function DELETE(req:Request){if(!sameOrigin(req))return crossSite();const c=await cookies();const token=c.get('hf_access')?.value;if(token)await supa('/auth/v1/logout',{method:'POST'},token).catch(()=>null);c.delete('hf_access');c.delete('hf_refresh');c.delete(workspaceCookie);return Response.json({ok:true});}
