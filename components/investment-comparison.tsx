"use client";
import { useEffect,useMemo,useState } from 'react';
import Link from 'next/link';
import { CartesianGrid,Line,LineChart,ReferenceLine,ResponsiveContainer,Tooltip,XAxis,YAxis } from 'recharts';
import { Button } from '@/components/ui/button';
import { LoadingPlaceholder } from '@/components/loading-placeholder';
import { useLanguage } from '@/components/language-provider';
import { formatDate,formatMoney,formatNumber } from '@/lib/format';
import { categoryColor } from '@/lib/category-colors';
import { value,type Entry } from '@/lib/finance';
import { marketEntry,type MarketData } from '@/lib/market';
import { historyChartDate,type HistoryEvent } from '@/lib/investment-history';
import { depositToday } from '@/lib/deposit-interest';
import { dateMillis,shiftDay,type BenchmarkData } from '@/lib/benchmark-data';
import { compareInvestments,percentagePerformance } from '@/lib/investment-comparison';
import { actualInvestmentPerformance,investmentEvents } from '@/lib/actual-investment-performance';
import { investmentKinds,type BaselineHolding,type ComparisonProfile } from '@/lib/comparison-profile';

type History={records:Entry[];events:HistoryEvent[]};
export function InvestmentComparison({history,today,currency,market,demo}:{history:History;today:string;currency:string;market:MarketData|null;demo:boolean}){
 const {t,locale}=useLanguage();
 const [profile,setProfile]=useState<ComparisonProfile|null>(null),[profileError,setProfileError]=useState(''),[profileRetry,setProfileRetry]=useState(0);
 const [data,setData]=useState<BenchmarkData|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0),[loadedKey,setLoadedKey]=useState(''),[hidden,setHidden]=useState<string[]>([]),[windowDays,setWindowDays]=useState(0);
 const live=useMemo(()=>history.records.filter(record=>(investmentKinds as readonly string[]).includes(record.kind)).map(record=>{const converted=marketEntry(record,record.currency,market);return converted?{id:record.id,kind:record.kind as BaselineHolding['kind'],currency:record.currency,balance:value(converted)}:null;}).filter((holding):holding is BaselineHolding=>holding!==null),[history.records,market]);
 useEffect(()=>{
  if(demo)return;const controller=new AbortController();
  fetch('/api/comparison-profile',{signal:controller.signal}).then(async response=>{const result=await response.json() as ComparisonProfile&{error?:string};if(!response.ok)throw Error(result.error);if(!controller.signal.aborted){setProfile(result);setProfileError('');}}).catch(reason=>{if(!controller.signal.aborted)setProfileError(reason.message);});
  return()=>controller.abort();
 },[demo,profileRetry]);
 const events=useMemo(()=>investmentEvents(history.records,history.events,today),[history,today]);
 const start=events[0]?.occurred_on??today;
 const appStart=profile?depositToday(new Date(profile.activity.started_at)):start;
 const selected:readonly string[]=profile?.preferences.benchmarks??['BTC'];
 const selectionKey=selected.join(',');
 const symbol=profile?.preferences.custom_symbol??'';
 const requestKey=events.length?start+':'+today+':'+selectionKey+':'+symbol:'';
 useEffect(()=>{
  if(demo||!requestKey||(!profile&&!profileError))return;
  const controller=new AbortController(),params=new URLSearchParams({start,end:today,benchmarks:selectionKey});
  if(symbol)params.set('symbol',symbol);
  fetch('/api/benchmarks?'+params,{signal:controller.signal,cache:'no-store'}).then(async response=>{const result=await response.json() as BenchmarkData&{error?:string};if(!response.ok)throw Error(result.error);if(!controller.signal.aborted){setData(result);setLoadedKey(requestKey);setError('');}}).catch(reason=>{if(!controller.signal.aborted){setError(reason.message);setLoadedKey(requestKey);setData(null);}});
  return()=>controller.abort();
 },[demo,requestKey,start,today,selectionKey,symbol,retry,profile,profileError]);
 const ready=loadedKey===requestKey?data:null;
 const performance=useMemo(()=>ready?actualInvestmentPerformance(history.records,history.events,live,ready.fx,currency,today):null,[ready,history,live,currency,today]);
 const result=useMemo(()=>ready&&performance&&!performance.missing?compareInvestments(0,performance.flows,performance.points,ready,currency,true):null,[ready,performance,currency]);
 const points=useMemo(()=>result&&performance?percentagePerformance(result.points,performance.flows):[],[result,performance]);
 const last=points.at(-1),lastValues=result?.points.at(-1);
 const viewStart=windowDays?([appStart,shiftDay(today,-windowDays)].sort().at(-1)!):appStart;
 const visiblePoints=points.filter(point=>point.date>=viewStart);
 const money=(amount:number)=>formatMoney(amount,currency,locale);
 const percent=(amount:number)=>formatNumber(amount,locale,2)+'%';
 const definitions=[{key:'actual',label:t('My investments'),color:'var(--primary)',dash:undefined},{key:'BTC',label:'Bitcoin · BTC',color:categoryColor('Crypto'),dash:undefined},{key:'SPY',label:'S&P 500 · SPY',color:categoryColor('Stock'),dash:'7 3'},{key:'HYG',label:t('High-yield bonds · HYG'),color:categoryColor('Property'),dash:'9 3 2 3'},{key:'depositUZS',label:t('{currency} deposit · {rate}%',{currency:'UZS',rate:formatNumber(21,locale)}),color:categoryColor('Deposit'),dash:'5 5'},{key:'depositUSD',label:t('{currency} deposit · {rate}%',{currency:'USD',rate:formatNumber(8,locale)}),color:categoryColor('Cash'),dash:'2 4'},{key:'CUSTOM',label:symbol,color:categoryColor('Business'),dash:'12 4'}].filter(item=>item.key==='actual'||selected.includes(item.key));
 const names=Object.fromEntries(definitions.map(item=>[item.key,item.label]));
 return <section className="panel portfolio-trend investment-comparison">
  <div className="panel-title"><div><h2>{t('Investment performance')}</h2><p className="muted">{t('Your return versus investing the same amounts on the same dates in Bitcoin and other benchmarks.')}</p></div><Button asChild variant="outline"><Link href="/settings">{t('Choose benchmarks in Settings')}</Link></Button></div>
  {demo?<p className="comparison-note">{t('Sign in to save investment comparisons.')}</p>:<>
   {profileError&&<p className="error" role="alert">{t(profileError)} {t('Showing Bitcoin as the default comparison.')} <Button variant="outline" onClick={()=>{setProfileError('');setProfileRetry(n=>n+1);}}>{t('Retry')}</Button></p>}
   {!profile&&!profileError?<LoadingPlaceholder label={t('Loading comparisons…')}/>:<>
    {profile&&<p className="comparison-note">{t('Started using the app')}: {formatDate(appStart,locale)}. {profile.activity.source==='earliest_record'&&t('For this existing account, the start date is the earliest saved app activity.')}</p>}
    {!events.length?<p className="comparison-notice">{t('Add an investment, then record the amount invested and its date in Tracker to compare it with Bitcoin.')}</p>:loadedKey!==requestKey?<LoadingPlaceholder label={t('Loading comparisons…')}/>:error?<p className="error" role="alert">{t(error)} <Button variant="outline" onClick={()=>{setLoadedKey('');setRetry(n=>n+1);}}>{t('Retry')}</Button></p>:<>
     {performance?.missing&&<p className="comparison-notice">{t('An investment balance or exchange rate is missing. Performance is paused rather than using an incomplete total.')}</p>}
     {!!performance?.observed.length&&<p className="comparison-notice">{t('Some investments have no recorded purchase. Their first recorded value is used as opening capital, so earlier profit is unknown. Add the original investment amount and date in Tracker for a purchase-based comparison.')}</p>}
     {!!points.length&&<>
      <div className="portfolio-headline"><div><span>{t('Total invested')}</span><strong>{money(Number(last?.invested??0))}</strong></div><div><span>{t('Investment gain')}</span><strong>{typeof lastValues?.actual==='number'?money(lastValues.actual-lastValues.contributed):'—'}</strong></div><div><span>{t('My return')}</span><strong>{typeof last?.actual==='number'?percent(last.actual):'—'}</strong></div></div>
      <div className="panel-title"><div className="comparison-legend">{definitions.map(item=><div className="comparison-legend-item" key={item.key}><button type="button" aria-pressed={!hidden.includes(item.key)} disabled={!points.some(point=>typeof point[item.key]==='number')} onClick={()=>setHidden(previous=>previous.includes(item.key)?previous.filter(key=>key!==item.key):[...previous,item.key])}><i style={{background:item.color}}/>{item.label}</button></div>)}</div><div className="portfolio-ranges">{[30,90,365,0].map(days=><Button key={days} variant={windowDays===days?'default':'outline'} aria-pressed={windowDays===days} onClick={()=>setWindowDays(days)}>{days?t('{days} days',{days:formatNumber(days,locale)}):t('All history')}</Button>)}</div></div>
      <p className="comparison-note">{t('Time buttons zoom the chart. Returns always use the same investment history; they do not reset the starting money.')}</p>
      <div className="portfolio-chart"><ResponsiveContainer width="100%" height={340}><LineChart data={visiblePoints.map(point=>({...point,timestamp:dateMillis(point.date)}))} accessibilityLayer margin={{top:15,right:15,left:5,bottom:10}}><CartesianGrid stroke="var(--border)" strokeDasharray="3 5" vertical={false}/><XAxis dataKey="timestamp" type="number" scale="time" domain={viewStart<today?[dateMillis(viewStart),dateMillis(today)]:['dataMin','dataMax']} tickFormatter={date=>formatDate(historyChartDate(Number(date)),locale)} minTickGap={80}/><YAxis width={85} domain={['auto','auto']} tickFormatter={percent}/><ReferenceLine y={0} stroke="var(--muted-foreground)"/><Tooltip labelFormatter={date=>formatDate(historyChartDate(Number(date)),locale)} formatter={(amount,name)=>[percent(Number(amount)),names[String(name)]??String(name)]} contentStyle={{background:'var(--background)',borderColor:'var(--border)',borderRadius:12}}/>{definitions.filter(item=>!hidden.includes(item.key)).map(item=><Line key={item.key} type={item.key==='actual'?'stepAfter':'linear'} dataKey={item.key} name={item.key} stroke={item.color} strokeDasharray={item.dash} strokeWidth={item.key==='actual'?3:2} dot={visiblePoints.length===1} connectNulls={false} isAnimationActive={false}/>)}</LineChart></ResponsiveContainer></div>
      {start===today&&<p className="comparison-note">{t('Your first day appears as a point. The line grows as prices and recorded investment values change.')}</p>}
      <div className="table-scroll"><table className="comparison-table"><thead><tr><th>{t('Allocation')}</th><th>{t('Investment gain')}</th><th>{t('Return')}</th><th>{t('My performance')}</th></tr></thead><tbody>{definitions.map(item=>{const amount=lastValues?.[item.key],own=last?.actual,returnValue=last?.[item.key];const difference=typeof returnValue==='number'&&typeof own==='number'?own-returnValue:null;return <tr key={item.key}><td><i style={{background:item.color}}/>{item.label}</td><td>{typeof amount==='number'&&lastValues?money(amount-lastValues.contributed):'—'}</td><td>{typeof returnValue==='number'?percent(returnValue):'—'}</td><td>{item.key==='actual'||difference===null?'—':Math.abs(difference)<.005?t('Matching this benchmark'):t(difference>0?'Outperforming by {points} percentage points':'Underperforming by {points} percentage points',{points:formatNumber(Math.abs(difference),locale,2)})}</td></tr>;})}</tbody></table></div>
      {Number(last?.invested??0)===0&&<p className="comparison-note">{t('A return percentage needs a positive invested amount. Record your investment in Tracker.')}</p>}
     </>}
     {ready?.errors.fx&&<p className="comparison-note">{t(ready.errors.fx)}</p>}
     {ready&&definitions.filter(item=>item.key!=='actual').map(item=>{const reason=ready.errors[item.key]??(result?.unavailable.includes(item.key)?'Price data, exchange rates or funds needed for a matching withdrawal are unavailable.':null);return reason?<p key={item.key} className="comparison-note">{item.label}: {t(reason)}</p>:null;})}
     {ready&&(Object.keys(ready.errors).length>0||!!result?.unavailable.some(key=>selected.includes(key)))&&<Button variant="outline" onClick={()=>{setLoadedKey('');setRetry(n=>n+1);}}>{t('Retry unavailable comparisons')}</Button>}
    </>}
   </>}
   <details className="comparison-method"><summary>{t('How this comparison works')}</summary><p>{t('Each amount invested in Tracker buys the benchmark at that date’s daily closing price. Withdrawals sell the same cash amount on the same date. Salary and monthly income count only when you actually invest them.')}</p><p>{t('Return is cumulative investment profit divided by total amounts invested. Profit includes value changes, recorded investment income and costs, and realized withdrawals. This is not an annualized return. Percentage-point differences show whether you are ahead or behind.')}</p><p>{t('Add livestock, a café, a business or crypto in Assets & investments. Record purchases, sales, income and value updates in Tracker. Keep sold investments with a zero balance to preserve their history.')}</p><p>{t('Recorded values carry forward until updated. Opening observations are disclosed when purchase history is missing. Cash balances and debts are excluded. Transferring or reinvesting money counts as another investment if entered as a new contribution.')}</p><p>{t('Fund histories include dividend and split adjustments. Deposit rates are assumed effective annual returns, compounded daily, before taxes and fees. Historical exchange-rate checkpoints are used between dates, so comparisons are estimates.')}</p></details>
  </>}
 </section>;
}
