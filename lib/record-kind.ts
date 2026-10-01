import { expenses, income, interestKinds, liabilities, type Entry } from './finance';

const unitPriced = (kind: string) => kind === 'Stock' || kind === 'Crypto';
const cashFlow: readonly string[] = [...income, ...expenses];

/** Change a record's category in the form. Fields the new category does not show are reset,
 * so nothing hidden is saved; the amount is kept unless its meaning changes (a unit price is not a balance). */
export function changeRecordKind(entry: Entry, kind: Entry['kind'], today: string): Entry {
 if (kind === entry.kind) return entry;
 return {
  ...entry, kind,
  amount: unitPriced(kind) || unitPriced(entry.kind) ? 0 : entry.amount,
  quantity: unitPriced(kind) ? entry.quantity : 1,
  cost: unitPriced(kind) ? entry.cost : 0,
  rate: [...interestKinds, 'Money lent', ...liabilities].includes(kind) ? entry.rate : 0,
  deposit_compounding: kind === 'Treasury bill' ? 'none' : entry.deposit_compounding,
  ownership_percentage: kind === 'Business' ? entry.ownership_percentage : 100,
  estimated_monthly_income: kind === 'Property' || kind === 'Business' ? entry.estimated_monthly_income : 0,
  estimated_monthly_payment: kind === 'Mortgage' ? entry.estimated_monthly_payment : 0,
  is_investment: kind === 'Cash' ? entry.is_investment : false,
  opened_on: ['Cash', ...interestKinds, 'Stock', 'Crypto', ...liabilities].includes(kind) ? entry.opened_on ?? today : null,
  holding_account_id: null,
  account_id: null,
  end_date: cashFlow.includes(kind) ? entry.end_date : null,
  expense_plan_id: expenses.includes(kind) ? entry.expense_plan_id : null,
  business_id: cashFlow.includes(kind) ? entry.business_id : null,
  date: kind === 'Money lent' ? '' : entry.date || today,
  lent_date: entry.lent_date || today,
 };
}
