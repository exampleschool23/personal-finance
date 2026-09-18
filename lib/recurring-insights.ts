import {expenses,income,type Entry} from './finance';
const normalize=(name:string)=>name.trim().toLowerCase().replace(/\s+/g,' ');
const key=(row:Entry)=>JSON.stringify([normalize(row.name),row.kind,row.currency]);
export function recurringSuggestions(records:Entry[],today:string){
 const scheduled=new Set(records.filter(r=>!r.source_paused&&r.frequency!=='Once'&&(!r.end_date||r.end_date>=today)).map(key));
 const groups=new Map<string,Entry[]>();for(const row of records){if(row.earning_source_id||![...expenses,...income].includes(row.kind)||row.frequency!=='Once'||row.date>today||!row.date||row.operation_id||row.history_event_id||row.mortgage_payment_id||row.movement_id)continue;const id=key(row);if(scheduled.has(id))continue;const list=groups.get(id)??[];list.push(row);groups.set(id,list);}
 return [...groups].flatMap(([id,rows])=>{
  rows.sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));const recent=rows.slice(-4);if(recent.length<3)return [];
  const gaps=recent.slice(1).map((row,index)=>(Date.parse(row.date)-Date.parse(recent[index].date))/86400000);const frequency=gaps.every(n=>n>=25&&n<=35)?'Monthly':gaps.every(n=>n>=350&&n<=380)?'Yearly':null;if(!frequency)return [];
  const last=recent.at(-1)!,previous=recent.at(-2)!;const [year,month,day]=last.date.split('-').map(Number),nextMonth=month-1+(frequency==='Monthly'?1:12);const next=new Date(Date.UTC(year,nextMonth,Math.min(day,new Date(Date.UTC(year,nextMonth+1,0)).getUTCDate()))).toISOString().slice(0,10);
  // Stale patterns are no longer reasonable suggestions for a new schedule.
  if((Date.parse(today)-Date.parse(next))/86400000>(frequency==='Monthly'?35:380))return [];
  return [{id,record:last,frequency:frequency as 'Monthly'|'Yearly',next,changed:previous.amount!==last.amount,previous:previous.amount}];
 });
}
export function suspectedDuplicates(records:Entry[]){
 const groups=new Map<string,Entry[]>();for(const row of records){if(![...expenses,...income].includes(row.kind)||row.frequency!=='Once'||row.operation_id||row.movement_id||row.history_event_id||row.mortgage_payment_id)continue;const id=JSON.stringify([key(row),row.account_id??null,row.date,row.amount]);const list=groups.get(id)??[];list.push(row);groups.set(id,list);}
 return [...groups.values()].filter(rows=>rows.length>1);
}
