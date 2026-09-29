"use client";
import type { BenchmarkMovement } from '@/lib/investment-benchmarks';
import { demoHistory } from '@/lib/demo-finance';
import { InvestmentPeriodSummary } from '@/components/investment-period-summary';
import { InvestmentComparison } from '@/components/investment-comparison';
import { investmentValueChange } from '@/lib/investment-portfolio';
import { shiftDay } from '@/lib/benchmark-data';
import { refreshRead } from '@/lib/refresh-read';
import { PartialTotal } from '@/components/partial-total';
import { IncomeHistoryChart } from '@/components/income-history-chart';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { changePercent } from '@/lib/overview';
import { useLanguage } from '@/components/language-provider';
import { Button } from '@/components/ui/button';
import { ChartSkeleton } from '@/components/loading-placeholder';
import { financialTotals, type Entry } from '@/lib/finance';
import { formatMoney, formatNumber } from '@/lib/format';
import { depositToday } from '@/lib/deposit-interest';
import { mergePortfolioPoints, type PortfolioSnapshot } from '@/lib/portfolio-snapshots';
import { portfolioHistory, portfolioWindow } from '@/lib/portfolio-history';
import { type HistoryEvent } from '@/lib/investment-history';
import { type MarketData } from '@/lib/market';

type History = { movements?:BenchmarkMovement[]; records: Entry[]; events: HistoryEvent[]; cashflows?: Entry[]; incomeRecords?: Entry[] };
export function PortfolioOverview({ entries, excludedCurrencies = [], demoRecords, currency, market, demo, revision, children }: { children?: ReactNode; demoRecords?: Entry[]; excludedCurrencies?:string[]; snapshots: PortfolioSnapshot[]; snapshotError: string; onSnapshotRetry: () => void; entries: Entry[]; currency: string; market: MarketData | null; demo: boolean; revision: number }) {
 const { t, locale } = useLanguage();
 const [savedHistory, setHistory] = useState<History | null>(null);
 const [error, setError] = useState(false);
 const [retry, setRetry] = useState(0);
 const [range, setRange] = useState<number | null>(null);
 useEffect(() => {
  if (demo) return;
  const controller = new AbortController();
  refreshRead('/api/portfolio-history', { signal: controller.signal }).then(async response => {
   if (!response.ok) throw Error();
   const data = await response.json() as History;
   if (!controller.signal.aborted) { setHistory(data); setError(false); }
  }).catch(() => { if (!controller.signal.aborted) setError(true); });
  return () => controller.abort();
 }, [demo, revision, retry]);
 const today = depositToday();
 const history: History | null = useMemo(() => demo ? demoHistory(demoRecords ?? [], today) : savedHistory, [demo, demoRecords, today, savedHistory]);
 const money = (amount: number) => formatMoney(amount, currency, locale);
 const {totalAssets:assetTotal,totalDebt:debt}=financialTotals(entries);
 const allRecords = history?.records ?? [];
 const rates = market?.rates ?? market?.fx?.rate;
 const recorded = portfolioHistory(allRecords, history?.events ?? [], currency, rates, today, true);
 const portfolioValue = assetTotal - debt;
 const points = mergePortfolioPoints(recorded.points, [], {date:today,assets:assetTotal,debt,net:portfolioValue});
 const visible = portfolioWindow(points, range, today);
 const partialHistory = visible.some(point=>point.partial);
 const change = partialHistory ? null : investmentValueChange(visible.map(point=>point.net));
 const loading = !demo && !history && !error;
 const percent = changePercent(portfolioValue, change);
 const Trend = change !== null && change < 0 ? TrendingDown : TrendingUp;
 return <>
  <section className="panel portfolio-trend overview-hero" aria-labelledby="overview-net-worth">
   <header className="overview-hero-head">
    <div className="overview-hero-value">
     <h2 id="overview-net-worth">{t('Net worth')}</h2>
     <strong>{money(portfolioValue)}</strong>
     {!loading && !error && change !== null && <p><span className={change >= 0 ? 'overview-delta positive' : 'overview-delta negative'}><Trend size={15} aria-hidden="true"/>{change > 0 ? '+' : ''}{money(change)}{percent !== null && <> · {percent > 0 ? '+' : ''}{formatNumber(percent, locale, 1)}%</>}</span><span>{t('Change in selected period')}</span></p>}
     <PartialTotal currencies={excludedCurrencies}/>
    </div>
    <div className="portfolio-ranges overview-segments" role="group" aria-label={t('History period')}>{[30, 90, 365, null].map(days => <Button key={String(days)} size="sm" variant="ghost" aria-pressed={range === days} onClick={() => setRange(days)}>{days === null ? t('All history') : t('{days} days', { days: formatNumber(days, locale, 0) })}</Button>)}</div>
   </header>
   {loading ? <ChartSkeleton label={t('Loading history…')}/> : error ? <p role="alert" className="error">{t('Could not load portfolio history.')} <Button variant="outline" onClick={() => { setError(false); setHistory(null); setRetry(n => n + 1); }}>{t('Retry')}</Button></p> : <>
    <InvestmentComparison history={history??{records:[],events:[]}} today={today} currency={currency} market={market} demo={demo} days={range??0} points={visible} summary={<InvestmentPeriodSummary input={{records:allRecords,events:history?.events??[],cashflows:history?.cashflows,movements:history?.movements,market,currency,today}} start={range===null?'0000-01-01':shiftDay(today,-range)}/>}/>
    {recorded.missing > 0 && <p className="muted overview-hero-note">{t('Some holdings have no recorded history yet.')}</p>}
    {excludedCurrencies.length > 0 && <p className="muted overview-hero-note">{t('Some currencies could not be converted and are excluded from totals.')}</p>}
   </>}
  </section>
  {children}
  {!loading&&!error&&<IncomeHistoryChart records={history?.records??[]} events={history?.events??[]} incomeRecords={history?.incomeRecords??[]} currency={currency} rates={market?.rates??market?.fx?.rate} today={today}/>}
 </>;
}
