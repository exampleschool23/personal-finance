// What the bot does with each Telegram update. Pure apart from the database
// handed in, so tests drive it with a fake. Every reply is in the owner's
// saved language; an unlinked chat only ever learns how to connect. Linked
// chats add records through the button flow in telegram-flow.ts, saved by the
// owner-scoped wrappers from migration 077. Its parts live in ./telegram-bot/:
// the owner, drafts, saving, fixed replies, setup, the conversation and contacts.
import {depositToday} from './deposit-interest';
import type {Language} from './i18n';
import type {ServiceDatabase} from './service-role';
import {mainMenu,menuChoice} from './telegram-flow';
import {t} from './telegram-kit';
import {createdInTelegram,type TelegramSubscription} from './telegram-link';
import {isOnboardDraft,startOnboarding} from './telegram-onboarding';
import {handleContact} from './telegram-bot/contact';
import {converse} from './telegram-bot/converse';
import {loadDraft,storeDraft} from './telegram-bot/drafts';
import {connectedReply,fromHint,ownerLanguage,privateChat,sameSender,stranger,subscriptionByChat} from './telegram-bot/owner';
import {contactRequest,invite,openAppReply,signOut,webAccountNumber,webSignIn} from './telegram-bot/replies';
import {botEnvFromProcess,type BotClock,type BotEnv,type BotOutcome,type TelegramUpdate,type Turn} from './telegram-bot/types';
export {connectedReply,deletionNotice,ownerLanguage} from './telegram-bot/owner';
export {botEnvFromProcess} from './telegram-bot/types';
export type {BotClock,BotEnv,BotOutcome,RateLookup,TelegramUpdate} from './telegram-bot/types';

const defaultClock=():BotClock=>({now:new Date(),today:depositToday(),newId:()=>globalThis.crypto.randomUUID()});

/** A button pressed in the chat. An unlinked chat can only start creating an account or sign in on the web. */
async function handleCallback(turn:Turn,query:NonNullable<TelegramUpdate['callback_query']>):Promise<BotOutcome>{
 const {db,chatId,clock}=turn,callbackId=query.id,from=query.from;
 const subscription=await subscriptionByChat(db,chatId),hint=fromHint(from?.language_code);
 if(subscription&&!sameSender(chatId,from))return {replies:[],callbackId};
 if(!subscription){
  const data=query.data;
  if(data!=='o:agree'&&data!=='o:signin')return {callbackId,replies:await invite(turn,from,hint)};
  const {returning,language}=await stranger(db,from,hint);
  return {callbackId,replies:[data==='o:agree'?contactRequest(chatId,language,returning?'return':'signup'):await webSignIn(turn,from,language)]};
 }
 if(query.data==='m:signout')return {callbackId,replies:[await signOut(db,subscription,clock.now)]};
 return {callbackId,replies:await converse(turn,subscription,{callback:query.data??''})};
}

/** /phone: an account made here already signs in with its number, so it is offered the web; an account from the web keeps its own sign-in. */
async function phoneCommand(turn:Turn,subscription:TelegramSubscription,language:Language):Promise<BotOutcome>{
 if(!createdInTelegram(subscription))return {replies:[{chat_id:turn.chatId,text:t(language,webAccountNumber),keyboard:mainMenu(language)}]};
 const open=await openAppReply(turn,subscription,language);
 return {replies:[open??await connectedReply(turn.db,subscription.user_id,turn.chatId)]};
}
/** /start: mid-setup it starts the questions over from the language; otherwise it says the chat is connected. Anything
 * after it, such as an old deep-link code, is ignored: chats link only by phone number or web sign-in. */
async function startCommand({db,chatId,clock}:Turn,subscription:TelegramSubscription,language:Language):Promise<BotOutcome>{
 const draft=await loadDraft(db,subscription.user_id,clock.now);
 if(!isOnboardDraft(draft))return {replies:[await connectedReply(db,subscription.user_id,chatId)]};
 const restarted=startOnboarding(language,chatId);
 await storeDraft(db,subscription.user_id,restarted.draft,clock.now);
 return {replies:restarted.reply?[restarted.reply]:[]};
}
/** A message in a linked chat: the commands, signing out, or the next step of the conversation. */
async function linkedMessage(turn:Turn,subscription:TelegramSubscription,text:string):Promise<BotOutcome>{
 if(/^\/(?:stop|signout)(?:@\w+)?$/.test(text)||menuChoice(text)==='signout')return {replies:[await signOut(turn.db,subscription,turn.clock.now)]};
 const language=await ownerLanguage(turn.db,subscription.user_id);
 if(/^\/phone(?:@\w+)?$/.test(text))return phoneCommand(turn,subscription,language);
 if(/^\/app(?:@\w+)?$/.test(text)){const open=await openAppReply(turn,subscription,language);return {replies:open?[open]:[]};}
 if(/^\/start(?:@\w+)?(?:\s.*)?$/.test(text))return startCommand(turn,subscription,language);
 return {replies:await converse(turn,subscription,{text})};
}

/** Decide the replies for one update. Throws only on database failure, so the webhook can ask Telegram to retry. */
export async function handleTelegramUpdate(update:TelegramUpdate,db:ServiceDatabase,clock:BotClock=defaultClock(),env:BotEnv=botEnvFromProcess()):Promise<BotOutcome>{
 const query=update.callback_query;
 if(query){
  const chatId=query.message?.chat.id;
  if(chatId===undefined||!privateChat(query.message?.chat))return {replies:[],callbackId:query.id};
  return handleCallback({db,chatId,clock,env},query);
 }
 const message=update.message;
 if(!message||!privateChat(message.chat))return {replies:[]};
 const turn:Turn={db,chatId:message.chat.id,clock,env},hint=fromHint(message.from?.language_code);
 if(message.contact)return handleContact(turn,message,hint);
 const subscription=await subscriptionByChat(db,turn.chatId);
 // A chat nobody has linked is invited to create an account.
 if(!subscription)return {replies:await invite(turn,message.from,hint)};
 if(!sameSender(turn.chatId,message.from))return {replies:[]};
 return linkedMessage(turn,subscription,(message.text??'').trim());
}
