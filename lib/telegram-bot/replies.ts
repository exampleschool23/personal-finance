// The bot's fixed answers: the welcome and invitation, the number button, web sign-in, signing out, the app link and
// upcoming payments.
import {paymentsSection} from '../digest-message';
import type {Language} from '../i18n';
import {legalPaths} from '../legal';
import {debtPaymentsFrom,upcomingPayments,type Occurrence} from '../planning';
import {ownerRows} from '../owner-rows';
import type {ServiceDatabase} from '../service-role';
import {createLoginToken} from '../telegram-account';
import {connectMinutes,connectStartPath,createConnectRequest,unlinkChat} from '../telegram-connect';
import {t} from '../telegram-kit';
import {createdInTelegram,type TelegramSubscription} from '../telegram-link';
import {ownerRecordsSince} from '../telegram-owner';
import type {TelegramMessage} from '../telegram';
import {ownerLanguage,stranger} from './owner';
import type {BotEnv,TelegramFrom,Turn} from './types';

/** The bot's answer to "I already have an account": a single-use link to sign in on the web, where any sign-in method works. */
export async function webSignIn({db,chatId,clock,env}:Turn,from:TelegramFrom|undefined,language:Language):Promise<TelegramMessage>{
 if(!env.appOrigin||!from?.id)return {chat_id:chatId,text:t(language,'Registration is not available yet. Please try again later.')};
 const token=await createConnectRequest(db,{chatId,telegramUserId:from.id,firstName:from.first_name??''},clock.now);
 return {chat_id:chatId,text:t(language,'Sign in on the web to connect this chat to your account. The link works for {minutes} minutes.',{minutes:connectMinutes}),keyboard:{inline:[[{text:t(language,'Sign in'),url:`${env.appOrigin}${connectStartPath}?c=${token}`}]]}};
}
/** Sign the chat out. An account that signs in with its number keeps its Telegram identity, so sharing the number returns to it; an account linked from the app is released completely, so the same person can use another account. */
export async function signOut(db:ServiceDatabase,subscription:TelegramSubscription,now:Date):Promise<TelegramMessage>{
 const language=await ownerLanguage(db,subscription.user_id);
 await unlinkChat(db,subscription,now);
 await db.write('/rest/v1/telegram_drafts?user_id=eq.'+subscription.user_id,{method:'DELETE'});
 return {chat_id:subscription.chat_id!,text:t(language,'You are signed out. Sad to see you go! 👋 Come back any time: send /start and sign in with your phone number or on the web.'),keyboard:{remove:true}};
}
/** Payments due in the next 31 days, as the morning digest lists them. */
export async function upcomingReply(db:ServiceDatabase,owner:string,language:Language,today:string){
 const [records,occurrences,repayments,mortgagePayments]=await Promise.all([
  // Schedules and debts in full; no cash-flow history, which the payments due never read.
  ownerRecordsSince(db,owner,today),
  ownerRows<Occurrence>(db,'payment_occurrences',owner,'id,record_id,due_on,status'),
  db.read<Array<{action:string;target_id:string|null;occurred_on:string}>>(`/rest/v1/account_activity?select=action,target_id,occurred_on&action=in.(repayment,mortgage)&user_id=eq.${owner}`),
  db.read<Array<{mortgage_id:string;paid_on:string}>>(`/rest/v1/mortgage_payments?select=mortgage_id,paid_on&user_id=eq.${owner}`),
 ]);
 return paymentsSection(upcomingPayments(records,occurrences,today,undefined,debtPaymentsFrom(repayments,mortgagePayments)),language,today)??t(language,'No payments due in the next 31 days.');
}
/** The "your account also works on the web" message. Accounts created in Telegram get one-tap buttons; other accounts get a plain link. */
export async function openAppReply({db,chatId,clock,env}:Turn,subscription:TelegramSubscription,language:Language):Promise<TelegramMessage|null>{
 if(!env.appOrigin)return null;
 const text=t(language,'Your account also works on the web.');
 const createdHere=createdInTelegram(subscription)&&!!env.loginSecret;
 if(!createdHere)return {chat_id:chatId,text,keyboard:{inline:[[{text:t(language,'Open in browser'),url:env.appOrigin}]]}};
 const token=await createLoginToken(db,subscription.user_id,clock.now);
 return {chat_id:chatId,text,keyboard:{inline:[[{text:t(language,'Open app'),web_app:{url:env.appOrigin+'/auth/telegram'}}],[{text:t(language,'Open in browser'),url:`${env.appOrigin}/auth/telegram?t=${token}`}]]}};
}
/** The first messages a stranger sees: a greeting that also clears a number button left from an earlier visit, then one choice between a new account and an existing one. The terms and privacy policy open in the browser, so they can be read before creating an account. */
const welcome=(chatId:number,language:Language,env:BotEnv):TelegramMessage[]=>[
 {chat_id:chatId,text:t(language,'Welcome to Hoggish. Track your money here in Telegram and in the app.'),keyboard:{remove:true}},
 {chat_id:chatId,text:t(language,'By creating an account you agree to the terms of use and privacy policy of Hoggish.'),keyboard:{inline:[[{text:t(language,'Create an account'),callback_data:'o:agree'}],[{text:t(language,'I already have an account'),callback_data:'o:signin'}],...(env.appOrigin?[[{text:t(language,'Terms of use'),url:env.appOrigin+legalPaths.terms},{text:t(language,'Privacy policy'),url:env.appOrigin+legalPaths.privacy}]]:[])]}},
];
/** The number button, worded for signing up or signing back in. A number is never added to an account linked from the web: whoever holds
 * the chat would then receive that account's sign-in codes, and a chat can be linked by someone who tricked the owner into confirming it. */
const contactPrompts={signup:'Share your phone number to create your account. It is also how you sign in on the web.',return:'Share your phone number to sign in again.'};
export const contactRequest=(chatId:number,language:Language,purpose:keyof typeof contactPrompts):TelegramMessage=>({chat_id:chatId,text:t(language,contactPrompts[purpose]),keyboard:{contact:t(language,'Share my number')}});
/** Why an account linked from the web gets no number: signing in by number belongs to accounts made here, and its own web sign-in keeps working. */
export const webAccountNumber='Signing in with a phone number is only for accounts created in Telegram. Keep signing in on the web the way you do now.';
/** The invitation an unlinked chat gets. A returning person chooses between their number and an account from the web, laid out like the welcome. */
export async function invite({db,chatId,env}:Turn,from:TelegramFrom|undefined,hint:Language):Promise<TelegramMessage[]>{
 const {returning,language}=await stranger(db,from,hint);
 if(!returning)return welcome(chatId,language,env);
 return [
  {chat_id:chatId,text:t(language,'Welcome back.'),keyboard:{remove:true}},
  {chat_id:chatId,text:t(language,'Sign in with your number, or with an account you use on the web.'),keyboard:{inline:[[{text:t(language,'Sign in with my number'),callback_data:'o:agree'}],[{text:t(language,'Sign in on the web'),callback_data:'o:signin'}]]}},
 ];
}
