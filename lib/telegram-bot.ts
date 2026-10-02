// What the bot does with each Telegram update. Pure apart from the database
// handed in, so tests drive it with a fake. Every reply is in the owner's
// saved language; an unlinked chat only ever learns how to connect. Linked
// chats add records through the button flow in telegram-flow.ts, saved by the
// owner-scoped wrappers from migration 077.
import {accountOrigin} from './account-access';
import {ownerProfile} from './telegram-owner';
import {actionMessage,type ActionEvent,type ActionLookup} from './action-messages';
import {loadDatedExchangeRate} from './dated-exchange-rate';
import {depositToday} from './deposit-interest';
import {paymentsSection} from './digest-message';
import {expenses,type Entry} from './finance';
import {formatMoney} from './format';
import {translate,isLanguage,detectLanguage,locales,type Language} from './i18n';
import {debtPaymentsFrom,upcomingPayments,type Category,type Occurrence} from './planning';
import {planningSchemas} from './planning-schemas';
import {legalPaths} from './legal';
import {normalizePhone} from './phone';
import {recordSchema} from './record-schema';
import type {ServiceDatabase} from './service-role';
import {adminAccounts,createLoginToken,createTelegramAccount,type AdminAccounts} from './telegram-account';
import {advance,mainMenu,menuChoice,needsRate,prompt,retryKeyboard,withRate,type Commit,type Draft,type FlowContext,type FlowKind,type Step} from './telegram-flow';
import type {TransactionRule} from './transaction-rules';
import {connectMinutes,connectStartPath,createConnectRequest,linkChat} from './telegram-connect';
import {linkExpired,startCode,type TelegramSubscription} from './telegram-link';
import {advanceOnboarding,isOnboardDraft,startOnboarding,type OnboardDraft} from './telegram-onboarding';
import {escapeHtml,type TelegramMessage} from './telegram';
type TelegramFrom={id?:number;first_name?:string;language_code?:string};
export type TelegramUpdate={update_id?:number;message?:{message_id?:number;chat:{id:number};text?:string;from?:TelegramFrom;contact?:{phone_number?:string;user_id?:number;first_name?:string}};callback_query?:{id:string;data?:string;message?:{chat:{id:number}};from?:TelegramFrom}};
/** What the bot needs beyond the database to create accounts and sign people in, and the app's dated exchange rates
 * (ECB, with the Central Bank of Uzbekistan as fallback) for entries in another currency than their account. Missing pieces switch those features off. */
