"use client";
import { demoHistory } from '@/lib/demo-finance';
import { InvestmentPeriodSummary } from '@/components/investment-period-summary';
import { InvestmentComparison } from '@/components/investment-comparison';
import { getInvestmentPortfolio, investmentValueChange } from '@/lib/investment-portfolio';
import { shiftDay } from '@/lib/benchmark-data';
import { isInvestmentRecord } from '@/lib/comparison-profile';
import { refreshRead } from '@/lib/refresh-read';
import { PortfolioTooltip } from '@/components/portfolio-tooltip';
import { portfolioChanges, type PortfolioChange } from '@/lib/portfolio-changes';
import { PartialTotal } from '@/components/partial-total';
import { IncomeHistoryChart } from '@/components/income-history-chart';
import { useEffect, useMemo, useState } from 'react';
import { useLanguage } from '@/components/language-provider';
import { Button } from '@/components/ui/button';
import { LoadingPlaceholder } from '@/components/loading-placeholder';
import { financialTotals, liabilities, type Entry } from '@/lib/finance';
import { formatMoney, formatNumber } from '@/lib/format';
import { depositToday } from '@/lib/deposit-interest';
import { type PortfolioSnapshot } from '@/lib/portfolio-snapshots';
import { portfolioWindow } from '@/lib/portfolio-history';
import { type HistoryEvent } from '@/lib/investment-history';
import { convertAmount, type MarketData } from '@/lib/market';

type History = { records: Entry[]; events: HistoryEvent[]; cashflows?: Entry[]; incomeRecords?: Entry[] };
export function PortfolioOverview({ entries, demoRecords, currency, market, demo, revision, onOpenActivity }: { demoRecords?: Entry[]; onOpenActivity?:(activity:PortfolioChange)=>void; excludedCurrencies?:string[]; snapshots: PortfolioSnapshot[]; snapshotError: string; onSnapshotRetry: () => void; entries: Entry[]; currency: string; market: MarketData | null; demo: boolean; revision: number }) {
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
 const portfolio = getInvestmentPortfolio({records:allRecords,events:history?.events??[],cashflows:history?.cashflows,market,currency,today});
 const {performance,rates,points,records:portfolioRecords,excluded:investmentExcluded}=portfolio;
 const portfolioIds = new Set(portfolioRecords.map(record=>record.id));
 const portfolioCashflows = (history?.cashflows ?? []).filter(record=>portfolioIds.has(record.business_id??record.income_source_id??''));
 const portfolioValue = demo ? financialTotals(entries.filter(isInvestmentRecord)).totalAssets : portfolio.value;
 const visible = portfolioWindow(points, range, today);
 const detailEvents=(history?.events??[]).filter(event=>!liabilities.includes(allRecords.find(record=>record.id===event.record_id)?.kind??'')||['withdrawal','mortgage_payment'].includes(event.event_type));
 const details = portfolioChanges(visible, portfolioRecords, detailEvents, portfolioCashflows, currency, rates);
 for(const detail of details.values())for(const row of detail.activity){
  const event=detailEvents.find(event=>event.id===row.id);
  if(event?.event_type==='mortgage_payment'){
   row.amount=convertAmount(Number(event.principal),row.record!.currency,currency,rates);
   row.label='Principal repaid';
  }
 }
 const change = investmentValueChange(visible.map(point=>point.net));
 const loading = !demo && !history && !error;
 return <>
  <section className="panel portfolio-trend">
   <div className="panel-title"><div><h2>{t('Portfolio over time')}</h2></div><div className="portfolio-ranges" aria-label={t('History period')}>{[30, 90, 365, null].map(days => <Button key={String(days)} size="sm" variant={range === days ? 'default' : 'outline'} aria-pressed={range === days} onClick={() => setRange(days)}>{days === null ? t('All history') : t('{days} days', { days: formatNumber(days, locale, 0) })}</Button>)}</div></div>
   <div className="portfolio-headline"><div><span>{t('Investment value today')}</span><strong>{portfolioValue===null?'—':money(portfolioValue)}</strong><PartialTotal currencies={investmentExcluded}/></div>{!loading && !error && change !== null && <div><span>{t('Change in selected period')}</span><strong className={change >= 0 ? 'positive' : 'negative'}>{money(change)}</strong></div>}</div>
   {loading ? <LoadingPlaceholder label={t('Loading history…')}/> : error ? <p role="alert" className="error">{t('Could not load portfolio history.')} <Button variant="outline" onClick={() => { setError(false); setHistory(null); setRetry(n => n + 1); }}>{t('Retry')}</Button></p> : <>
    <InvestmentPeriodSummary input={{records:allRecords,events:history?.events??[],cashflows:history?.cashflows,market,currency,today}} start={range===null?'0000-01-01':shiftDay(today,-range)}/>
    <InvestmentComparison history={history??{records:[],events:[]}} today={today} currency={currency} market={market} demo={demo} embedded={{days:range??0,points:visible,tooltip:<PortfolioTooltip valueKey="actual" showBalanceDifference={false} valueLabel="Investment value" details={details} currency={currency} onOpenActivity={onOpenActivity}/>}}/>
    {performance.missing && <p className="muted">{t('Some investment balances or exchange rates are missing.')}</p>}
    {investmentExcluded.length > 0 && <p className="muted">{t('Some currencies could not be converted and are excluded from totals.')}</p>}
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
