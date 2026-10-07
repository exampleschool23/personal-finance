// A linked chat's conversation: the setup questions until they are answered, then the button flow and its saves.
import type {Entry} from '../finance';
import type {Language} from '../i18n';
import type {Category} from '../planning';
import {ownerRows} from '../owner-rows';
import type {ServiceDatabase} from '../service-role';
import {advance,mainMenu,needsRate,prompt,retryKeyboard,withRate,type Draft,type FlowContext,type FlowResult} from '../telegram-flow';
import type {TelegramSubscription} from '../telegram-link';
import {isOnboardDraft} from '../telegram-onboarding';
import type {TelegramMessage} from '../telegram';
import type {TransactionRule} from '../transaction-rules';
import {loadDraft,storeDraft} from './drafts';
import {onboard} from './onboard';
import {ownerLanguage} from './owner';
import {upcomingReply} from './replies';
import {commitDraft} from './save';
import type {BotClock,FlowInput,Turn} from './types';

type Context=FlowContext&{records:Entry[]};
async function loadContext(db:ServiceDatabase,owner:string,language:Language,clock:BotClock,typed=false):Promise<Context>{
 const [records,categories,preferences,rules]=await Promise.all([
  // Every record, read in pages: a long history must not push accounts or schedules past the first page.
  ownerRows<Entry>(db,'finance_records',owner).then(rows=>rows.sort((a,b)=>a.name.localeCompare(b.name))),
  db.read<Category[]>(`/rest/v1/transaction_categories?select=id,name,direction&user_id=eq.${owner}`),
  db.read<Array<{currencies?:string[]}>>('/rest/v1/user_preferences?select=currencies&user_id=eq.'+owner),
  // Typed text may be an entry, which the owner's rules help categorise. Without the rules table it is guessed from history alone.
  typed?db.read<TransactionRule[]>(`/rest/v1/transaction_rules?select=*&user_id=eq.${owner}&order=created_at.desc`).catch(()=>[]):Promise.resolve([] as TransactionRule[]),
 ]);
 return {language,currencies:preferences[0]?.currencies??[],today:clock.today,newId:clock.newId(),categories,records,rules,accounts:records.filter(record=>record.kind==='Cash'),businesses:records.filter(record=>record.kind==='Business'),liabilities:records.filter(record=>['Loan','Debt','Mortgage'].includes(record.kind))};
}
/** An entry in another currency than its account waits for the day's rate; without one the owner is asked for the converted amount. */
async function withDatedRate({env,chatId}:Turn,result:FlowResult,ctx:Context){
 const pair=result.draft?needsRate(result.draft,ctx):null;
 if(!result.draft||!pair)return;
 const quote=env.rates?await env.rates(pair.from,pair.to,pair.date).catch(()=>null):null;
 result.draft=withRate(result.draft,quote);result.reply=prompt(result.draft,ctx,chatId);
}
/** Saves what the flow produced and says how it went. A new account made from a dead end hands the conversation back
 * to the question that needed it; a refused save keeps the answers, so Back can correct the one that was wrong. */
async function save(turn:Turn,owner:string,result:FlowResult&{commit:NonNullable<FlowResult['commit']>},draft:Draft|null,ctx:Context):Promise<TelegramMessage[]>{
 const {db,chatId,clock}=turn,language=ctx.language;
 const outcome=await commitDraft(db,owner,result.commit,ctx);
 const resume=result.commit.type==='record'?result.commit.resume:undefined;
 if(outcome.saved&&resume){
  const fresh=await loadContext(db,owner,language,clock);
  await storeDraft(db,owner,resume,clock.now);
  return [{chat_id:chatId,text:outcome.text},prompt(resume,fresh,chatId)];
 }
 if(!outcome.saved&&draft){
  await storeDraft(db,owner,draft,clock.now);
  return [{chat_id:chatId,text:outcome.text,keyboard:retryKeyboard(draft,ctx)}];
 }
 return [{chat_id:chatId,text:outcome.text,keyboard:mainMenu(language)}];
}
/** One message or button in a linked chat. */
export async function converse(turn:Turn,subscription:TelegramSubscription,input:FlowInput):Promise<TelegramMessage[]>{
 const {db,chatId,clock}=turn,owner=subscription.user_id,language=await ownerLanguage(db,owner);
 const draft=await loadDraft(db,owner,clock.now);
 // Until the setup questions are answered, the chat only continues them.
 if(isOnboardDraft(draft))return onboard(turn,subscription,draft,input,language);
 const ctx=await loadContext(db,owner,language,clock,!!input.text);
 const result=advance(draft,input,ctx,chatId);
 await withDatedRate(turn,result,ctx);
 if(result.menu==='upcoming')return [{chat_id:chatId,text:await upcomingReply(db,owner,language,clock.today),keyboard:mainMenu(language)}];
 if(result.draft!==draft)await storeDraft(db,owner,result.draft,clock.now);
 if(result.commit)return save(turn,owner,{...result,commit:result.commit},draft,ctx);
 return result.reply?[result.reply]:[];
}
