import { expenses, income, liabilities, type Entry } from './finance';

/** Legal structures whose profit flows through personal taxes. */
export const businessStructures = ['sole_proprietorship', 'llc', 'partnership', 'rental_property', 'other'] as const;
export type BusinessStructure = typeof businessStructures[number];
export const businessStructureLabels: Record<BusinessStructure, string> = {
 sole_proprietorship: 'Sole proprietorship', llc: 'Single-member LLC', partnership: 'Partnership', rental_property: 'Rental property', other: 'Other business',
};

/** Business and tag colours: one hue each, rendered through `paletteColor` so light and dark mode stay in step. */
const paletteHues = { teal: 175, blue: 215, indigo: 240, violet: 270, pink: 330, red: 0, orange: 25, amber: 42, green: 140, slate: 215 } as const;
export type PaletteColor = keyof typeof paletteHues;
export const paletteColors = Object.keys(paletteHues) as PaletteColor[];
export const paletteLabels: Record<PaletteColor, string> = { teal: 'Teal', blue: 'Blue', indigo: 'Indigo', violet: 'Violet', pink: 'Pink', red: 'Red', orange: 'Orange', amber: 'Amber', green: 'Green', slate: 'Grey' };
export const paletteColor = (color: string | null | undefined) => {
 const key = (color && Object.hasOwn(paletteHues, color) ? color : 'slate') as PaletteColor;
 return key === 'slate' ? 'hsl(215 14% 52%)' : `hsl(${paletteHues[key]} 62% 46%)`;
};
/** A colour for a new business or tag: the first one not yet taken. */
export const nextPaletteColor = (taken: readonly (string | null | undefined)[]) => paletteColors.find(color => color !== 'slate' && !taken.includes(color)) ?? 'slate';

/** The household is everything without a business. */
export const HOUSEHOLD = 'household';
/** Records shown as one business: its Business record. */
export const businessesIn = (records: readonly Entry[]) => records.filter(record => record.kind === 'Business');

/** Records that can belong to a business as its accounts and assets: everything held or owed except the Business record itself. */
const businessAccountKinds: readonly string[] = ['Cash', 'Stock', 'Crypto', 'Deposit', 'Treasury bill', 'Property', 'Valuables', 'Money lent', ...liabilities];
export const isBusinessAccount = (record: Pick<Entry, 'kind'>) => businessAccountKinds.includes(record.kind);
/** Those records by type, as lists that assign accounts to businesses show them. */
export const businessAccountGroups: ReadonlyArray<readonly [label: string, matches: (record: Pick<Entry, 'kind'>) => boolean]> = [
 ['Cash and deposits', record => ['Cash', 'Deposit', 'Treasury bill'].includes(record.kind)],
 ['Holdings', record => ['Stock', 'Crypto'].includes(record.kind)],
 ['Property and other assets', record => ['Property', 'Valuables', 'Money lent'].includes(record.kind)],
 ['Loans and debts', record => liabilities.includes(record.kind)],
];

/** Whether a business can be set on a transaction by hand, mirroring `public.assign_transaction_business`. */
export function canAssignBusiness(record: Entry, business: string | null) {
 return record.frequency === 'Once' && [...income, ...expenses].includes(record.kind) && !record.history_event_id && !record.earning_source_id
  && !(record.kind === 'Salary' && record.income_source_id) && (business !== null || record.kind !== 'Business income') && (business === null || !record.expense_plan_id)
  && (record.business_id ?? null) !== business;
}

/** The selected businesses of a filter. Empty means everything. */
export type BusinessFilter = readonly string[];
export const inBusinessFilter = (filter: BusinessFilter, business: string | null | undefined) => !filter.length || filter.includes(business ?? HOUSEHOLD);

/** Moves the chosen transactions to a business (or the household); the sample workspace's copy of the database function. */
export function assignBusiness(records: readonly Entry[], ids: readonly string[], business: string | null, names?: ReadonlyMap<string, string>) {
 const wanted = new Set(ids);
 let changed = 0;
 const next = records.map(record => {
  if (!wanted.has(record.id) || !canAssignBusiness(record, business)) return record;
  changed++;
  return { ...record, business_id: business, ...(record.kind === 'Business income' && business && names?.get(business) ? { name: names.get(business)! } : {}) };
 });
 return { records: next, changed };
}

/** An account changes business and takes along the transactions that followed it; the sample workspace's copy of `public.set_account_business`. */
export function moveAccountToBusiness(records: readonly Entry[], accountId: string, business: string | null) {
 const account = records.find(record => record.id === accountId);
 if (!account || !isBusinessAccount(account) || (account.business_id ?? null) === business) return { records: [...records], changed: 0 };
 const before = account.business_id ?? null;
 const follows = (record: Entry) => (record.account_id === accountId || (account.kind === 'Property' && record.kind === 'Rent income' && record.income_source_id === accountId))
  && (record.business_id ?? null) === before && canAssignBusiness(record, business);
 let changed = 0;
 const next = records.map(record => {
  if (record.id === accountId) return { ...record, business_id: business };
  if (!follows(record)) return record;
  changed++;
  return { ...record, business_id: business };
 });
 return { records: next, changed };
}

/** A transaction moved to another account takes that account's business, unless its business was chosen by hand
 * (it differs from the old account's). Spending inside a monthly plan stays household spending. */
export function withAccount(entry: Entry, accountId: string | null, records: readonly Entry[]): Entry {
 const before = records.find(record => record.id === entry.account_id)?.business_id ?? null;
 const after = records.find(record => record.id === accountId)?.business_id ?? null;
 const follows = (entry.business_id ?? null) === before && entry.kind !== 'Business income' && !entry.expense_plan_id && !(entry.kind === 'Salary' && entry.income_source_id);
 return { ...entry, account_id: accountId, ...(follows && after && after !== before ? { business_id: after } : follows && !after && before ? { business_id: null } : {}) };
}

/** What to do after setup, each with the page that does it. Someone who tracked a business by hand before is shown
 * how their categories, tags and rules carry over; the guide reopened from Settings adds the tags card when tags exist. */
export function setupGuide(trackedBefore: boolean | null, hasTags: boolean): Array<{ emoji: string; title: string; detail: string; action: string; href: string }> {
 const tags = { emoji: '🔖', title: 'Move tagged history', detail: 'In Settings, open Tags and click a tag’s transaction count, then select them and set their business.', action: 'Open tags', href: '/settings#tags' };
 return trackedBefore ? [
  { emoji: '🏷️', title: 'Keep your categories', detail: 'Any category works for business transactions. Nothing needs recategorizing.', action: 'Review transactions', href: '/transactions' },
  tags,
  { emoji: '⚙️', title: 'Update your rules', detail: 'Rules that tagged a business can now set the business itself.', action: 'Set up rules', href: '/settings#rules' },
 ] : [
  { emoji: '🧾', title: 'Assign personal-account spending', detail: 'On Transactions, set the business of anything paid from a personal account.', action: 'Review transactions', href: '/transactions?business=household' },
  { emoji: '⚙️', title: 'Create rules', detail: 'A rule can send every purchase from a merchant to a business automatically.', action: 'Set up rules', href: '/settings#rules' },
  { emoji: '📊', title: 'Watch each business', detail: 'Reports show each business’s profit and loss; tax prep is ready when you need it.', action: 'Explore business tax tools', href: '/reports?tab=tax' },
  ...(trackedBefore === null && hasTags ? [tags] : []),
 ];
}
