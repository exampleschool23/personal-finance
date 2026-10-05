"use client";
import { useState } from 'react';
import { useLocationSearch } from '@/hooks/use-location-search';
import { reportLink, type CashMode, type CashView, type ReportTab } from '@/lib/report-view';

/** The Reports tab, business filter and cash flow view, which a link can set: dashboard links open
 * /reports?tab=cash_flow&business=…&view=pnl. Each distinct query is applied once; afterwards the page's own
 * choices stand. */
export function useReportLink() {
 const search = useLocationSearch();
 const [tab, setTab] = useState<ReportTab>('cash_flow');
 const [businesses, setBusinesses] = useState<string[]>([]);
 const [cashView, setCashView] = useState<CashView>('sankey');
 const [cashMode, setCashMode] = useState<CashMode>('breakdown');
 const [appliedSearch, setAppliedSearch] = useState('');
 if (search !== appliedSearch) {
  setAppliedSearch(search);
  const link = reportLink(search);
  if (link.tab) setTab(link.tab);
  if (link.businesses) setBusinesses(link.businesses);
  if (link.view) setCashView(link.view);
  if (link.mode) setCashMode(link.mode);
 }
 return { tab, setTab, businesses, setBusinesses, cashView, setCashView, cashMode, setCashMode };
}
