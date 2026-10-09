// What the background Telegram messages need to know about an owner: language,
// the name to greet them by, and the currency to show amounts in.
import {forEachLimited} from './bounded-concurrency';
import {reportError} from './monitoring';
import {expenses,type Entry} from './finance';
import {isLanguage,type Language} from './i18n';
import {ownerRows,pagePath,readAllPages,readIdPages} from './owner-rows';
import {cashflowKinds,standingRecords} from './planning-reads';
import type {PortfolioSnapshot} from './portfolio-snapshots';
import type {ServiceDatabase} from './service-role';
import type {SendOutcome} from './telegram';
import type {CashFlowExtras,SpendingLink} from './spending';
import {normalizeSplits,type TransactionSplit} from './transaction-tools';
export type OwnerProfile={language:Language;name:string;currency:string};
/** The name is the one saved in the app's Settings. An empty name means "greet without one"; the Telegram profile name is deliberately not used. */
export async function ownerProfile(db:ServiceDatabase,owner:string):Promise<OwnerProfile>{
 const [row]=await db.read<Array<{language?:string;display_name?:string;currencies?:string[]}>>('/rest/v1/user_preferences?select=language,display_name,currencies&user_id=eq.'+owner);
 return {language:isLanguage(row?.language)?row.language:'en',name:(row?.display_name??'').trim(),currency:row?.currencies?.[0]||'USD'};
}
/** The owner's newest daily snapshots, oldest first. */
export async function recentSnapshots(db:ServiceDatabase,owner:string,limit:number){
 const rows=await db.read<PortfolioSnapshot[]>(`/rest/v1/portfolio_snapshots?select=occurred_on,assets,debt,rates,updated_at&user_id=eq.${owner}&order=occurred_on.desc&limit=${limit}`);
 return rows.reverse();
}
/** The columns of one-time income and expenses that the bot and its messages use: totals, categories, the account last
 * used for a name, the Tracker expense a record copies, and the older way a salary settled its schedule. */
export const cashflowColumns='id,name,kind,amount,currency,date,frequency,custom_category_id,account_id,business_id,history_event_id,mortgage_payment_id,payment_principal,payment_interest,income_source_id,income_due_on';
const recordPages=(db:ServiceDatabase,owner:string,filter:string,select:string)=>readIdPages<Entry>(range=>db.read<Entry[]>(`/rest/v1/finance_records?select=${select}&user_id=eq.${owner}&${filter}&order=id.asc&${range}`));
/** An owner's one-time income and expenses dated `from` on, with `cashflowColumns`, paged by id. */
export function ownerCashflowSince(db:ServiceDatabase,owner:string,from:string){
 return recordPages(db,owner,`frequency=eq.Once&kind=in.(${encodeURIComponent(cashflowKinds)})&date=gte.${from}`,cashflowColumns);
}
/** An owner's records as background Telegram work needs them, mirroring planningReadFilters: every holding and schedule
 * in full, and one-time income and expenses only from `from` on. A salary that settled a schedule the older way
 * (income_source_id) is kept whatever its date, because it still marks that due date as paid. A failed page throws. */
export async function ownerRecordsSince(db:ServiceDatabase,owner:string,from:string):Promise<Entry[]>{
 const standing=encodeURIComponent(`(${standingRecords},and(kind.eq.Salary,frequency.eq.Once,income_source_id.not.is.null,date.lt.${from}))`);
 const [kept,recent]=await Promise.all([recordPages(db,owner,'or='+standing,'*'),ownerCashflowSince(db,owner,from)]);
 return [...kept,...recent];
}
/** What marks a loan installment or mortgage payment as paid, for debtPaymentsFrom: repayments in the activity log and
 * the mortgage payments, both paged in full. A failed page throws. */
export function ownerDebtPayments(db:ServiceDatabase,owner:string){
 return Promise.all([
  readAllPages<{action:string;target_id:string|null;occurred_on:string}>(range=>db.read(`/rest/v1/account_activity?select=action,target_id,occurred_on&action=in.(repayment,mortgage)&user_id=eq.${owner}&order=id.asc&${range}`)),
  ownerRows<{mortgage_id:string;paid_on:string}>(db,'mortgage_payments',owner,'mortgage_id,paid_on'),
 ]);
}
/** Records whose splits one request asks for, so the address stays short. */
const splitBatch=100;
type SplitRow=Parameters<typeof normalizeSplits>[0][number];
type LinkRow=Omit<SpendingLink,'investment_history'>&{account?:{currency?:string|null}|null;investment_history:SpendingLink['investment_history']};
/** What lib/spending.ts adds to `records` for spending dated `from` on: the splits of those expense records and the
 * Tracker's expenses on investments, with their account's currency. Narrow columns, bounded by date, paged; a failed page throws. */
