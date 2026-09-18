import { depositToday } from './deposit-interest';
import type { EarningSource } from './earning-sources';
import { income, monthly, duplicatesAssetEstimate, type Entry } from './finance';

type IncomeCard = { entry: Entry; amount: number; asset: boolean; excluded: boolean; notes: string[]; received: boolean };

export function monthlyIncomeCards(entries: Entry[], month: string, sources: EarningSource[] = [], today = depositToday()): IncomeCard[] {
 const assets = entries.filter(entry => ['Business', 'Property', 'Deposit'].includes(entry.kind) && (entry.estimated_monthly_income ?? 0) > 0);
 const businessIds = new Set(assets.filter(entry => entry.kind === 'Business').map(entry => entry.id));
 const propertyIds = new Set(assets.filter(entry => entry.kind === 'Property').map(entry => entry.id));
 const recurring = entries.filter(entry => income.includes(entry.kind) && !entry.source_paused);
 const included = recurring.filter(entry => monthly(entry, month) > 0 && !duplicatesAssetEstimate(entry, businessIds, propertyIds));
 const cards: IncomeCard[] = [
  ...included.map(entry => ({ entry, amount: monthly(entry, month), asset: false, excluded: false, notes: [] as string[], received: false })),
  ...assets.map(entry => ({ entry, amount: entry.estimated_monthly_income ?? 0, asset: true, excluded: false, notes: [] as string[], received: false })),
 ];
 for (const entry of recurring.filter(entry => !included.includes(entry))) {
  const received = entry.frequency === 'Once' && entry.amount > 0 && entry.date.slice(0, 7) === month && entry.date <= today;
  const source = sources.find(source => source.id === entry.earning_source_id);
  // Reusable-source receipts link to the source, whose schedule is already folded
  // into its property/business card. Resolve that asset before the schedule.
  const assetId = entry.kind === 'Business income' ? entry.business_id ?? source?.linked_record_id : entry.kind === 'Rent income' ? entry.income_source_id ?? source?.linked_record_id : null;
  const scheduleId = source?.schedule_id ?? (entry.kind === 'Salary' ? entry.income_source_id : null);
  const candidates = cards.filter(card => assetId ? card.entry.id === assetId : scheduleId ? card.entry.id === scheduleId : entry.earning_source_id ? card.entry.earning_source_id === entry.earning_source_id : !card.entry.earning_source_id && (card.entry.kind === entry.kind || (entry.kind === 'Rent income' && card.entry.kind === 'Property') || (entry.kind === 'Business income' && card.entry.kind === 'Business')) && card.entry.currency === entry.currency && !!entry.name.trim() && card.entry.name.trim().toLowerCase() === entry.name.trim().toLowerCase());
  const existing = candidates.length === 1 ? candidates[0] : undefined;
  const note = duplicatesAssetEstimate(entry, businessIds, propertyIds)
   ? entry.kind === 'Rent income' ? 'Already included in the property estimate.' : 'Already included in the business estimate.'
   : entry.frequency === 'Once' ? 'One-time payments are not added to the monthly estimate.' : 'Outside its start and end dates for this month.';
  if (existing) {
   existing.received ||= received;
   if (!existing.notes.includes(note)) existing.notes.push(note);
  } else {
   cards.push({ entry, amount: entry.amount, asset: false, excluded: true, notes: [note], received });
  }
 }
 return cards.sort((a, b) => Number(a.excluded) - Number(b.excluded) || Number(b.entry.kind === 'Salary') - Number(a.entry.kind === 'Salary') || b.amount - a.amount);
}
