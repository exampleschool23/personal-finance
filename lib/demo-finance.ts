import { addMonths, shiftDay, shiftMonth } from './calendar-days';
import { defaultComparisonPreferences, isInvestmentRecord } from './comparison-profile';
import { assets, expenses, income, interestKinds, liabilities, scheduleDates, unitPricedKinds, value, type Entry } from './finance';
import { withAssetIncomePlans } from './earning-sources';
import type { HoldingAccount } from './holding-accounts';
import { demoPeople, ownedBy } from './household';
import type { HistoryEvent } from './investment-history';
import type { MarketData } from './market';
import type { Category, Goal, Occurrence } from './planning';
import type { TagData } from './tags';

// Illustrative fixtures only: never represent these as historical market quotes.
export const demoMarket: MarketData = { rates: { USD: 1, UZS: 12500 }, fx: null, quotes: {}, errors: {}, stocksConfigured: false };
// The sample workspace also shows the Treasury bill benchmark, so the risk-free comparison can be explored.
export const demoBenchmarkKeys = [...defaultComparisonPreferences.benchmarks, 'BIL'] as const;

// The sample household: the brokerage is Alex's, the crypto wallet Sam's; holdings follow their account.
const demoHoldingAccounts: HoldingAccount[] = [
 { id: 'demo-brokerage', name: 'Brokerage account', kind: 'Stock', currency: 'USD', member_id: demoPeople.me },
 { id: 'demo-crypto-wallet', name: 'Crypto wallet', kind: 'Crypto', currency: 'USD', member_id: demoPeople.partner },
];
const mine = ownedBy(demoPeople.me), partners = ownedBy(demoPeople.partner);

/** Value a year ago, so the net-worth chart shows homes appreciating and debts being repaid. */
const openings: Record<string, number> = {
 'demo-home': 498000, 'demo-condo': 262000, 'demo-studio': 171000, 'demo-business': 104000, 'demo-watches': 12500,
 'demo-checking': 11800, 'demo-savings': 41000, 'demo-mortgage': 189400, 'demo-car-loan': 24300, 'demo-credit-card': 3100,
 'demo-401k': 74000, 'demo-ira': 28500, 'demo-suv': 27500,
};

