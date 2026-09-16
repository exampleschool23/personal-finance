"use client";
import { useCallback, useEffect, useState } from 'react';
import type { Entry } from '@/lib/finance';
import { instrumentFor, type MarketData } from '@/lib/market';

export async function fetchMarket(entries: Array<Pick<Entry, 'kind' | 'name'>>, signal?: AbortSignal): Promise<MarketData> {
  const instruments = entries.map(instrumentFor).filter(i => i !== null);
  const crypto = [...new Set(instruments.filter(i => i.kind === 'Crypto').map(i => i.symbol))];
  const stocks = [...new Set(instruments.filter(i => i.kind === 'Stock').map(i => i.symbol))];
  const params = new URLSearchParams({ crypto: crypto.join(','), stocks: stocks.slice(0, 20).join(',') });
  const response = await fetch('/api/market?' + params, { signal });
  if (!response.ok) throw new Error('Market prices unavailable. Saved prices are shown.');
  const result = await response.json() as MarketData;
  for (const symbol of stocks.slice(20)) result.errors[`Stock:${symbol}`] = 'Refresh supports up to 20 stock symbols.';
  return result;
}
export function useMarket(entries: Entry[], enabled: boolean) {
  const [market, setMarket] = useState<MarketData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [refreshId, setRefreshId] = useState(0);
  const signature = JSON.stringify(entries.map(e => ({ kind: e.kind, name: e.name })).filter(e => instrumentFor(e)));
  const refresh = useCallback(() => setRefreshId(id => id + 1), []);
  useEffect(() => {
    if (!enabled) { setMarket(null); return; }
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
  return { market, loading, error, refresh };
}
