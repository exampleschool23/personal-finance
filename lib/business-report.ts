import { monthsBetween } from './budget';
import { monthEnd, shiftMonth } from './calendar-days';
import { HOUSEHOLD, inBusinessFilter, type BusinessFilter } from './business';
import { expenses, income, liabilities, value, type Entry } from './finance';
import { convertAmount } from './market';
import type { Share } from './cash-flow-report';
import type { PlanningData } from './planning';
import { isMortgagePayment, spendingAmount } from './spending';
import type { TransactionSplit } from './transaction-tools';

type Rates = number | Record<string, number> | undefined;
export type Direction = 'income' | 'expense';

export const reportRanges = ['this_month', 'last_month', 'last_3_months', 'last_6_months', 'last_12_months', 'this_year', 'last_year'] as const;
export type ReportRangePreset = typeof reportRanges[number];
export const reportRangeLabels: Record<ReportRangePreset, string> = {
 this_month: 'This month', last_month: 'Last month', last_3_months: 'Last 3 months', last_6_months: 'Last 6 months', last_12_months: 'Last 12 months', this_year: 'This year', last_year: 'Last year',
};
/** Inclusive ISO dates. Reports read at most 24 months of transactions. */
export type ReportRange = { from: string; to: string };
export function rangeFor(preset: ReportRangePreset, today: string): ReportRange {
 const month = today.slice(0, 7), year = Number(today.slice(0, 4));
 if (preset === 'this_month') return { from: month + '-01', to: today };
 if (preset === 'last_month') { const last = shiftMonth(month, -1); return { from: last + '-01', to: monthEnd(last) }; }
 if (preset === 'this_year') return { from: `${year}-01-01`, to: today };
 if (preset === 'last_year') return { from: `${year - 1}-01-01`, to: `${year - 1}-12-31` };
 const back = preset === 'last_3_months' ? 2 : preset === 'last_6_months' ? 5 : 11;
 return { from: shiftMonth(month, -back) + '-01', to: today };
}
/** The months a range touches, which is what the planning read needs. */
export const rangeMonths = (range: ReportRange) => monthsBetween(range.from.slice(0, 7), range.to.slice(0, 7));
/** A range the planning read accepts: it ends with the later month and covers at most 24 months. */
export const readableRange = (range: ReportRange): ReportRange => {
 const months = rangeMonths(range);
 return months.length <= 24 ? range : { from: months[months.length - 24] + '-01', to: range.to };
};

/** One amount on a report: a transaction, or one split part of it, in the display currency. */
export type LedgerLine = { id: string; record: Entry | null; name: string; date: string; direction: Direction; amount: number; category: string; business: string | null };

/** Recorded income and spending in the range: splits become their parts, mortgage payments count their interest
 * (`lib/spending.ts`), and tracker expenses on investments count where they have no transaction of their own. */
export function reportLedger(data: Pick<PlanningData, 'records' | 'investmentLinks'>, splits: readonly TransactionSplit[], range: ReportRange, currency: string, today: string, rates: Rates) {
 const lines: LedgerLine[] = [];
 let missing = 0;
 const last = range.to < today ? range.to : today;
 const records = data.records as Entry[];
 for (const record of records) {
  if (record.frequency !== 'Once' || !record.date || record.date < range.from || record.date > last) continue;
  const direction: Direction | null = income.includes(record.kind) ? 'income' : expenses.includes(record.kind) ? 'expense' : null;
  if (!direction) continue;
  const total = direction === 'income' ? Number(record.amount) : spendingAmount(record);
  const parts = isMortgagePayment(record) ? [] : splits.filter(part => part.record_id === record.id);
  for (const [index, part] of (parts.length ? parts.map(part => ({ category: part.category_id, amount: Number(part.amount) })) : [{ category: record.custom_category_id ?? record.kind, amount: total }]).entries()) {
   const amount = convertAmount(part.amount, record.currency, currency, rates);
   if (amount === null || !Number.isFinite(amount)) { missing++; break; }
   lines.push({ id: parts.length ? `${record.id}:${index}` : record.id, record, name: record.name.trim() || record.kind, date: record.date, direction, amount, category: part.category, business: record.business_id ?? null });
  }
 }
 const byId = new Map(records.map(record => [record.id, record]));
 for (const link of data.investmentLinks ?? []) {
  const event = link.investment_history;
  if (!event || event.event_type !== 'expense' || event.occurred_on < range.from || event.occurred_on > last || Number(link.amount) >= 0) continue;
  if (records.some(record => record.history_event_id === link.id)) continue;
  const asset = byId.get(event.record_id), unit = link.account_currency ?? byId.get(link.account_id)?.currency;
  const amount = unit ? convertAmount(-Number(link.amount), unit, currency, rates) : null;
  if (amount === null) { missing++; continue; }
  lines.push({ id: link.id, record: null, name: asset?.name ?? 'Other expense', date: event.occurred_on, direction: 'expense', amount, category: 'Other expense', business: asset ? (asset.kind === 'Business' ? asset.id : asset.business_id ?? null) : null });
 }
 return { lines: lines.sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id)), missing };
}

