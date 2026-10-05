import { assets, financialTotals, liabilities, type Entry } from './finance';
import { marketEntry, type MarketData } from './market';

/** The workspace's records in the display currency, and what follows from them: net worth, total debt, and the
 * currencies whose assets or debts are left out because no rate converts them. The sample workspace counts its own
 * rows; signed in, the server's summary of every record. */
export function workspaceTotals({ records, planningRecords, currency, market }: { records: Entry[]; planningRecords: Entry[]; currency: string; market: MarketData | null }) {
 const convert = (list: Entry[]) => list.map(record => marketEntry(record, currency, market)).filter((record): record is Entry => record !== null);
 const excludedCurrencies = [...new Set(records.filter(record => [...assets, ...liabilities].includes(record.kind) && marketEntry(record, currency, market) === null).map(record => record.currency))];
 const current = convert(records);
 const { totalDebt, netWorth } = financialTotals(current);
 return { current, monthlyIncomeEntries: convert(planningRecords), excludedCurrencies, totalDebt, netWorth };
}

/** A signed-in workspace shows its loading state until its settings, its first records (or summary), its expense
 * plans and, the first time, the market have arrived. The sample workspace never waits. */
export const workspaceLoading = ({ demo, settingsLoading, summaryLoaded, tableLoading, plansLoading, marketReady, marketLoading }: { demo: boolean; settingsLoading: boolean; summaryLoaded: boolean; tableLoading: boolean; plansLoading: boolean; marketReady: boolean; marketLoading: boolean }) =>
 !demo && (settingsLoading || (!summaryLoaded && tableLoading) || plansLoading || (!marketReady && marketLoading));
