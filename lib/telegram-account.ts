// Accounts created in Telegram. A person who shares their own number gets a
// Supabase user with the phone already confirmed. Nothing here sends SMS: the
// sign-in code travels through the Telegram chat, and the password below is
// derived from a server secret so "Open in browser" and the Mini App can sign
// the same person in without ever storing or showing a credential.
import {createHash,createHmac,randomBytes} from 'node:crypto';
import {serviceKeyHeaders,type ServiceDatabase} from './service-role';
export const loginTokenMinutes=5;
/** The password of an account created in Telegram. Derived, never stored or shown, and recomputed whenever the server signs that person in. */
export const derivedPassword=(secret:string,telegramUserId:number)=>createHmac('sha256',secret).update('hoggish-telegram-login:'+telegramUserId).digest('hex');
export type NewPhoneUser={phone:string;password:string;metadata:Record<string,unknown>};
export type AdminAccounts={
 createPhoneUser:(input:NewPhoneUser)=>Promise<{id:string}|{exists:true}>;
 setUserPhone:(userId:string,phone:string)=>Promise<boolean>;
 deleteUser:(userId:string)=>Promise<void>;
};
const failureCode=async(response:Response)=>(await response.json().catch(()=>({})) as {error_code?:string}).error_code;
/** The Supabase Auth admin calls the bot needs, or null when the server key is not configured. */
export function adminAccounts(env:Record<string,string|undefined>=process.env,fetcher:typeof fetch=fetch):AdminAccounts|null{
 const key=env.SUPABASE_SERVICE_ROLE_KEY,url=env.SUPABASE_URL;
 if(!key||!url)return null;
 const headers={...serviceKeyHeaders(key),'Content-Type':'application/json'};
 const call=(path:string,method:string,body?:unknown)=>fetcher(url+path,{method,headers,...(body===undefined?{}:{body:JSON.stringify(body)}),cache:'no-store',signal:AbortSignal.timeout(15000)});
 return {
  async createPhoneUser({phone,password,metadata}){
   const response=await call('/auth/v1/admin/users','POST',{phone,password,phone_confirm:true,user_metadata:metadata});
   if(response.ok){const user=await response.json() as {id?:string};if(!user.id)throw Error('Account creation failed.');return {id:user.id};}
   if(response.status===422&&await failureCode(response)==='phone_exists')return {exists:true as const};
   throw Error('Account creation failed.');
  },
  async setUserPhone(userId,phone){
   const response=await call('/auth/v1/admin/users/'+userId,'PUT',{phone,phone_confirm:true});
   if(response.ok)return true;
   if(response.status===422&&await failureCode(response)==='phone_exists')return false;
   throw Error('Could not save the phone number.');
  },
  async deleteUser(userId){await call('/auth/v1/admin/users/'+userId,'DELETE').catch(()=>null);},
 };
}
export type TelegramPerson={chatId:number;telegramUserId:number;phone:string;firstName:string;language:string;now:Date};
/** Create the account, its preferences and its linked chat. Resolves to `exists` when the number already has an account, and removes the new user again if a later write fails. */
export async function createTelegramAccount(deps:{db:ServiceDatabase;admin:AdminAccounts;secret:string},person:TelegramPerson):Promise<{userId:string}|{exists:true}>{
 const created=await deps.admin.createPhoneUser({phone:person.phone,password:derivedPassword(deps.secret,person.telegramUserId),metadata:{telegram_user_id:person.telegramUserId,first_name:person.firstName.slice(0,80)}});
 if('exists' in created)return created;
 const userId=created.id,at=person.now.toISOString();
 try{
  const preferences=await deps.db.write('/rest/v1/user_preferences?on_conflict=user_id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates'},body:JSON.stringify({user_id:userId,language:person.language,currencies:['USD'],display_name:person.firstName.trim().slice(0,80)})});
  if(!preferences.ok)throw Error('Database request failed.');
  const subscription=await deps.db.write('/rest/v1/telegram_subscriptions?on_conflict=user_id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates'},body:JSON.stringify({user_id:userId,chat_id:person.chatId,telegram_user_id:person.telegramUserId,phone:person.phone,first_name:person.firstName.trim().slice(0,80)||null,linked_at:at,consented_at:at,digest_enabled:true,actions_enabled:true,updated_at:at})});
  if(!subscription.ok)throw Error('Database request failed.');
 }catch(error){await deps.admin.deleteUser(userId);throw error;}
 return {userId};
}
/** Single-use tokens are stored only as this hash. */
export const hashToken=(token:string)=>createHash('sha256').update(token).digest('hex');
/** A single-use token for the "Open in browser" button. Only its hash is stored. */
export async function createLoginToken(db:ServiceDatabase,userId:string,now:Date){
 const token=randomBytes(32).toString('hex');
 const response=await db.write('/rest/v1/telegram_login_tokens',{method:'POST',body:JSON.stringify({token_hash:hashToken(token),user_id:userId,expires_at:new Date(now.getTime()+loginTokenMinutes*60000).toISOString()})});
 if(!response.ok)throw Error('Database request failed.');
 return token;
}
/** Spend a token. Returns the owner it belonged to, or null when it is unknown, expired or already used. The update is atomic, so two requests cannot both win. */
export async function consumeLoginToken(db:ServiceDatabase,token:unknown,now:Date):Promise<string|null>{
 if(typeof token!=='string'||!/^[0-9a-f]{64}$/.test(token))return null;
 const response=await db.write(`/rest/v1/telegram_login_tokens?token_hash=eq.${hashToken(token)}&used_at=is.null&expires_at=gt.${encodeURIComponent(now.toISOString())}`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({used_at:now.toISOString()})});
 if(!response.ok)throw Error('Database request failed.');
 const rows=await response.json() as Array<{user_id:string}>;
 return rows[0]?.user_id??null;
}