export function demoRecords(today: string): Entry[] {
 const record = (id: string, name: string, kind: Entry['kind'], amount: number, extra: Partial<Entry> = {}): Entry => ({
  id: 'demo-' + id, name, kind, currency: 'USD', amount, quantity: 1, cost: 0, rate: 0,
  date: shiftDay(today, -365), frequency: 'Once', notes: '', ownership_percentage: 100, ...extra,
 });
 const stock = (symbol: string, quantity: number, price: number, cost: number) => record(symbol.toLowerCase(), symbol, 'Stock', price, { quantity, cost, holding_account_id: 'demo-brokerage', ...mine });
 const coin = (id: string, name: string, quantity: number, price: number, cost: number) => record(id, name, 'Crypto', price, { quantity, cost, holding_account_id: 'demo-crypto-wallet', ...partners });
 const monthly = (id: string, name: string, kind: Entry['kind'], amount: number, extra: Partial<Entry> = {}) => record(id, name, kind, amount, { frequency: 'Monthly', ...extra });
 return [
  // Cash
  record('checking', 'Everyday checking', 'Cash', 14200),
  record('savings', 'High-yield savings', 'Cash', 58000),
  // Stocks
  stock('VOO', 180, 520, 410), stock('AAPL', 120, 228, 165), stock('MSFT', 60, 430, 310),
  stock('NVDA', 150, 120, 45), stock('AMZN', 80, 185, 140),
  // Crypto
  coin('btc', 'Bitcoin', 1.15, 62000, 38000), coin('eth', 'Ethereum', 12, 2600, 1900), coin('sol', 'Solana', 150, 145, 95),
  // Treasury bills and deposits
  record('tbill', '26-week Treasury bill', 'Treasury bill', 25000, { rate: 4.3, deposit_compounding: 'none', estimated_monthly_income: 25000 * .043 / 12, date: shiftDay(today, 75) }),
  record('tbill-short', '13-week Treasury bill', 'Treasury bill', 15000, { rate: 4.25, deposit_compounding: 'none', estimated_monthly_income: 15000 * .0425 / 12, date: shiftDay(today, 40) }),
  record('deposit-usd', '12-month CD', 'Deposit', 20000, { rate: 4.6, deposit_compounding: 'none', estimated_monthly_income: 20000 * .046 / 12, date: shiftDay(today, 160) }),
  record('bond', '10-year Treasury note', 'Bond', 30000, { rate: 4.1, deposit_compounding: 'none', estimated_monthly_income: 30000 * .041 / 12, opened_on: shiftDay(today, -400), date: shiftDay(today, 3250) }),
  // Precious metals are priced per unit of their own weight and purity: 200 g of fine gold, 50 troy ounces of silver coins.
  record('gold', 'Gold bars', 'Precious metals', 76.5, { quantity: 200, cost: 61, metal: 'XAU', metal_unit: 'g', metal_purity: .9999, ...mine }),
  record('silver', 'Silver coins', 'Precious metals', 28.2, { quantity: 50, cost: 23.5, metal: 'XAG', metal_unit: 'oz', metal_purity: .999, ...partners }),
  // Vested employer shares; the date is the next vesting date.
  record('rsu', 'GOOGL', 'Equity compensation', 165, { quantity: 60, cost: 0, date: shiftDay(today, 45), ...mine }),
  // Retirement savings and a car, valued by hand.
  record('401k', '401(k)', 'Retirement account', 86000, { date: shiftDay(today, -1800), ...mine }),
  record('ira', 'Roth IRA', 'Retirement account', 32000, { date: shiftDay(today, -1200), ...partners }),
  record('suv', 'Family SUV', 'Vehicle', 24000, { date: shiftDay(today, -900) }),
  // Real estate: the home and the condo appreciate, the studio dipped slightly.
  record('home', 'Family home', 'Property', 540000, { date: shiftDay(today, -2400) }),
  record('condo', 'Lakeside rental condo', 'Property', 285000, { estimated_monthly_income: 2100, date: shiftDay(today, -1500), business_id: 'demo-biz-rentals' }),
  record('studio', 'Downtown studio', 'Property', 168000, { estimated_monthly_income: 1250, date: shiftDay(today, -700), business_id: 'demo-biz-rentals' }),
  // Other assets
  record('business', 'Neighborhood café', 'Business', 120000, { ownership_percentage: 25, estimated_monthly_income: 900, business_structure: 'partnership', business_color: 'amber' }),
  // Businesses tracked beside the household: a side business and the rentals.
  record('biz-candles', 'Coastal Candle Co.', 'Business', 0, { business_structure: 'llc', business_color: 'teal', notes: 'Hand-poured candles sold online and at markets.' }),
  record('biz-rentals', 'Lakeside Rentals LLC', 'Business', 0, { business_structure: 'rental_property', business_color: 'violet' }),
  record('candle-checking', 'Candle Co. checking', 'Cash', 3200, { business_id: 'demo-biz-candles' }),
  record('rental-checking', 'Rentals operating account', 'Cash', 9800, { business_id: 'demo-biz-rentals' }),
  record('watches', 'Watch collection', 'Valuables', 14000, mine),
  record('lent', 'Loan to a friend', 'Money lent', 3000, { lent_date: shiftDay(today, -60), date: shiftDay(today, 30) }),
  // Debts
  record('mortgage', 'Family home mortgage', 'Mortgage', 182000, { rate: 6.1, estimated_monthly_payment: 1480, date: shiftDay(today, 20) }),
  record('car-loan', 'Car loan', 'Loan', 18500, { rate: 5.4, estimated_monthly_payment: 520, date: shiftDay(today, 12), ...partners }),
  record('credit-card', 'Credit card balance', 'Debt', 2300, { rate: 21.9, estimated_monthly_payment: 300, date: shiftDay(today, 8) }),
  // Income
  monthly('salary', 'Monthly salary', 'Salary', 14500, mine),
  monthly('freelance', 'Freelance design', 'Other income', 1800, partners),
  record('bonus', 'Annual bonus', 'Other income', 12000, { date: shiftDay(today, -45) }),
  record('dividends', 'Quarterly dividends', 'Other income', 640, { date: shiftDay(today, -20) }),
  // Recurring expenses
  monthly('utilities', 'Utilities', 'Living expense', 320),
  monthly('tuition', 'School tuition', 'Living expense', 1200),
  monthly('internet', 'Phone & internet', 'Living expense', 130),
  monthly('streaming', 'Streaming subscriptions', 'Living expense', 45),
  monthly('gym', 'Gym membership', 'Living expense', 60, mine),
  monthly('home-insurance', 'Home insurance', 'Other expense', 210),
  monthly('car-insurance', 'Car insurance', 'Other expense', 140),
  monthly('hoa', 'Condo HOA fees', 'Other expense', 380),
  record('property-tax', 'Property tax', 'Other expense', 6800, { frequency: 'Yearly', date: shiftDay(today, -300) }),
  monthly('charity', 'Monthly donation', 'Charity', 300),
  ...demoSpending(today, record),
  ...demoSubscriptionCharges(today, record),
  ...demoBusinessActivity(today, record),
 ];
}

