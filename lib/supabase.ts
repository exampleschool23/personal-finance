import { cookies } from 'next/headers';
import { tokenVerifier } from './supabase-jwt';
import { workspaceCookie, workspaceHeader, workspaceId } from './household';
type AuthSession = {access_token:string;refresh_token:string;expires_in:number;user:{id:string;email:string;phone?:string}};
export function config(){const url=process.env.SUPABASE_URL;const key=process.env.SUPABASE_PUBLISHABLE_KEY;if(!url||!key)throw new Error('Supabase connection is not configured yet.');return {url,key};}
/** The shared workspace this browser has open, from its cookie; null for the person's own or outside a request. */
async function activeWorkspace(){try{return workspaceId((await cookies()).get(workspaceCookie)?.value);}catch{return null;}}
// Signed-in requests name the open workspace; the database checks the caller belongs to it (migration 100).
// A request that sets the header itself, such as personalRequest's empty one, keeps it.
export async function supa(path:string,init:RequestInit={},token?:string){const {url,key}=config();const workspace=token&&!new Headers(init.headers).has(workspaceHeader)?await activeWorkspace():null;return fetch(url+path,{cache:'no-store',signal:AbortSignal.timeout(15000),...init,headers:{apikey:key,'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`} :{}),...(workspace?{[workspaceHeader]:workspace}:{}),...(init.headers instanceof Headers?Object.fromEntries(init.headers):init.headers as Record<string,string>|undefined)}});}
export async function saveSession(s:{access_token:string;refresh_token:string;expires_in:number}){const c=await cookies();const options={httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax' as const,path:'/'};c.set('hf_access',s.access_token,{...options,maxAge:s.expires_in});c.set('hf_refresh',s.refresh_token,{...options,maxAge:60*60*24*30});}
// Access tokens are checked locally against Supabase's published keys; Supabase Auth is asked only when that fails.
let verifier:ReturnType<typeof tokenVerifier>|null=null;
function verifyLocally(token:string){const {url,key}=config();verifier??=tokenVerifier(url+'/auth/v1',{now:Date.now,fetchKeys:async()=>{const r=await fetch(url+'/auth/v1/.well-known/jwks.json',{headers:{apikey:key},signal:AbortSignal.timeout(5000)});if(!r.ok)throw Error('Signing keys are unavailable.');return ((await r.json()) as {keys?:JsonWebKey[]}).keys??[];}});return verifier(token);}
/** The signed-in person, their token and `owner`: whose workspace is open (their own unless they switched to a household). */
export async function session(){const c=await cookies();const owner=(user:{id:string})=>workspaceId(c.get(workspaceCookie)?.value)??user.id;const token=c.get('hf_access')?.value;if(token){const local=await verifyLocally(token);if(local)return {token,user:local,owner:owner(local)};const r=await supa('/auth/v1/user',{},token);if(r.ok){const user=await r.json() as AuthSession["user"];return {token,user,owner:owner(user)};}}const refresh=c.get('hf_refresh')?.value;if(refresh){const r=await supa('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:JSON.stringify({refresh_token:refresh})});if(r.ok){const s=await r.json() as AuthSession;await saveSession(s);return {token:s.access_token,user:s.user,owner:owner(s.user)};}}return null;}
// Mutations refuse other sites by Origin and Sec-Fetch-Site (lib/api-route.ts); cron and webhooks send neither.
export { sameOrigin } from './api-route';