/** Lines of the selected businesses (and the household when it is selected, or nothing is). */
export const filterLines = (lines: readonly LedgerLine[], filter: BusinessFilter) => lines.filter(line => inBusinessFilter(filter, line.business));

export type Attribute = 'category' | 'group' | 'merchant' | 'business';
/** Totals by a key, largest first, with each one's share of the whole. */
export function sharesBy(lines: readonly LedgerLine[], keyOf: (line: LedgerLine) => string): Share[] {
 const totals = new Map<string, number>();
 for (const line of lines) totals.set(keyOf(line), (totals.get(keyOf(line)) ?? 0) + line.amount);
 const sum = [...totals.values()].reduce((total, amount) => total + amount, 0);
 return [...totals].filter(([, amount]) => amount > 0).map(([key, amount]) => ({ key, amount, share: sum > 0 ? amount / sum : 0 })).sort((a, b) => b.amount - a.amount || a.key.localeCompare(b.key));
}
export const businessKey = (line: Pick<LedgerLine, 'business'>) => line.business ?? HOUSEHOLD;

export type PnlLine = { key: string; amount: number };
export type BusinessPnl = { id: string; income: PnlLine[]; expenses: PnlLine[]; grossIncome: number; totalExpenses: number; net: number };
export type ProfitAndLoss = { household: { income: PnlLine[]; incomeTotal: number; expenses: PnlLine[]; expenseTotal: number } | null; businesses: BusinessPnl[]; totalIncome: number; net: number };
const pnlLines = (lines: readonly LedgerLine[], keyOf: (line: LedgerLine) => string) => sharesBy(lines, keyOf).map(({ key, amount }) => ({ key, amount }));
const sum = (lines: readonly { amount: number }[]) => lines.reduce((total, line) => total + line.amount, 0);

/** Profit and loss: each business's net income (gross income less business expenses) rolls up into total
 * income beside household income, as profit from a pass-through business does on a personal return; household
 * expenses then leave the net cash flow. `businessIds` gives the businesses to list, in display order. */
export function profitAndLoss(lines: readonly LedgerLine[], businessIds: readonly string[], keyOf: (line: LedgerLine) => string, includeHousehold: boolean): ProfitAndLoss {
 const of = (business: string | null, direction: Direction) => lines.filter(line => line.business === business && line.direction === direction);
 const businesses = businessIds.map(id => {
  const incomeLines = of(id, 'income'), expenseLines = of(id, 'expense');
  const grossIncome = sum(incomeLines), totalExpenses = sum(expenseLines);
  return { id, income: pnlLines(incomeLines, keyOf), expenses: pnlLines(expenseLines, keyOf), grossIncome, totalExpenses, net: grossIncome - totalExpenses };
 });
 const household = includeHousehold ? (() => {
  const incomeLines = of(null, 'income'), expenseLines = of(null, 'expense');
  return { income: pnlLines(incomeLines, keyOf), incomeTotal: sum(incomeLines), expenses: pnlLines(expenseLines, keyOf), expenseTotal: sum(expenseLines) };
 })() : null;
 const totalIncome = (household?.incomeTotal ?? 0) + businesses.reduce((total, business) => total + business.net, 0);
 return { household, businesses, totalIncome, net: totalIncome - (household?.expenseTotal ?? 0) };
}

/** What a click on a chart narrows the transactions to. */
export type Drill = { direction?: Direction; category?: string; categories?: readonly string[]; business?: string | null; merchant?: string };
export const drillMatches = (drill: Drill | null, line: LedgerLine, keyOf: (line: LedgerLine) => string = line => line.category) => !drill || (
 (drill.direction === undefined || line.direction === drill.direction) && (drill.category === undefined || keyOf(line) === drill.category) && (drill.categories === undefined || drill.categories.includes(line.category))
 && (drill.business === undefined || line.business === drill.business) && (drill.merchant === undefined || line.name === drill.merchant));