export function demoGoals(today: string): Goal[] {
 const months = (count: number) => addMonths(today, count);
 return [
  { id: 'demo-goal-mortgage', name: 'Pay $50K off the mortgage', kind: 'savings', account_id: 'demo-savings', currency: 'USD', target: 50000, allocated: 22000, target_date: months(14), archived: false, funding_enabled: true, funding_priority: 1, monthly_contribution: 2000, annual_return: 0 },
  { id: 'demo-goal-emergency', name: 'Emergency fund', kind: 'savings', account_id: 'demo-savings', currency: 'USD', target: 36000, allocated: 30000, target_date: months(6), archived: false, funding_enabled: true, funding_priority: 2, monthly_contribution: 1000, annual_return: 0 },
  { id: 'demo-goal-net-worth', name: 'Reach $1.5M net worth', kind: 'net_worth', account_id: null, currency: 'USD', target: 1500000, allocated: 0, target_date: months(36), archived: false, funding_enabled: true, funding_priority: 3, monthly_contribution: 4500, annual_return: 6 },
  { id: 'demo-goal-bitcoin', name: 'Hold 1.5 BTC', kind: 'investment', account_id: null, currency: 'USD', target: 1.5, allocated: 0, target_date: months(24), archived: false, holding_account_id: 'demo-crypto-wallet', asset_kind: 'Crypto', asset_symbol: 'BTC', investment_targets: [{ holding_account_id: 'demo-crypto-wallet', asset_kind: 'Crypto', asset_symbol: 'BTC', target: 1.5, monthly_contribution: .015 }] },
 ];
}

/** Recurring bills and pay already settled before today, so only what is still due shows as upcoming. */
function demoOccurrences(records: Entry[], today: string): Occurrence[] {
 const yesterday = shiftDay(today, -1);
 return records.filter(record => [...income, ...expenses].includes(record.kind) && record.frequency !== 'Once' && record.date <= yesterday)
  .flatMap(record => scheduleDates(record, record.date, yesterday).map(date => ({ id: `${record.id}:${date}`, record_id: record.id, due_on: date, status: 'paid' as const })));
}

/** Categories the sample businesses use, and two household spending categories with their own budget, beside the built-in ones. */
const demoCategories: Category[] = [
 { id: 'demo-cat-sales', name: 'Product sales', direction: 'income' },
 { id: 'demo-cat-supplies', name: 'Supplies', direction: 'expense' },
 { id: 'demo-cat-shipping', name: 'Shipping', direction: 'expense' },
 { id: 'demo-cat-fees', name: 'Platform fees', direction: 'expense' },
 { id: 'demo-cat-ads', name: 'Advertising', direction: 'expense' },
 { id: 'demo-cat-cleaning', name: 'Cleaning', direction: 'expense' },
 { id: 'demo-cat-repairs', name: 'Repairs & maintenance', direction: 'expense' },
 { id: 'demo-cat-management', name: 'Property management', direction: 'expense' },
 { id: 'demo-cat-groceries', name: 'Groceries', direction: 'expense' },
 { id: 'demo-cat-household', name: 'Household', direction: 'expense' },
];

/** Six months of trading for the side business (a small loss) and the rentals (a profit), paid through their own
 * accounts, plus one supply order paid from personal checking. */
