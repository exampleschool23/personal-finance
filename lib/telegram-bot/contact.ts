// A phone number shared with the number button: creating an account, or signing back in to one made here.
import type {Language} from '../i18n';
import {normalizePhone} from '../phone';
import type {ServiceDatabase} from '../service-role';
import {createTelegramAccount} from '../telegram-account';
import {mainMenu} from '../telegram-flow';
import {t} from '../telegram-kit';
import type {TelegramSubscription} from '../telegram-link';
import {startOnboarding} from '../telegram-onboarding';
import type {TelegramMessage} from '../telegram';
import {storeDraft} from './drafts';
import {connectedReply,connectedText,ownerLanguage,ownerName,sameSender,subscriptionByChat,subscriptionsWhere} from './owner';
import {webAccountNumber} from './replies';
import type {BotOutcome,TelegramUpdate,Turn} from './types';

const taken='This number is already used with another Telegram account.';
type Say=(language:Language,key:string,keyboard?:TelegramMessage['keyboard'])=>BotOutcome;
/** A linked chat is only told whether the number is already its own. */
async function linkedChat(db:ServiceDatabase,existing:TelegramSubscription,chatId:number,phone:string,say:Say):Promise<BotOutcome>{
 const language=await ownerLanguage(db,existing.user_id),menu=mainMenu(language);
 if(existing.phone===phone)return {replies:[{chat_id:chatId,text:connectedText(language,await ownerName(db,existing.user_id)),keyboard:menu}]};
 if(existing.phone)return say(language,'This chat is already linked to a different number.',menu);
 // Linked from the web: the number is never attached, so a chat linked by deceit cannot turn into a way to sign in to the account.
 return say(language,webAccountNumber,menu);
}
/** The account this Telegram user made here before, if any. An identity left on an account without a number (one
 * unlinked from the app) is stale: it is released so this person can sign up or sign in. */
async function ownAccount(db:ServiceDatabase,own:TelegramSubscription|undefined,now:Date){
 if(!own||own.phone)return own;
 const released=await db.write('/rest/v1/telegram_subscriptions?user_id=eq.'+own.user_id,{method:'PATCH',body:JSON.stringify({telegram_user_id:null,first_name:null,updated_at:now.toISOString()})});
 if(!released.ok)throw Error('Database request failed.');
 return undefined;
}
/** Someone who signed out and returns is signed back in, but only with the same number. */
async function signBackIn({db,chatId,clock}:Turn,own:TelegramSubscription,phone:string,say:()=>BotOutcome):Promise<BotOutcome>{
 if(own.phone!==phone)return say();
 const relinked=await db.write('/rest/v1/telegram_subscriptions?user_id=eq.'+own.user_id,{method:'PATCH',body:JSON.stringify({chat_id:chatId,linked_at:clock.now.toISOString(),updated_at:clock.now.toISOString()})});
 if(!relinked.ok)throw Error('Database request failed.');
 return {replies:[await connectedReply(db,own.user_id,chatId)]};
}
/** A contact the person shared with the button: sign up or sign back in. */
export async function handleContact(turn:Turn,message:NonNullable<TelegramUpdate['message']>,hint:Language):Promise<BotOutcome>{
 const {db,chatId,clock,env}=turn,contact=message.contact!,from=message.from,now=clock.now;
 const say:Say=(language,key,keyboard)=>({replies:[{chat_id:chatId,text:t(language,key),...(keyboard?{keyboard}:{})}]});
 const phone=normalizePhone(contact.phone_number);
 // Only the person's own number counts: Telegram sets the contact's user to the sender when the button was used.
 if(!from?.id||contact.user_id!==from.id||!phone)return say(hint,'Please share your own number with the button.',{contact:t(hint,'Share my number')});
 const existing=await subscriptionByChat(db,chatId);
 if(existing)return sameSender(chatId,from)?linkedChat(db,existing,chatId,phone,say):{replies:[]};
 const [byPhone,byTelegram]=await Promise.all([subscriptionsWhere(db,'phone=eq.'+encodeURIComponent(phone)),subscriptionsWhere(db,'telegram_user_id=eq.'+from.id)]);
 const own=await ownAccount(db,byTelegram[0],now);
 if(own)return signBackIn(turn,own,phone,()=>say(hint,taken));
 if(byPhone.length)return say(hint,taken);
 if(!env.admin||!env.loginSecret)return say(hint,'Registration is not available yet. Please try again later.');
 const created=await createTelegramAccount({db,admin:env.admin,secret:env.loginSecret},{chatId,telegramUserId:from.id,phone,firstName:from.first_name??contact.first_name??'',language:hint,now});
 if('exists' in created)return say(hint,taken);
 const started=startOnboarding(hint,chatId);
 await storeDraft(db,created.userId,started.draft,now);
 return {replies:[{chat_id:chatId,text:t(hint,'Account created. Let us set up a few things.'),keyboard:{remove:true}},...(started.reply?[started.reply]:[])]};
}
