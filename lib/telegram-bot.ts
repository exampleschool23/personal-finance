// What the bot does with each Telegram update. Pure apart from the database
// handed in, so tests drive it with a fake. Every reply is in the owner's
// saved language; an unlinked chat only ever learns how to connect. Linked
// chats add records through the button flow in telegram-flow.ts, saved by the
// owner-scoped wrappers from migration 077.
import {actionMessage,type ActionEvent,type ActionLookup} from './action-messages';
import {depositToday} from './deposit-interest';
import {digestMessage} from './digest-message';
import type {Entry} from './finance';
import {translate,isLanguage,detectLanguage,type Language} from './i18n';
import {upcomingPayments,type Category,type Occurrence} from './planning';
import {planningSchemas} from './planning-schemas';
import {recordSchema} from './record-schema';
import type {ServiceDatabase} from './service-role';
import {advance,mainMenu,type Commit,type Draft,type FlowContext,type FlowKind,type Step} from './telegram-flow';
import {linkExpired,startCode,type TelegramSubscription} from './telegram-link';
import type {TelegramMessage} from './telegram';
export type TelegramUpdate={update_id?:number;message?:{message_id?:number;chat:{id:number};text?:string;from?:{language_code?:string}};callback_query?:{id:string;data?:string;message?:{chat:{id:number}};from?:{language_code?:string}}};
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
const connectedText=(language:Language)=>t(language,'Connected. You will get a morning digest of upcoming payments and a message after every saved action.');
async function connect(db:ServiceDatabase,chatId:number,code:string,now:Date,hint:Language):Promise<TelegramMessage>{
 const rows=await db.read<TelegramSubscription[]>('/rest/v1/telegram_subscriptions?select=*&link_code=eq.'+code);
 const pending=rows[0];
 if(!pending||linkExpired(pending,now))return {chat_id:chatId,text:t(hint,'This link has expired. Open Settings in the app and press Connect to Telegram again.')};
 // A chat can serve one owner: an earlier owner of this chat is unlinked first.
 const earlier=await subscriptionByChat(db,chatId);
 if(earlier&&earlier.user_id!==pending.user_id){const cleared=await db.write('/rest/v1/telegram_subscriptions?user_id=eq.'+earlier.user_id,{method:'PATCH',body:JSON.stringify({chat_id:null,linked_at:null,updated_at:now.toISOString()})});if(!cleared.ok)throw Error('Database request failed.');}
 const saved=await db.write('/rest/v1/telegram_subscriptions?user_id=eq.'+pending.user_id+'&link_code=eq.'+code,{method:'PATCH',body:JSON.stringify({chat_id:chatId,link_code:null,link_code_expires_at:null,linked_at:now.toISOString(),updated_at:now.toISOString()})});
 if(!saved.ok)throw Error('Database request failed.');
 const language=await ownerLanguage(db,pending.user_id);
 return {chat_id:chatId,text:connectedText(language),keyboard:mainMenu(language)};
}
async function disconnect(db:ServiceDatabase,subscription:TelegramSubscription,now:Date):Promise<TelegramMessage>{
 const language=await ownerLanguage(db,subscription.user_id);
 const cleared=await db.write('/rest/v1/telegram_subscriptions?user_id=eq.'+subscription.user_id,{method:'PATCH',body:JSON.stringify({chat_id:null,linked_at:null,updated_at:now.toISOString()})});
 if(!cleared.ok)throw Error('Database request failed.');
 await db.write('/rest/v1/telegram_drafts?user_id=eq.'+subscription.user_id,{method:'DELETE'});
 return {chat_id:subscription.chat_id!,text:t(language,'Disconnected. Open Settings in the app to connect again.'),keyboard:{remove:true}};
}
async function loadDraft(db:ServiceDatabase,owner:string,now:Date):Promise<Draft|null>{
 const rows=await db.read<Array<{step:string;data:Draft['data'];updated_at:string}>>('/rest/v1/telegram_drafts?select=step,data,updated_at&user_id=eq.'+owner);
 const row=rows[0];
 if(!row||now.getTime()-Date.parse(row.updated_at)>draftMinutes*60000)return null;
 const [kind,step]=row.step.split(':');
 return {kind:kind as FlowKind,step:step as Step,data:row.data};
}
async function storeDraft(db:ServiceDatabase,owner:string,draft:Draft|null,now:Date){
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
async function converse(db:ServiceDatabase,subscription:TelegramSubscription,chatId:number,input:{text?:string;callback?:string},clock:BotClock):Promise<TelegramMessage[]>{
 const owner=subscription.user_id,language=await ownerLanguage(db,owner);
 const [draft,ctx]=await Promise.all([loadDraft(db,owner,clock.now),loadContext(db,owner,language,clock)]);
 const result=advance(draft,input,ctx,chatId);
 if(result.menu==='upcoming')return [{chat_id:chatId,text:await upcomingReply(db,owner,language,clock.today),keyboard:mainMenu(language)}];
 if(result.draft!==draft)await storeDraft(db,owner,result.draft,clock.now);
 if(result.commit)return [{chat_id:chatId,text:await commitDraft(db,owner,result.commit,ctx),keyboard:mainMenu(language)}];
 return result.reply?[result.reply]:[];
}
const defaultClock=():BotClock=>({now:new Date(),today:depositToday(),newId:()=>globalThis.crypto.randomUUID()});
/** Decide the replies for one update. Throws only on database failure, so the webhook can ask Telegram to retry. */
export async function handleTelegramUpdate(update:TelegramUpdate,db:ServiceDatabase,clock:BotClock=defaultClock()):Promise<BotOutcome>{
 const {now}=clock;
 if(update.callback_query){
  const chatId=update.callback_query.message?.chat.id;
  if(chatId===undefined)return {replies:[],callbackId:update.callback_query.id};
  const subscription=await subscriptionByChat(db,chatId);
  if(!subscription)return {callbackId:update.callback_query.id,replies:[{chat_id:chatId,text:t(fromHint(update.callback_query.from?.language_code),'This chat is not connected. Open Settings in the app and press Connect to Telegram.')}]};
  return {callbackId:update.callback_query.id,replies:await converse(db,subscription,chatId,{callback:update.callback_query.data??''},clock)};
 }
 const message=update.message;
 if(!message)return {replies:[]};
 const chatId=message.chat.id,text=(message.text??'').trim(),hint=fromHint(message.from?.language_code);
 const code=startCode(text);
 if(code)return {replies:[await connect(db,chatId,code,now,hint)]};
 const subscription=await subscriptionByChat(db,chatId);
 if(!subscription)return {replies:[{chat_id:chatId,text:t(hint,'This chat is not connected. Open Settings in the app and press Connect to Telegram.')}]};
 if(/^\/stop(?:@\w+)?$/.test(text))return {replies:[await disconnect(db,subscription,now)]};
 if(/^\/start(?:@\w+)?$/.test(text)){const language=await ownerLanguage(db,subscription.user_id);return {replies:[{chat_id:chatId,text:connectedText(language),keyboard:mainMenu(language)}]};}
 return {replies:await converse(db,subscription,chatId,{text},clock)};
}