export type RateLookup=(from:string,to:string,date:string)=>Promise<{rate:number;effective_date:string}>;
export type BotEnv={appOrigin:string|null;loginSecret:string|null;admin:AdminAccounts|null;rates?:RateLookup};
export const botEnvFromProcess=():BotEnv=>({appOrigin:accountOrigin(),loginSecret:process.env.TELEGRAM_WEBHOOK_SECRET??null,admin:adminAccounts(),rates:loadDatedExchangeRate});
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
/** What a linked chat is told when its account is deleted on the web: the menu goes, and /start begins again. Read before deleting, because deletion removes the link. */
export async function deletionNotice(db:ServiceDatabase,userId:string):Promise<TelegramMessage|null>{
 const [row]=await db.read<TelegramSubscription[]>('/rest/v1/telegram_subscriptions?select=chat_id&user_id=eq.'+userId);
 if(!row?.chat_id)return null;
 return {chat_id:row.chat_id,text:t(await ownerLanguage(db,userId),'Your Hoggish account was deleted. Send /start to create a new one.'),keyboard:{remove:true}};
}
/** The name saved in the app's Settings; Telegram's own profile name is never used. */
const ownerName=async(db:ServiceDatabase,userId:string)=>(await ownerProfile(db,userId)).name;
async function subscriptionByChat(db:ServiceDatabase,chatId:number){
 const rows=await db.read<TelegramSubscription[]>('/rest/v1/telegram_subscriptions?select=*&chat_id=eq.'+chatId);
 return rows[0];
}
const connectedText=(language:Language,name?:string|null)=>{
 const first=(name??'').trim();
 return first?t(language,'Welcome, {name}! You are connected and will get a morning digest of upcoming payments and a message after every saved action.',{name:escapeHtml(first)}):t(language,'Connected. You will get a morning digest of upcoming payments and a message after every saved action.');
};
/** The "you are connected" message with the main menu, in the owner's language. */
export async function connectedReply(db:ServiceDatabase,owner:string,chatId:number):Promise<TelegramMessage>{
 const language=await ownerLanguage(db,owner);
 return {chat_id:chatId,text:connectedText(language,await ownerName(db,owner)),keyboard:mainMenu(language)};
}
async function connect(db:ServiceDatabase,chatId:number,code:string,now:Date,hint:Language,from?:TelegramFrom):Promise<TelegramMessage>{
 const rows=await db.read<TelegramSubscription[]>('/rest/v1/telegram_subscriptions?select=*&link_code=eq.'+code);
 const pending=rows[0];
 if(!pending||linkExpired(pending,now))return {chat_id:chatId,text:t(hint,'This link has expired. Open Settings in the app and press Connect to Telegram again.')};
 await linkChat(db,pending.user_id,{chatId,telegramUserId:from?.id,firstName:from?.first_name},now);
 return connectedReply(db,pending.user_id,chatId);
}
/** The bot's answer to "I already have an account": a single-use link to sign in on the web, where any sign-in method works. */
async function webSignIn(db:ServiceDatabase,chatId:number,from:TelegramFrom|undefined,language:Language,now:Date,env:BotEnv):Promise<TelegramMessage>{
 if(!env.appOrigin||!from?.id)return {chat_id:chatId,text:t(language,'Registration is not available yet. Please try again later.')};
 const token=await createConnectRequest(db,{chatId,telegramUserId:from.id,firstName:from.first_name??''},now);
 return {chat_id:chatId,text:t(language,'Sign in on the web to connect this chat to your account. The link works for {minutes} minutes.',{minutes:connectMinutes}),keyboard:{inline:[[{text:t(language,'Sign in'),url:`${env.appOrigin}${connectStartPath}?c=${token}`}]]}};
}
/** Sign the chat out. An account that signs in with its number keeps its Telegram identity, so sharing the number returns to it; an account linked from the app is released completely, so the same person can use another account. */
async function signOut(db:ServiceDatabase,subscription:TelegramSubscription,now:Date):Promise<TelegramMessage>{
 const language=await ownerLanguage(db,subscription.user_id);
 const cleared=await db.write('/rest/v1/telegram_subscriptions?user_id=eq.'+subscription.user_id,{method:'PATCH',body:JSON.stringify({chat_id:null,linked_at:null,updated_at:now.toISOString(),...(subscription.phone?{}:{telegram_user_id:null,first_name:null})})});
 if(!cleared.ok)throw Error('Database request failed.');
 await db.write('/rest/v1/telegram_drafts?user_id=eq.'+subscription.user_id,{method:'DELETE'});
 return {chat_id:subscription.chat_id!,text:t(language,'You are signed out. Sad to see you go! 👋 Come back any time: send /start to sign in again. To connect an account you use on the web, open its Settings and press Connect to Telegram.'),keyboard:{remove:true}};
}
type AnyDraft=Draft|OnboardDraft;
async function loadDraft(db:ServiceDatabase,owner:string,now:Date):Promise<AnyDraft|null>{
 const rows=await db.read<Array<{step:string;data:Draft['data'];updated_at:string}>>('/rest/v1/telegram_drafts?select=step,data,updated_at&user_id=eq.'+owner);
 const row=rows[0];
 if(!row)return null;
 const [kind,step]=row.step.split(':');
 // The setup questions never expire: an account that stops halfway must be able to finish later. Record entries do.
 if(kind!=='onboard'&&now.getTime()-Date.parse(row.updated_at)>draftMinutes*60000)return null;
 return kind==='onboard'?{kind:'onboard',step:step as OnboardDraft['step'],data:row.data as OnboardDraft['data']}:{kind:kind as FlowKind,step:step as Step,data:row.data as Draft['data']};
}
async function storeDraft(db:ServiceDatabase,owner:string,draft:AnyDraft|null,now:Date){
 const response=draft
  ?await db.write('/rest/v1/telegram_drafts?on_conflict=user_id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates'},body:JSON.stringify({user_id:owner,step:`${draft.kind}:${draft.step}`,data:draft.data,updated_at:now.toISOString()})})
  :await db.write('/rest/v1/telegram_drafts?user_id=eq.'+owner,{method:'DELETE'});
 if(!response.ok)throw Error('Database request failed.');
}
async function loadContext(db:ServiceDatabase,owner:string,language:Language,clock:BotClock,typed=false):Promise<FlowContext&{records:Entry[]}>{
 const [records,categories,preferences,rules]=await Promise.all([
  db.read<Entry[]>(`/rest/v1/finance_records?select=*&user_id=eq.${owner}&order=name.asc`),
  db.read<Category[]>(`/rest/v1/transaction_categories?select=id,name,direction&user_id=eq.${owner}`),
  db.read<Array<{currencies?:string[]}>>('/rest/v1/user_preferences?select=currencies&user_id=eq.'+owner),
  // Typed text may be an entry, which the owner's rules help categorise. Without the rules table it is guessed from history alone.
  typed?db.read<TransactionRule[]>(`/rest/v1/transaction_rules?select=*&user_id=eq.${owner}&order=created_at.desc`).catch(()=>[]):Promise.resolve([] as TransactionRule[]),
 ]);
 return {language,currencies:preferences[0]?.currencies??[],today:clock.today,newId:clock.newId(),categories,records,rules,accounts:records.filter(record=>record.kind==='Cash'),businesses:records.filter(record=>record.kind==='Business'),liabilities:records.filter(record=>['Loan','Debt','Mortgage'].includes(record.kind))};
}
function commitEvent(commit:Commit):ActionEvent{
 if(commit.type==='record')return {type:'record',created:true,kind:commit.record.kind,name:commit.record.name,amount:commit.record.amount,currency:commit.record.currency,date:commit.record.date||null,frequency:commit.record.frequency,category_id:commit.record.custom_category_id??null};
 const d=commit.data;
 if(commit.action==='transfer')return {type:'transfer',account_id:d.account_id,target_id:d.target_id,amount:d.amount,received:d.received,date:d.date};
 if(commit.action==='repayment')return {type:'repayment',account_id:d.account_id,target_id:d.target_id,amount:d.amount,date:d.date};
 return {type:'mortgage',account_id:d.account_id,target_id:d.target_id,principal:d.amount,interest:d.fee,date:d.date};
}
/** The cash account a save would overdraw, when the amount it takes (in the account's currency) is more than the account holds. */
function overdrawn(commit:Commit,accounts:Entry[]):Entry|undefined{
 const [accountId,debit]=commit.type==='record'?[commit.record.account_id,expenses.includes(commit.record.kind)?commit.record.amount/(commit.record.account_exchange_rate??1):0]:[commit.data.account_id,(commit.action==='mortgage'?commit.data.amount+commit.data.fee:commit.data.amount)/(commit.type==='fxpayment'?commit.rate:1)];
 const account=accounts.find(item=>item.id===accountId);
 return account&&debit>Number(account.amount)?account:undefined;
}
/** Save what the flow produced through the owner-scoped wrappers. Returns the reply text. */
async function commitDraft(db:ServiceDatabase,owner:string,commit:Commit,ctx:FlowContext&{records:Entry[]}):Promise<{text:string;saved:boolean}>{
 const language=ctx.language;
 const failed=(text:string)=>({text,saved:false});
 const invalid=()=>failed(t(language,'Could not save. {reason}',{reason:t(language,'Check the record fields.')}));
 let response:Response;
 if(commit.type==='record'){
  const parsed=recordSchema.safeParse(commit.record);
  if(!parsed.success)return invalid();
  // A converted record carries the rate's day and the account currency beside the rate, as the app's records route adds them.
  response=await db.write('/rest/v1/rpc/telegram_save_finance_record',{method:'POST',body:JSON.stringify({p_owner:owner,p_record:{...parsed.data,...commit.fx}})});
 }else if(commit.type==='fxpayment'){
  const parsed=planningSchemas[commit.action].safeParse(commit.data);
  if(!parsed.success||!(commit.rate>0))return invalid();
  response=await db.write('/rest/v1/rpc/telegram_payment_with_fx',{method:'POST',body:JSON.stringify({p_owner:owner,p_action:commit.action,p_data:parsed.data,p_rate:commit.rate,p_rate_date:commit.rate_date,p_account_currency:commit.account_currency,p_record_currency:commit.record_currency})});
 }else{
  const parsed=planningSchemas[commit.action].safeParse(commit.data);
  if(!parsed.success)return invalid();
  response=await db.write('/rest/v1/rpc/telegram_planning_action',{method:'POST',body:JSON.stringify({p_owner:owner,p_action:commit.action,p_data:parsed.data})});
 }
 if(!response.ok){
  const failure=await response.json().catch(()=>({})) as {code?:string;message?:string};
  // The same wording the app gives: named refusals are relayed, an overdrawn balance and a duplicate are explained.
  const short=overdrawn(commit,ctx.accounts);
  const insufficient=failure.code==='23514'||(failure.code==='P0001'&&/insufficient balance/i.test(failure.message??''));
  const reason=insufficient&&short?t(language,'Insufficient balance: {account} has {amount}.',{account:escapeHtml(short.name),amount:formatMoney(short.amount,short.currency,locales[language])}):failure.code==='P0001'&&failure.message?t(language,failure.message):failure.code==='23514'?t(language,'Insufficient balance or invalid amount.'):failure.code==='23505'?t(language,'This name or payment already exists.'):t(language,'Please try again.');
  return failed(t(language,'Could not save. {reason}',{reason}));
 }
 const lookup:ActionLookup={records:Object.fromEntries(ctx.records.map(record=>[record.id,{name:record.name,kind:record.kind,currency:record.currency}])),goals:{},deleted:{},categories:Object.fromEntries(ctx.categories.map(category=>[category.id,category.name]))};
 return {text:`${t(language,'Saved.')}\n${actionMessage(commitEvent(commit),lookup,language)}`,saved:true};
}
async function upcomingReply(db:ServiceDatabase,owner:string,language:Language,today:string){
 const [records,occurrences,repayments,mortgagePayments]=await Promise.all([
  db.read<Entry[]>(`/rest/v1/finance_records?select=*&user_id=eq.${owner}&order=id.asc`),
  db.read<Occurrence[]>(`/rest/v1/payment_occurrences?select=id,record_id,due_on,status&user_id=eq.${owner}`),
  db.read<Array<{action:string;target_id:string|null;occurred_on:string}>>(`/rest/v1/account_activity?select=action,target_id,occurred_on&action=in.(repayment,mortgage)&user_id=eq.${owner}`),
  db.read<Array<{mortgage_id:string;paid_on:string}>>(`/rest/v1/mortgage_payments?select=mortgage_id,paid_on&user_id=eq.${owner}`),
 ]);
 return paymentsSection(upcomingPayments(records,occurrences,today,undefined,debtPaymentsFrom(repayments,mortgagePayments)),language,today)??t(language,'No payments due in the next 31 days.');
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
 const ctx=await loadContext(db,owner,language,clock,!!input.text);
 const result=advance(draft,input,ctx,chatId);
 // An entry in another currency than its account waits for the day's rate; without one the owner is asked for the converted amount.
 const pair=result.draft?needsRate(result.draft,ctx):null;
 if(result.draft&&pair){
  const quote=env.rates?await env.rates(pair.from,pair.to,pair.date).catch(()=>null):null;
  result.draft=withRate(result.draft,quote);result.reply=prompt(result.draft,ctx,chatId);
 }
 if(result.menu==='upcoming')return [{chat_id:chatId,text:await upcomingReply(db,owner,language,clock.today),keyboard:mainMenu(language)}];
 if(result.draft!==draft)await storeDraft(db,owner,result.draft,clock.now);
 if(result.commit){
  const outcome=await commitDraft(db,owner,result.commit,ctx);
  const resume=result.commit.type==='record'?result.commit.resume:undefined;
  // A new account made from a dead end hands the conversation back to the question that needed it.
  if(outcome.saved&&resume){
   const fresh=await loadContext(db,owner,language,clock);
   await storeDraft(db,owner,resume,clock.now);
   return [{chat_id:chatId,text:outcome.text},prompt(resume,fresh,chatId)];
  }
  // A refused save keeps the answers, so Back can correct the one that was wrong.
  if(!outcome.saved&&draft){
   await storeDraft(db,owner,draft,clock.now);
   return [{chat_id:chatId,text:outcome.text,keyboard:retryKeyboard(draft,ctx)}];
  }
  return [{chat_id:chatId,text:outcome.text,keyboard:mainMenu(language)}];
 }
 return result.reply?[result.reply]:[];
}
/** The first messages a stranger sees: a greeting that also clears a number button left from an earlier visit, then one choice between a new account and an existing one. The terms and privacy policy open in the browser, so they can be read before creating an account. */
const welcome=(chatId:number,language:Language,env:BotEnv):TelegramMessage[]=>[
 {chat_id:chatId,text:t(language,'Welcome to Hoggish. Track your money here in Telegram and in the app.'),keyboard:{remove:true}},
 {chat_id:chatId,text:t(language,'By creating an account you agree to the terms of use and privacy policy of Hoggish.'),keyboard:{inline:[[{text:t(language,'Create an account'),callback_data:'o:agree'}],[{text:t(language,'I already have an account'),callback_data:'o:signin'}],...(env.appOrigin?[[{text:t(language,'Terms of use'),url:env.appOrigin+legalPaths.terms},{text:t(language,'Privacy policy'),url:env.appOrigin+legalPaths.privacy}]]:[])]}},
];
/** The number button, worded for signing up, signing back in, or adding a number to an account linked from the web. */
const contactPrompts={signup:'Share your phone number to create your account. It is also how you sign in on the web.',return:'Share your phone number to sign in again.',add:'Share your phone number so you can also sign in on the web with it.'};
// A linked chat adding its number can change its mind: Cancel brings the main menu back.
const contactRequest=(chatId:number,language:Language,purpose:keyof typeof contactPrompts):TelegramMessage=>({chat_id:chatId,text:t(language,contactPrompts[purpose]),keyboard:{contact:t(language,'Share my number'),...(purpose==='add'?{cancel:t(language,'Cancel')}:{})}});
const subscriptionsWhere=(db:ServiceDatabase,filter:string)=>db.read<TelegramSubscription[]>('/rest/v1/telegram_subscriptions?select=*&'+filter);
/** Who an unlinked chat belongs to. Someone who signed out of an account made here returns to it, so they are spoken to in its language and never asked to create an account again. */
async function stranger(db:ServiceDatabase,from:TelegramFrom|undefined,hint:Language):Promise<{returning:boolean;language:Language}>{
 const [own]=from?.id?await subscriptionsWhere(db,'telegram_user_id=eq.'+from.id):[];
 return own?.phone?{returning:true,language:await ownerLanguage(db,own.user_id)}:{returning:false,language:hint};
}
/** The invitation an unlinked chat gets. A returning person chooses between their number and an account from the web, laid out like the welcome. */
async function invite(db:ServiceDatabase,chatId:number,from:TelegramFrom|undefined,hint:Language,env:BotEnv):Promise<TelegramMessage[]>{
 const {returning,language}=await stranger(db,from,hint);
 if(!returning)return welcome(chatId,language,env);
 return [
  {chat_id:chatId,text:t(language,'Welcome back.'),keyboard:{remove:true}},
  {chat_id:chatId,text:t(language,'Sign in with your number, or with an account you use on the web.'),keyboard:{inline:[[{text:t(language,'Sign in with my number'),callback_data:'o:agree'}],[{text:t(language,'Sign in on the web'),callback_data:'o:signin'}]]}},
 ];
}
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
  if(existing.phone===phone)return {replies:[{chat_id:chatId,text:connectedText(language,await ownerName(db,existing.user_id)),keyboard:menu}]};
  if(existing.phone)return say(language,'This chat is already linked to a different number.',menu);
  if(!env.admin)return say(language,'Registration is not available yet. Please try again later.',menu);
  if((await subscriptionsWhere(db,'phone=eq.'+encodeURIComponent(phone))).length||!await env.admin.setUserPhone(existing.user_id,phone))return say(language,taken,menu);
  const free=!(await subscriptionsWhere(db,'telegram_user_id=eq.'+from.id)).some(row=>row.user_id!==existing.user_id);
  const saved=await db.write('/rest/v1/telegram_subscriptions?user_id=eq.'+existing.user_id,{method:'PATCH',body:JSON.stringify({phone,updated_at:now.toISOString(),...(free?{telegram_user_id:from.id}:{})})});
  if(!saved.ok)throw Error('Database request failed.');
  return say(language,'Your number is saved. You can now sign in on the web with it.',menu);
 }
 const [byPhone,byTelegram]=await Promise.all([subscriptionsWhere(db,'phone=eq.'+encodeURIComponent(phone)),subscriptionsWhere(db,'telegram_user_id=eq.'+from.id)]);
 let own:TelegramSubscription|undefined=byTelegram[0];
 // An identity left on an account without a number (one unlinked from the app) is stale: release it so this person can sign up or sign in.
 if(own&&!own.phone){
  const released=await db.write('/rest/v1/telegram_subscriptions?user_id=eq.'+own.user_id,{method:'PATCH',body:JSON.stringify({telegram_user_id:null,first_name:null,updated_at:now.toISOString()})});
  if(!released.ok)throw Error('Database request failed.');
  own=undefined;
 }
 // Someone who signed out and returns is signed back in, but only with the same number.
 if(own){
  if(own.phone!==phone)return say(hint,taken);
  const relinked=await db.write('/rest/v1/telegram_subscriptions?user_id=eq.'+own.user_id,{method:'PATCH',body:JSON.stringify({chat_id:chatId,linked_at:now.toISOString(),updated_at:now.toISOString()})});
  if(!relinked.ok)throw Error('Database request failed.');
  return {replies:[await connectedReply(db,own.user_id,chatId)]};
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
  if(!subscription){
   const data=update.callback_query.data,from=update.callback_query.from;
   if(data!=='o:agree'&&data!=='o:signin')return {callbackId:update.callback_query.id,replies:await invite(db,chatId,from,hint,env)};
   const {returning,language}=await stranger(db,from,hint);
   return {callbackId:update.callback_query.id,replies:[data==='o:agree'?contactRequest(chatId,language,returning?'return':'signup'):await webSignIn(db,chatId,from,language,now,env)]};
  }
  if(update.callback_query.data==='m:signout')return {callbackId:update.callback_query.id,replies:[await signOut(db,subscription,now)]};
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
 if(!subscription)return {replies:await invite(db,chatId,message.from,hint,env)};
 if(/^\/(?:stop|signout)(?:@\w+)?$/.test(text)||menuChoice(text)==='signout')return {replies:[await signOut(db,subscription,now)]};
 const language=await ownerLanguage(db,subscription.user_id);
 if(/^\/phone(?:@\w+)?$/.test(text))return {replies:[contactRequest(chatId,language,'add')]};
 if(/^\/app(?:@\w+)?$/.test(text)){const open=await openAppReply(db,subscription,chatId,language,now,env);return {replies:open?[open]:[]};}
 if(/^\/start(?:@\w+)?$/.test(text)){
  const draft=await loadDraft(db,subscription.user_id,now);
  // Mid-setup, Start means start over: the questions begin again from the language.
  if(isOnboardDraft(draft)){const restarted=startOnboarding(language,chatId);await storeDraft(db,subscription.user_id,restarted.draft,now);return {replies:restarted.reply?[restarted.reply]:[]};}
  return {replies:[await connectedReply(db,subscription.user_id,chatId)]};
 }
 return {replies:await converse(db,subscription,chatId,{text},clock,env)};
}
