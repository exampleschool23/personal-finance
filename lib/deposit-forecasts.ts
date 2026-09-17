import type { Entry } from './finance';
import type { HistoryEvent } from './investment-history';
import { depositInterest } from './deposit-interest';
import { supa } from './supabase';

// Read through owner RLS and paginate explicitly; never silently use partial histories.
async function readAll<T>(path: string, token: string): Promise<T[]> {
 const rows: T[] = [];
 for (let offset = 0; ; offset += 500) {
  const response = await supa(`${path}&limit=500&offset=${offset}`, {}, token);
  if (!response.ok) throw new Error('Could not load deposit estimates.');
  const page = await response.json() as T[];
  rows.push(...page);
  if (page.length < 500) return rows;
 }
}
export async function depositForecasts(token: string): Promise<Entry[]> {
 const deposits = await readAll<Entry>('/rest/v1/finance_records?kind=eq.Deposit&select=*&order=id.asc', token);
 for (let offset = 0; offset < deposits.length; offset += 100) {
  const batch = deposits.slice(offset, offset + 100);
  const events = await readAll<HistoryEvent>(`/rest/v1/investment_history?record_id=in.(${batch.map(d=>d.id).join(',')})&select=*&order=occurred_on.asc,created_at.asc,id.asc`, token);
  const byRecord = new Map<string, HistoryEvent[]>();
  for (const event of events) { const group = byRecord.get(event.record_id) ?? []; group.push(event); byRecord.set(event.record_id, group); }
  for (const deposit of batch) deposit.estimated_monthly_income = depositInterest(byRecord.get(deposit.id) ?? [], Number(deposit.rate));
 }
 return deposits.map(deposit => ({id:deposit.id,name:deposit.name,kind:deposit.kind,currency:deposit.currency,amount:deposit.amount,quantity:deposit.quantity,cost:deposit.cost,rate:deposit.rate,date:deposit.date,frequency:deposit.frequency,notes:'',estimated_monthly_income:deposit.estimated_monthly_income,record_count:1}));
}
