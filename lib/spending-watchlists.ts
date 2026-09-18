import {expenses,type Entry} from './finance';
import type {Watchlist} from './workspace-preferences';
import type {TransactionSplit} from './transaction-tools';
/** Match actual expense records only; selected categories respect split amounts. */
export function watchlistSpending(watchlist:Watchlist,records:Entry[],splits:TransactionSplit[],today:string){
 const month=today.slice(0,7);let spent=0,count=0;
 for(const record of records){if(!expenses.includes(record.kind)||record.frequency!=='Once'||record.currency!==watchlist.currency||record.date.slice(0,7)!==month||record.date>today||!record.name.toLowerCase().includes(watchlist.query.toLowerCase()))continue;
 const parts=splits.filter(s=>s.record_id===record.id);const amount=watchlist.category?(parts.length?parts.filter(s=>s.category_id===watchlist.category).reduce((sum,s)=>sum+Number(s.amount),0):record.custom_category_id===watchlist.category?record.amount:0):record.amount;
 if(amount>0){spent+=amount;count++;}}
 const days=new Date(Date.UTC(Number(today.slice(0,4)),Number(today.slice(5,7)),0)).getUTCDate(),elapsed=Number(today.slice(8));
 return {spent,count,remaining:watchlist.target-spent,projected:elapsed>0?spent/elapsed*days:null,over:spent>watchlist.target};
}