function demoBusinessActivity(today: string, record: (id: string, name: string, kind: Entry['kind'], amount: number, extra?: Partial<Entry>) => Entry): Entry[] {
 const candles = { business_id: 'demo-biz-candles', account_id: 'demo-candle-checking' }, rentals = { business_id: 'demo-biz-rentals', account_id: 'demo-rental-checking' };
 const lines: Array<[string, Entry['kind'], number, string | null, Partial<Entry>, number]> = [
  ['Etsy payout', 'Other income', 1150, 'demo-cat-sales', candles, 3], ['Farmers market sales', 'Other income', 250, 'demo-cat-sales', candles, 14],
  ['CandleScience', 'Other expense', 900, 'demo-cat-supplies', candles, 5], ['Etsy fees', 'Other expense', 140, 'demo-cat-fees', candles, 4],
  ['Shipping labels', 'Other expense', 220, 'demo-cat-shipping', candles, 9], ['Instagram ads', 'Other expense', 300, 'demo-cat-ads', candles, 12],
  ['Airbnb payout', 'Rent income', 2600, null, rentals, 2], ['Cleaning service', 'Other expense', 380, 'demo-cat-cleaning', rentals, 6],
  ['Property management', 'Other expense', 260, 'demo-cat-management', rentals, 7],
 ];
 const month = today.slice(0, 7), todayDay = Number(today.slice(8, 10));
 const result: Entry[] = [];
 for (let back = 6; back >= 0; back--) {
  const current = previousMonth(month, back), factor = [.92, .97, 1.04, 1, 1.08, .95, 1.03][6 - back];
  lines.forEach(([name, kind, amount, category, extra, day]) => {
   if (back === 0 && day > todayDay) return;
   result.push(record(`biz-${back}-${name.toLowerCase().replace(/\W+/g, '-')}`, name, kind, Math.round(amount * factor), { ...extra, custom_category_id: category, date: `${current}-${String(day).padStart(2, '0')}` }));
  });
  if (back % 2 === 0 && back > 0) result.push(record(`biz-${back}-repairs`, 'Handyman repairs', 'Other expense', 450, { ...rentals, custom_category_id: 'demo-cat-repairs', date: `${current}-20` }));
 }
 result.push(record('biz-personal-wax', 'CandleScience', 'Other expense', 185, { business_id: 'demo-biz-candles', account_id: 'demo-checking', custom_category_id: 'demo-cat-supplies', date: `${previousMonth(month, 1)}-22` }));
 return result;
}

/** Tags in the sample workspace: business purchases to keep for taxes, and one trip. */
function demoTags(records: Entry[]): TagData {
 const tags: TagData['tags'] = [{ id: 'demo-tag-receipts', name: 'Keep receipt', color: 'green' }, { id: 'demo-tag-trip', name: 'Summer trip', color: 'blue' }];
 const links = [
  ...records.filter(item => item.business_id && expenses.includes(item.kind) && item.frequency === 'Once' && item.custom_category_id === 'demo-cat-supplies').map(item => ({ record_id: item.id, tag_id: 'demo-tag-receipts' })),
  ...records.filter(item => item.id === 'demo-spend-trip').map(item => ({ record_id: item.id, tag_id: 'demo-tag-trip' })),
 ];
 return { tags, links };
}

/** Everything the sample workspace starts with, as served by /api/demo. */
export function demoWorkspace(today: string) {
 // Rent and café income schedules exist up front, so their past payments are settled too.
 const records = withAssetIncomePlans(demoRecords(today)).map(record => record.id.startsWith('demo-') ? record : { ...record, id: 'demo-income-' + (record.income_source_id ?? record.business_id), date: shiftDay(today, -365) });
 return { today, records, goals: demoGoals(today), occurrences: demoOccurrences(records, today), holdingAccounts: demoHoldingAccounts, categories: demoCategories, tags: demoTags(records) };
}
export type DemoWorkspace = ReturnType<typeof demoWorkspace>;

const previousMonth = (month: string, count: number) => shiftMonth(month, -count);

/** Day-to-day purchases over the last six months and so far this month, so spending charts and budget history have something real to compare. */
function demoSpending(today: string, record: (id: string, name: string, kind: Entry['kind'], amount: number, extra?: Partial<Entry>) => Entry): Entry[] {
 const purchases: Array<[string, number, Entry['kind'], string?]> = [
  ['Whole Foods', 184, 'Living expense', 'groceries'], ['Coffee', 46, 'Living expense'], ['Uber', 24, 'Living expense'], ['Lunch', 22, 'Living expense'],
  ['Pharmacy', 38, 'Living expense'], ['Costco', 236, 'Living expense', 'groceries'], ['Fuel', 62, 'Living expense'], ['Dinner out', 118, 'Living expense'],
  ['Home Depot', 146, 'Living expense', 'household'], ['Trader Joe\'s', 142, 'Living expense', 'groceries'], ['Kids\' activities', 95, 'Living expense'],
  ['Amazon', 87, 'Living expense', 'household'], ['Clothing', 164, 'Living expense'], ['Movie night', 42, 'Living expense'],
  ['Farmers market', 58, 'Living expense', 'groceries'], ['Car service', 289, 'Other expense'], ['Gift for a friend', 75, 'Other expense'],
 ];
 // Most spending is the household's; a few purchases are one person's own.
 const personal: Record<string, Partial<Entry>> = { Coffee: mine, Lunch: mine, 'Car service': mine, Uber: partners, Clothing: partners, 'Gift for a friend': partners };
 const month = today.slice(0, 7), todayDay = Number(today.slice(8, 10));
 const spends: Entry[] = [];
 for (let back = 6; back >= 0; back--) {
  const current = previousMonth(month, back);
  // Recent months run slightly ahead of earlier ones, as real spending often does.
  const factor = [.95, 1.02, .98, 1, 1.04, .97, 1.12][6 - back];
  purchases.forEach(([name, amount, kind, category], index) => {
   const day = 1 + Math.floor(index * 27 / purchases.length);
   if (back === 0 && day > todayDay) return;
   spends.push(record(`spend-${back}-${index}`, name, kind, Math.round(amount * factor), { date: `${current}-${String(day).padStart(2, '0')}`, custom_category_id: category ? 'demo-cat-' + category : null, ...personal[name] }));
  });
 }
 // One larger trip last month.
 spends.push(record('spend-trip', 'Summer trip flights', 'Other expense', 1840, { date: `${previousMonth(month, 1)}-18` }));
 return spends;
}

