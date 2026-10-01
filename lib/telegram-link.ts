// Pure helpers for tying a Telegram chat to an owner. The owner asks Settings
// for a short code, opens the bot with it, and the webhook matches the code.
export const linkCodeLength=8;
export const linkCodeMinutes=10;
const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export type TelegramSubscription={user_id:string;chat_id:number|null;digest_enabled:boolean;actions_enabled:boolean;link_code:string|null;link_code_expires_at:string|null;linked_at:string|null;telegram_user_id?:number|null;phone?:string|null;first_name?:string|null;consented_at?:string|null};
/** What the Settings panel shows; the code never reaches the browser after it is used. */
export type TelegramStatus={configured:boolean;linked:boolean;digest_enabled:boolean;actions_enabled:boolean;bot_username:string|null};
export function generateLinkCode(random:(max:number)=>number){
 let code='';for(let index=0;index<linkCodeLength;index++)code+=alphabet[random(alphabet.length)];return code;
}
export const isLinkCode=(value:unknown):value is string=>typeof value==='string'&&new RegExp(`^[${alphabet}]{${linkCodeLength}}$`).test(value);
export const linkExpiry=(now:Date)=>new Date(now.getTime()+linkCodeMinutes*60000).toISOString();
export const linkExpired=(subscription:Pick<TelegramSubscription,'link_code'|'link_code_expires_at'>,now:Date)=>!subscription.link_code||!subscription.link_code_expires_at||Date.parse(subscription.link_code_expires_at)<=now.getTime();
export const telegramLinkUrl=(botUsername:string,code:string)=>`https://t.me/${botUsername}?start=${code}`;
/** The code from a "/start CODE" message, or null for any other text. */
export function startCode(text:string|undefined){
 const match=/^\/start(?:@\w+)?\s+([A-Za-z0-9]+)\s*$/.exec(text??'');
 const code=match?.[1].toUpperCase();return code&&isLinkCode(code)?code:null;
}
export function subscriptionStatus(subscription:TelegramSubscription|undefined,botUsername:string|null):TelegramStatus{
 return {configured:!!botUsername,linked:!!subscription?.chat_id,digest_enabled:subscription?.digest_enabled??true,actions_enabled:subscription?.actions_enabled??true,bot_username:botUsername};
}
