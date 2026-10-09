"use client";
import { useMemo, useState } from 'react';
import { Briefcase } from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import { BusinessMark } from '@/components/presentation-foundation/business-mark';
import { DrawerLink } from '@/components/presentation-foundation/drawer-link';
import { EmptyState } from '@/components/presentation-foundation/empty-state';
import { LoadingPlaceholder } from '@/components/presentation-foundation/loading-placeholder';
import { PanelTitle } from '@/components/presentation-foundation/panel-title';
import { Segmented } from '@/components/presentation-foundation/segmented';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { useOwnerResource } from '@/hooks/use-owner-resource';
import { shiftMonth } from '@/lib/calendar-days';
import { businessNetAssets, cashFlowTrend, rangeFor, reportLedger, reportRangeLabels, type ReportRangePreset } from '@/lib/business-report';
import { depositToday } from '@/lib/deposit-interest';
import { normalizeEntry, type Entry } from '@/lib/finance';
import { formatMoney, formatNumber } from '@/lib/format';
import { marketEntry, type MarketData, marketRates } from '@/lib/market';
import { emptyPlanning, type PlanningData } from '@/lib/planning';
import type { TransactionSplit } from '@/lib/transaction-tools';

const periods: ReportRangePreset[] = ['this_month', 'last_month', 'this_year', 'last_12_months'];

/** A business's monthly net income as tiny bars: profit up in green, loss down in red. */
function NetBars({ values }: { values: number[] }) {
 const peak = Math.max(1, ...values.map(Math.abs));
 return <svg className="business-net-bars" viewBox={`0 0 ${values.length * 8} 28`} aria-hidden="true">
  <line x1="0" x2={values.length * 8} y1="14" y2="14"/>
  {values.map((value, index) => <rect key={index} x={index * 8 + 1} width="6" rx="1.5" y={value >= 0 ? 14 - value / peak * 13 : 14} height={Math.max(1, Math.abs(value) / peak * 13)} data-tone={value >= 0 ? 'positive' : 'negative'}/>)}
 </svg>;
}

/** Business tracking widget: each business's net income for a period (with its trend) or its net assets,
 * linking into the reports, the profit and loss table, the accounts and tax prep. */
export function BusinessCard({ owner, demo, revision, data: provided, splits, businesses, currency, market, onSetup }: { owner: string | null; demo: boolean; revision: number; data: PlanningData; splits: TransactionSplit[]; businesses: readonly Entry[]; currency: string; market: MarketData | null; onSetup: () => void }) {
 const { t, locale } = useLanguage();
 const today = depositToday();
 const [mode, setMode] = useState<'income' | 'assets'>('income');
 const [period, setPeriod] = useState<ReportRangePreset>('this_year');
 // The tiny bars cover the chosen period month by month; a period of a month or two shows the last six months instead.
 const range = rangeFor(period, today), sixBack = shiftMonth(today.slice(0, 7), -5) + '-01';
 const long = range.from <= shiftMonth(range.to.slice(0, 7), -2) + '-01', trendFrom = long ? range.from : sixBack, trendTo = long ? range.to : today;
 const from = range.from < trendFrom ? range.from : trendFrom;
 const live = !!owner && !demo;
 const remote = useOwnerResource(`/api/planning?scope=budget&month=${today.slice(0, 7)}&from=${from.slice(0, 7)}`, owner, live && businesses.length > 0, revision, emptyPlanning);
 const data = useMemo(() => live ? { ...remote.data, records: remote.data.records.map(normalizeEntry) } : provided, [live, remote.data, provided]);
 const rates = marketRates(market);
 const ledger = useMemo(() => reportLedger(data, splits, { from, to: today }, currency, today, rates).lines, [data, splits, from, today, currency, rates]);
 const assets = useMemo(() => businessNetAssets(provided.records.map(record => marketEntry(record, currency, market)), businesses.map(item => item.id)).byBusiness, [provided.records, currency, market, businesses]);
 const money = (amount: number) => formatMoney(amount, currency, locale);
 if (!businesses.length) return <section className="panel overview-panel dashboard-business" aria-label={t('Business tracking')}>
  <PanelTitle title={t('Business tracking')}/>
  <EmptyState icon={<Briefcase/>} description={t('Track a side business, freelance work or rentals beside your household.')}><Button onClick={onSetup}>{t('Set up business tracking')}</Button></EmptyState>
 </section>;
 return <section className="panel overview-panel dashboard-business" aria-label={t('Business tracking')}>
  <PanelTitle title={t('Business tracking')}>
   <Segmented label={t('Business tracking')} options={[{ value: 'income', label: t('Net income') }, { value: 'assets', label: t('Net assets') }] as const} value={mode} onChange={setMode}/>
  </PanelTitle>
  {mode === 'income' && <NativeSelect aria-label={t('Period')} value={period} onChange={event => setPeriod(event.currentTarget.value as ReportRangePreset)}>{periods.map(item => <option key={item} value={item}>{t(reportRangeLabels[item])}</option>)}</NativeSelect>}
  {live && remote.initialLoading ? <LoadingPlaceholder label={t('Loading records…')} rows={2}/> : <ul className="overview-list business-card-list">{businesses.map(business => {
   const lines = ledger.filter(line => line.business === business.id);
   if (mode === 'assets') {
    const net = assets.get(business.id)?.net ?? 0;
    return <li key={business.id}><BusinessMark name={business.name} color={business.business_color} logo={business.business_logo}/><DrawerLink className="business-card-name" href={`/accounts?business=${business.id}`}>{business.name}<small>{t('{count} accounts and assets', { count: formatNumber(assets.get(business.id)?.accounts.length ?? 0, locale, 0) })}</small></DrawerLink><span/><DrawerLink href={`/accounts?business=${business.id}`} className={net < 0 ? 'negative' : undefined}><strong>{money(net)}</strong></DrawerLink></li>;
   }
   const inPeriod = lines.filter(line => line.date >= range.from && line.date <= range.to);
   const net = inPeriod.reduce((sum, line) => sum + (line.direction === 'income' ? line.amount : -line.amount), 0);
   const trend = cashFlowTrend(lines, { from: trendFrom, to: trendTo }, 'month').map(row => row.net);
   return <li key={business.id}>
    <BusinessMark name={business.name} color={business.business_color} logo={business.business_logo}/>
    <DrawerLink className="business-card-name" href={`/reports?tab=cash_flow&business=${business.id}`}>{business.name}<small>{t(net < 0 ? 'Net loss' : 'Net profit')}</small></DrawerLink>
    <DrawerLink href={`/reports?tab=cash_flow&business=${business.id}&view=trends`} aria-label={t('Cash flow trend for {name}', { name: business.name })}><NetBars values={trend}/></DrawerLink>
    <DrawerLink href={`/reports?tab=cash_flow&business=${business.id}&view=pnl`} className="business-card-net" title={t('View P&L')}><strong className={net < 0 ? 'negative' : net > 0 ? 'positive' : undefined}>{money(net)}</strong><small>{t('View P&L')}</small></DrawerLink>
   </li>;
  })}</ul>}
  <DrawerLink className="panel-link" href="/reports?tab=tax">{t('Explore business tax tools')}</DrawerLink>
 </section>;
}
