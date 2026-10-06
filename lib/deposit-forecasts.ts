import { interestCompounding, interestKinds, type Entry } from './finance';
import type { HistoryEvent } from './investment-history';
import { depositInterest } from './deposit-interest';
import { supa } from './supabase';
import { pagePath, readAllPages } from './owner-rows';

// Read through owner RLS and paginate explicitly; never silently use partial histories.
function readAll<T>(path:string,token:string){return readAllPages<T>(range=>supa(pagePath(path,range),{},token),'Could not load deposit estimates.');}
/** Monthly interest estimates for every deposit, Treasury bill and bond. `holdings`, when given, are records the caller already
 * read with the same token that include every interest-bearing holding, so they are not read again. */
export async function depositForecasts(token: string, holdings?: readonly Entry[]): Promise<Entry[]> {
 const deposits = holdings ? holdings.filter(record => interestKinds.includes(record.kind)).map(record => ({ ...record })) : await readAll<Entry>(`/rest/v1/finance_records?kind=in.(${interestKinds.map(kind => encodeURIComponent(`"${kind}"`)).join(',')})&select=*&order=id.asc`, token);
 for (let offset = 0; offset < deposits.length; offset += 100) {
  const batch = deposits.slice(offset, offset + 100);
  const events = await readAll<HistoryEvent>(`/rest/v1/investment_history?record_id=in.(${batch.map(d=>d.id).join(',')})&select=*&order=occurred_on.asc,created_at.asc,id.asc`, token);
  const byRecord = new Map<string, HistoryEvent[]>();
  for (const event of events) { const group = byRecord.get(event.record_id) ?? []; group.push(event); byRecord.set(event.record_id, group); }
  for (const deposit of batch) deposit.estimated_monthly_income = depositInterest(byRecord.get(deposit.id) ?? [], Number(deposit.rate), undefined, interestCompounding(deposit));
 }
 return deposits.map(deposit => ({id:deposit.id,name:deposit.name,kind:deposit.kind,currency:deposit.currency,amount:deposit.amount,quantity:deposit.quantity,cost:deposit.cost,rate:deposit.rate,date:deposit.date,frequency:deposit.frequency,notes:'',estimated_monthly_income:deposit.estimated_monthly_income,deposit_compounding:deposit.deposit_compounding,record_count:1}));
}
