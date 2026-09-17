import { session, supa } from '@/lib/supabase';
import { income, type Entry } from '@/lib/finance';
import type { HistoryEvent } from '@/lib/investment-history';

async function readAll<T>(path: string, token: string): Promise<T[]> {
 const rows: T[] = [];
 for (let offset = 0; ; offset += 500) {
  const response = await supa(`${path}&limit=500&offset=${offset}`, {}, token);
  if (!response.ok) throw new Error('History unavailable');
  const page = await response.json() as T[];
  rows.push(...page);
  if (page.length < 500) return rows;
 }
}
export async function GET() {
 try {
  const auth = await session();
  if (!auth) return Response.json({ error: 'Please sign in again.' }, { status: 401 });
  // Both reads use the signed-in owner's RLS. Only current records enter the chart.
  const records = await readAll<Entry>('/rest/v1/finance_records?kind=in.(Cash,Stock,Crypto,Deposit,Property,Business,Money%20lent,Mortgage,Loan,Debt)&select=*&order=id.asc', auth.token);
  const events: HistoryEvent[] = [];
  for (let offset = 0; offset < records.length; offset += 100) {
   const ids = records.slice(offset, offset + 100).map(record => record.id).join(',');
   events.push(...await readAll<HistoryEvent>(`/rest/v1/investment_history?record_id=in.(${ids})&select=*&order=occurred_on.asc,created_at.asc,id.asc`, auth.token));
  }
  const cashflows = await readAll<Entry>('/rest/v1/finance_records?kind=in.(Salary,Rent%20income,Other%20income,Rent%20expense,Living%20expense,Charity,Other%20expense)&frequency=eq.Once&select=*&order=date.asc,id.asc', auth.token);
  const recurringIncome = await readAll<Entry>('/rest/v1/finance_records?kind=in.(Salary,Rent%20income,Other%20income)&frequency=neq.Once&select=*&order=date.asc,id.asc', auth.token);
  const incomeRecords = [...cashflows.filter(record => income.includes(record.kind)), ...recurringIncome];
  return Response.json({ records, events, cashflows, incomeRecords }, { headers: { 'Cache-Control': 'no-store' } });
 } catch {
  return Response.json({ error: 'Could not load portfolio history.' }, { status: 503 });
 }
}
