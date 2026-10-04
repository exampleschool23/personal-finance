import { accountRepaymentEvents, type AccountRepayment, type BenchmarkMovement } from '@/lib/investment-benchmarks';
import { signInAgain } from '@/lib/api-route';
import { pagePath, readAllPages } from '@/lib/owner-rows';
import { session, supa } from '@/lib/supabase';
import { income, type Entry } from '@/lib/finance';
import { trackedKinds, type HistoryEvent } from '@/lib/investment-history';

function readAll<T>(path: string, token: string) { return readAllPages<T>(range => supa(pagePath(path, range), {}, token), 'History unavailable'); }
export async function GET() {
 try {
  const auth = await session();
  if (!auth) return signInAgain();
  // Both reads use the signed-in owner's RLS. Only current records enter the chart.
  const records = await readAll<Entry>(`/rest/v1/finance_records?kind=in.(${trackedKinds.map(encodeURIComponent).join(',')})&select=*&order=id.asc`, auth.token);
  // The remaining reads are independent: run them together rather than one after another.
  const batches: string[] = [];
  for (let offset = 0; offset < records.length; offset += 100) batches.push(records.slice(offset, offset + 100).map(record => record.id).join(','));
  const [history, repayments, cashflows, recurringIncome, movements] = await Promise.all([
   Promise.all(batches.map(ids => readAll<HistoryEvent>(`/rest/v1/investment_history?record_id=in.(${ids})&select=*,account_link:investment_account_links(account_id,amount,account_currency,record_currency,exchange_rate,rate_date)&order=occurred_on.asc,created_at.asc,id.asc`, auth.token))),
   // Repayments saved from Accounts have no Tracker transaction; the chart reads them as one.
   readAll<AccountRepayment>('/rest/v1/account_activity?action=eq.repayment&select=id,action,account_id,target_id,amount,occurred_on,notes,created_at&order=occurred_on.asc,created_at.asc,id.asc', auth.token),
   readAll<Entry>('/rest/v1/finance_records?kind=in.(Salary,Rent%20income,Business%20income,Other%20income,Rent%20expense,Living%20expense,Charity,Other%20expense)&frequency=eq.Once&select=*&order=date.asc,id.asc', auth.token),
   readAll<Entry>('/rest/v1/finance_records?kind=in.(Salary,Rent%20income,Business%20income,Other%20income)&frequency=neq.Once&select=*&order=date.asc,id.asc', auth.token),
   readAll<BenchmarkMovement>('/rest/v1/asset_movements?select=*&order=occurred_on.asc,created_at.asc,id.asc', auth.token),
  ]);
  const events = [...history.flat(), ...accountRepaymentEvents(repayments, records)];
  const incomeRecords = [...cashflows.filter(record => income.includes(record.kind)), ...recurringIncome];
  return Response.json({ records, events, cashflows, incomeRecords, movements }, { headers: { 'Cache-Control': 'no-store' } });
 } catch {
  return Response.json({ error: 'Could not load portfolio history.' }, { status: 503 });
 }
}
