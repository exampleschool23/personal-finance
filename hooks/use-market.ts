"use client";
import { useCallback, useEffect, useState } from 'react';
import type { Entry } from '@/lib/finance';
import { instrumentFor, type MarketData } from '@/lib/market';

export async function fetchMarket(entries: Array<Pick<Entry, 'kind' | 'name'>>, signal?: AbortSignal): Promise<MarketData> {
  const instruments = entries.map(instrumentFor).filter(i => i !== null);
  const crypto = [...new Set(instruments.filter(i => i.kind === 'Crypto').map(i => i.symbol))];
  const stocks = [...new Set(instruments.filter(i => i.kind === 'Stock').map(i => i.symbol))];
  const combined: MarketData = { fx:null, quotes:{}, errors:{}, stocksConfigured:false };
  let completed=0;
  // Keep each request within the endpoint limits and avoid parallel quota spikes.
  const batches=Math.max(1,Math.ceil(crypto.length/16),Math.ceil(stocks.length/20));
  for(let index=0;index<batches;index++){
    if(signal?.aborted)throw signal.reason??new Error('Aborted');
    const coinBatch=crypto.slice(index*16,(index+1)*16),stockBatch=stocks.slice(index*20,(index+1)*20);
    const params=new URLSearchParams({crypto:coinBatch.join(','),stocks:stockBatch.join(',')});
    try{
      const response=await fetch('/api/market?'+params,{signal});
      if(!response.ok)throw new Error('Market prices unavailable. Saved prices are shown.');
      const result=await response.json() as MarketData;
      completed++;
      combined.fx=result.fx??combined.fx;
      if(result.rates){combined.rates={...combined.rates,...result.rates};combined.ratesDate=result.ratesDate??combined.ratesDate;}
      Object.assign(combined.quotes,result.quotes);
      Object.assign(combined.errors,result.errors);
      combined.stocksConfigured ||= result.stocksConfigured;
    }catch(error){
      if(signal?.aborted)throw error;
      for(const symbol of coinBatch)combined.errors[`Crypto:${symbol}`]='Price unavailable. Saved price is shown.';
      for(const symbol of stockBatch)combined.errors[`Stock:${symbol}`]='Price unavailable. Saved price is shown.';
    }
  }
  if(!completed)throw new Error('Market prices unavailable. Saved prices are shown.');
  if(combined.fx){combined.rates={...combined.rates,USD:1,UZS:combined.fx.rate};delete combined.errors.fx;}
  if(combined.rates)delete combined.errors.rates;
  return combined;
}
export function useMarket(entries: Entry[], enabled: boolean) {
  const [market, setMarket] = useState<MarketData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [refreshId, setRefreshId] = useState(0);
  const signature = JSON.stringify(entries.map(e => ({ kind: e.kind, name: e.name })).filter(e => instrumentFor(e)));
  if (!enabled && market !== null) setMarket(null);
  const refresh = useCallback(() => setRefreshId(id => id + 1), []);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let running = false;
    const load = async () => {
      if (running) return;
      running = true; setLoading(true); setError('');
      try { const data = await fetchMarket(JSON.parse(signature), controller.signal); if (!controller.signal.aborted) setMarket(data); }
      catch { if (!controller.signal.aborted) { setMarket(null); setError('Market prices unavailable. Saved prices are shown.'); } }
      finally { running = false; if (!controller.signal.aborted) setLoading(false); }
    };
    void load();
    const interval = setInterval(() => { if (!document.hidden) void load(); }, 300000);
    return () => { controller.abort(); clearInterval(interval); };
  }, [signature, enabled, refreshId]);
  return { market: enabled ? market : null, loading: enabled && loading, error: enabled ? error : '', refresh };
}
