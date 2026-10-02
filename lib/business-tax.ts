import type { LedgerLine } from './business-report';
import { expenses, income } from './finance';

// A prep sheet that sorts one business's categories into the lines of a sole
// proprietor's profit-or-loss return. It is a worksheet for the person or their
// accountant, not tax advice, and never files anything.

export type TaxLine = { id: string; part: 'income' | 'expense'; label: string; number: string; manual?: boolean };
/** The lines of a sole proprietor's profit-or-loss return. `number` is the line on the US Schedule C; `manual`
 * lines need figures the app does not keep (inventory, depreciation, home office) and are worked out by hand. */
export const taxLines: readonly TaxLine[] = [
 { id: 'gross_receipts', part: 'income', label: 'Gross receipts or sales', number: '1' },
 { id: 'returns', part: 'income', label: 'Returns and allowances', number: '2', manual: true },
 { id: 'cost_of_goods', part: 'income', label: 'Cost of goods sold', number: '4', manual: true },
 { id: 'other_income', part: 'income', label: 'Other business income', number: '6' },
 { id: 'advertising', part: 'expense', label: 'Advertising', number: '8' },
 { id: 'car', part: 'expense', label: 'Car and truck expenses', number: '9' },
 { id: 'commissions', part: 'expense', label: 'Commissions and fees', number: '10' },
 { id: 'contract_labor', part: 'expense', label: 'Contract labor', number: '11' },
 { id: 'depletion', part: 'expense', label: 'Depletion', number: '12', manual: true },
 { id: 'depreciation', part: 'expense', label: 'Depreciation', number: '13', manual: true },
 { id: 'benefits', part: 'expense', label: 'Employee benefit programs', number: '14' },
 { id: 'insurance', part: 'expense', label: 'Insurance (other than health)', number: '15' },
 { id: 'mortgage_interest', part: 'expense', label: 'Mortgage interest', number: '16a' },
 { id: 'other_interest', part: 'expense', label: 'Other interest', number: '16b' },
 { id: 'legal', part: 'expense', label: 'Legal and professional services', number: '17' },
 { id: 'office', part: 'expense', label: 'Office expense', number: '18' },
 { id: 'pension', part: 'expense', label: 'Pension and profit-sharing plans', number: '19' },
 { id: 'rent_equipment', part: 'expense', label: 'Rent or lease: vehicles, machinery and equipment', number: '20a' },
 { id: 'rent_property', part: 'expense', label: 'Rent or lease: other business property', number: '20b' },
 { id: 'repairs', part: 'expense', label: 'Repairs and maintenance', number: '21' },
 { id: 'supplies', part: 'expense', label: 'Supplies', number: '22' },
 { id: 'taxes', part: 'expense', label: 'Taxes and licenses', number: '23' },
 { id: 'travel', part: 'expense', label: 'Travel', number: '24a' },
 { id: 'meals', part: 'expense', label: 'Deductible meals', number: '24b' },
 { id: 'utilities', part: 'expense', label: 'Utilities', number: '25' },
 { id: 'wages', part: 'expense', label: 'Wages', number: '26' },
 { id: 'other_expenses', part: 'expense', label: 'Other expenses', number: '27a' },
 { id: 'home_office', part: 'expense', label: 'Business use of home', number: '30', manual: true },
];
export const taxLineIds = taxLines.map(line => line.id);
/** `general` shows line names only; `schedule_c` adds the US Schedule C line numbers. */
export const taxTemplates = ['general', 'schedule_c'] as const;
export type TaxTemplate = typeof taxTemplates[number];
export const taxTemplateLabels: Record<TaxTemplate, string> = { general: 'Profit or loss lines', schedule_c: 'US Schedule C lines' };
/** The person's choices: the template, and a line (or none) for categories they moved by hand. */
export type TaxSettings = { template: TaxTemplate; lines: Record<string, string | null> };
export const defaultTaxSettings: TaxSettings = { template: 'general', lines: {} };

const keywordLines: Array<[RegExp, string]> = [
 [/advertis|marketing|promotion|\bads?\b/i, 'advertising'],
 [/fuel|gas station|petrol|parking|toll|mileage|\bcar\b|vehicle|truck/i, 'car'],
 [/commission|merchant fee|platform fee|processing fee|\bfees?\b/i, 'commissions'],
 [/contractor|freelanc|contract labou?r|outsourc/i, 'contract_labor'],
 [/insurance/i, 'insurance'],
 [/mortgage/i, 'mortgage_interest'],
 [/interest/i, 'other_interest'],
 [/legal|lawyer|attorney|accountan|bookkeep|professional/i, 'legal'],
 [/office|software|subscription|postage|shipping|stationery/i, 'office'],
 [/equipment rental|lease/i, 'rent_equipment'],
 [/\brent\b/i, 'rent_property'],
 [/repair|maintenance|cleaning/i, 'repairs'],
 [/suppl|materials|inventory|wax|packaging/i, 'supplies'],
 [/\btax(es)?\b|licen[cs]e|permit/i, 'taxes'],
 [/travel|flight|airfare|hotel|lodging/i, 'travel'],
 [/meal|restaurant|dining|food/i, 'meals'],
 [/utilit|electric|water|internet|phone/i, 'utilities'],
 [/wage|payroll|salar/i, 'wages'],
];

