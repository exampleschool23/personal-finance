import { HOUSEHOLD } from './business';
import type { Drill, LedgerLine } from './business-report';
import { income } from './finance';
import type { Category } from './planning';

export const reportTabs = ['cash_flow', 'spending', 'income', 'tax'] as const;
export type ReportTab = typeof reportTabs[number];
export type CashView = 'sankey' | 'pnl';
export type CashMode = 'breakdown' | 'trends';
type Translate = (message: string, values?: Record<string, string | number>) => string;

/** What a Reports link asks for (/reports?tab=cash_flow&business=…&view=pnl, from the dashboard): a tab, the
 * businesses to narrow to, and the cash flow view. Unknown values are left out, so the page keeps its own. */
export function reportLink(search: string): { tab?: ReportTab; businesses?: string[]; view?: CashView; mode?: CashMode } {
 const params = new URLSearchParams(search), tab = params.get('tab'), view = params.get('view');
 return {
  ...(tab && (reportTabs as readonly string[]).includes(tab) ? { tab: tab as ReportTab } : {}),
  ...(params.has('business') ? { businesses: params.getAll('business').flatMap(value => value.split(',')).filter(Boolean) } : {}),
  ...(view === 'pnl' || view === 'sankey' ? { view, mode: 'breakdown' as const } : view === 'trends' ? { mode: 'trends' as const } : {}),
 };
}

/** Tax prep needs a business; a link to it without one falls back to cash flow. */
export const reportTabsFor = (hasBusinesses: boolean) => reportTabs.filter(tab => tab !== 'tax' || hasBusinesses);

/** The lines a tab reads: cash flow takes both directions, Spending and Income one each. */
export const tabLines = (tab: ReportTab, lines: LedgerLine[]) => tab === 'spending' ? lines.filter(line => line.direction === 'expense') : tab === 'income' ? lines.filter(line => line.direction === 'income') : lines;

/** A category's budget group; categories without one fall back to Income or Everyday spending by their direction. */
export function groupFinder(groups: ReadonlyMap<string, string>, categories: readonly Category[]) {
 return (key: string) => groups.get(key) ?? (income.includes(key) || categories.some(category => category.id === key && category.direction === 'income') ? 'Income' : 'Everyday spending');
}

/** Names for a report's keys: custom categories by their own name, built-in ones translated, businesses by name and
 * the household (no business) as Household. */
export function reportNames<B extends { id: string; name: string }>(categories: readonly Category[], businesses: readonly B[], t: Translate) {
 const byId = <T extends { id: string }>(list: readonly T[], id: string | null | undefined) => list.find(item => item.id === id);
 return {
  category: (key: string) => byId(categories, key)?.name ?? t(key),
  icon: (key: string) => byId(categories, key)?.name ?? key,
  group: (key: string) => t(key),
  business: (id: string | null) => !id || id === HOUSEHOLD ? t('Household') : byId(businesses, id)?.name ?? t('Business'),
  businessRecord: (id: string | null) => byId(businesses, id),
 };
}

/** What a chart click narrowed the transactions to, in words: "Groceries · Household". */
export function describeDrill(drill: Drill, names: Pick<ReturnType<typeof reportNames>, 'category' | 'business'>, t: Translate) {
 const what = drill.category ? names.category(drill.category) : drill.categories ? t('{count} categories', { count: drill.categories.length }) : drill.direction ? t(drill.direction === 'income' ? 'Income' : 'Expenses') : null;
 return [what, drill.merchant, drill.business !== undefined ? names.business(drill.business) : null].filter(Boolean).join(' · ');
}
