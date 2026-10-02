import {z} from 'zod';
import {maxPasswordLength,minPasswordLength} from './password-policy';
export const password=z.string().min(minPasswordLength).max(maxPasswordLength);
const email=z.string().trim().email().max(254);
export const accountAccessSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('signup'),email,password}),
 z.object({action:z.literal('recover'),email}),
 z.object({action:z.literal('add_email'),email,password}),
 z.object({action:z.literal('verify'),token_hash:z.string().regex(/^[a-zA-Z0-9_-]{20,512}$/),type:z.enum(['email','recovery'])}),
 z.object({action:z.literal('reset'),password}),
 z.object({action:z.literal('change_password'),current_password:z.string().min(1).max(1024),password}),
 // An account made with a phone number never had a password, so it confirms deletion with DELETE alone.
 z.object({action:z.literal('delete_account'),current_password:z.string().max(1024).optional(),confirmation:z.literal('DELETE')})
]);
export const recoveryCookie='hf_recovery';
export const recoveryOptions={httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax' as const,path:'/api/account-access',maxAge:600};
// Email redirects must come from deployment configuration, never a request Host.
export function accountOrigin(){try{const url=new URL(process.env.APP_ORIGIN??'');if(url.username||url.password||url.pathname!=='/'||url.search||url.hash)return null;if(url.protocol!=='https:'&&!(process.env.NODE_ENV!=='production'&&url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)))return null;return url.origin;}catch{return null;}}
/** What a refused sign-up tells the person: the reasons they can act on, and a plain retry otherwise. */
export function signupError(status:number,code:string){
 if(status===429||code==='over_email_send_rate_limit'||code==='over_request_rate_limit')return 'Too many attempts. Please try again later.';
 if(code==='weak_password')return 'Choose a stronger password. Use at least 8 characters, mixing letters and numbers.';
 if(code==='email_address_invalid')return 'Check the email address.';
 if(code==='user_already_exists'||code==='email_exists')return 'This email already has an account. Sign in or reset your password.';
 if(code==='signup_disabled'||code==='email_provider_disabled'||code==='email_address_not_authorized')return 'Registration by email is not available right now.';
 return 'Could not start registration. Please try again.';
}
