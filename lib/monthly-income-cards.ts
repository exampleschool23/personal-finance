import { depositToday } from './deposit-interest';
import type { EarningSource } from './earning-sources';
import { income, interestKinds, monthly, duplicatesAssetEstimate, type Entry } from './finance';
import { convertAmount } from './market';
import { amountIn, type Money, type PairRate, type RateTable } from './money';

/** One income source's card, in that source's own currency (`entry.currency`): its estimate and what came in. `entered` is
 * what came in as it was entered, when every payment shares one currency (a mix leaves it null and `receivedAmount`, in the
 * card's currency, is shown). `missing` counts payments in another currency that no rate converts: the card is marked
 * received, but its received amount is unknown (—, with "Exchange rate unavailable."), never counted as zero. */
type IncomeCard = { entry: Entry; amount: number; asset: boolean; excluded: boolean; notes: string[]; received: boolean; receivedAmount: number; missing: number; entered?: Money | null };

/** Unlinked one-time receipts group only by the ids they carry (AGENTS: never by name); without one each stands alone. */
function receiptKey(entry: Entry): string {
 const source = entry.earning_source_id ? ['source', entry.earning_source_id]
  : entry.business_id ? ['business', entry.business_id]
  : entry.income_source_id ? ['legacy', entry.income_source_id]
  : ['record', entry.id];
 return JSON.stringify([entry.currency, entry.kind, entry.payment_type ?? 'regular', ...source]);
}

/** Sources expressed in the display currency, like the converted entries the cards read.
 * An approximate amount without a usable rate is dropped rather than guessed. */
export function sourcesIn(sources: readonly EarningSource[], currency: string, rates?: number | Record<string, number>): EarningSource[] {
 return sources.map(source => {
  if (source.approx_monthly == null || source.currency === currency) return source;
  const approx = convertAmount(source.approx_monthly, source.currency, currency, rates);
  return { ...source, currency, approx_monthly: approx !== null && Number.isFinite(approx) && approx > 0 ? approx : null };
 });
}

/** Variable income has no schedule; its approximate amount is its monthly estimate. */
const estimatedVariably = (source: EarningSource) => source.mode === 'variable' && !source.archived && (source.approx_monthly ?? 0) > 0;

/** The variable sources' approximate monthly income in `currency`: the part of "Income this month" that no schedule
 * carries, so the monthly estimate (`estimatedCashFlow`) counts the same income as the cards (CF-048). `missing` counts
 * the sources whose currency no rate converts: their income is unknown, so the estimate that adds it is too (shown as
 * —, with the Exchange rate unavailable note), never counted as zero. */
export function approximateIncome(sources: readonly EarningSource[], currency: string, rates?: number | Record<string, number>): { amount: number; missing: number } {
 const converted = sourcesIn(sources, currency, rates);
 const amount = converted.filter(estimatedVariably).reduce((sum, source) => sum + source.approx_monthly!, 0);
 const missing = sources.filter((source, index) => estimatedVariably(source) && converted[index].approx_monthly === null).length;
 return { amount, missing };
}

/** A variable source's approximate monthly income, as a card that this month's receipts from it join. */
const approximateCard = (source: EarningSource): IncomeCard => ({
 entry: { id: 'source:' + source.id, earning_source_id: source.id, name: source.name, kind: source.kind, currency: source.currency, amount: source.approx_monthly!, date: '', frequency: 'Monthly', quantity: 1, cost: 0, rate: 0, notes: '' },
 amount: source.approx_monthly!, asset: false, excluded: false, notes: [], received: false, receivedAmount: 0, missing: 0,
});

/** The card a payment belongs to, joined by ids only: the asset it pays into, else the schedule it names
 * (`occurrence_record_id`, the one link of every scheduled payment since migration 140), else its variable source.
 * A payment that names none of them is never matched by name, kind or amount (migration 119). */
function linkedCard(cards: readonly IncomeCard[], entry: Entry, sources: readonly EarningSource[]): IncomeCard | undefined {
 const source = sources.find(source => source.id === entry.earning_source_id);
 // Reusable-source receipts link to the source, whose schedule is already folded
 // into its property/business card. Resolve that asset before the schedule.
 const assetId = entry.kind === 'Business income' ? entry.business_id ?? source?.linked_record_id : entry.kind === 'Rent income' ? entry.income_source_id ?? source?.linked_record_id : null;
 const scheduleId = entry.occurrence_record_id;
 const joins = assetId ? (card: IncomeCard) => card.entry.id === assetId
  : scheduleId ? (card: IncomeCard) => card.entry.id === scheduleId
  : entry.earning_source_id ? (card: IncomeCard) => card.entry.earning_source_id === entry.earning_source_id : null;
 const candidates = joins ? cards.filter(card => (card.asset || card.entry.frequency !== 'Once') && joins(card)) : [];
 return candidates.length === 1 ? candidates[0] : undefined;
}

