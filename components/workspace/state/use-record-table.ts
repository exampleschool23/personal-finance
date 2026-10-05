"use client";
import { useState, type Dispatch, type SetStateAction } from 'react';
import { useOwnerResource } from '@/hooks/use-owner-resource';
import { useRecordFilters } from '@/hooks/use-record-filters';
import type { Entry } from '@/lib/finance';
import type { MarketData } from '@/lib/market';
import { activeFilterCount, recordsRequestKey, type RecordFiltersValue } from '@/lib/record-filters';
import { recordTableView, sectionKeyOf } from '@/lib/record-table';
import { useRecordReads } from './use-record-reads';

const emptyHistoryPage={records:[] as Entry[],total:0,page:1};

export type RecordTableInput = {
    user: string | null; demo: boolean; section: string; locale: string; currency: string; market: MarketData | null; reload: number;
    rows: Entry[]; setRows: Dispatch<SetStateAction<Entry[]>>; setSummary: Dispatch<SetStateAction<Entry[]>>; setError: Dispatch<SetStateAction<string>>;
    /** Every record in the display currency, which the sample workspace's table pages through. */
    current: Entry[];
    planning: { loading: boolean; data: { records: Entry[] } };
};

/** The record table of the open section: its filters and page, the reads behind it, and the rows it shows. Filtered
 * views and Cash flow search the full record list; signed in, Cash flow pages through the transaction history read.
 * In another currency without a rate, the server sends only the workspace currency's records. */
export function useRecordTable({ user, demo, section, locale, currency, market, reload, rows, setRows, setSummary, setError, current, planning }: RecordTableInput) {
    const [pageState, setPageState] = useState({ key: '', page: 1 });
    const sectionKey = sectionKeyOf(section);
    const {filters,setFilters:updateFilters}=useRecordFilters(sectionKey,demo?'demo':user);
    const setFilters=(next:RecordFiltersValue)=>{updateFilters(next);setPageState({key:'',page:1});};
    const filtersActive = sectionKey !== 'assets' && (activeFilterCount(filters) > 0);
    const historyOnly = sectionKey === 'cashflow';
    const useFilteredRecords = filtersActive || historyOnly;
    const remoteHistory = historyOnly && !demo;
    const currencyFilter = sectionKey === 'assets' || market?.rates?.[currency] ? '' : currency;
    const paginationKey = user + ':' + sectionKey + ':' + currencyFilter + ':' + JSON.stringify(filters);
    const page = pageState.key === paginationKey ? pageState.page : 1;
    const serverPage = useFilteredRecords ? 1 : page;
    const requestKey = recordsRequestKey(user,sectionKey,currencyFilter,serverPage);
    const reads = useRecordReads({ user, demo, section, sectionKey, currencyFilter, serverPage, reload, serverPaginationKey: recordsRequestKey(user,sectionKey,currencyFilter,0), requestKey },
        { setRows, setSummary, setError, onPage: next => { if(!useFilteredRecords&&next!==page)setPageState({key:paginationKey,page:next}); } });
    const historyParams=new URLSearchParams({...filters,page:String(page),currency:currencyFilter});
    const historyPage=useOwnerResource('/api/transaction-history?'+historyParams,user,remoteHistory,reload,emptyHistoryPage);
    const view = recordTableView({ demo, section, sectionKey, locale, currency, market, rows, current, planningRecords: planning.data.records, planningLoading: planning.loading, filters, currencyFilter, page, historyOnly, remoteHistory, useFilteredRecords, historyPage: historyPage.data, historyLoading: historyPage.loading, recordTotal: reads.recordTotal, loadedKey: reads.loadedKey, requestKey });
    const showFirstPage = () => setPageState({ key: paginationKey, page: 1 });
    const showPage = (next: number) => setPageState({ key: paginationKey, page: next });
    /** Signing out starts the table again from nothing. */
    const resetTable = () => { setPageState({key:'',page:1}); reads.resetReads(); };
    return { sectionKey, filters, setFilters, filtersActive, historyOnly, useFilteredRecords, remoteHistory, historyPage, ...view, recordsLoading: reads.recordsLoading, showFirstPage, showPage, summaryLoaded: reads.summaryLoaded, businesses: reads.businesses, resetTable };
}
