import { sortAssetsByWorth } from './asset-sort';
import { assetRecordKinds, expenses, income, lendingRecordKinds, normalizeEntry, type Entry } from './finance';
import { marketEntry, type MarketData } from './market';
import { compareRecordDates } from './record-dates';
import { filterRecords, type RecordFiltersValue } from './record-filters';
import { isTransactionHistory } from './transaction-history';

export type SectionKey = 'assets' | 'cashflow' | 'debts' | 'all';
export const recordsPerPage = 10;

/** The record table's slice of the workspace for a drawer section. */
export const sectionKeyOf = (section: string): SectionKey => section === 'Assets & investments' ? 'assets' : section === 'Income & expenses' ? 'cashflow' : section === 'Loans & debts' ? 'debts' : 'all';

/** Newest first; money lent counts from the day it was lent. */
export const sortRecords = (entries: Entry[]) => [...entries].sort((a, b) => compareRecordDates(a.kind === 'Money lent' ? a.lent_date || a.date : a.date, b.kind === 'Money lent' ? b.lent_date || b.date : b.date) || b.id.localeCompare(a.id));

const sectionKinds = (section: string): readonly string[] | null => section === 'Overview' ? null : section === 'Assets & investments' ? assetRecordKinds : section === 'Loans & debts' ? lendingRecordKinds : [...income, ...expenses];

export type RecordTableInput = {
 demo: boolean; section: string; sectionKey: SectionKey; locale: string; currency: string; market: MarketData | null;
 /** The sample workspace's records, or the page the server sent. */
 rows: Entry[];
 /** Every record of the workspace in the display currency (sample workspace) or the server's summary. */
 current: Entry[];
 /** Planning's full record list, which filtered views search. */
 planningRecords: Entry[]; planningLoading: boolean;
 filters: RecordFiltersValue; currencyFilter: string; page: number;
 /** Cash flow shows only transactions; signed in, its pages come from the transaction history read. */
 historyOnly: boolean; remoteHistory: boolean; useFilteredRecords: boolean;
 historyPage: { records: Entry[]; total: number; page: number }; historyLoading: boolean;
 recordTotal: number; loadedKey: string; requestKey: string;
};

/** What the record table shows: its rows in the display currency, how many there are, the page and whether it is loading. */
export function recordTableView(input: RecordTableInput) {
 const { demo, section, sectionKey, locale, currency, market, rows, current, filters, currencyFilter, page, historyOnly, remoteHistory, useFilteredRecords, historyPage } = input;
 const display = (record: Entry) => marketEntry(record, currency, market) ?? record;
 const kinds = sectionKinds(section);
 const demoVisible = (sectionKey === 'assets' ? sortAssetsByWorth : sortRecords)(current.filter(record => !kinds || kinds.includes(record.kind)));
 const filtered = filterRecords((demo ? rows : input.planningRecords).filter(record => (!historyOnly || isTransactionHistory(record)) && (sectionKey === 'all' || (sectionKey === 'debts' ? lendingRecordKinds : [...income, ...expenses]).includes(record.kind)) && (!currencyFilter || record.currency === currencyFilter)), filters, locale);
 const totalRecords = remoteHistory ? historyPage.total : useFilteredRecords ? filtered.length : demo ? demoVisible.length : input.recordTotal;
 const pageCount = Math.max(1, Math.ceil(totalRecords / recordsPerPage));
 const tablePage = remoteHistory ? historyPage.page : Math.min(page, pageCount);
 const tableLoading = remoteHistory ? input.historyLoading : !demo && (useFilteredRecords ? input.planningLoading : input.loadedKey !== input.requestKey);
 const slice = <T,>(list: T[], at: number) => list.slice((at - 1) * recordsPerPage, at * recordsPerPage);
 const visible = remoteHistory ? historyPage.records.map(record => display(normalizeEntry(record)))
  : useFilteredRecords ? slice(filtered, tablePage).map(display)
  : demo ? slice(demoVisible, page)
  : tableLoading ? []
  : sectionKey === 'assets' ? slice(sortAssetsByWorth(rows, record => marketEntry(record, currency, market)), page).map(display)
  : rows.map(display);
 return { visible, totalRecords, pageCount, tablePage, tableLoading };
}

/** The full stored copy of a record for viewing and editing. Summary rows (`record_count`) leave out dates,
 * accounts, notes and revisions, so a full record handed in wins over them. */
export function storedEntry(record: Entry, sources: { history: readonly Entry[]; planning: readonly Entry[]; rows: readonly Entry[]; summary: readonly Entry[] }, demo: boolean) {
 const find = (list: readonly Entry[]) => list.find(item => item.id === record.id);
 const full = demo || record.record_count === undefined;
 return normalizeEntry(find(sources.history) || find(sources.planning) || find(sources.rows) || (full ? record : find(sources.summary) || record));
}

/** The stored version of the record a form edits: in the open page, else in the planning list, else the record as
 * the dialog opened it when that was a saved one (a revision), as screens with their own reads (Transactions) hand
 * it over. Undefined for a new draft. */
export function savedRecord(id: string | undefined, rows: readonly Entry[], planning: readonly Entry[], opened?: Entry | null): Entry | undefined {
 if (id === undefined) return undefined;
 return rows.find(row => row.id === id) ?? planning.find(row => row.id === id) ?? (opened?.id === id && opened.revision != null ? opened : undefined);
}
