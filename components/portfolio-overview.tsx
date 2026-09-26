"use client";
import type { BenchmarkMovement } from '@/lib/investment-benchmarks';
import { demoHistory } from '@/lib/demo-finance';
import { InvestmentPeriodSummary } from '@/components/investment-period-summary';
import { InvestmentComparison } from '@/components/investment-comparison';
import { investmentValueChange } from '@/lib/investment-portfolio';
import { shiftDay } from '@/lib/benchmark-data';
import { refreshRead } from '@/lib/refresh-read';
import { PortfolioTooltip } from '@/components/portfolio-tooltip';
import { portfolioChanges, type PortfolioChange } from '@/lib/portfolio-changes';
import { PartialTotal } from '@/components/partial-total';
import { IncomeHistoryChart } from '@/components/income-history-chart';
import { useEffect, useMemo, useState } from 'react';
import { useLanguage } from '@/components/language-provider';
import { Button } from '@/components/ui/button';
import { LoadingPlaceholder } from '@/components/loading-placeholder';
import { financialTotals, type Entry } from '@/lib/finance';
import { formatMoney, formatNumber } from '@/lib/format';
import { depositToday } from '@/lib/deposit-interest';
import { mergePortfolioPoints, type PortfolioSnapshot } from '@/lib/portfolio-snapshots';
import { portfolioHistory, portfolioWindow } from '@/lib/portfolio-history';
import { type HistoryEvent } from '@/lib/investment-history';
import { convertAmount, type MarketData } from '@/lib/market';

type History = { movements?:BenchmarkMovement[]; records: Entry[]; events: HistoryEvent[]; cashflows?: Entry[]; incomeRecords?: Entry[] };
export function PortfolioOverview({ entries, excludedCurrencies = [], demoRecords, currency, market, demo, revision, onOpenActivity }: { demoRecords?: Entry[]; onOpenActivity?:(activity:PortfolioChange)=>void; excludedCurrencies?:string[]; snapshots: PortfolioSnapshot[]; snapshotError: string; onSnapshotRetry: () => void; entries: Entry[]; currency: string; market: MarketData | null; demo: boolean; revision: number }) {
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
 const history = useMemo(() => demo ? demoHistory(demoRecords ?? [], today) : savedHistory, [demo, demoRecords, today, savedHistory]);
 const money = (amount: number) => formatMoney(amount, currency, locale);
 const {totalAssets:assetTotal,totalDebt:debt,cash}=financialTotals(entries);
 const investments = entries.filter(entry => ['Stock', 'Crypto'].includes(entry.kind) && entry.cost > 0);
 const cost = investments.reduce((sum, entry) => sum + entry.cost * entry.quantity, 0);
 const gain = investments.reduce((sum, entry) => sum + (entry.amount - entry.cost) * entry.quantity, 0);
 const allRecords = history?.records ?? [];
 const rates = market?.rates ?? market?.fx?.rate;
 const recorded = portfolioHistory(allRecords, history?.events ?? [], currency, rates, today, true);
 const portfolioValue = assetTotal - debt;
 const points = mergePortfolioPoints(recorded.points, [], {date:today,assets:assetTotal,debt,net:portfolioValue});
 const visible = portfolioWindow(points, range, today);
 const detailEvents = history?.events ?? [];
 const details = portfolioChanges(visible, allRecords, detailEvents, history?.cashflows ?? [], currency, rates);
 for(const detail of details.values())for(const row of detail.activity){
  const event=detailEvents.find(event=>event.id===row.id);
  if(event?.event_type==='mortgage_payment'){
   row.amount=convertAmount(Number(event.principal),row.record!.currency,currency,rates);
   row.label='Principal repaid';
  }
 }
 const partialHistory = visible.some(point=>point.partial);
 const change = partialHistory ? null : investmentValueChange(visible.map(point=>point.net));
 const loading = !demo && !history && !error;
 const headline = <><div><span>{t('Net worth today')}</span><strong>{portfolioValue===null?'—':money(portfolioValue)}</strong><PartialTotal currencies={excludedCurrencies}/></div>{!loading && !error && change !== null && <div><span>{t('Change in selected period')}</span><strong className={change >= 0 ? 'positive' : 'negative'}>{money(change)}</strong></div>}</>;
 return <>
  <section className="panel portfolio-trend">
   <div className="panel-title"><div><h2>{t('Portfolio over time')}</h2></div><div className="portfolio-ranges" aria-label={t('History period')}>{[30, 90, 365, null].map(days => <Button key={String(days)} size="sm" variant={range === days ? 'default' : 'outline'} aria-pressed={range === days} onClick={() => setRange(days)}>{days === null ? t('All history') : t('{days} days', { days: formatNumber(days, locale, 0) })}</Button>)}</div></div>
   {!loading&&!error?<InvestmentPeriodSummary input={{records:allRecords,events:history?.events??[],cashflows:history?.cashflows,market,currency,today}} start={range===null?'0000-01-01':shiftDay(today,-range)}>{headline}</InvestmentPeriodSummary>:<div className="portfolio-headline">{headline}</div>}
   {loading ? <LoadingPlaceholder label={t('Loading history…')}/> : error ? <p role="alert" className="error">{t('Could not load portfolio history.')} <Button variant="outline" onClick={() => { setError(false); setHistory(null); setRetry(n => n + 1); }}>{t('Retry')}</Button></p> : <>
    <InvestmentComparison history={history??{records:[],events:[]}} today={today} currency={currency} market={market} demo={demo} embedded={{openingNetWorth:recorded.points[0]?{date:recorded.points[0].date,amount:recorded.points[0].net}:undefined,days:range??0,points:visible,tooltip:<PortfolioTooltip valueKey="actual" showBalanceDifference={!partialHistory} valueLabel="NET WORTH" details={details} currency={currency} onOpenActivity={onOpenActivity}/>}}/>
    {recorded.missing > 0 && <p className="muted">{t('Some holdings have no recorded history yet.')}</p>}
    {excludedCurrencies.length > 0 && <p className="muted">{t('Some currencies could not be converted and are excluded from totals.')}</p>}
   </>}
  </section>
  {!loading&&!error&&<IncomeHistoryChart records={history?.records??[]} events={history?.events??[]} incomeRecords={history?.incomeRecords??[]} currency={currency} rates={market?.rates??market?.fx?.rate} today={today}/>}
  <div className="portfolio-indicators">
   <article className="panel"><span>{t('Cash share')}</span><strong>{assetTotal > 0 ? formatNumber(cash / assetTotal * 100, locale, 1) + '%' : '—'}</strong><p>{t('Cash available')}: {money(cash)}</p></article>
   <article className="panel"><span>{t('Debt to assets')}</span><strong>{assetTotal > 0 ? formatNumber(debt / assetTotal * 100, locale, 1) + '%' : '—'}</strong><p>{t('Outstanding debt compared with everything you own.')}</p></article>
   <article className="panel"><span>{t('Stock & crypto gain / loss')}</span><strong className={cost > 0 ? gain >= 0 ? 'positive' : 'negative' : ''}>{cost > 0 ? money(gain) : '—'}</strong><p>{t('Current value minus entered purchase cost. Only holdings with a purchase price are included.')}</p></article>
  </div>
 </>;
}
