"use client";
import { useEffect,useMemo,useState } from 'react';
import Link from 'next/link';
import { CartesianGrid,Line,LineChart,ReferenceLine,ResponsiveContainer,Tooltip,XAxis,YAxis } from 'recharts';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { LoadingPlaceholder } from '@/components/loading-placeholder';
import { useLanguage } from '@/components/language-provider';
import { formatDate,formatMoney,formatNumber } from '@/lib/format';
import { categoryColor } from '@/lib/category-colors';
import { liabilities,value,type Entry } from '@/lib/finance';
import { marketEntry,type MarketData } from '@/lib/market';
import { historyChartDate,type HistoryEvent } from '@/lib/investment-history';
import { depositToday } from '@/lib/deposit-interest';
import { dateMillis,shiftDay,type BenchmarkData } from '@/lib/benchmark-data';
import { compareInvestments } from '@/lib/investment-comparison';
import { actualInvestmentPerformance,investmentEvents } from '@/lib/actual-investment-performance';
import { investmentKinds,type BaselineHolding,type ComparisonProfile } from '@/lib/comparison-profile';

type History={records:Entry[];events:HistoryEvent[];cashflows?:Entry[]};
export function InvestmentComparison({history,today,currency,market,demo}:{history:History;today:string;currency:string;market:MarketData|null;demo:boolean}){
 const {t,locale}=useLanguage();
 const [profile,setProfile]=useState<ComparisonProfile|null>(null),[profileError,setProfileError]=useState(''),[profileRetry,setProfileRetry]=useState(0);
 const [data,setData]=useState<BenchmarkData|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0),[loadedKey,setLoadedKey]=useState(''),[hidden,setHidden]=useState<string[]>([]),[windowDays,setWindowDays]=useState(0);
 const [chosen,setChosen]=useState<string[]|null>(null);
 const [benchmarks,setBenchmarks]=useState<string[]|null>(null);
 const choices=history.records.filter(record=>(investmentKinds as readonly string[]).includes(record.kind)||liabilities.includes(record.kind));
 const records=useMemo(()=>history.records.filter(record=>chosen===null||chosen.includes(record.id)),[history.records,chosen]);
 const live=useMemo(()=>records.filter(record=>(investmentKinds as readonly string[]).includes(record.kind)).map(record=>{const converted=marketEntry(record,record.currency,market);return converted?{id:record.id,kind:record.kind as BaselineHolding['kind'],currency:record.currency,balance:value(converted)}:null;}).filter((holding):holding is BaselineHolding=>holding!==null),[records,market]);
 useEffect(()=>{
  if(demo)return;const controller=new AbortController();
  fetch('/api/comparison-profile',{signal:controller.signal}).then(async response=>{const result=await response.json() as ComparisonProfile&{error?:string};if(!response.ok)throw Error(result.error);if(!controller.signal.aborted){setProfile(result);setProfileError('');}}).catch(reason=>{if(!controller.signal.aborted)setProfileError(reason.message);});
  return()=>controller.abort();
 },[demo,profileRetry]);
 const events=useMemo(()=>investmentEvents(records,history.events,today,history.cashflows),[records,history,today]);
 const start=events[0]?.occurred_on??today;
 const appStart=profile?depositToday(new Date(profile.activity.started_at)):start;
 const selected:readonly string[]=benchmarks??profile?.preferences.benchmarks??['BTC','SPY','depositUZS','depositUSD'];
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
 const performance=useMemo(()=>ready?actualInvestmentPerformance(records,history.events,live,ready.fx,currency,today,history.cashflows):null,[ready,records,history,live,currency,today]);
 const result=useMemo(()=>ready&&performance&&!performance.missing?compareInvestments(0,performance.flows,performance.points,ready,currency,true):null,[ready,performance,currency]);
 const points=result?.points??[];
 const invested=performance?.flows.reduce((total,flow)=>total+Math.max(0,flow.amount),0)??0;
 const last=points.at(-1);
 const viewStart=windowDays?([start,shiftDay(today,-windowDays)].sort().at(-1)!):start;
 const visiblePoints=points.filter(point=>point.date>=viewStart);
 const money=(amount:number)=>formatMoney(amount,currency,locale);
 const definitions=[{key:'actual',label:t('My investments'),color:'var(--primary)',dash:undefined},{key:'BTC',label:'Bitcoin · BTC',color:categoryColor('Crypto'),dash:undefined},{key:'SPY',label:'S&P 500 · SPY',color:categoryColor('Stock'),dash:'7 3'},{key:'HYG',label:t('High-yield bonds · HYG'),color:categoryColor('Property'),dash:'9 3 2 3'},{key:'depositUZS',label:t('{currency} deposit · {rate}%',{currency:'UZS',rate:formatNumber(21,locale)}),color:categoryColor('Deposit'),dash:'5 5'},{key:'depositUSD',label:t('{currency} deposit · {rate}%',{currency:'USD',rate:formatNumber(8,locale)}),color:categoryColor('Cash'),dash:'2 4'},{key:'CUSTOM',label:symbol,color:categoryColor('Business'),dash:'12 4'}];
 const displayed=definitions.filter(item=>item.key==='actual'||selected.includes(item.key));
 const names=Object.fromEntries(definitions.map(item=>[item.key,item.label]));
 return <section className="panel portfolio-trend investment-comparison">
  <div className="panel-title"><div><h2>{t('Investment performance')}</h2><p className="muted">{t('What your investments are worth compared with investing the same amounts on the same dates in each benchmark.')}</p></div><Button asChild variant="outline"><Link href="/settings#benchmarks">{t('Choose benchmarks in Settings')}</Link></Button></div>
  <p className="comparison-note">{t('Contributions, business spending and debt repayments are compared. Personal expenses and uninvested income are excluded.')}</p>
  <details className="comparison-method"><summary>{t('Choose investments and repayments')}</summary><div className="portfolio-ranges"><Button variant="outline" onClick={()=>setChosen(null)}>{t('All')}</Button><Button variant="outline" onClick={()=>setChosen([])}>{t('Clear selection')}</Button></div>{choices.map(record=><label key={record.id} className="planning-check"><Checkbox checked={chosen===null||chosen.includes(record.id)} onCheckedChange={checked=>setChosen(previous=>{const ids=previous??choices.map(item=>item.id);return checked===true?[...ids,record.id]:ids.filter(id=>id!==record.id);})}/> {record.name} · {t(record.kind)}</label>)}</details>
  <div className="portfolio-ranges" role="group" aria-label={t('Benchmarks')}>{definitions.filter(item=>item.key!=='actual'&&(item.key!=='CUSTOM'||symbol)).map(item=><Button key={item.key} variant={selected.includes(item.key)?'default':'outline'} aria-pressed={selected.includes(item.key)} disabled={selected.length===1&&selected.includes(item.key)} onClick={()=>setBenchmarks(selected.includes(item.key)?selected.filter(key=>key!==item.key):[...selected,item.key])}>{item.label}</Button>)}</div>
  {demo?<p className="comparison-note">{t('Sign in to save investment comparisons.')}</p>:<>
   {profileError&&<p className="error" role="alert">{t(profileError)} {t('Showing default comparisons.')} <Button variant="outline" onClick={()=>{setProfileError('');setProfileRetry(n=>n+1);}}>{t('Retry')}</Button></p>}
   {!profile&&!profileError?<LoadingPlaceholder label={t('Loading comparisons…')}/>:<>
    {profile&&<p className="comparison-note">{t('Started using the app')}: {formatDate(appStart,locale)}. {profile.activity.source==='earliest_record'&&t('For this existing account, the start date is the earliest saved app activity.')}</p>}
    {!events.length?<p className="comparison-notice">{t('Select investments or debts with dated contributions, business spending or repayments to start the comparison.')}</p>:loadedKey!==requestKey?<LoadingPlaceholder label={t('Loading comparisons…')}/>:error?<p className="error" role="alert">{t(error)} <Button variant="outline" onClick={()=>{setLoadedKey('');setRetry(n=>n+1);}}>{t('Retry')}</Button></p>:<>
     {performance?.missing&&<p className="comparison-notice">{t('An investment balance or exchange rate is missing. Performance is paused rather than using an incomplete total.')}</p>}
     {!!performance?.observed.length&&<p className="comparison-notice">{t('Some investments have no recorded purchase. Their first recorded value is used as opening capital, so earlier profit is unknown. Add the original investment amount and date in Tracker for a purchase-based comparison.')}</p>}
     {!!points.length&&<>
      <div className="portfolio-headline"><div><span>{t('Total invested')}</span><strong>{money(invested)}</strong></div><div><span>{t('Value including payouts')}</span><strong>{typeof last?.actual==='number'?money(last.actual):'—'}</strong></div><div><span>{t('Investment gain')}</span><strong>{typeof last?.actual==='number'?money(last.actual-last.contributed):'—'}</strong></div></div>
      <p className="comparison-note">{t('Value includes holdings, investment income and principal repaid. Investment spending funds the comparison; it is not deducted twice. Mortgage interest is a cost, and future interest savings are not projected.')}</p>
      <div className="panel-title"><div className="comparison-legend">{displayed.map(item=><div className="comparison-legend-item" key={item.key}><button type="button" aria-pressed={!hidden.includes(item.key)} disabled={!points.some(point=>typeof point[item.key]==='number')} onClick={()=>setHidden(previous=>previous.includes(item.key)?previous.filter(key=>key!==item.key):[...previous,item.key])}><i style={{background:item.color}}/>{item.label}</button></div>)}</div><div className="portfolio-ranges">{[30,90,365,0].map(days=><Button key={days} variant={windowDays===days?'default':'outline'} aria-pressed={windowDays===days} onClick={()=>setWindowDays(days)}>{days?t('{days} days',{days:formatNumber(days,locale)}):t('All history')}</Button>)}</div></div>
      <p className="comparison-note">{t('Time buttons zoom the chart. Values always use your original investment amounts and dates.')}</p>
      <div className="portfolio-chart"><ResponsiveContainer width="100%" height={340}><LineChart data={visiblePoints.map(point=>({...point,timestamp:dateMillis(point.date)}))} accessibilityLayer margin={{top:15,right:15,left:5,bottom:10}}><CartesianGrid stroke="var(--border)" strokeDasharray="3 5" vertical={false}/><XAxis dataKey="timestamp" type="number" scale="time" domain={viewStart<today?[dateMillis(viewStart),dateMillis(today)]:['dataMin','dataMax']} tickFormatter={date=>formatDate(historyChartDate(Number(date)),locale)} minTickGap={80}/><YAxis width={120} domain={['auto','auto']} tickFormatter={money}/><ReferenceLine y={0} stroke="var(--muted-foreground)"/><Tooltip labelFormatter={date=>formatDate(historyChartDate(Number(date)),locale)} formatter={(amount,name)=>[money(Number(amount)),names[String(name)]??String(name)]} contentStyle={{background:'var(--background)',borderColor:'var(--border)',borderRadius:12}}/>{displayed.filter(item=>!hidden.includes(item.key)).map(item=><Line key={item.key} type={item.key==='actual'?'stepAfter':'linear'} dataKey={item.key} name={item.key} stroke={item.color} strokeDasharray={item.dash} strokeWidth={item.key==='actual'?3:2} dot={visiblePoints.length===1} connectNulls={false} isAnimationActive={false}/>)}</LineChart></ResponsiveContainer></div>
      {start===today&&<p className="comparison-note">{t('Your first day appears as a point. The line grows as prices and recorded investment values change.')}</p>}
      <div className="table-scroll"><table className="comparison-table"><thead><tr><th>{t('Allocation')}</th><th>{t('Value including payouts')}</th><th>{t('Investment gain')}</th><th>{t('Ahead / behind benchmark')}</th></tr></thead><tbody>{displayed.map(item=>{const amount=last?.[item.key],own=last?.actual;const difference=typeof amount==='number'&&typeof own==='number'?own-amount:null;return <tr key={item.key}><td><i style={{background:item.color}}/>{item.label}</td><td>{typeof amount==='number'?money(amount):'—'}</td><td>{typeof amount==='number'&&last?money(amount-last.contributed):'—'}</td><td>{item.key==='actual'||difference===null?'—':Math.round(Math.abs(difference))===0?t('Matching this benchmark'):t(difference>0?'Ahead by {amount}':'Behind by {amount}',{amount:money(Math.abs(difference))})}</td></tr>;})}</tbody></table></div>
     </>}
     {ready?.errors.fx&&<p className="comparison-note">{t(ready.errors.fx)}</p>}
     {ready&&displayed.filter(item=>item.key!=='actual').map(item=>{const reason=ready.errors[item.key]??(result?.unavailable.includes(item.key)?'Price data, exchange rates or funds needed for a matching withdrawal are unavailable.':null);return reason?<p key={item.key} className="comparison-note">{item.label}: {t(reason)}</p>:null;})}
     {ready&&(Object.keys(ready.errors).length>0||!!result?.unavailable.some(key=>selected.includes(key)))&&<Button variant="outline" onClick={()=>{setLoadedKey('');setRetry(n=>n+1);}}>{t('Retry unavailable comparisons')}</Button>}
    </>}
   </>}
   <details className="comparison-method"><summary>{t('How this comparison works')}</summary><p>{t('Contributions, linked business spending and debt payments buy each benchmark on the payment date. Personal spending, charity and uninvested salary are excluded. Withdrawals sell the same cash amount on the same date.')}</p><p>{t('Each benchmark shows what the same dated investments would be worth in your selected currency. The difference from your investments shows how much money you are ahead or behind. Investment gain is value including payouts minus net contributions.')}</p><p>{t('Add livestock, a café, a business or crypto in Assets & investments. Record purchases, sales, income and value updates in Tracker. Keep sold investments with a zero balance to preserve their history.')}</p><p>{t('Recorded values carry forward until updated. Opening observations are disclosed when purchase history is missing. Cash balances and outstanding debts are not opening investments. Only actual repayments enter; principal counts as retained value and interest does not. Transferring or reinvesting money counts as another investment if entered as a new contribution.')}</p><p>{t('Fund histories include dividend and split adjustments. Deposit rates are assumed effective annual returns, compounded daily, before taxes and fees. Historical exchange-rate checkpoints are used between dates, so comparisons are estimates.')}</p></details>
  </>}
 </section>;
}
