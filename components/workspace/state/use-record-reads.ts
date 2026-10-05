"use client";
import { useEffect, useEffectEvent, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { normalizeEntry, type Entry } from '@/lib/finance';
import { recordsRequestKey } from '@/lib/record-filters';
import { refreshRead } from '@/lib/refresh-read';

type Read = { user: string | null; demo: boolean; section: string; sectionKey: string; currencyFilter: string; serverPage: number; reload: number; serverPaginationKey: string; requestKey: string };

/** A signed-in account's records, a page at a time for the open section, and once per reload the summary of every
 * record (net worth, the market's instruments, kept by the caller) with the businesses. Settings reads none. A failed read empties the
 * table only when it was for a different page than the one showing. */
export function useRecordReads({ user, demo, section, sectionKey, currencyFilter, serverPage, reload, serverPaginationKey, requestKey }: Read, { setRows, setSummary, setError, onPage }: { setRows: Dispatch<SetStateAction<Entry[]>>; setSummary: Dispatch<SetStateAction<Entry[]>>; setError: Dispatch<SetStateAction<string>>; onPage: (page: number) => void }) {
    const [businesses, setBusinesses] = useState<Array<{ id: string; name: string }>>([]);
    const [recordTotal, setRecordTotal] = useState(0);
    const [recordsLoading, setRecordsLoading] = useState(false);
    const [loadedKey, setLoadedKey] = useState('');
    const recordReadError = useRef('');
    const [summaryLoaded, setSummaryLoaded] = useState(false);
    const summaryCache = useRef({ loaded: false, revision: -1 });
    const lastLoadedKey = useEffectEvent(() => loadedKey);
    const receiveServerPage = useEffectEvent(onPage);
    useEffect(() => {
        if (!user || demo || section === 'Settings') return;
        const controller = new AbortController();
        const markLoading = setTimeout(() => { if (!controller.signal.aborted) setRecordsLoading(true); }, 0);
        const params = new URLSearchParams({ page: String(serverPage), section: sectionKey, summary: summaryCache.current.loaded && summaryCache.current.revision === reload ? '0' : '1' });
        if (currencyFilter) params.set('currency', currencyFilter);
        refreshRead('/api/records?' + params, { signal: controller.signal }).then(async response => {
            const data = await response.json() as { error?: string; records: Entry[]; total: number; page: number; summary?: Entry[]; businesses?: Array<{ id: string; name: string }> };
            if (!response.ok) throw Error(data.error);
            if (controller.signal.aborted) return;
            setError(previous => previous === recordReadError.current ? '' : previous);
            setRows(data.records.map(normalizeEntry)); setRecordTotal(data.total);
            if (data.summary) { setSummary(data.summary.map(normalizeEntry)); setBusinesses(data.businesses || []); setSummaryLoaded(true); summaryCache.current = {loaded:true,revision:reload}; }
            setLoadedKey(recordsRequestKey(user,sectionKey,currencyFilter,data.page)); receiveServerPage(data.page);
        }).catch(error => { if (!controller.signal.aborted) { recordReadError.current=error.message; setError(error.message); if (lastLoadedKey() !== requestKey) { setRows([]); setRecordTotal(0); setLoadedKey(requestKey); } } })
          .finally(() => { clearTimeout(markLoading); if (!controller.signal.aborted) setRecordsLoading(false); });
        return () => { clearTimeout(markLoading); controller.abort(); };
    // The setters it receives are state setters, which never change, so they are left out.
    }, [user, demo, serverPage, section, sectionKey, currencyFilter, reload, serverPaginationKey, requestKey]); // eslint-disable-line react-hooks/exhaustive-deps
    /** Signing out forgets what was read. */
    const resetReads = () => { setLoadedKey(''); setBusinesses([]); setRecordTotal(0); setSummaryLoaded(false); summaryCache.current = {loaded:false,revision:-1}; };
    return { businesses, recordTotal, recordsLoading, loadedKey, summaryLoaded, resetReads };
}
