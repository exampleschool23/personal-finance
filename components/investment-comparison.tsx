"use client";
import { demoBenchmarkKeys } from '@/lib/demo-finance';
import { readOverviewBenchmarks, overviewBenchmarkStorageKey, toggleOverviewBenchmark } from '@/lib/overview-benchmarks';
import { portfolioAssets } from '@/lib/diversified-portfolio';
import { stockBenchmarks } from '@/lib/benchmark-selection';
import { Spinner } from '@/components/ui/spinner';
import { InvestmentPeriodSummary } from '@/components/investment-period-summary';
import { refreshRead } from '@/lib/refresh-read';
import { InvestmentValueChart } from '@/components/investment-value-chart';
import { useEffect,useMemo,useState,type ReactElement } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { LoadingPlaceholder } from '@/components/loading-placeholder';
import { useLanguage } from '@/components/language-provider';
import { formatDate,formatMoney,formatNumber } from '@/lib/format';
import { categoryColor } from '@/lib/category-colors';
import { liabilities,type Entry } from '@/lib/finance';
import { type MarketData } from '@/lib/market';
import { type HistoryEvent } from '@/lib/investment-history';
import { depositToday } from '@/lib/deposit-interest';
import { shiftDay,type BenchmarkData } from '@/lib/benchmark-data';
import { getInvestmentPortfolio, getInvestmentComparison, investmentValueChange } from '@/lib/investment-portfolio';
import { defaultComparisonPreferences,isInvestmentRecord,type ComparisonProfile } from '@/lib/comparison-profile';