// Requires individual dated records, never the all-time valuation summary. A payment in another currency than its
// card counts in the card's currency through `rates` (migration 120); without a usable rate its amount is missing.
export function monthlyIncomeCards(entries: Entry[], month: string, sources: EarningSource[] = [], today = depositToday(), rates?: RateTable | PairRate | null): IncomeCard[] {
 const assets = entries.filter(entry => ['Business', 'Property', ...interestKinds].includes(entry.kind) && (entry.estimated_monthly_income ?? 0) > 0);
 const businessIds = new Set(assets.filter(entry => entry.kind === 'Business').map(entry => entry.id));
 const propertyIds = new Set(assets.filter(entry => entry.kind === 'Property').map(entry => entry.id));
 const recurring = entries.filter(entry => income.includes(entry.kind) && !entry.source_paused && !entry.archived);
 const included = recurring.filter(entry => monthly(entry, month) > 0 && !duplicatesAssetEstimate(entry, businessIds, propertyIds));
 const cards: IncomeCard[] = [
  ...included.map(entry => ({ entry, amount: monthly(entry, month), asset: false, excluded: false, notes: [] as string[], received: false, receivedAmount: 0, missing: 0 })),
  ...assets.map(entry => ({ entry, amount: entry.estimated_monthly_income ?? 0, asset: true, excluded: false, notes: [] as string[], received: false, receivedAmount: 0, missing: 0 })),
  ...sources.filter(estimatedVariably).map(approximateCard),
 ];
 for (const entry of recurring.filter(entry => !included.includes(entry))) {
  // Undated summary rows and receipts from other months are not monthly income.
  if (entry.frequency === 'Once' && entry.date?.slice(0, 7) !== month) continue;
  // A recorded 0 ("nothing came this month") is a receipt too: the card shows $0 rather than a dash.
  const received = entry.frequency === 'Once' && entry.amount >= 0 && entry.date.slice(0, 7) === month && entry.date <= today;
  const existing = linkedCard(cards, entry, sources) ?? (entry.frequency === 'Once'
   ? cards.find(card => card.excluded && card.entry.frequency === 'Once' && receiptKey(card.entry) === receiptKey(entry)) : undefined);
  const note = duplicatesAssetEstimate(entry, businessIds, propertyIds)
   ? entry.kind === 'Rent income' ? 'Already included in the property estimate.' : 'Already included in the business estimate.'
   : entry.frequency === 'Once' ? 'One-time payments are not added to the monthly estimate.' : 'Outside its start and end dates for this month.';
  if (existing) {
   // Actual payments accumulate only within this month; estimates stay intact.
   if (existing.excluded && existing.entry.frequency === 'Once' && entry.frequency === 'Once') existing.amount += entry.amount;
   existing.received ||= received;
   const value = received ? amountIn({ amount: entry.amount, currency: entry.currency }, existing.entry.currency, rates) : 0;
   if (value === null) existing.missing += 1; else existing.receivedAmount += value;
   if (received) existing.entered = enteredWith(existing.entered, entry);
   if (!existing.notes.includes(note)) existing.notes.push(note);
  } else {
   cards.push({ entry, amount: entry.amount, asset: false, excluded: true, notes: [note], received, receivedAmount: received ? entry.amount : 0, missing: 0, entered: received ? { amount: entry.amount, currency: entry.currency } : undefined });
  }
 }
 // Larger sources first, compared in one currency: each card is in its own (a source in sums is not larger than one in dollars).
 const size = (card: IncomeCard) => amountIn({ amount: card.amount, currency: card.entry.currency }, 'USD', rates) ?? card.amount;
 return cards.sort((a, b) => Number(a.excluded) - Number(b.excluded) || Number(b.entry.kind === 'Salary') - Number(a.entry.kind === 'Salary') || size(b) - size(a));
}

/** The payments of a card as entered: one currency added up, a second currency ends it (null). */
function enteredWith(before: Money | null | undefined, payment: Entry): Money | null {
 if (before === null || (before && before.currency !== payment.currency)) return null;
 return { amount: (before?.amount ?? 0) + payment.amount, currency: payment.currency };
}

/** A month's income headline: what was received against the estimate, over every card (not only the previewed five).
 * Each card is in its own currency; `convert` brings it into the headline's (the display currency), and without it the
 * cards must already share one. `missing` counts amounts no rate converts; the received total is then unknown. */
export function incomeCardTotals(cards: readonly (Pick<IncomeCard, 'amount' | 'excluded' | 'receivedAmount' | 'missing'> & { entry?: Pick<Entry, 'currency'> })[], convert: (amount: number, currency: string) => number | null = amount => amount) {
 return cards.reduce((sum, card) => {
  const currency = card.entry?.currency ?? '', estimate = card.excluded ? 0 : convert(card.amount, currency), received = convert(card.receivedAmount, currency);
  return { estimate: sum.estimate + (estimate ?? 0), received: sum.received + (received ?? 0), missing: sum.missing + (card.missing ?? 0) + Number(estimate === null) + Number(received === null) };
 }, { estimate: 0, received: 0, missing: 0 });
}