/** Card subscriptions for the subscriptions list on Recurring: a steady one, a price rise and one that stopped. */
function demoSubscriptionCharges(today: string, record: (id: string, name: string, kind: Entry['kind'], amount: number, extra?: Partial<Entry>) => Entry): Entry[] {
 const month = today.slice(0, 7), todayDay = Number(today.slice(8, 10));
 const charges: Entry[] = [];
 for (let back = 6; back >= 0; back--) {
  const current = previousMonth(month, back);
  const charge = (id: string, name: string, amount: number, day: number) => {
   if (back === 0 && day > todayDay) return;
   charges.push(record(`sub-${id}-${back}`, name, 'Living expense', amount, { date: `${current}-${String(day).padStart(2, '0')}`, account_id: 'demo-checking' }));
  };
  charge('music', 'Spotify', 11.99, 6);
  charge('video', 'Netflix', back <= 1 ? 17.99 : 15.49, 11);
  if (back >= 2) charge('news', 'Daily News digital', 9, 20);
 }
 return charges;
}

export function demoHistory(records: Entry[], today: string) {
 const events: HistoryEvent[] = [];
 const originals = new Map(demoRecords(today).map(record => [record.id, record]));
 for (const record of records.filter(record => isInvestmentRecord(record) || assets.includes(record.kind) || liabilities.includes(record.kind))) {
  const original = originals.get(record.id);
  // Demo edits keep their own values; new records don't acquire invented history.
  if (!original || original.kind !== record.kind || original.currency !== record.currency) continue;
  const investment = isInvestmentRecord(record);
  const amount = value(original);
  const share = record.kind === 'Business' ? (original.ownership_percentage ?? 100) / 100 : 1;
  const opening = unitPricedKinds.includes(record.kind) ? original.cost * original.quantity : (openings[record.id] ?? amount / share) * share;
  const add = (suffix: string, date: string, event_type: HistoryEvent['event_type'], amount: number, balance: number | null) => events.push({
   id: record.id + ':' + suffix, record_id: record.id, occurred_on: date, created_at: date + 'T12:00:00Z',
   event_type, amount, balance, ownership_percentage: 100, principal: 0, interest: 0, notes: 'Sample data',
  });
  // Cash and debts only carry balances; they are not investments.
  add('purchase', shiftDay(today, -365), investment ? 'contribution' : 'valuation', investment ? opening : 0, opening);
  for (let month = 1; month <= 12; month++) {
   const date = shiftDay(today, -365 + Math.floor(365 * month / 12));
   const progress = month / 12;
   const swing = unitPricedKinds.includes(record.kind) ? Math.sin(month * 1.8) * amount * .025 * (1 - progress) : 0;
   const balance = interestKinds.includes(record.kind) ? amount : opening + (amount - opening) * progress + swing;
   add('value-' + month, date, 'valuation', 0, balance);
   if (!investment) continue;
   const rental = record.kind === 'Property' ? original.estimated_monthly_income ?? 0 : 0;
   if (interestKinds.includes(record.kind) || record.kind === 'Business' || rental > 0 || (record.kind === 'Stock' && month % 3 === 0)) {
    const receipt = interestKinds.includes(record.kind) ? amount * original.rate / 100 / 12 : record.kind === 'Business' ? 820 + month * 8 : rental || amount * .003;
    add('income-' + month, date, 'income', receipt, null);
   }
   if (record.kind === 'Business') add('expense-' + month, date, 'expense', 45 + month * 2, null);
   if (rental > 0 && month % 4 === 0) add('expense-' + month, date, 'expense', Math.round(rental * .35), null);
  }
 }
 return { records, events, cashflows: [] as Entry[], incomeRecords: records };
}