type History={records:Entry[];events:HistoryEvent[];cashflows?:Entry[]};
export function InvestmentComparison({history,today,currency,market,demo,embedded}:{embedded?:{days:number;points:{date:string;net:number}[];tooltip:ReactElement};history:History;today:string;currency:string;market:MarketData|null;demo:boolean}){
 const {t,locale}=useLanguage();
 const [profile,setProfile]=useState<ComparisonProfile|null>(null),[profileError,setProfileError]=useState(''),[profileRetry,setProfileRetry]=useState(0);
 const [data,setData]=useState<BenchmarkData|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0),[loadedKey,setLoadedKey]=useState(''),[hidden,setHidden]=useState<string[]>([]),[windowDays,setWindowDays]=useState(0);
 const [overviewSelection,setOverviewSelection]=useState<{owner:string;keys:string[]}|null>(null);
 const [chosen,setChosen]=useState<string[]|null>(null);
 const [benchmarks,setBenchmarks]=useState<string[]|null>(null);
 const choices=history.records.filter(record=>isInvestmentRecord(record)||liabilities.includes(record.kind));
 const records=useMemo(()=>history.records.filter(record=>chosen===null||chosen.includes(record.id)),[history.records,chosen]);
 const portfolio=useMemo(()=>getInvestmentPortfolio({records,events:history.events,cashflows:history.cashflows,market,currency,today}),[records,history,market,currency,today]);
 useEffect(()=>{
  if(demo)return;const controller=new AbortController();
  refreshRead('/api/comparison-profile',{signal:controller.signal}).then(async response=>{const result=await response.json() as ComparisonProfile&{error?:string};if(!response.ok)throw Error(result.error);if(!controller.signal.aborted){setProfile(result);setProfileError('');}}).catch(reason=>{if(!controller.signal.aborted)setProfileError(reason.message);});
  return()=>controller.abort();
 },[demo,profileRetry]);
 useEffect(()=>{const refresh=()=>setProfileRetry(value=>value+1);window.addEventListener('comparison-settings-saved',refresh);window.addEventListener('focus',refresh);return()=>{window.removeEventListener('comparison-settings-saved',refresh);window.removeEventListener('focus',refresh);};},[]);
 const overviewOwner=demo?'demo':profile?.owner_id;
 const isEmbedded=!!embedded;
 useEffect(()=>{
  if(!isEmbedded||!overviewOwner)return;
  let cancelled=false;
  queueMicrotask(()=>{
   if(cancelled)return;
   let keys:string[]=demo?[...demoBenchmarkKeys]:[];
   try{if(localStorage.getItem(overviewBenchmarkStorageKey(overviewOwner))!==null)keys=readOverviewBenchmarks(localStorage,overviewOwner);}catch{}
   setOverviewSelection({owner:overviewOwner,keys});
  });
  return()=>{cancelled=true;};
 },[isEmbedded,overviewOwner,demo]);
 const overviewKeys=overviewSelection?.owner===overviewOwner?overviewSelection?.keys??[]:[];
 function toggleOverview(key:string){
  if(!overviewOwner)return;
  const keys=toggleOverviewBenchmark(overviewKeys,key);
  setOverviewSelection({owner:overviewOwner,keys});
  try{localStorage.setItem(overviewBenchmarkStorageKey(overviewOwner),JSON.stringify(keys));}catch{/* The current selection still works when browser storage is unavailable. */}
 }
 const events=portfolio.activity;
 const start=events[0]?.occurred_on??today;
 const appStart=profile?depositToday(new Date(profile.activity.started_at)):start;
 const selected:readonly string[]=benchmarks??profile?.preferences.benchmarks??defaultComparisonPreferences.benchmarks;
 const selectionKey=selected.join(',');
 const symbol=profile?.preferences.custom_symbol??'';
 const diversified=profile?.preferences.portfolio;
 const activeDiversified=selected.includes('PORTFOLIO')?diversified:null;
 const portfolioConfig=activeDiversified?.assets?JSON.stringify(activeDiversified):'';
 const portfolioCrypto=selected.includes('PORTFOLIO')&&!diversified?.assets&&diversified?.crypto?diversified.cryptoSymbol:'';
 const portfolioStock=selected.includes('PORTFOLIO')&&!diversified?.assets&&diversified?.stock?diversified.stockSymbol:'';
 const requestKey=events.length?start+':'+today+':'+selectionKey+':'+symbol+':'+portfolioCrypto+':'+portfolioStock+':'+portfolioConfig:'';
 useEffect(()=>{
  if(!requestKey||(!demo&&!profile&&!profileError))return;
  const controller=new AbortController(),params=new URLSearchParams({start,end:today,benchmarks:selectionKey});
  if(portfolioConfig)params.set('portfolio',portfolioConfig);
  if(symbol)params.set('symbol',symbol);
  if(portfolioCrypto)params.set('portfolioCrypto',portfolioCrypto);
  if(portfolioStock)params.set('portfolioStock',portfolioStock);
  refreshRead(demo?'/api/benchmarks?demo=1':'/api/benchmarks?'+params,{signal:controller.signal}).then(async response=>{const result=await response.json() as BenchmarkData&{error?:string};if(!response.ok)throw Error(result.error);if(!controller.signal.aborted){setData(result);setLoadedKey(requestKey);setError('');}}).catch(reason=>{if(!controller.signal.aborted){setError(reason.message);setLoadedKey(requestKey);setData(null);}});
  return()=>controller.abort();
 },[demo,requestKey,start,today,selectionKey,symbol,portfolioCrypto,portfolioStock,portfolioConfig,retry,profile,profileError]);
 const comparisonsLoading=!!requestKey&&((!demo&&!profile&&!profileError)||loadedKey!==requestKey);
 const ready=loadedKey===requestKey?data:null;
 const performance=portfolio.performance;
 const result=useMemo(()=>ready&&!performance.missing?getInvestmentComparison({records,events:history.events,cashflows:history.cashflows,market,currency,today},ready,activeDiversified):null,[ready,performance,records,history,market,currency,today,activeDiversified]);
 const points=result?.points??[];
 const last=points.at(-1);
 const viewStart=windowDays?([start,shiftDay(today,-windowDays)].sort().at(-1)!):start;
 const firstComplete=points.find(point=>point.actual!==null)?.date;
 const visiblePoints=points.filter(point=>point.date>=viewStart&&!!firstComplete&&point.date>=firstComplete);
 const valueChange=investmentValueChange(visiblePoints.map(point=>point.actual));
 const money=(amount:number)=>formatMoney(amount,currency,locale);
 const definitions=[{key:'actual',label:t(embedded?'NET WORTH':'My investments'),color:'var(--primary)',dash:undefined},...stockBenchmarks(profile?.preferences.benchmarks??[]).map(item=>({key:item.id,label:item.symbol,color:categoryColor(item.id),dash:'12 4'})),{key:'BTC',label:'Bitcoin · BTC',color:categoryColor('Crypto'),dash:undefined},{key:'SPY',label:'S&P 500 · SPY',color:categoryColor('Stock'),dash:'7 3'},{key:'HYG',label:t('High-yield bonds · HYG'),color:categoryColor('Property'),dash:'9 3 2 3'},{key:'depositUZS',label:t('{currency} deposit · {rate}%',{currency:'UZS',rate:formatNumber(21,locale)}),color:categoryColor('Deposit'),dash:'5 5'},{key:'depositUSD',label:t('{currency} deposit · {rate}%',{currency:'USD',rate:formatNumber(8,locale)}),color:categoryColor('Cash'),dash:'2 4'},{key:'CUSTOM',label:symbol,color:categoryColor('Business'),dash:'12 4'},{key:'PORTFOLIO',label:t('Diversified portfolio'),color:categoryColor('Money lent'),dash:'8 3 2 3'}];
 const displayed=definitions.filter(item=>item.key==='actual'||selected.includes(item.key));
 const visibleSeries=embedded?displayed.filter(item=>item.key==='actual'||overviewKeys.includes(item.key)):displayed.some(item=>!hidden.includes(item.key))?displayed.filter(item=>!hidden.includes(item.key)):displayed.filter(item=>item.key==='actual');
 const visibleKeys=new Set(visibleSeries.map(item=>item.key));
 if(embedded){
  const comparisonsByDate=new Map(points.map(point=>[point.date,point]));
  const chartPoints=embedded.points.map(point=>({...comparisonsByDate.get(point.date),...point,actual:point.net}));
  const chartSeries=result?visibleSeries:definitions.filter(item=>item.key==='actual');
  return <>
   {demo&&<p className="comparison-note">{t("Sample portfolio compared with real BTC and SPY price history. SPY tracks the S&P 500; deposits use assumed annual rates.")}</p>}
   <div className="comparison-legend" aria-busy={comparisonsLoading}>{comparisonsLoading&&<span role="status" className="flex items-center gap-2 muted"><Spinner aria-hidden="true"/>{t('Loading comparisons…')}</span>}{displayed.map(item=><button key={item.key} type="button" aria-pressed={visibleKeys.has(item.key)} disabled={item.key==='actual'||!overviewOwner} onClick={()=>toggleOverview(item.key)}><i style={{background:item.color}}/>{item.label}</button>)}</div>
   {ready&&visibleSeries.filter(item=>item.key!=='actual').map(item=>{const reason=ready.errors[item.key]??ready.errors.fx??(result?.unavailable.includes(item.key)?'Price data, exchange rates or funds needed for a matching withdrawal are unavailable.':null);return reason?<p key={item.key} className="comparison-note">{item.label}: {t(reason)}</p>:null;})}
   <InvestmentValueChart label="NET WORTH" points={chartPoints} currency={currency} series={chartSeries.map(item=>({...item,primary:item.key==='actual'}))} tooltip={chartSeries.length===1?embedded.tooltip:undefined}/>
   {error&&<p role="alert" className="error">{t(error)} <Button variant="outline" onClick={()=>{setLoadedKey('');setError('');setRetry(n=>n+1);}}>{t('Retry')}</Button></p>}
  </>;
 }
 return <section className="panel portfolio-trend investment-comparison">
  <div className="panel-title"><div><h2>{t('Investment performance')}</h2><p className="muted">{t('What your investments are worth compared with investing the same amounts on the same dates in each benchmark.')}</p></div><Button asChild variant="outline"><Link href="/settings#benchmarks">{t('Choose benchmarks in Settings')}</Link></Button></div>
  <p className="comparison-note">{t('Contributions, business spending and debt repayments are compared. Personal expenses and uninvested income are excluded.')}</p>
  <details className="comparison-method"><summary>{t('Choose investments and repayments')}</summary><div className="portfolio-ranges"><Button variant="outline" onClick={()=>setChosen(null)}>{t('All')}</Button><Button variant="outline" onClick={()=>setChosen([])}>{t('Clear selection')}</Button></div>{choices.map(record=><label key={record.id} className="planning-check"><Checkbox checked={chosen===null||chosen.includes(record.id)} onCheckedChange={checked=>setChosen(previous=>{const ids=previous??choices.map(item=>item.id);return checked===true?[...new Set([...ids,record.id])]:ids.filter(id=>id!==record.id);})}/> {record.name} · {t(record.kind)}</label>)}</details>
  <div className="portfolio-ranges" role="group" aria-label={t('Benchmarks')}>{definitions.filter(item=>item.key!=='actual'&&(item.key!=='CUSTOM'||symbol)&&(item.key!=='PORTFOLIO'||diversified)).map(item=><Button key={item.key} variant={selected.includes(item.key)?'default':'outline'} aria-pressed={selected.includes(item.key)} disabled={selected.length===1&&selected.includes(item.key)} onClick={()=>setBenchmarks(selected.includes(item.key)?selected.filter(key=>key!==item.key):[...selected,item.key])}>{item.label}</Button>)}</div>
  {demo?<p className="comparison-note">{t('Sign in to save investment comparisons.')}</p>:<>
   {profileError&&<p className="error" role="alert">{t(profileError)} {t('Showing default comparisons.')} <Button variant="outline" onClick={()=>{setProfileError('');setProfileRetry(n=>n+1);}}>{t('Retry')}</Button></p>}
   {!profile&&!profileError?<LoadingPlaceholder label={t('Loading comparisons…')}/>:<>
    {profile&&<p className="comparison-note">{t('Started using the app')}: {formatDate(appStart,locale)}. {profile.activity.source==='earliest_record'&&t('For this existing account, the start date is the earliest saved app activity.')}</p>}
    {!events.length?<p className="comparison-notice">{t('Select investments or debts with dated contributions, business spending or repayments to start the comparison.')}</p>:loadedKey!==requestKey?<LoadingPlaceholder label={t('Loading comparisons…')}/>:error?<p className="error" role="alert">{t(error)} <Button variant="outline" onClick={()=>{setLoadedKey('');setRetry(n=>n+1);}}>{t('Retry')}</Button></p>:<>
     {(performance.missing||(ready&&!result))&&<p className="comparison-notice">{t('An investment balance or exchange rate is missing. Performance is paused rather than using an incomplete total.')}</p>}
     {!!performance?.observed.length&&<p className="comparison-notice">{t('Some investments have no recorded purchase. Their first recorded value is used as opening capital, so earlier profit is unknown. Add the original investment amount and date in Tracker for a purchase-based comparison.')}</p>}
     {!!points.length&&<>
      <div className="portfolio-headline"><div><span>{t('Investment value today')}</span><strong>{typeof last?.actual==='number'?money(last.actual):'—'}</strong></div><div><span>{t('Change in selected period')}</span><strong className={valueChange===null?'':valueChange>=0?'positive':'negative'}>{valueChange===null?'—':money(valueChange)}</strong></div></div>
      <p className="comparison-note">{t('Investment balances change on their recorded dates. Contributions increase the portfolio value but are not profit.')}</p>
      {performance&&<details className="comparison-method"><summary>{t('Explain these numbers')}</summary>
      <div className="portfolio-headline"><div><span>{t('Net funding')}</span><strong>{typeof last?.contributed==='number'?money(last.contributed):'—'}</strong></div><div><span>{t('Value including payouts')}</span><strong>{typeof last?.actual==='number'?money(last.actual):'—'}</strong></div><div><span>{t('Result after costs')}</span><strong>{typeof last?.actual==='number'?money(last.actual-last.contributed):'—'}</strong></div></div>
       <p>{t('Result after costs = value including payouts minus net funding. This is not the change in your total wealth.')}</p>
       <p>{t('Each row reconciles the selected record. Expand a record to see the dated amounts used as funding. Opening capital is a recorded balance, not a verified purchase cost.')}</p>
       <div className="table-scroll"><table className="comparison-table"><thead><tr><th>{t('Record')}</th><th>{t('Net funding')}</th><th>{t('Value including payouts')}</th><th>{t('Result after costs')}</th></tr></thead><tbody>{performance.breakdown.map(row=><tr key={row.id}><td><details><summary>{row.name} · {t(row.kind)}</summary>
        {row.interestPaid>0&&<p>{t('Mortgage interest paid')}: {money(row.interestPaid)}</p>}
        {row.principalPaid>0&&<p>{t('Principal repaid')}: {money(row.principalPaid)}</p>}
        {row.income!==0&&<p>{t('Income received')}: {money(row.income)}</p>}
        <ul>{row.transactions.map(transaction=><li key={transaction.id}>{formatDate(transaction.date,locale)} · {t(transaction.label)} · {formatMoney(transaction.original,transaction.currency,locale)}{transaction.currency!==currency&&<> → {money(transaction.funding)}</>}</li>)}</ul>
       </details></td><td>{money(row.funding)}</td><td>{money(row.value)}</td><td>{money(row.result)}</td></tr>)}</tbody><tfoot><tr><th>{t('Total')}</th><td>{money(last?.contributed??0)}</td><td>{typeof last?.actual==='number'?money(last.actual):'—'}</td><td>{typeof last?.actual==='number'?money(last.actual-last.contributed):'—'}</td></tr></tfoot></table></div>
       <p>{t('Principal repayments retain value; interest is a cost. Valuation and currency changes also affect the result. Independently rounded rows may differ slightly from the total.')}</p>
      </details>}
      <div className="panel-title"><div className="comparison-legend">{displayed.map(item=><div className="comparison-legend-item" key={item.key}><button type="button" aria-pressed={visibleKeys.has(item.key)} disabled={!points.some(point=>typeof point[item.key]==='number')||(visibleKeys.has(item.key)&&visibleSeries.length===1)} onClick={()=>setHidden(previous=>previous.includes(item.key)?previous.filter(key=>key!==item.key):[...previous,item.key])}><i style={{background:item.color}}/>{item.label}</button></div>)}</div><div className="portfolio-ranges">{[30,90,365,0].map(days=><Button key={days} variant={windowDays===days?'default':'outline'} aria-pressed={windowDays===days} onClick={()=>setWindowDays(days)}>{days?t('{days} days',{days:formatNumber(days,locale)}):t('All history')}</Button>)}</div></div>
      <p className="comparison-note">{t('Time buttons zoom the chart. Values always use your original investment amounts and dates.')}</p>
      <p className="comparison-note">{t('Your investment values use the same current exchange rates as Overview. Benchmarks use dated prices and currency rates, then convert to your display currency at current rates.')}</p>
    <InvestmentPeriodSummary input={{records:history.records,events:history.events,cashflows:history.cashflows,market,currency,today}} start={viewStart}/>
      <InvestmentValueChart points={visiblePoints} currency={currency} height={340} series={visibleSeries.map(item=>({...item,primary:item.key==='actual'}))}/>

      {start===today&&<p className="comparison-note">{t('Your first day appears as a point. The line grows as prices and recorded investment values change.')}</p>}
      <div className="table-scroll"><table className="comparison-table"><thead><tr><th>{t('Allocation')}</th><th>{t('Value including payouts')}</th><th>{t('Result after costs')}</th><th>{t('Ahead / behind benchmark')}</th></tr></thead><tbody>{displayed.map(item=>{const amount=last?.[item.key],own=last?.actual;const difference=typeof amount==='number'&&typeof own==='number'?own-amount:null;return <tr key={item.key}><td><i style={{background:item.color}}/>{item.label}</td><td>{typeof amount==='number'?money(amount):'—'}</td><td>{typeof amount==='number'&&last?money(amount-last.contributed):'—'}</td><td>{item.key==='actual'||difference===null?'—':Math.round(Math.abs(difference))===0?t('Matching this benchmark'):t(difference>0?'Ahead by {amount}':'Behind by {amount}',{amount:money(Math.abs(difference))})}</td></tr>;})}</tbody></table></div>
     </>}
     {ready?.errors.fx&&<p className="comparison-note">{t(ready.errors.fx)}</p>}
     {ready&&displayed.filter(item=>item.key!=='actual').map(item=>{const reason=ready.errors[item.key]??(result?.unavailable.includes(item.key)?typeof last?.[item.key]==='number'?'Some earlier dates have missing prices or exchange rates. Gaps are left in the chart.':'Price data, exchange rates or funds needed for a matching withdrawal are unavailable.':null);return reason?<p key={item.key} className="comparison-note">{item.label}: {t(reason)}</p>:null;})}
     {ready&&(Object.keys(ready.errors).length>0||!!result?.unavailable.some(key=>selected.includes(key)))&&<Button variant="outline" onClick={()=>{setLoadedKey('');setRetry(n=>n+1);}}>{t('Retry unavailable comparisons')}</Button>}
    </>}
   </>}
   {selected.includes('PORTFOLIO')&&diversified&&<p className="comparison-note">{t('Diversified portfolio')}: {portfolioAssets(diversified).filter(asset=>asset.weight>0).map(asset=>`${formatNumber(asset.weight,locale)}% ${asset.symbol||asset.name||t({deposit:'Deposit',business:'Business',cash:'Cash',crypto:'Crypto',stock:'Stock',property:'Real estate',custom:'Custom asset'}[asset.kind])}`).join(' · ')}. {t('Split each contribution across these investments. Weights must total {target}%. Holdings are not automatically rebalanced.',{target:formatNumber(100,locale)})}</p>}<details className="comparison-method"><summary>{t('How this comparison works')}</summary><p>{t('Contributions, linked business spending and debt payments buy each benchmark on the payment date. Personal spending, charity and uninvested salary are excluded. Withdrawals sell the same cash amount on the same date.')}</p><p>{t('Each benchmark shows what the same dated investments would be worth in your selected currency. The difference from your investments shows how much money you are ahead or behind. Investment gain is value including payouts minus net contributions.')}</p><p>{t('Add livestock, a café, a business or crypto in Assets & investments. Record purchases, sales, income and value updates in Tracker. Keep sold investments with a zero balance to preserve their history.')}</p><p>{t('Recorded values carry forward until updated. Opening observations are disclosed when purchase history is missing. Cash balances and outstanding debts are not opening investments. Only actual repayments enter; principal counts as retained value and interest does not. Transferring or reinvesting money counts as another investment if entered as a new contribution.')}</p><p>{t('Fund histories include dividend and split adjustments. Deposit rates are assumed effective annual returns, compounded daily, before taxes and fees. Historical exchange-rate checkpoints are used between dates, so comparisons are estimates.')}</p></details>
  </>}
 </section>;
}
