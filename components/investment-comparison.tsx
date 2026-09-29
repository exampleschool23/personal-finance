"use client";
import { DatePicker } from '@/components/date-picker';
import { NativeSelect } from '@/components/ui/native-select';
import { benchmarkHistoryStart, benchmarkMethodStorageKey, readBenchmarkMethod, investmentComparisonCoverage, investmentDecisionComparison, purchaseComparisonStart, type ComparisonMethod, type BenchmarkMovement, type FundingScope } from '@/lib/investment-benchmarks';
import { validDay } from '@/lib/benchmark-data';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { BenchmarkTooltip } from '@/components/benchmark-tooltip';
import { demoBenchmarkKeys } from '@/lib/demo-finance';
import { readOverviewBenchmarks, overviewBenchmarkStorageKey, toggleOverviewBenchmark, overviewSeriesVisible } from '@/lib/overview-benchmarks';
import { portfolioQuotes } from '@/lib/diversified-portfolio';
import { stockBenchmarks } from '@/lib/benchmark-selection';
import { refreshRead } from '@/lib/refresh-read';
import { InvestmentValueChart } from '@/components/investment-value-chart';
import { useEffect,useMemo,useState,type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { ChartSkeleton } from '@/components/loading-placeholder';
import { useLanguage } from '@/components/language-provider';
import { formatDate,formatNumber } from '@/lib/format';
import { categoryColor } from '@/lib/category-colors';
import { type Entry } from '@/lib/finance';
import { type MarketData } from '@/lib/market';
import { type HistoryEvent } from '@/lib/investment-history';
import { shiftDay,type BenchmarkData } from '@/lib/benchmark-data';
import { defaultComparisonPreferences,type ComparisonProfile } from '@/lib/comparison-profile';

type History={movements?:BenchmarkMovement[];records:Entry[];events:HistoryEvent[];cashflows?:Entry[]};
export function InvestmentComparison({history,today,currency,market,demo,days,points,summary}:{days:number;points:{date:string;net:number}[];summary?:ReactNode;history:History;today:string;currency:string;market:MarketData|null;demo:boolean}){
 const {t,locale}=useLanguage();
 const [profile,setProfile]=useState<ComparisonProfile|null>(null),[profileError,setProfileError]=useState(''),[profileRetry,setProfileRetry]=useState(0);
 const [data,setData]=useState<BenchmarkData|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0),[loadedKey,setLoadedKey]=useState('');
 const [overviewSelection,setOverviewSelection]=useState<{owner:string;keys:string[]}|null>(null);
 const [methodChoice,setMethodChoice]=useState<{owner:string;method:ComparisonMethod}|null>(null);
 const [detailDate,setDetailDate]=useState<string|null>(null);
 useEffect(()=>{
  if(demo)return;const controller=new AbortController();
  refreshRead('/api/comparison-profile',{signal:controller.signal}).then(async response=>{const result=await response.json() as ComparisonProfile&{error?:string};if(!response.ok)throw Error(result.error);if(!controller.signal.aborted){setProfile(result);setProfileError('');}}).catch(reason=>{if(!controller.signal.aborted)setProfileError(reason.message);});
  return()=>controller.abort();
 },[demo,profileRetry]);
 useEffect(()=>{const refresh=()=>setProfileRetry(value=>value+1);window.addEventListener('comparison-settings-saved',refresh);window.addEventListener('focus',refresh);return()=>{window.removeEventListener('comparison-settings-saved',refresh);window.removeEventListener('focus',refresh);};},[]);
 const overviewOwner=demo?'demo':profile?.owner_id;
 useEffect(()=>{
  if(!overviewOwner)return;
  let cancelled=false;
  queueMicrotask(()=>{
   if(cancelled)return;
   // Until the owner chooses, show the headline market benchmarks rather than an empty comparison.
   let keys:string[]=[...demoBenchmarkKeys];
   try{if(localStorage.getItem(overviewBenchmarkStorageKey(overviewOwner))!==null)keys=readOverviewBenchmarks(localStorage,overviewOwner);}catch{}
   setOverviewSelection({owner:overviewOwner,keys});
   try{const saved=readBenchmarkMethod(localStorage,overviewOwner,today);if(saved)setMethodChoice({owner:overviewOwner,method:saved});}catch{}

  });
  return()=>{cancelled=true;};
 },[overviewOwner,demo,today]);
 const coverage=useMemo(()=>investmentComparisonCoverage(history.records,history.events,today),[history.records,history.events,today]);
 const savedMethod=methodChoice&&methodChoice.owner===overviewOwner?methodChoice.method:null;
 const scope=savedMethod?.scope??'investments';
 const purchaseStart=useMemo(()=>purchaseComparisonStart({records:history.records,events:history.events,movements:history.movements,cashflows:history.cashflows,today},scope),[history,today,scope]);
 // Market history is limited. Earlier purchases compare from recorded values on its first day.
 const earliestStart=purchaseStart<benchmarkHistoryStart?benchmarkHistoryStart:purchaseStart;
 const requestedMethod:ComparisonMethod=savedMethod??{mode:'purchases',date:earliestStart,scope};
 const beforeMarketHistory=requestedMethod.mode==='purchases'&&purchaseStart<benchmarkHistoryStart;
 const method:ComparisonMethod=beforeMarketHistory?{mode:'date',date:earliestStart,scope}:{...requestedMethod,scope};
 function chooseMethod(next:ComparisonMethod){if(!overviewOwner)return;setMethodChoice({owner:overviewOwner,method:next});setDetailDate(null);try{localStorage.setItem(benchmarkMethodStorageKey(overviewOwner),JSON.stringify(next));}catch{}}
 const overviewKeys=overviewSelection?.owner===overviewOwner?overviewSelection?.keys??[]:[];
 function toggleOverview(key:string){
  if(!overviewOwner)return;
  const keys=toggleOverviewBenchmark(overviewKeys,key);
  setOverviewSelection({owner:overviewOwner,keys});
  try{localStorage.setItem(overviewBenchmarkStorageKey(overviewOwner),JSON.stringify(keys));}catch{/* The current selection still works when browser storage is unavailable. */}
 }
 const start=method.mode==='date'?method.date:purchaseStart;
 const selected:readonly string[]=profile?.preferences.benchmarks??defaultComparisonPreferences.benchmarks;
 // Legend visibility is presentation state. Keep every configured benchmark
 // loaded so hiding and restoring lines never changes the request or simulation.
 const selectionKey=selected.join(',');
 const symbol=profile?.preferences.custom_symbol??'';
 const diversified=profile?.preferences.portfolio;
 const activeDiversified=selected.includes('PORTFOLIO')?diversified:null;
 const portfolioConfig=activeDiversified?.assets?JSON.stringify(activeDiversified):'';
 const portfolioCrypto=selected.includes('PORTFOLIO')&&!diversified?.assets&&diversified?.crypto?diversified.cryptoSymbol:'';
 const portfolioStock=selected.includes('PORTFOLIO')&&!diversified?.assets&&diversified?.stock?diversified.stockSymbol:'';
 const requestKey=points.length?start+':'+today+':'+selectionKey+':'+symbol+':'+portfolioCrypto+':'+portfolioStock+':'+portfolioConfig:'';
 const canLoad=(demo||!!profile||!!profileError)&&(!!profileError||overviewSelection?.owner===overviewOwner);
 useEffect(()=>{
  if(!requestKey||!canLoad)return;
  const controller=new AbortController(),params=new URLSearchParams({start,end:today,benchmarks:selectionKey});
  if(portfolioConfig)params.set('portfolio',portfolioConfig);
  if(symbol)params.set('symbol',symbol);
  if(portfolioCrypto)params.set('portfolioCrypto',portfolioCrypto);
  if(portfolioStock)params.set('portfolioStock',portfolioStock);
  refreshRead(demo?'/api/benchmarks?demo=1':'/api/benchmarks?'+params,{signal:controller.signal}).then(async response=>{const result=await response.json() as BenchmarkData&{error?:string};if(!response.ok)throw Error(result.error);if(!controller.signal.aborted){setData(result);setLoadedKey(requestKey);setError('');}}).catch(reason=>{if(!controller.signal.aborted){setError(reason.message);setLoadedKey(requestKey);setData(null);}});
  return()=>controller.abort();
 },[demo,requestKey,start,today,selectionKey,symbol,portfolioCrypto,portfolioStock,portfolioConfig,retry,canLoad]);
 const comparisonsLoading=!!requestKey&&((!demo&&!profile&&!profileError)||loadedKey!==requestKey);
 const ready=loadedKey===requestKey?data:null;
 const decision=useMemo(()=>ready?investmentDecisionComparison({records:history.records,events:history.events,cashflows:history.cashflows,movements:history.movements,market,currency,today,method:{mode:method.mode,date:method.date,scope}},ready,activeDiversified):null,[ready,history,market,currency,today,method.mode,method.date,scope,activeDiversified]);
 const definitions=[{key:'actual',label:t('Investment value and proceeds'),color:'var(--primary)',dash:undefined,quotes:undefined},...stockBenchmarks(profile?.preferences.benchmarks??[]).map(item=>({key:item.id,label:item.symbol,color:categoryColor(item.id),dash:'12 4',quotes:[{key:item.id,symbol:item.symbol}]})),{key:'BTC',label:'Bitcoin · BTC',color:categoryColor('Crypto'),dash:undefined,quotes:[{key:'BTC',symbol:'BTC'}]},{key:'SPY',label:'S&P 500 · SPY',color:categoryColor('Stock'),dash:'7 3',quotes:[{key:'SPY',symbol:'SPY'}]},{key:'HYG',label:t('High-yield bonds · HYG'),color:categoryColor('Property'),dash:'9 3 2 3',quotes:[{key:'HYG',symbol:'HYG'}]},{key:'depositUZS',label:t('{currency} deposit · {rate}%',{currency:'UZS',rate:formatNumber(21,locale)}),color:categoryColor('Deposit'),dash:'5 5'},{key:'depositUSD',label:t('{currency} deposit · {rate}%',{currency:'USD',rate:formatNumber(8,locale)}),color:categoryColor('Cash'),dash:'2 4'},{key:'CUSTOM',label:symbol,color:categoryColor('Business'),dash:'12 4',quotes:[{key:'CUSTOM',symbol}]},{key:'PORTFOLIO',label:t('Diversified portfolio'),color:categoryColor('Money lent'),dash:'8 3 2 3',quotes:activeDiversified?portfolioQuotes(activeDiversified):undefined}];
 const displayed=definitions.filter(item=>item.key==='actual'||selected.includes(item.key));
 const visibleSeries=displayed.filter(item=>overviewSeriesVisible(overviewKeys,item.key));
 const visibleKeys=new Set(visibleSeries.map(item=>item.key));
 const overviewResult=decision?.result;
 const windowStart=days?shiftDay(today,-days):'0000-01-01';
 const chartPoints=(overviewResult?.points??[]).filter(point=>point.date>=windowStart);
 const chartSeries=visibleSeries;
 const detailPoint=chartPoints.find(point=>point.date===detailDate);
 return <>
  <div className="overview-chart-heading"><h3>{t('Portfolio over time')}</h3><div className="comparison-legend" aria-busy={comparisonsLoading}>{displayed.map(item=><button key={item.key} type="button" aria-pressed={visibleKeys.has(item.key)} disabled={!overviewOwner} onClick={()=>toggleOverview(item.key)}><i style={{background:item.color}}/>{item.label}</button>)}</div></div>
  {ready&&!decision&&<p className="comparison-notice">{t('Investment history or exchange rates are incomplete for this comparison.')}</p>}
  {ready&&visibleSeries.filter(item=>item.key!=='actual').map(item=>{const reason=ready.errors[item.key]??ready.errors.fx??(overviewResult?.unavailable.includes(item.key)?'Price data, exchange rates or funds needed for a matching withdrawal are unavailable.':null);return reason?<p key={item.key} className="comparison-note">{item.label}: {t(reason)}</p>:null;})}
  {comparisonsLoading?<ChartSkeleton label={t('Loading comparisons…')}/>:!!chartPoints.length&&<><InvestmentValueChart onPointSelect={setDetailDate} label="Investment value and proceeds" points={chartPoints} currency={currency} series={chartSeries.map(item=>({...item,primary:item.key==='actual'}))} tooltip={<BenchmarkTooltip scope={scope} marketHistory={ready} fundingDetails={decision?.details} receipts={[]} currency={currency} series={chartSeries}/>}/>
  <p className="comparison-note">{t('Tap a chart point to open its activity and investments.')}</p></>}
  {summary}
  <details className="overview-details"><summary>{t('Comparison settings')}</summary>
   <div className="form-grid"><label>{t('Comparison method')}<NativeSelect value={method.mode} disabled={!overviewOwner} onChange={event=>chooseMethod({...method,mode:event.target.value as ComparisonMethod['mode']})}><option value="purchases">{t('From original purchases')}</option><option value="date">{t('From a chosen start date')}</option></NativeSelect></label><label>{t('Benchmark funding')}<NativeSelect value={scope} disabled={!overviewOwner} onChange={event=>chooseMethod({...requestedMethod,scope:event.target.value as FundingScope})}><option value="investments">{t('Excluding expenses')}</option><option value="expenses">{t('Including expenses')}</option></NativeSelect></label>{method.mode==='date'&&<label>{t('Starting date')}<DatePicker value={method.date} min="2016-01-01" max={today} required onChange={date=>{if(validDay(date))chooseMethod({...method,date});}}/></label>}</div>
   <p className="comparison-note">{t(scope==='expenses'?'Investment purchases, principal repayments and every recorded expense fund benchmarks. Spending adds nothing to your investment value, so the gap shows what it cost. Transfers between your accounts and income receipts are not counted.':'Investment purchases and principal repayments fund benchmarks. Explicit transfers between investments are not counted again. Cash balances and income receipts are excluded.')}</p>
   {beforeMarketHistory&&<p className="comparison-note">{t('Market history starts on {date}. Earlier purchases are compared from their recorded values on that day.',{date:formatDate(earliestStart,locale)})}</p>}
   {coverage.missing.length>0&&<p className="comparison-note">{t('Some investments have no recorded purchase. Their first recorded value counts as invested on the day it was recorded, so it is never shown as a gain.')}</p>}
   {method.mode==='date'&&method.date!==earliestStart&&<Button variant="outline" onClick={()=>chooseMethod({mode:'date',date:earliestStart,scope})}>{t('Use earliest recorded date')}</Button>}
   {demo&&<p className="comparison-note">{t("Sample portfolio compared with real BTC and SPY price history. SPY tracks the S&P 500; deposits use assumed annual rates.")}</p>}
  </details>
  <Dialog open={!!detailPoint} onOpenChange={open=>{if(!open)setDetailDate(null);}}><DialogContent className="chart-point-details sm:max-w-xl"><DialogHeader><DialogTitle>{t('Activity and investments')}</DialogTitle><DialogDescription>{detailDate?formatDate(detailDate,locale):''}</DialogDescription></DialogHeader>
   {detailPoint&&<>
    <BenchmarkTooltip scope={scope} marketHistory={ready} fundingDetails={decision?.details} active payload={[{payload:detailPoint}]} receipts={[]} currency={currency} series={chartSeries}/>
   </>}
  </DialogContent></Dialog>
  {error&&<p role="alert" className="error">{t(error)} <Button variant="outline" onClick={()=>{setLoadedKey('');setError('');setRetry(n=>n+1);}}>{t('Retry')}</Button></p>}
 </>;
}