export type SankeyNode = { name: string; kind: 'income' | 'total' | 'expense' | 'savings' | 'business' | 'loss'; drill: Drill | null };
export type BusinessSankey = { nodes: SankeyNode[]; links: Array<{ source: number; target: number; value: number }> };
/** Where money came from and went, with a layer for each business: its income flows into it and its expenses out of
 * it; a profit then flows into household income, while a loss leaves the household like any other expense. Without
 * the household, a business's profit or loss stands on its own. Small flows merge into "Other". */
export function businessSankey(pnl: ProfitAndLoss, labels: { category: (key: string) => string; business: (id: string) => string; total: string; savings: string; profit: string; loss: (name: string) => string; otherIncome: string; otherExpense: string }, limit = 7): BusinessSankey {
 const nodes: SankeyNode[] = [], links: BusinessSankey['links'] = [];
 const node = (item: SankeyNode) => nodes.push(item) - 1;
 const top = (items: PnlLine[], other: string, direction: Direction, business: string | null) => {
  const named = items.length <= limit ? items : items.slice(0, limit - 1);
  const rest = items.length <= limit ? [] : items.slice(limit - 1);
  return [...named.map(item => ({ name: labels.category(item.key), amount: item.amount, drill: { direction, category: item.key, business } as Drill })), ...(rest.length ? [{ name: other, amount: sum(rest), drill: { direction, business } as Drill }] : [])];
 };
 const household = pnl.household;
 const total = household ? node({ name: labels.total, kind: 'total', drill: { business: null } }) : -1;
 if (household) for (const item of top(household.income, labels.otherIncome, 'income', null)) links.push({ source: node({ name: item.name, kind: 'income', drill: item.drill }), target: total, value: item.amount });
 for (const business of pnl.businesses) {
  if (!business.grossIncome && !business.totalExpenses) continue;
  const name = labels.business(business.id);
  const hub = node({ name, kind: 'business', drill: { business: business.id } });
  for (const item of top(business.income, labels.otherIncome, 'income', business.id)) links.push({ source: node({ name: item.name, kind: 'income', drill: item.drill }), target: hub, value: item.amount });
  for (const item of top(business.expenses, labels.otherExpense, 'expense', business.id)) links.push({ source: hub, target: node({ name: item.name, kind: 'expense', drill: item.drill }), value: item.amount });
  if (business.net > 0) links.push({ source: hub, target: household ? total : node({ name: labels.profit, kind: 'savings', drill: { business: business.id } }), value: business.net });
  else if (business.net < 0) {
   if (household) links.push({ source: total, target: node({ name: labels.loss(name), kind: 'loss', drill: { business: business.id } }), value: -business.net });
   else links.push({ source: node({ name: labels.loss(name), kind: 'loss', drill: { business: business.id } }), target: hub, value: -business.net });
  }
 }
 if (household) {
  for (const item of top(household.expenses, labels.otherExpense, 'expense', null)) links.push({ source: total, target: node({ name: item.name, kind: 'expense', drill: item.drill }), value: item.amount });
  if (pnl.net > 0) links.push({ source: total, target: node({ name: labels.savings, kind: 'savings', drill: null }), value: pnl.net });
 }
 const used = new Set(links.filter(link => link.value > 0).flatMap(link => [link.source, link.target]));
 const index = new Map([...nodes.keys()].filter(key => used.has(key)).map((key, position) => [key, position]));
 return { nodes: nodes.filter((_, key) => used.has(key)), links: links.filter(link => link.value > 0).map(link => ({ source: index.get(link.source)!, target: index.get(link.target)!, value: link.value })) };
}

export const intervals = ['month', 'quarter', 'year'] as const;
export type Interval = typeof intervals[number];
/** The interval a date falls in: `2026-07`, `2026-Q3` or `2026`. */
export const intervalOf = (date: string, interval: Interval) => interval === 'month' ? date.slice(0, 7) : interval === 'year' ? date.slice(0, 4) : `${date.slice(0, 4)}-Q${Math.floor((Number(date.slice(5, 7)) - 1) / 3) + 1}`;
export const intervalsIn = (range: ReportRange, interval: Interval) => [...new Set(rangeMonths(range).map(month => intervalOf(month + '-01', interval)))];

