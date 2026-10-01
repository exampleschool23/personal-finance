// What the bot does with each Telegram update. Pure apart from the database
// handed in, so tests drive it with a fake. Every reply is in the owner's
// saved language; an unlinked chat only ever learns how to connect. Linked
// chats add records through the button flow in telegram-flow.ts, saved by the
// owner-scoped wrappers from migration 077.
import {accountOrigin} from './account-access';
import {actionMessage,type ActionEvent,type ActionLookup} from './action-messages';
import {depositToday} from './deposit-interest';
import {digestMessage} from './digest-message';
import type {Entry} from './finance';
import {translate,isLanguage,detectLanguage,type Language} from './i18n';
import {upcomingPayments,type Category,type Occurrence} from './planning';
import {planningSchemas} from './planning-schemas';
import {normalizePhone} from './phone';
import {recordSchema} from './record-schema';
import type {ServiceDatabase} from './service-role';
import {adminAccounts,createLoginToken,createTelegramAccount,type AdminAccounts} from './telegram-account';
import {advance,mainMenu,type Commit,type Draft,type FlowContext,type FlowKind,type Step} from './telegram-flow';
import {linkExpired,startCode,type TelegramSubscription} from './telegram-link';
import {advanceOnboarding,isOnboardDraft,onboardPrompt,startOnboarding,type OnboardDraft} from './telegram-onboarding';
import type {TelegramMessage} from './telegram';
type TelegramFrom={id?:number;first_name?:string;language_code?:string};
export type TelegramUpdate={update_id?:number;message?:{message_id?:number;chat:{id:number};text?:string;from?:TelegramFrom;contact?:{phone_number?:string;user_id?:number;first_name?:string}};callback_query?:{id:string;data?:string;message?:{chat:{id:number}};from?:TelegramFrom}};
/** What the bot needs beyond the database to create accounts and sign people in. Missing pieces switch those features off. */
export type BotEnv={appOrigin:string|null;loginSecret:string|null;admin:AdminAccounts|null};
export const botEnvFromProcess=():BotEnv=>({appOrigin:accountOrigin(),loginSecret:process.env.TELEGRAM_WEBHOOK_SECRET??null,admin:adminAccounts()});
export type BotOutcome={replies:TelegramMessage[];callbackId?:string};
export type BotClock={now:Date;today:string;newId:()=>string};
const draftMinutes=30;
const languageOf=(value:unknown):Language=>isLanguage(value)?value:'en';
const fromHint=(code:string|undefined):Language=>detectLanguage(code?[code]:[]);
const t=(language:Language,key:string,params?:Record<string,string|number>)=>translate(language,key,params);
export async function ownerLanguage(db:ServiceDatabase,userId:string){
 const rows=await db.read<Array<{language?:string}>>('/rest/v1/user_preferences?select=language&user_id=eq.'+userId);
 return languageOf(rows[0]?.language);
}
async function subscriptionByChat(db:ServiceDatabase,chatId:number){
 const rows=await db.read<TelegramSubscription[]>('/rest/v1/telegram_subscriptions?select=*&chat_id=eq.'+chatId);
 return rows[0];
}
const connectedText=(language:Language,name?:string|null)=>{
 const body=t(language,'Connected. You will get a morning digest of upcoming payments and a message after every saved action.'),first=(name??'').trim();
 return first?t(language,'Welcome, {name}! You are connected.',{name:first})+'\n\n'+body:body;
};
async function connect(db:ServiceDatabase,chatId:number,code:string,now:Date,hint:Language,from?:TelegramFrom):Promise<TelegramMessage>{
 const rows=await db.read<TelegramSubscription[]>('/rest/v1/telegram_subscriptions?select=*&link_code=eq.'+code);
 const pending=rows[0];
 if(!pending||linkExpired(pending,now))return {chat_id:chatId,text:t(hint,'This link has expired. Open Settings in the app and press Connect to Telegram again.')};
 // A chat can serve one owner: an earlier owner of this chat is unlinked first.
 const earlier=await subscriptionByChat(db,chatId);
 if(earlier&&earlier.user_id!==pending.user_id){const cleared=await db.write('/rest/v1/telegram_subscriptions?user_id=eq.'+earlier.user_id,{method:'PATCH',body:JSON.stringify({chat_id:null,linked_at:null,updated_at:now.toISOString()})});if(!cleared.ok)throw Error('Database request failed.');}
 // The Telegram user is recorded only when no other account already holds it, so one person cannot be tied to two owners.
 const taken=from?.id?await db.read<Array<{user_id:string}>>('/rest/v1/telegram_subscriptions?select=user_id&telegram_user_id=eq.'+from.id):[];
 const identity=from?.id&&!taken.some(row=>row.user_id!==pending.user_id)?{telegram_user_id:from.id,first_name:(from.first_name??'').trim().slice(0,80)||null}:{};
 const saved=await db.write('/rest/v1/telegram_subscriptions?user_id=eq.'+pending.user_id+'&link_code=eq.'+code,{method:'PATCH',body:JSON.stringify({chat_id:chatId,link_code:null,link_code_expires_at:null,linked_at:now.toISOString(),updated_at:now.toISOString(),...identity})});
 if(!saved.ok)throw Error('Database request failed.');
 const language=await ownerLanguage(db,pending.user_id);
 return {chat_id:chatId,text:connectedText(language,from?.first_name||pending.first_name),keyboard:mainMenu(language)};
}
async function disconnect(db:ServiceDatabase,subscription:TelegramSubscription,now:Date):Promise<TelegramMessage>{
 const language=await ownerLanguage(db,subscription.user_id);
 const cleared=await db.write('/rest/v1/telegram_subscriptions?user_id=eq.'+subscription.user_id,{method:'PATCH',body:JSON.stringify({chat_id:null,linked_at:null,updated_at:now.toISOString()})});
 if(!cleared.ok)throw Error('Database request failed.');
 await db.write('/rest/v1/telegram_drafts?user_id=eq.'+subscription.user_id,{method:'DELETE'});
 return {chat_id:subscription.chat_id!,text:t(language,'Disconnected. Open Settings in the app to connect again.'),keyboard:{remove:true}};
}
type AnyDraft=Draft|OnboardDraft;
async function loadDraft(db:ServiceDatabase,owner:string,now:Date):Promise<AnyDraft|null>{
 const rows=await db.read<Array<{step:string;data:Draft['data'];updated_at:string}>>('/rest/v1/telegram_drafts?select=step,data,updated_at&user_id=eq.'+owner);
 const row=rows[0];
 if(!row||now.getTime()-Date.parse(row.updated_at)>draftMinutes*60000)return null;
 const [kind,step]=row.step.split(':');
 return kind==='onboard'?{kind:'onboard',step:step as OnboardDraft['step'],data:row.data as OnboardDraft['data']}:{kind:kind as FlowKind,step:step as Step,data:row.data as Draft['data']};
}
async function storeDraft(db:ServiceDatabase,owner:string,draft:AnyDraft|null,now:Date){
 const response=draft
  ?await db.write('/rest/v1/telegram_drafts?on_conflict=user_id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates'},body:JSON.stringify({user_id:owner,step:`${draft.kind}:${draft.step}`,data:draft.data,updated_at:now.toISOString()})})
  :await db.write('/rest/v1/telegram_drafts?user_id=eq.'+owner,{method:'DELETE'});
 if(!response.ok)throw Error('Database request failed.');
}
async function loadContext(db:ServiceDatabase,owner:string,language:Language,clock:BotClock):Promise<FlowContext&{records:Entry[]}>{
 const [records,categories]=await Promise.all([
  db.read<Entry[]>(`/rest/v1/finance_records?select=*&user_id=eq.${owner}&order=name.asc`),
  db.read<Category[]>(`/rest/v1/transaction_categories?select=id,name,direction&user_id=eq.${owner}`),
 ]);
 return {language,today:clock.today,newId:clock.newId(),categories,records,accounts:records.filter(record=>record.kind==='Cash'),liabilities:records.filter(record=>['Loan','Debt','Mortgage'].includes(record.kind))};
}
function commitEvent(commit:Commit):ActionEvent{
 if(commit.type==='record')return {type:'record',created:true,kind:commit.record.kind,name:commit.record.name,amount:commit.record.amount,currency:commit.record.currency,date:commit.record.date||null,frequency:commit.record.frequency};
 const d=commit.data;
 if(commit.action==='transfer')return {type:'transfer',account_id:d.account_id,target_id:d.target_id,amount:d.amount,received:d.received,date:d.date};
 if(commit.action==='repayment')return {type:'repayment',account_id:d.account_id,target_id:d.target_id,amount:d.amount,date:d.date};
 return {type:'mortgage',account_id:d.account_id,target_id:d.target_id,principal:d.amount,interest:d.fee,date:d.date};
}
/** Save what the flow produced through the owner-scoped wrappers. Returns the reply text. */
async function commitDraft(db:ServiceDatabase,owner:string,commit:Commit,ctx:FlowContext&{records:Entry[]}):Promise<string>{
 const language=ctx.language;
 const invalid=()=>t(language,'Could not save. {reason}',{reason:t(language,'Check the record fields.')});
 let response:Response;
 if(commit.type==='record'){
  const parsed=recordSchema.safeParse(commit.record);
  if(!parsed.success)return invalid();
  response=await db.write('/rest/v1/rpc/telegram_save_finance_record',{method:'POST',body:JSON.stringify({p_owner:owner,p_record:parsed.data})});
 }else{
  const parsed=planningSchemas[commit.action].safeParse(commit.data);
  if(!parsed.success)return invalid();
  response=await db.write('/rest/v1/rpc/telegram_planning_action',{method:'POST',body:JSON.stringify({p_owner:owner,p_action:commit.action,p_data:parsed.data})});
 }
 if(!response.ok){
  const failure=await response.json().catch(()=>({})) as {code?:string;message?:string};
  return t(language,'Could not save. {reason}',{reason:failure.code==='P0001'&&failure.message?failure.message:t(language,'Please try again.')});
 }
 const lookup:ActionLookup={records:Object.fromEntries(ctx.records.map(record=>[record.id,{name:record.name,kind:record.kind,currency:record.currency}])),goals:{},deleted:{}};
 return `${t(language,'Saved.')}\n${actionMessage(commitEvent(commit),lookup,language)}`;
}
async function upcomingReply(db:ServiceDatabase,owner:string,language:Language,today:string){
 const [records,occurrences]=await Promise.all([
  db.read<Entry[]>(`/rest/v1/finance_records?select=*&user_id=eq.${owner}&order=id.asc`),
  db.read<Occurrence[]>(`/rest/v1/payment_occurrences?select=id,record_id,due_on,status&user_id=eq.${owner}`),
 ]);
 return digestMessage(upcomingPayments(records,occurrences,today),language,today)??t(language,'No payments due in the next 31 days.');
}
/** The "your account also works on the web" message. Accounts created in Telegram get one-tap buttons; other accounts get a plain link. */
async function openAppReply(db:ServiceDatabase,subscription:TelegramSubscription,chatId:number,language:Language,now:Date,env:BotEnv):Promise<TelegramMessage|null>{
 if(!env.appOrigin)return null;
 const text=t(language,'Your account also works on the web.');
 const createdHere=!!subscription.consented_at&&!!subscription.telegram_user_id&&!!env.loginSecret;
 if(!createdHere)return {chat_id:chatId,text,keyboard:{inline:[[{text:t(language,'Open in browser'),url:env.appOrigin}]]}};
 const token=await createLoginToken(db,subscription.user_id,now);
 return {chat_id:chatId,text,keyboard:{inline:[[{text:t(language,'Open app'),web_app:{url:env.appOrigin+'/auth/telegram'}}],[{text:t(language,'Open in browser'),url:`${env.appOrigin}/auth/telegram?t=${token}`}]]}};
}
/** One answer to the setup questions: save what it produced, store the next step and reply. */
async function onboard(db:ServiceDatabase,subscription:TelegramSubscription,chatId:number,draft:OnboardDraft,input:{text?:string;callback?:string},language:Language,clock:BotClock,env:BotEnv):Promise<TelegramMessage[]>{
 const owner=subscription.user_id;
 const result=advanceOnboarding(draft,input,{language},chatId);
 const {effects}=result,replyLanguage=effects.language??language;
 if(effects.account){
  const parsed=recordSchema.safeParse({id:clock.newId(),name:effects.account.name,kind:'Cash',currency:effects.account.currency,amount:effects.account.amount,quantity:1,cost:0,rate:0,date:clock.today,frequency:'Once',notes:'',business_id:null,ownership_percentage:100,estimated_monthly_income:0,estimated_monthly_payment:0});
  const saved=parsed.success?await db.write('/rest/v1/rpc/telegram_save_finance_record',{method:'POST',body:JSON.stringify({p_owner:owner,p_record:parsed.data})}):null;
  // A refused account keeps the conversation where it is, so the answer can be corrected.
  if(!saved?.ok)return [{chat_id:chatId,text:t(language,'Could not save. {reason}',{reason:t(language,'Check the record fields.')})}];
 }
 const patch:Record<string,unknown>={};
 if(effects.language)patch.language=effects.language;
 if(effects.currency)patch.currencies=[effects.currency];
 if(effects.finished)patch.onboarded_at=clock.now.toISOString();
 if(Object.keys(patch).length){const response=await db.write('/rest/v1/user_preferences?user_id=eq.'+owner,{method:'PATCH',body:JSON.stringify(patch)});if(!response.ok)throw Error('Database request failed.');}
 await storeDraft(db,owner,result.draft,clock.now);
 const replies=result.reply?[result.reply]:[];
 if(effects.finished){const open=await openAppReply(db,subscription,chatId,replyLanguage,clock.now,env);if(open)replies.push(open);}
 return replies;
}
async function converse(db:ServiceDatabase,subscription:TelegramSubscription,chatId:number,input:{text?:string;callback?:string},clock:BotClock,env:BotEnv):Promise<TelegramMessage[]>{
 const owner=subscription.user_id,language=await ownerLanguage(db,owner);
 const draft=await loadDraft(db,owner,clock.now);
 // Until the setup questions are answered, the chat only continues them.
 if(isOnboardDraft(draft))return onboard(db,subscription,chatId,draft,input,language,clock,env);
 const ctx=await loadContext(db,owner,language,clock);
 const result=advance(draft,input,ctx,chatId);
 if(result.menu==='upcoming')return [{chat_id:chatId,text:await upcomingReply(db,owner,language,clock.today),keyboard:mainMenu(language)}];
 if(result.draft!==draft)await storeDraft(db,owner,result.draft,clock.now);
 if(result.commit)return [{chat_id:chatId,text:await commitDraft(db,owner,result.commit,ctx),keyboard:mainMenu(language)}];
 return result.reply?[result.reply]:[];
}
const welcome=(chatId:number,language:Language):TelegramMessage=>({chat_id:chatId,text:`${t(language,'Welcome to Hoggish. Track your money here in Telegram and in the app.')}\n\n${t(language,'By continuing you agree to the terms of use and privacy policy of Hoggish.')}`,keyboard:{inline:[[{text:t(language,'I agree'),callback_data:'o:agree'}]]}});
const contactRequest=(chatId:number,language:Language):TelegramMessage=>({chat_id:chatId,text:t(language,'Share your phone number to create your account. It is also how you sign in on the web.'),keyboard:{contact:t(language,'Share my number')}});
const subscriptionsWhere=(db:ServiceDatabase,filter:string)=>db.read<TelegramSubscription[]>('/rest/v1/telegram_subscriptions?select=*&'+filter);
/** A contact the person shared with the button: sign up, sign back in, or add the number to a linked account. */
async function handleContact(db:ServiceDatabase,message:NonNullable<TelegramUpdate['message']>,hint:Language,clock:BotClock,env:BotEnv):Promise<BotOutcome>{
 const chatId=message.chat.id,contact=message.contact!,from=message.from,now=clock.now;
 const say=(language:Language,key:string,keyboard?:TelegramMessage['keyboard']):BotOutcome=>({replies:[{chat_id:chatId,text:t(language,key),...(keyboard?{keyboard}:{})}]});
 const phone=normalizePhone(contact.phone_number);
 // Only the person's own number counts: Telegram sets the contact's user to the sender when the button was used.
 if(!from?.id||contact.user_id!==from.id||!phone)return say(hint,'Please share your own number with the button.',{contact:t(hint,'Share my number')});
 const taken='This number is already used with another Telegram account.';
 const existing=await subscriptionByChat(db,chatId);
 if(existing){
  const language=await ownerLanguage(db,existing.user_id),menu=mainMenu(language);
  if(existing.phone===phone)return {replies:[{chat_id:chatId,text:connectedText(language,existing.first_name||from.first_name),keyboard:menu}]};
  if(existing.phone)return say(language,'This chat is already linked to a different number.',menu);
  if(!env.admin)return say(language,'Registration is not available yet. Please try again later.',menu);
  if((await subscriptionsWhere(db,'phone=eq.'+encodeURIComponent(phone))).length||!await env.admin.setUserPhone(existing.user_id,phone))return say(language,taken,menu);
  const free=!(await subscriptionsWhere(db,'telegram_user_id=eq.'+from.id)).some(row=>row.user_id!==existing.user_id);
  const saved=await db.write('/rest/v1/telegram_subscriptions?user_id=eq.'+existing.user_id,{method:'PATCH',body:JSON.stringify({phone,updated_at:now.toISOString(),...(free?{telegram_user_id:from.id}:{})})});
  if(!saved.ok)throw Error('Database request failed.');
  return say(language,'Your number is saved. You can now sign in on the web with it.',menu);
 }
 const [byPhone,byTelegram]=await Promise.all([subscriptionsWhere(db,'phone=eq.'+encodeURIComponent(phone)),subscriptionsWhere(db,'telegram_user_id=eq.'+from.id)]);
 const own=byTelegram[0];
 // Someone who pressed /stop and returns is signed back in, but only with the same number.
 if(own){
  if(own.phone!==phone)return say(hint,taken);
  const relinked=await db.write('/rest/v1/telegram_subscriptions?user_id=eq.'+own.user_id,{method:'PATCH',body:JSON.stringify({chat_id:chatId,linked_at:now.toISOString(),updated_at:now.toISOString()})});
  if(!relinked.ok)throw Error('Database request failed.');
  const language=await ownerLanguage(db,own.user_id);
  return {replies:[{chat_id:chatId,text:connectedText(language,own.first_name||from.first_name),keyboard:mainMenu(language)}]};
 }
 if(byPhone.length)return say(hint,taken);
 if(!env.admin||!env.loginSecret)return say(hint,'Registration is not available yet. Please try again later.');
 const created=await createTelegramAccount({db,admin:env.admin,secret:env.loginSecret},{chatId,telegramUserId:from.id,phone,firstName:from.first_name??contact.first_name??'',language:hint,now});
 if('exists' in created)return say(hint,taken);
 const started=startOnboarding(hint,chatId);
 await storeDraft(db,created.userId,started.draft,now);
 return {replies:[{chat_id:chatId,text:t(hint,'Account created. Let us set up a few things.'),keyboard:{remove:true}},...(started.reply?[started.reply]:[])]};
}
const defaultClock=():BotClock=>({now:new Date(),today:depositToday(),newId:()=>globalThis.crypto.randomUUID()});
/** Decide the replies for one update. Throws only on database failure, so the webhook can ask Telegram to retry. */
export async function handleTelegramUpdate(update:TelegramUpdate,db:ServiceDatabase,clock:BotClock=defaultClock(),env:BotEnv=botEnvFromProcess()):Promise<BotOutcome>{
 const {now}=clock;
 if(update.callback_query){
  const chatId=update.callback_query.message?.chat.id;
  if(chatId===undefined)return {replies:[],callbackId:update.callback_query.id};
  const subscription=await subscriptionByChat(db,chatId),hint=fromHint(update.callback_query.from?.language_code);
  if(!subscription)return {callbackId:update.callback_query.id,replies:[update.callback_query.data==='o:agree'?contactRequest(chatId,hint):welcome(chatId,hint)]};
  return {callbackId:update.callback_query.id,replies:await converse(db,subscription,chatId,{callback:update.callback_query.data??''},clock,env)};
 }
 const message=update.message;
 if(!message)return {replies:[]};
 const chatId=message.chat.id,text=(message.text??'').trim(),hint=fromHint(message.from?.language_code);
 if(message.contact)return handleContact(db,message,hint,clock,env);
 const code=startCode(text);
 if(code)return {replies:[await connect(db,chatId,code,now,hint,message.from)]};
 const subscription=await subscriptionByChat(db,chatId);
 // A chat nobody has linked is invited to create an account.
 if(!subscription)return {replies:[welcome(chatId,hint)]};
 if(/^\/stop(?:@\w+)?$/.test(text))return {replies:[await disconnect(db,subscription,now)]};
 const language=await ownerLanguage(db,subscription.user_id);
 if(/^\/phone(?:@\w+)?$/.test(text))return {replies:[contactRequest(chatId,language)]};
 if(/^\/app(?:@\w+)?$/.test(text)){const open=await openAppReply(db,subscription,chatId,language,now,env);return {replies:open?[open]:[]};}
 if(/^\/start(?:@\w+)?$/.test(text)){
  const draft=await loadDraft(db,subscription.user_id,now);
  if(isOnboardDraft(draft))return {replies:[onboardPrompt(draft,language,chatId)]};
  return {replies:[{chat_id:chatId,text:connectedText(language,subscription.first_name),keyboard:mainMenu(language)}]};
 }
 return {replies:await converse(db,subscription,chatId,{text},clock,env)};
}
