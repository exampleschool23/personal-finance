"use client";

import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { InvestmentComparison } from '@/components/investment-comparison';
import { LoadingPlaceholder } from '@/components/loading-placeholder';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/components/language-provider';
import { depositToday } from '@/lib/deposit-interest';
import type { Entry } from '@/lib/finance';
import type { HistoryEvent } from '@/lib/investment-history';
import type { MarketData } from '@/lib/market';

type History = { records: Entry[]; events: HistoryEvent[] };
type Props = {
 currency: string; currencies: string[]; onCurrencyChange: (currency: string) => void;
 market: MarketData | null; marketLoading: boolean; onRefresh: () => void; demo: boolean; revision: number;
};

export function BenchmarksPage({currency,currencies,onCurrencyChange,market,marketLoading,onRefresh,demo,revision}:Props) {
 const {t}=useLanguage();
 const [history,setHistory]=useState<History|null>(null);
 const [error,setError]=useState(false);
 const [retry,setRetry]=useState(0);
 useEffect(()=>{
  if(demo)return;
  const controller=new AbortController();
  fetch('/api/portfolio-history',{signal:controller.signal}).then(async response=>{
   if(!response.ok)throw Error();
   const data=await response.json() as History;
   if(!controller.signal.aborted){setHistory(data);setError(false);}
  }).catch(()=>{if(!controller.signal.aborted)setError(true);});
  return()=>controller.abort();
 },[demo,revision,retry]);
 return <>
  <div className="page-heading"><div><h1>{t('Benchmarks')}</h1><p className="muted">{t('Compare your investment returns with Bitcoin and other assets, using the same money on the same dates.')}</p></div></div>
  <div className="workspace-controls"><div className="currency-bar"><div className="currency-switch" aria-label={t('Display currency')}>{currencies.map(code=><button key={code} className={currency===code?'selected':''} aria-pressed={currency===code} onClick={()=>onCurrencyChange(code)}>{code}</button>)}</div><span>{t('Balances converted to {currency}.',{currency})}</span></div><Button size="sm" variant="outline" disabled={marketLoading} onClick={onRefresh}><RefreshCw size={14}/>{t(marketLoading?'Fetching prices…':'Refresh prices')}</Button></div>
  {error?<section className="panel"><p role="alert" className="error">{t('Could not load portfolio history.')} <Button variant="outline" onClick={()=>{setError(false);setHistory(null);setRetry(n=>n+1);}}>{t('Retry')}</Button></p></section>:!demo&&!history?<section className="panel"><LoadingPlaceholder label={t('Loading history…')}/></section>:<InvestmentComparison key={currency} history={history??{records:[],events:[]}} today={depositToday()} currency={currency} market={market} demo={demo}/>}
 </>;
}
