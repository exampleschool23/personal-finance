import { depositToday } from './deposit-interest';
import type { EarningSource } from './earning-sources';
import { income, monthly, duplicatesAssetEstimate, type Entry } from './finance';

type IncomeCard = { entry: Entry; amount: number; asset: boolean; excluded: boolean; notes: string[]; received: boolean; receivedAmount: number };

function receiptKey(entry: Entry): string {
 const source = entry.earning_source_id ? ['source', entry.earning_source_id]
  : entry.business_id ? ['business', entry.business_id]
  : entry.income_source_id ? ['legacy', entry.income_source_id]
  : ['name', entry.name.trim().toLowerCase() || entry.id];
 return JSON.stringify([entry.currency, entry.kind, entry.payment_type ?? 'regular', ...source]);
}

// Requires individual dated records, never the all-time valuation summary.
export function monthlyIncomeCards(entries: Entry[], month: string, sources: EarningSource[] = [], today = depositToday()): IncomeCard[] {
 const assets = entries.filter(entry => ['Business', 'Property', 'Deposit'].includes(entry.kind) && (entry.estimated_monthly_income ?? 0) > 0);
 const businessIds = new Set(assets.filter(entry => entry.kind === 'Business').map(entry => entry.id));
 const propertyIds = new Set(assets.filter(entry => entry.kind === 'Property').map(entry => entry.id));
 const recurring = entries.filter(entry => income.includes(entry.kind) && !entry.source_paused);
 const included = recurring.filter(entry => monthly(entry, month) > 0 && !duplicatesAssetEstimate(entry, businessIds, propertyIds));
 const cards: IncomeCard[] = [
  ...included.map(entry => ({ entry, amount: monthly(entry, month), asset: false, excluded: false, notes: [] as string[], received: false, receivedAmount: 0 })),
  ...assets.map(entry => ({ entry, amount: entry.estimated_monthly_income ?? 0, asset: true, excluded: false, notes: [] as string[], received: false, receivedAmount: 0 })),
 ];
 for (const entry of recurring.filter(entry => !included.includes(entry))) {
  // Undated summary rows and receipts from other months are not monthly income.
  if (entry.frequency === 'Once' && entry.date?.slice(0, 7) !== month) continue;
  const received = entry.frequency === 'Once' && entry.amount > 0 && entry.date.slice(0, 7) === month && entry.date <= today;
  const source = sources.find(source => source.id === entry.earning_source_id);
  // Reusable-source receipts link to the source, whose schedule is already folded
  // into its property/business card. Resolve that asset before the schedule.
  const assetId = entry.kind === 'Business income' ? entry.business_id ?? source?.linked_record_id : entry.kind === 'Rent income' ? entry.income_source_id ?? source?.linked_record_id : null;
  const scheduleId = source?.schedule_id ?? (entry.kind === 'Salary' ? entry.income_source_id : null);
  const candidates = cards.filter(card => (card.asset || card.entry.frequency !== 'Once') && card.entry.currency === entry.currency && (assetId ? card.entry.id === assetId : scheduleId ? card.entry.id === scheduleId : entry.earning_source_id ? card.entry.earning_source_id === entry.earning_source_id : !card.entry.earning_source_id && (card.entry.kind === entry.kind || (entry.kind === 'Rent income' && card.entry.kind === 'Property') || (entry.kind === 'Business income' && card.entry.kind === 'Business')) && card.entry.currency === entry.currency && !!entry.name.trim() && card.entry.name.trim().toLowerCase() === entry.name.trim().toLowerCase()));
  const existing = candidates.length === 1 ? candidates[0] : entry.frequency === 'Once'
   ? cards.find(card => card.excluded && card.entry.frequency === 'Once' && receiptKey(card.entry) === receiptKey(entry)) : undefined;
  const note = duplicatesAssetEstimate(entry, businessIds, propertyIds)
   ? entry.kind === 'Rent income' ? 'Already included in the property estimate.' : 'Already included in the business estimate.'
   : entry.frequency === 'Once' ? 'One-time payments are not added to the monthly estimate.' : 'Outside its start and end dates for this month.';
  if (existing) {
   // Actual payments accumulate only within this month; estimates stay intact.
   if (existing.excluded && existing.entry.frequency === 'Once' && entry.frequency === 'Once') existing.amount += entry.amount;
   existing.received ||= received;
   if(received) existing.receivedAmount += entry.amount;
   if (!existing.notes.includes(note)) existing.notes.push(note);
  } else {
   cards.push({ entry, amount: entry.amount, asset: false, excluded: true, notes: [note], received, receivedAmount: received ? entry.amount : 0 });
  }
 }
 return cards.sort((a, b) => Number(a.excluded) - Number(b.excluded) || Number(b.entry.kind === 'Salary') - Number(a.entry.kind === 'Salary') || b.amount - a.amount);
}