/** Income, expenses and net for each interval of the range. */
export function cashFlowTrend(lines: readonly LedgerLine[], range: ReportRange, interval: Interval) {
 const rows = new Map(intervalsIn(range, interval).map(period => [period, { period, income: 0, expenses: 0, net: 0 }]));
 for (const line of lines) {
  const row = rows.get(intervalOf(line.date, interval));
  if (!row) continue;
  if (line.direction === 'income') { row.income += line.amount; row.net += line.amount; } else { row.expenses += line.amount; row.net -= line.amount; }
 }
 return [...rows.values()];
}

/** One direction's totals for each interval, split by a key; keys past the largest `limit` share one "other" series. */
export function attributeTrend(lines: readonly LedgerLine[], range: ReportRange, interval: Interval, keyOf: (line: LedgerLine) => string, limit = 6, other = 'other') {
 const ranked = sharesBy(lines, keyOf);
 const kept = ranked.length <= limit ? ranked.map(item => item.key) : ranked.slice(0, limit - 1).map(item => item.key);
 const keys = ranked.length > kept.length ? [...kept, other] : kept;
 const rows = new Map(intervalsIn(range, interval).map(period => [period, Object.fromEntries([['period', period], ...keys.map(key => [key, 0])]) as Record<string, number | string>]));
 for (const line of lines) {
  const row = rows.get(intervalOf(line.date, interval));
  if (!row) continue;
  const key = kept.includes(keyOf(line)) ? keyOf(line) : other;
  row[key] = Number(row[key]) + line.amount;
 }
 return { keys, rows: [...rows.values()] };
}

/** Net income (income less expenses) for each interval, one series per key such as a business or the household. */
export function netTrendBy(lines: readonly LedgerLine[], range: ReportRange, interval: Interval, keyOf: (line: LedgerLine) => string, keys: readonly string[]) {
 const rows = new Map(intervalsIn(range, interval).map(period => [period, Object.fromEntries([['period', period], ...keys.map(key => [key, 0])]) as Record<string, number | string>]));
 for (const line of lines) {
  const row = rows.get(intervalOf(line.date, interval)), key = keyOf(line);
  if (!row || !keys.includes(key)) continue;
  row[key] = Number(row[key]) + (line.direction === 'income' ? line.amount : -line.amount);
 }
 return [...rows.values()];
}

/** The summary beside a report's transactions: how many, each direction's total, the largest one and the first and last dates. */
export function summarizeLines(lines: readonly LedgerLine[]) {
 let incomeTotal = 0, expenseTotal = 0, largest: LedgerLine | null = null, first: string | null = null, last: string | null = null;
 for (const line of lines) {
  if (line.direction === 'income') incomeTotal += line.amount; else expenseTotal += line.amount;
  if (!largest || line.amount > largest.amount) largest = line;
  if (!first || line.date < first) first = line.date;
  if (!last || line.date > last) last = line.date;
 }
 return { count: lines.length, income: incomeTotal, expenses: expenseTotal, largest, first, last };
}

/** A report's transactions as export rows, newest first as shown. Spending is negative; amounts stay unrounded numbers. */
export const ledgerExportRows = (lines: readonly LedgerLine[], categoryName: (key: string) => string, businessName: (id: string | null) => string) =>
 lines.map(line => ({ date: line.date, name: line.name, category: categoryName(line.category), business: businessName(line.business), amount: line.direction === 'income' ? line.amount : -line.amount }));

/** Each business's accounts and assets less what it owes, in the display currency. `records` are already converted;
 * a record that could not be converted is left out and counted in `missing`. The Business record's own value counts as an asset. */
export function businessNetAssets(records: readonly (Entry | null)[], businessIds: readonly string[]) {
 const result = new Map(businessIds.map(id => [id, { assets: 0, debts: 0, net: 0, accounts: [] as Entry[] }]));
 let missing = 0;
 for (const record of records) {
  if (!record) { missing++; continue; }
  const id = record.kind === 'Business' ? record.id : record.business_id;
  const entry = id ? result.get(id) : undefined;
  if (!entry || [...income, ...expenses].includes(record.kind)) continue;
  if (record.kind !== 'Business') entry.accounts.push(record);
  if (liabilities.includes(record.kind)) entry.debts += value(record); else entry.assets += value(record);
  entry.net = entry.assets - entry.debts;
 }
 return { byBusiness: result, missing };
}