export async function ownerSpendingExtras(db:ServiceDatabase,owner:string,from:string,records:readonly Pick<Entry,'id'|'kind'|'frequency'|'date'>[]):Promise<Required<CashFlowExtras>&{splits:TransactionSplit[]}>{
 const ids=records.filter(record=>record.id&&record.frequency==='Once'&&record.date>=from&&expenses.includes(record.kind)).map(record=>record.id);
 const batches=Array.from({length:Math.ceil(ids.length/splitBatch)},(_,index)=>ids.slice(index*splitBatch,(index+1)*splitBatch));
 const [splitPages,links]=await Promise.all([
  Promise.all(batches.map(batch=>readAllPages<SplitRow>(range=>db.read<SplitRow[]>(`/rest/v1/transaction_splits?select=record_id,position,category_id,amount&user_id=eq.${owner}&record_id=in.(${batch.join(',')})&order=record_id.asc,position.asc&${range}`)))),
  readIdPages<LinkRow>(range=>db.read<LinkRow[]>(`/rest/v1/investment_account_links?select=id,account_id,account_currency,amount,account:finance_records!account_id(currency),investment_history!inner(occurred_on,record_id,event_type)&user_id=eq.${owner}&amount=lt.0&investment_history.event_type=eq.expense&investment_history.occurred_on=gte.${from}&order=id.asc&${range}`)),
 ]);
 return {splits:normalizeSplits(splitPages.flat()),investmentLinks:links.map(({account,...link})=>({...link,account_currency:link.account_currency??account?.currency??null}))};
}
/** An owner whose linked chat takes the digest and the weekly recap. */
export type DigestSubscriber={user_id:string;chat_id:number};
/** Owners with a linked private chat and the digest switch on. Private chat ids are positive; a group's are negative and never receive anything. */
export const digestSubscribersPath='/rest/v1/telegram_subscriptions?select=user_id,chat_id&chat_id=not.is.null&digest_enabled=is.true&chat_id=gt.0&order=user_id.asc';
/** A scheduled message: the morning digest of a day, or the weekly recap keyed by the week's last day. */
export type Delivery={kind:'digest'|'recap';period:string};
const deliveries='/rest/v1/telegram_deliveries';
/** Claims an owner's message for the period (migration 129). False when another run already sent it or is sending it. */
async function claimDelivery(db:ServiceDatabase,owner:string,{kind,period}:Delivery){
 const response=await db.write(deliveries+'?on_conflict=user_id,kind,period',{method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=representation'},body:JSON.stringify({user_id:owner,kind,period})});
 if(!response.ok)throw Error('Database request failed.');
 return (await response.json() as unknown[]).length>0;
}
/** Gives a claim back after a failed send, so the next run sends it. A claim that stays would skip the owner for the
 * whole period, so a refused release is reported. */
async function releaseDelivery(db:ServiceDatabase,owner:string,{kind,period}:Delivery){
 const response=await db.write(`${deliveries}?user_id=eq.${owner}&kind=eq.${kind}&period=eq.${period}`,{method:'DELETE'}).catch(()=>null);
 if(!response?.ok)await reportError('telegram-delivery','A Telegram delivery claim was not released, so it is not retried this period.',{counts:{status:response?.status??0}});
}
/** Turns the scheduled messages off for a chat that refuses them for good (the person blocked the bot), so a blocked
 * chat is not retried and counted as a failure every run. The link stays: unblocking and switching the digest back on
 * in Settings restores it. */
async function muteSubscriber(db:ServiceDatabase,{user_id,chat_id}:DigestSubscriber){
 const response=await db.write(`/rest/v1/telegram_subscriptions?user_id=eq.${user_id}&chat_id=eq.${chat_id}`,{method:'PATCH',body:JSON.stringify({digest_enabled:false,updated_at:new Date().toISOString()})});
 if(!response.ok)throw Error('Database request failed.');
}
/** Subscribers handled at once: enough to finish a long list in time, few enough to stay gentle on the database and Telegram. */
export const deliveryConcurrency=8;
/** Runs `deliver` for each digest subscriber who has not had this `delivery` yet and counts the messages Telegram
 * accepted. Each owner's message is claimed before it is built, so a retried or overlapping run never repeats one; a
 * failed one is given back, so a retry sends it. A chat that blocked the bot keeps its claim, has its digest switched
 * off and counts as `blocked`, not as a failure. One owner's failure never blocks the others; only reading the
 * subscribers can throw. `deliver` sends to the subscriber's own linked chat and resolves to whether it arrived, or how
 * the send ended. */
export async function deliverToSubscribers(db:ServiceDatabase,delivery:Delivery,deliver:(subscriber:DigestSubscriber)=>Promise<boolean|SendOutcome>):Promise<{sent:number;failed:number;blocked:number}>{
 let sent=0,failed=0,blocked=0;
 const subscribers=await readAllPages<DigestSubscriber>(range=>db.read<DigestSubscriber[]>(pagePath(digestSubscribersPath,range)));
 await forEachLimited(subscribers,deliveryConcurrency,async subscriber=>{
  try{
   if(!await claimDelivery(db,subscriber.user_id,delivery))return;
   let outcome:SendOutcome='failed';
   try{
    const result=await deliver(subscriber);
    outcome=result===true?'sent':result===false?'failed':result;
    if(outcome==='blocked')await muteSubscriber(db,subscriber);
   }catch(error){outcome='failed';throw error;}
   finally{if(outcome==='failed')await releaseDelivery(db,subscriber.user_id,delivery);}
   if(outcome==='sent')sent++;else if(outcome==='blocked')blocked++;else failed++;
  }catch{failed++;}
 });
 return {sent,failed,blocked};
}
