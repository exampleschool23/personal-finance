import { expenses, income, interestKinds, liabilities, simpleInterestKinds, unitPricedKinds, type Entry } from './finance';

const unitPriced = (kind: string) => unitPricedKinds.includes(kind);
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
  deposit_compounding: simpleInterestKinds.includes(kind) ? 'none' : entry.deposit_compounding,
  // A metal holding starts as gold bullion in grams; other kinds carry no metal fields (cleared only where they were set).
  metal: kind === 'Precious metals' ? entry.metal ?? 'XAU' : entry.metal == null ? undefined : null,
  metal_unit: kind === 'Precious metals' ? entry.metal_unit ?? 'g' : entry.metal_unit == null ? undefined : null,
  metal_purity: kind === 'Precious metals' ? entry.metal_purity ?? 0.9999 : entry.metal_purity == null ? undefined : null,
  ownership_percentage: kind === 'Business' ? entry.ownership_percentage : 100,
  estimated_monthly_income: kind === 'Property' || kind === 'Business' ? entry.estimated_monthly_income : 0,
  estimated_monthly_payment: kind === 'Mortgage' ? entry.estimated_monthly_payment : 0,
  is_investment: kind === 'Cash' ? entry.is_investment : false,
  opened_on: ['Cash', ...interestKinds, ...unitPricedKinds, ...liabilities].includes(kind) ? entry.opened_on ?? today : null,
  holding_account_id: null,
  account_id: null,
  end_date: cashFlow.includes(kind) ? entry.end_date : null,
  expense_plan_id: expenses.includes(kind) ? entry.expense_plan_id : null,
  // Profile fields belong to a Business record; they are cleared only where they were set, so older databases accept the save.
  business_id: kind === 'Business' ? null : entry.business_id,
  business_structure: kind === 'Business' ? entry.business_structure : entry.business_structure == null ? undefined : null,
  business_color: kind === 'Business' ? entry.business_color : entry.business_color == null ? undefined : null,
  business_logo: kind === 'Business' ? entry.business_logo : entry.business_logo == null ? undefined : null,
  date: kind === 'Money lent' ? '' : entry.date || today,
  lent_date: entry.lent_date || today,
 };
}
