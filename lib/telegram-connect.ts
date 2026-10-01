// Connecting a Telegram chat to an account by signing in on the web. The bot
// hands out a single-use link tied to the chat; whoever signs in on the website
// and confirms becomes the chat's owner. Any sign-in method the site offers
// works, because the page needs only a session. Only token hashes are stored.
import {randomBytes} from 'node:crypto';
import type {ServiceDatabase} from './service-role';
import {hashToken} from './telegram-account';
import type {TelegramSubscription} from './telegram-link';
export const connectMinutes=15;
/** Holds the token while the person signs in, so every sign-in method can return to the confirmation page. */
export const connectCookie='hf_telegram_connect';
export const connectPage='/connect/telegram';
/** The address on the bot's Sign in button. It stores the token in the cookie and opens the confirmation page. */
export const connectStartPath='/api/telegram/connect';
export const isConnectToken=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);
export type ChatPerson={chatId:number;telegramUserId:number;firstName:string};
export type ConnectRequest={chat_id:number;telegram_user_id:number;first_name:string|null};
const table='/rest/v1/telegram_connect_requests';
const failed=()=>{throw Error('Database request failed.');};
/** Start a request for this chat. A chat has one open link at a time, and long-expired requests are swept on the way. */
export async function createConnectRequest(db:ServiceDatabase,person:ChatPerson,now:Date){
 const cleared=await db.write(`${table}?chat_id=eq.${person.chatId}&used_at=is.null`,{method:'DELETE'});
 if(!cleared.ok)failed();
 await db.write(`${table}?expires_at=lt.${encodeURIComponent(new Date(now.getTime()-86400000).toISOString())}`,{method:'DELETE'});
 const token=randomBytes(32).toString('hex');
 const saved=await db.write(table,{method:'POST',body:JSON.stringify({token_hash:hashToken(token),chat_id:person.chatId,telegram_user_id:person.telegramUserId,first_name:person.firstName.trim().slice(0,80)||null,expires_at:new Date(now.getTime()+connectMinutes*60000).toISOString()})});
 if(!saved.ok)failed();
 return token;
}
const open=(token:string,now:Date)=>`${table}?token_hash=eq.${hashToken(token)}&used_at=is.null&expires_at=gt.${encodeURIComponent(now.toISOString())}`;
/** The request behind a token, or null when it is unknown, expired or already used. */
export async function findConnectRequest(db:ServiceDatabase,token:unknown,now:Date):Promise<ConnectRequest|null>{
 if(!isConnectToken(token))return null;
 const rows=await db.read<ConnectRequest[]>(open(token,now).replace('?','?select=chat_id,telegram_user_id,first_name&'));
 return rows[0]??null;
}
/** Spend a request. The update is atomic, so two confirmations cannot both win. */
export async function consumeConnectRequest(db:ServiceDatabase,token:unknown,now:Date):Promise<ConnectRequest|null>{
 if(!isConnectToken(token))return null;
 const response=await db.write(open(token,now),{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({used_at:now.toISOString()})});
 if(!response.ok)failed();
 return (await response.json() as ConnectRequest[])[0]??null;
}
/** Withdraw an unused request, as Cancel on the web page does. */
export async function cancelConnectRequest(db:ServiceDatabase,token:unknown){
 if(!isConnectToken(token))return;
 await db.write(`${table}?token_hash=eq.${hashToken(token)}&used_at=is.null`,{method:'DELETE'});
}
/** Make `owner` the owner of the chat. An earlier owner of the chat is signed out first, as the Sign out button would, and the Telegram user is recorded only when no other account already holds it, so one person is never tied to two owners. */
export async function linkChat(db:ServiceDatabase,owner:string,person:{chatId:number;telegramUserId?:number;firstName?:string},now:Date){
 const at=now.toISOString();
 const [earlier]=await db.read<TelegramSubscription[]>('/rest/v1/telegram_subscriptions?select=*&chat_id=eq.'+person.chatId);
 if(earlier&&earlier.user_id!==owner){const cleared=await db.write('/rest/v1/telegram_subscriptions?user_id=eq.'+earlier.user_id,{method:'PATCH',body:JSON.stringify({chat_id:null,linked_at:null,updated_at:at,...(earlier.phone?{}:{telegram_user_id:null,first_name:null})})});if(!cleared.ok)failed();}
 const taken=person.telegramUserId?await db.read<Array<{user_id:string}>>('/rest/v1/telegram_subscriptions?select=user_id&telegram_user_id=eq.'+person.telegramUserId):[];
 const identity=person.telegramUserId&&!taken.some(row=>row.user_id!==owner)?{telegram_user_id:person.telegramUserId,first_name:(person.firstName??'').trim().slice(0,80)||null}:{};
 const saved=await db.write('/rest/v1/telegram_subscriptions?on_conflict=user_id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates'},body:JSON.stringify({user_id:owner,chat_id:person.chatId,link_code:null,link_code_expires_at:null,linked_at:at,updated_at:at,...identity})});
 if(!saved.ok)failed();
}
