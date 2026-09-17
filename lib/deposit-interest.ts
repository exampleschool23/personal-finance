import type { HistoryEvent } from './investment-history';

export type DepositCompounding = 'monthly' | 'daily' | 'none';
// Use the account's reporting timezone, independent of the server/browser timezone.
export const depositToday = (now = new Date()) => new Date(now.getTime() + 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
const dayLength = 86400000;

/** Dated deposit projection. Monthly interest uses annual rate / twelve, weighted
 * by calendar days; daily compounding uses actual days in each calendar year.
 * Top-ups and withdrawals apply before that day's interest. Confirmed balance
 * snapshots and capitalized interest replace the estimate, preventing double credit.
 * Calculated interest is a projection, never a mutation of a recorded bank balance.
 */
export function depositProjection(events: HistoryEvent[], annualRate: number, through = depositToday(), compounding: DepositCompounding = 'monthly') {
 const end = Date.parse(through + 'T00:00:00Z');
 const empty = { balance: 0, accrued: 0, total: 0, monthInterest: 0 };
 if (!Number.isFinite(end) || new Date(end).toISOString().slice(0,10)!==through || !Number.isFinite(annualRate) || annualRate<0) return empty;
 const sorted = events.filter(event=>event.balance!==null && event.balance!==undefined && event.occurred_on<=through && Number.isFinite(Number(event.balance)))
  .sort((a,b)=>a.occurred_on.localeCompare(b.occurred_on)||a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id));
 if (!sorted.length) return empty;
 const start = Date.parse(sorted[0].occurred_on+'T00:00:00Z');
 if(!Number.isFinite(start))return empty;
 let balance=0, accrued=0, monthInterest=0, index=0, initialized=false;
 for(let at=start;at<=end;at+=dayLength){
  const date=new Date(at), day=date.toISOString().slice(0,10);
  if(date.getUTCDate()===1){
   if(compounding==='monthly')balance+=accrued;
   accrued=0;monthInterest=0;
  }
  while(index<sorted.length && sorted[index].occurred_on===day){
   const event=sorted[index++];
   if(event.event_type==='withdrawal' && Number(event.balance)===0){
    balance=0;accrued=0;
   }else if(initialized && (event.event_type==='contribution'||event.event_type==='withdrawal') && Number(event.amount)>0){
    balance=Math.max(0,balance+(event.event_type==='contribution'?1:-1)*Number(event.amount));
   }else{
    balance=Number(event.balance);
    // A statement/actual interest credit already includes previously earned interest.
    accrued=0;
   }
   initialized=true;
  }
  const daysInMonth=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();
  const daysInYear=(Date.UTC(date.getUTCFullYear()+1,0,1)-Date.UTC(date.getUTCFullYear(),0,1))/dayLength;
  const interest=balance*annualRate/(compounding==='daily'?100*daysInYear:1200*daysInMonth);
  monthInterest+=interest;
  if(compounding==='daily')balance+=interest;
  else accrued+=interest;
 }
 return {balance,accrued,total:balance+(compounding==='none'?0:accrued),monthInterest};
}

export function depositInterest(events: HistoryEvent[], annualRate: number, month = depositToday().slice(0,7), compounding: DepositCompounding = 'monthly') {
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return 0;
 const end=new Date(month+'-01T00:00:00Z');end.setUTCMonth(end.getUTCMonth()+1);end.setUTCDate(0);
 return depositProjection(events,annualRate,end.toISOString().slice(0,10),compounding).monthInterest;
}
