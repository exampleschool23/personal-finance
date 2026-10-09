// Stand-ins for what the scheduled Telegram messages read and write: an owner's records through the two reads of
// ownerRecordsSince (lib/telegram-owner.ts), and the delivery claims of migration 129.
const cashflow=['Salary','Rent income','Business income','Other income','Rent expense','Living expense','Charity','Other expense'];
/** The rows a finance_records path asks for: one-time cash flow from a day (`frequency=eq.Once&…&date=gte.`), or the
 * holdings and schedules (`or=(…)`) with salaries that settled a schedule before that day. */
export function recordsFor(rows,path){
 const params=new URLSearchParams(path.split('?')[1]);
 const once=row=>row.frequency==='Once'&&cashflow.includes(row.kind);
 if(params.get('frequency')==='eq.Once'){const from=params.get('date').slice(4);return rows.filter(row=>once(row)&&row.date>=from);}
 if(params.has('or')){const from=/date\.lt\.([\d-]+)/.exec(params.get('or'))[1];return rows.filter(row=>!once(row)||(row.kind==='Salary'&&row.income_source_id&&row.date<from));}
 return rows;
}
/** telegram_deliveries: a claim returns the new row, or nothing when the owner already has one for the period. */
export function deliveryTable(rows=[]){
 const key=row=>`${row.user_id}|${row.kind}|${row.period}`;
 return {rows,async write(path,init){
  if(!path.startsWith('/rest/v1/telegram_deliveries'))throw Error('unexpected write '+path);
  if(init.method==='DELETE'){
   const params=new URLSearchParams(path.split('?')[1]),wanted=`${params.get('user_id').slice(3)}|${params.get('kind').slice(3)}|${params.get('period').slice(3)}`;
   rows.splice(0,rows.length,...rows.filter(row=>key(row)!==wanted));return new Response(null,{status:204});
  }
  const row=JSON.parse(init.body);
  if(!init.headers.Prefer.includes('ignore-duplicates'))throw Error('a claim never overwrites');
  if(rows.some(existing=>key(existing)===key(row)))return Response.json([],{status:201});
  rows.push(row);return Response.json([row],{status:201});
 }};
}
