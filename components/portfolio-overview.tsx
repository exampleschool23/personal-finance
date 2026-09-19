"use client";
import { InvestmentComparison } from '@/components/investment-comparison';
import { PartialTotal } from '@/components/partial-total';
import { IncomeHistoryChart } from '@/components/income-history-chart';
import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useLanguage } from '@/components/language-provider';
import { Button } from '@/components/ui/button';
import { LoadingPlaceholder } from '@/components/loading-placeholder';
import { financialTotals, type Entry } from '@/lib/finance';
import { formatDate, formatMoney, formatNumber } from '@/lib/format';
import { depositToday } from '@/lib/deposit-interest';
import { snapshotPoints, mergePortfolioPoints, type PortfolioSnapshot } from '@/lib/portfolio-snapshots';
import { portfolioHistory, portfolioWindow, portfolioChartDomain } from '@/lib/portfolio-history';
import { historyChartDate, type HistoryEvent } from '@/lib/investment-history';
import { type MarketData } from '@/lib/market';

type History = { records: Entry[]; events: HistoryEvent[]; cashflows?: Entry[]; incomeRecords?: Entry[] };
export function PortfolioOverview({ excludedCurrencies=[], entries, currency, market, demo, revision, snapshots, snapshotError, onSnapshotRetry }: { excludedCurrencies?:string[]; snapshots: PortfolioSnapshot[]; snapshotError: string; onSnapshotRetry: () => void; entries: Entry[]; currency: string; market: MarketData | null; demo: boolean; revision: number }) {
 const { t, locale } = useLanguage();
 const [history, setHistory] = useState<History | null>(null);
 const [error, setError] = useState(false);
 const [retry, setRetry] = useState(0);
 const [historyMode,setHistoryMode]=useState<'recorded'|'observed'>('recorded');
 const [series, setSeries] = useState<'net' | 'assets' | 'debt' | 'all'>('net');
 const [range, setRange] = useState<number | null>(null);
 useEffect(() => {
  if (demo) return;
  const controller = new AbortController();
  fetch('/api/portfolio-history', { signal: controller.signal }).then(async response => {
   if (!response.ok) throw Error();
   const data = await response.json() as History;
   if (!controller.signal.aborted) { setHistory(data); setError(false); }
  }).catch(() => { if (!controller.signal.aborted) setError(true); });
  return () => controller.abort();
 }, [demo, revision, retry]);
 const today = depositToday();
 const money = (amount: number) => formatMoney(amount, currency, locale);
 const {totalAssets:assetTotal,totalDebt:debt,cash,netWorth}=financialTotals(entries);
 const investments = entries.filter(entry => ['Stock', 'Crypto'].includes(entry.kind) && entry.cost > 0);
 const cost = investments.reduce((sum, entry) => sum + entry.cost * entry.quantity, 0);
 const gain = investments.reduce((sum, entry) => sum + (entry.amount - entry.cost) * entry.quantity, 0);
 const tracked = portfolioHistory(history?.records ?? [], history?.events ?? [], currency, market?.rates ?? market?.fx?.rate, today);
 // Today's quoted balances are a current snapshot, not a historical market-price feed.
 const points = mergePortfolioPoints(tracked.points, snapshotPoints(snapshots, currency), { date: today, assets: assetTotal, debt, net: netWorth }, historyMode);
 const visible = portfolioWindow(points, range, today);
 const change = visible.length > 1 ? visible.at(-1)!.net - visible[0].net : null;
 const chartKeys = series === 'all' ? ['net', 'assets', 'debt'] as const : [series];
 const chartDomain = portfolioChartDomain(visible, chartKeys);
 const onlyPoint = visible.length === 1;
 const startingTime = Date.parse(today + 'T00:00:00Z');
 const startingDot = ({cx,cy,stroke}:{cx?:number;cy?:number;stroke?:string}) => <g><line x1={cx} x2={(cx??0)+48} y1={cy} y2={cy} stroke={stroke} strokeWidth={3} strokeLinecap="round"/><circle cx={cx} cy={cy} r={4} fill={stroke}/></g>;
 const loading = !demo && !history && !error;
 return <>
  {!loading&&!error&&<InvestmentComparison history={history??{records:[],events:[]}} today={today} currency={currency} market={market} demo={demo}/>}
  <section className="panel portfolio-trend">
   <div className="panel-title"><div><h2>{t('Portfolio over time')}</h2><p className="muted">{t('Recorded balances of your current holdings')}</p></div><div className="portfolio-ranges" aria-label={t('History period')}>{[30, 90, 365, null].map(days => <Button key={String(days)} size="sm" variant={range === days ? 'default' : 'outline'} aria-pressed={range === days} onClick={() => setRange(days)}>{days === null ? t('All history') : t('{days} days', { days: formatNumber(days, locale, 0) })}</Button>)}</div></div>
   <div className="portfolio-headline"><div><span>{t('Net worth today')}</span><strong>{money(netWorth)}</strong><PartialTotal currencies={excludedCurrencies}/></div>{!loading && !error && change !== null && <div><span>{t('Change in selected period')}</span><strong className={change >= 0 ? 'positive' : 'negative'}>{money(change)}</strong></div>}</div>
   {loading ? <LoadingPlaceholder label={t('Loading history…')}/> : error ? <p role="alert" className="error">{t('Could not load portfolio history.')} <Button variant="outline" onClick={() => { setError(false); setHistory(null); setRetry(n => n + 1); }}>{t('Retry')}</Button></p> : <>
    <div className="portfolio-ranges" role="group" aria-label={t('History source')}>{(['recorded','observed'] as const).map(mode=><Button key={mode} variant={historyMode===mode?'default':'outline'} aria-pressed={historyMode===mode} onClick={()=>setHistoryMode(mode)}>{t(mode==='recorded'?'Dated balances':'Daily observations')}</Button>)}</div>
    <div className="portfolio-ranges" role="group" aria-label={t('Chart series')}>{([{key:'net',label:'NET WORTH'},{key:'assets',label:'Total assets'},{key:'debt',label:'Outstanding debt'},{key:'all',label:'All'}] as const).map(item=><Button key={item.key} size="sm" variant={series===item.key?'default':'outline'} aria-pressed={series===item.key} onClick={()=>setSeries(item.key)}>{t(item.label)}</Button>)}</div>
    <p className="footnote">{t(historyMode==='recorded'?'Value changes take effect on their recorded dates. Moving cash into an asset or repaying principal does not itself create profit.':'Daily observations reflect what was entered at the time. Added or corrected records can make these totals incomparable.')}</p>
    <div className="portfolio-chart" aria-label={t('Portfolio over time')}><ResponsiveContainer width="100%" height={310}><LineChart data={visible.map(point => ({ ...point, timestamp: Date.parse(point.date + 'T00:00:00Z') }))} accessibilityLayer margin={{ top: 15, right: 15, left: 5, bottom: 10 }}>
     <CartesianGrid stroke="var(--border)" strokeDasharray="3 5" vertical={false}/>
     <XAxis dataKey="timestamp" type="number" scale="time" domain={onlyPoint ? [startingTime,startingTime+86400000] : ['dataMin', 'dataMax']} ticks={onlyPoint ? [startingTime] : undefined} tickFormatter={date => formatDate(historyChartDate(Number(date)), locale)} minTickGap={80}/>
     <YAxis width={120} domain={chartDomain} allowDataOverflow tickCount={5} tickFormatter={money}/>
     <Tooltip labelFormatter={date => formatDate(historyChartDate(Number(date)), locale)} formatter={amount => money(Number(amount))} contentStyle={{ background: 'var(--background)', borderColor: 'var(--border)', borderRadius: 12 }}/>
     <Legend/>
     {chartKeys.includes('assets') && <Line type={historyMode==='recorded'?'stepAfter':'linear'} isAnimationActive={false} dataKey="assets" name={t('Total assets')} stroke="#0d9488" strokeWidth={2} dot={onlyPoint ? startingDot : false}/>}
     {chartKeys.includes('debt') && <Line type={historyMode==='recorded'?'stepAfter':'linear'} isAnimationActive={false} dataKey="debt" name={t('Outstanding debt')} stroke="#e18445" strokeWidth={2} strokeDasharray="5 4" dot={onlyPoint ? startingDot : false}/>}
     {chartKeys.includes('net') && <Line type={historyMode==='recorded'?'stepAfter':'linear'} isAnimationActive={false} dataKey="net" name={t('NET WORTH')} stroke="var(--primary)" strokeWidth={3} dot={onlyPoint ? startingDot : visible.length < 15} activeDot={{ r: 5 }}/>}
    </LineChart></ResponsiveContainer></div>
    {tracked.missing > 0 && <p className="muted">{t('{count} holdings need a dated balance in Tracker.', { count: formatNumber(tracked.missing, locale, 0) })}</p>}
    {tracked.excluded > 0 && <p className="muted">{t('Some currencies could not be converted and are excluded from totals.')}</p>}
    {snapshotError&&<p role="status" className="footnote">{t(snapshotError)} <Button variant="outline" size="sm" onClick={onSnapshotRetry}>{t('Retry')}</Button></p>}
    <p className="footnote">{t('Dated balances reconstruct current holdings from Tracker, using today’s exchange rates. Values carry forward until updated; today uses live quotes. Earlier daily observations are kept separately and do not override backdated corrections.')}</p>
   </>}
  </section>
  {!loading&&!error&&<IncomeHistoryChart records={demo?entries:history?.records??[]} events={history?.events??[]} incomeRecords={demo?entries:history?.incomeRecords??[]} currency={currency} rates={market?.rates??market?.fx?.rate} today={today}/>}
  <div className="portfolio-indicators">
   <article className="panel"><span>{t('Cash share')}</span><strong>{assetTotal > 0 ? formatNumber(cash / assetTotal * 100, locale, 1) + '%' : '—'}</strong><p>{t('Cash available')}: {money(cash)}</p></article>
   <article className="panel"><span>{t('Debt to assets')}</span><strong>{assetTotal > 0 ? formatNumber(debt / assetTotal * 100, locale, 1) + '%' : '—'}</strong><p>{t('Outstanding debt compared with everything you own.')}</p></article>
   <article className="panel"><span>{t('Stock & crypto gain / loss')}</span><strong className={cost > 0 ? gain >= 0 ? 'positive' : 'negative' : ''}>{cost > 0 ? money(gain) : '—'}</strong><p>{t('Current value minus entered purchase cost. Only holdings with a purchase price are included.')}</p></article>
  </div>
 </>;
}