/** The line a category goes to before the person moves it: business income to gross receipts (interest and
 * dividends to other income), rent paid to property rent, other spending by the words in its name. Household-only
 * categories stay unmapped. */
export function defaultTaxLine(key: string, name: string, direction: 'income' | 'expense' = income.includes(key) ? 'income' : 'expense'): string | null {
 if (direction === 'income') return key === 'Salary' ? null : /interest|dividend/i.test(name) ? 'other_income' : 'gross_receipts';
 if (key === 'Rent expense') return 'rent_property';
 if (key === 'Other expense') return 'other_expenses';
 if (expenses.includes(key)) return null;
 for (const [pattern, line] of keywordLines) if (pattern.test(name)) return line;
 return null;
}
export function taxLineFor(key: string, name: string, direction: 'income' | 'expense', settings: TaxSettings) {
 const chosen = Object.hasOwn(settings.lines, key) ? settings.lines[key] : defaultTaxLine(key, name, direction);
 const line = taxLines.find(item => item.id === chosen);
 return line && line.part === direction && !line.manual ? line.id : null;
}

export type TaxCategory = { key: string; direction: 'income' | 'expense'; amount: number; transactions: LedgerLine[] };
export type TaxSheetLine = { line: TaxLine; categories: TaxCategory[]; total: number };
/** One business's sheet for a period: its lines with the categories mapped to them, the categories left unmapped,
 * and net profit (mapped income less mapped expenses). `extra` adds categories without transactions, so every
 * category can be organized. */
export function taxSheet(lines: readonly LedgerLine[], settings: TaxSettings, nameOf: (key: string) => string, extra: ReadonlyArray<{ key: string; direction: 'income' | 'expense' }> = []) {
 const categories = new Map<string, TaxCategory>();
 for (const line of lines) {
  const category = categories.get(line.category) ?? { key: line.category, direction: line.direction, amount: 0, transactions: [] };
  category.amount += line.amount; category.transactions.push(line);
  categories.set(line.category, category);
 }
 for (const item of extra) if (!categories.has(item.key)) categories.set(item.key, { ...item, amount: 0, transactions: [] });
 const sheet: TaxSheetLine[] = taxLines.map(line => ({ line, categories: [], total: 0 }));
 const unmapped: TaxCategory[] = [];
 for (const category of [...categories.values()].sort((a, b) => b.amount - a.amount || nameOf(a.key).localeCompare(nameOf(b.key)))) {
  const target = sheet.find(item => item.line.id === taxLineFor(category.key, nameOf(category.key), category.direction, settings));
  if (target) { target.categories.push(category); target.total += category.amount; } else unmapped.push(category);
 }
 const grossIncome = sheet.filter(item => item.line.part === 'income').reduce((sum, item) => sum + item.total, 0);
 const totalExpenses = sheet.filter(item => item.line.part === 'expense').reduce((sum, item) => sum + item.total, 0);
 return { lines: sheet, unmapped, grossIncome, totalExpenses, net: grossIncome - totalExpenses };
}

export const taxPeriods = ['year', 'q1', 'q2', 'q3', 'q4'] as const;
export type TaxPeriod = typeof taxPeriods[number];
/** The dates of a tax year or one of its quarters. */
export function taxPeriodRange(year: number, period: TaxPeriod) {
 if (period === 'year') return { from: `${year}-01-01`, to: `${year}-12-31` };
 const quarter = Number(period.slice(1)), first = (quarter - 1) * 3 + 1;
 const last = new Date(Date.UTC(year, first + 2, 0)).toISOString().slice(0, 10);
 return { from: `${year}-${String(first).padStart(2, '0')}-01`, to: last };
}

export type TaxExportDetail = 'lines' | 'categories' | 'transactions';
/** The export as rows: line, category and transaction, by the level of detail chosen. Amounts stay unrounded numbers. */
export function taxExportRows(sheet: ReturnType<typeof taxSheet>, template: TaxTemplate, detail: TaxExportDetail, label: (text: string) => string, nameOf: (key: string) => string) {
 const rows: Array<{ line: string; description: string; category: string; date: string; amount: number }> = [];
 for (const item of sheet.lines) {
  if (item.line.manual || (!item.total && !item.categories.length)) continue;
  const line = template === 'schedule_c' ? item.line.number : '';
  rows.push({ line, description: label(item.line.label), category: '', date: '', amount: item.total });
  if (detail === 'lines') continue;
  for (const category of item.categories) {
   rows.push({ line, description: '', category: nameOf(category.key), date: '', amount: category.amount });
   if (detail === 'transactions') for (const transaction of category.transactions) rows.push({ line, description: transaction.name, category: nameOf(category.key), date: transaction.date, amount: transaction.amount });
  }
 }
 return rows;
}
