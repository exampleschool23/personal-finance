import {z} from 'zod';
export const password=z.string().min(12).max(128);
const email=z.string().trim().email().max(254);
export const accountAccessSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('signup'),email,password}),
 z.object({action:z.literal('recover'),email}),
 z.object({action:z.literal('verify'),token_hash:z.string().regex(/^[a-zA-Z0-9_-]{20,512}$/),type:z.enum(['email','recovery'])}),
 z.object({action:z.literal('reset'),password}),
 z.object({action:z.literal('change_password'),current_password:z.string().min(1).max(1024),password}),
 z.object({action:z.literal('delete_account'),current_password:z.string().min(1).max(1024),confirmation:z.literal('DELETE')})
]);
export const recoveryCookie='hf_recovery';
export const recoveryOptions={httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax' as const,path:'/api/account-access',maxAge:600};
// Email redirects must come from deployment configuration, never a request Host.
export function accountOrigin(){try{const url=new URL(process.env.APP_ORIGIN??'');if(url.username||url.password||url.pathname!=='/'||url.search||url.hash)return null;if(url.protocol!=='https:'&&!(process.env.NODE_ENV!=='production'&&url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)))return null;return url.origin;}catch{return null;}}
