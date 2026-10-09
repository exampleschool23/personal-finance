import {expenses,type Entry} from './finance';
import {spendingAmount} from './spending';
import type {Watchlist} from './workspace-preferences';
import type {TransactionSplit} from './transaction-tools';

/** Converts an amount in `from` into the currency the figures are shown in; null without a usable rate. */
export type WatchlistConvert=(amount:number,from:string)=>number|null;

/** What a record spent in the watchlist's category (its split share), or all of it without a category. */
function matchedAmount(watchlist:Watchlist,record:Entry,splits:TransactionSplit[]){
 if(!watchlist.category)return spendingAmount(record);
 const parts=splits.filter(s=>s.record_id===record.id);
 if(parts.length)return parts.filter(s=>s.category_id===watchlist.category).reduce((sum,s)=>sum+Number(s.amount),0);
 return record.custom_category_id===watchlist.category?spendingAmount(record):0;
}

/** Match actual expense records only; selected categories respect split amounts. Records in every currency count,
 * converted by `convert` into the display currency (AGENTS: one currency per screen), as is the target. A record no rate
 * converts is counted in `missing`, never added raw; without a convertible target the remaining figures are null.
 * Without `convert`, figures stay in the watchlist's own currency and other currencies are missing. */
export function watchlistSpending(watchlist:Watchlist,records:Entry[],splits:TransactionSplit[],today:string,convert?:WatchlistConvert){
 const into:WatchlistConvert=convert??((amount,from)=>from===watchlist.currency?amount:null);
 const month=today.slice(0,7),query=watchlist.query.toLowerCase();let spent=0,count=0,missing=0;
 for(const record of records){
  if(!expenses.includes(record.kind)||record.frequency!=='Once'||record.date.slice(0,7)!==month||record.date>today||!record.name.toLowerCase().includes(query))continue;
  const amount=matchedAmount(watchlist,record,splits);
  if(!(amount>0))continue;
  const value=into(amount,record.currency);
  if(value===null){missing++;continue;}
  spent+=value;count++;
 }
 const target=into(watchlist.target,watchlist.currency);
 const days=new Date(Date.UTC(Number(today.slice(0,4)),Number(today.slice(5,7)),0)).getUTCDate(),elapsed=Number(today.slice(8));
 return {spent,count,missing,target,remaining:target===null?null:target-spent,projected:elapsed>0?spent/elapsed*days:null,over:target!==null&&spent>target};
}
