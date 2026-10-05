// Who a chat belongs to, in which language they are spoken to, and the "you are connected" message.
import {isLanguage,detectLanguage,type Language} from '../i18n';
import type {ServiceDatabase} from '../service-role';
import {mainMenu} from '../telegram-flow';
import {t} from '../telegram-kit';
import type {TelegramSubscription} from '../telegram-link';
import {ownerProfile} from '../telegram-owner';
import {escapeHtml,type TelegramMessage} from '../telegram';

const languageOf=(value:unknown):Language=>isLanguage(value)?value:'en';
/** The language Telegram reports for someone not yet signed up, matched to the app's languages. */
export const fromHint=(code:string|undefined):Language=>detectLanguage(code?[code]:[]);
export async function ownerLanguage(db:ServiceDatabase,userId:string){
 const rows=await db.read<Array<{language?:string}>>('/rest/v1/user_preferences?select=language&user_id=eq.'+userId);
 return languageOf(rows[0]?.language);
}
/** The name saved in the app's Settings; Telegram's own profile name is never used. */
export const ownerName=async(db:ServiceDatabase,userId:string)=>(await ownerProfile(db,userId)).name;
export const subscriptionsWhere=(db:ServiceDatabase,filter:string)=>db.read<TelegramSubscription[]>('/rest/v1/telegram_subscriptions?select=*&'+filter);
export async function subscriptionByChat(db:ServiceDatabase,chatId:number){
 return (await subscriptionsWhere(db,'chat_id=eq.'+chatId))[0];
}
export const connectedText=(language:Language,name?:string|null)=>{
 const first=(name??'').trim();
 return first?t(language,'Welcome, {name}! You are connected and will get a morning digest of upcoming payments and a message when you reach a milestone.',{name:escapeHtml(first)}):t(language,'Connected. You will get a morning digest of upcoming payments and a message when you reach a milestone.');
};
/** The "you are connected" message with the main menu, in the owner's language. */
export async function connectedReply(db:ServiceDatabase,owner:string,chatId:number):Promise<TelegramMessage>{
 const language=await ownerLanguage(db,owner);
 return {chat_id:chatId,text:connectedText(language,await ownerName(db,owner)),keyboard:mainMenu(language)};
}
/** What a linked chat is told when its account is deleted on the web: the menu goes, and /start begins again. Read before deleting, because deletion removes the link. */
export async function deletionNotice(db:ServiceDatabase,userId:string):Promise<TelegramMessage|null>{
 const [row]=await db.read<TelegramSubscription[]>('/rest/v1/telegram_subscriptions?select=chat_id&user_id=eq.'+userId);
 if(!row?.chat_id)return null;
 return {chat_id:row.chat_id,text:t(await ownerLanguage(db,userId),'Your Hoggish account was deleted. Send /start to create a new one.'),keyboard:{remove:true}};
}
/** Who an unlinked chat belongs to. Someone who signed out of an account made here returns to it, so they are spoken to in its language and never asked to create an account again. */
export async function stranger(db:ServiceDatabase,from:{id?:number}|undefined,hint:Language):Promise<{returning:boolean;language:Language}>{
 const [own]=from?.id?await subscriptionsWhere(db,'telegram_user_id=eq.'+from.id):[];
 return own?.phone?{returning:true,language:await ownerLanguage(db,own.user_id)}:{returning:false,language:hint};
}
/** Only a private chat is served; a group, supergroup or channel is ignored, so nobody else in it sees or changes the account. */
export const privateChat=(chat:{type?:string}|undefined)=>!chat?.type||chat.type==='private';
/** In a private chat the sender is the chat itself; anything else (a group without its type, a forwarded update) is ignored.
 * Compared with the chat rather than the stored identity, which an older link may have left stale. */
export const sameSender=(chatId:number,from:{id?:number}|undefined)=>!from?.id||from.id===chatId;
