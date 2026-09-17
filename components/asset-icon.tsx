import type { Entry } from '@/lib/finance';

type AssetSymbol = 'home' | 'apartment' | 'cafe' | 'gaming' | 'solar' | 'livestock' | 'business' | 'cash' | 'stock' | 'crypto' | 'deposit';
function assetSymbol(record: Pick<Entry, 'kind' | 'name'>): AssetSymbol {
 const name = record.name.toLowerCase();
 if (record.kind === 'Property') return /rent|apartment|аренд|квартир|ijara|kvartira|ижара/u.test(name) ? 'apartment' : 'home';
 if (record.kind === 'Business') {
  if (/solar|quyosh|солнеч|қуёш/u.test(name)) return 'solar';
  if (/sheep|livestock|cattle|qo[‘’ʻʼ']?y|chorva|овц|скот|қўй/u.test(name)) return 'livestock';
  if (/game|gaming|playstation|игр|o[‘’ʻʼ']?yin|ўйин/u.test(name)) return 'gaming';
  if (/caf[eé]|coffee|restaurant|kebab|кафе|кофе|ресторан|kabob/u.test(name)) return 'cafe';
  return 'business';
 }
 return ({ Cash: 'cash', Stock: 'stock', Crypto: 'crypto', Deposit: 'deposit' } as const)[record.kind as 'Cash' | 'Stock' | 'Crypto' | 'Deposit'] ?? 'business';
}

// A small, consistent duotone set. Names refine business/property symbols only;
// the saved category and its shared color remain unchanged.
export function AssetIcon({ record }: { record: Pick<Entry, 'kind' | 'name'> }) {
 const symbol = assetSymbol(record);
 return <svg className="asset-symbol" viewBox="0 0 32 32" fill="none" aria-hidden="true" focusable="false">
  <g stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
   {symbol === 'home' && <><path d="M6 14 16 5l10 9v12H6Z" fill="currentColor" fillOpacity=".12" stroke="none"/><path d="m3.5 15 11-10a2.2 2.2 0 0 1 3 0l11 10M7 13v13h18V13M13 26v-8h6v8"/><path d="M21 6h4v5"/></>}
   {symbol === 'apartment' && <><rect x="6" y="4" width="14" height="24" rx="2" fill="currentColor" fillOpacity=".12" stroke="none"/><path d="M6 28V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v22M20 13h4a2 2 0 0 1 2 2v13M4 28h24M10 9h2m3 0h1M10 14h2m3 0h1M10 19h2m3 0h1M11 28v-5h4v5"/></>}
   {symbol === 'cafe' && <><path d="M6 12h16v8a7 7 0 0 1-7 7h-2a7 7 0 0 1-7-7Z" fill="currentColor" fillOpacity=".12" stroke="none"/><path d="M6 12h16v7a8 8 0 0 1-16 0ZM22 13h2a4 4 0 0 1 0 8h-2M4 28h23M10 4v3m5-4v4m5-3v3"/></>}
   {symbol === 'gaming' && <><path d="M10 9h12c3 0 5 3 6 11 1 6-3 7-6 3l-2-2h-8l-2 2c-3 4-7 3-6-3 1-8 3-11 6-11Z" fill="currentColor" fillOpacity=".12"/><path d="M8 15h6m-3-3v6M21 13h.01M25 17h.01" strokeWidth="2.3"/><path d="M14 9V6h4V4"/></>}
   {symbol === 'solar' && <><path d="M6 16h20l3 11H3Z" fill="currentColor" fillOpacity=".12"/><path d="M5 21h22M12 16l-1 11m9-11 1 11M16 27v3m-5 0h10M12 12a5 5 0 1 1 8 0M16 1v2M5 8h2m18 0h2M8 2l2 2m14-2-2 2"/></>}
   {symbol === 'livestock' && <><path d="M7 12a4 4 0 0 1 6-6 4 4 0 0 1 7 0 4 4 0 0 1 6 6 5 5 0 0 1 0 9H9a5 5 0 0 1-2-9Z" fill="currentColor" fillOpacity=".12"/><path d="M8 21v6m13-6v6M7 13l-4-2v5l3 1M7 12h5l1 7a3 3 0 0 1-6 0ZM9.5 16h.01"/></>}
   {symbol === 'business' && <><rect x="4" y="10" width="24" height="18" rx="3" fill="currentColor" fillOpacity=".12"/><path d="M11 10V6h10v4M4 17a34 34 0 0 0 24 0M14 17h4v5h-4Z"/></>}
   {symbol === 'cash' && <><rect x="4" y="10" width="24" height="17" rx="3" fill="currentColor" fillOpacity=".12"/><path d="m7 10 15-6v6M28 16h-7v6h7M24 19h.01"/></>}
   {symbol === 'stock' && <><path d="M5 25V18h5v7m4 0V13h5v12m4 0V7h5v18" fill="currentColor" fillOpacity=".12" stroke="none"/><path d="M4 28h25M7 24v-5m9 5V14m9 10V9M5 13l8-6 6 2 8-6m-5 0h5v5"/></>}
   {symbol === 'crypto' && <><circle cx="16" cy="16" r="12" fill="currentColor" fillOpacity=".12"/><path d="M12 9h6a3.5 3.5 0 0 1 0 7h-6m0 0h7a3.5 3.5 0 0 1 0 7h-7V9M14 6v3m4-3v3m-4 14v3m4-3v3"/></>}
   {symbol === 'deposit' && <><path d="m4 11 12-7 12 7v3H4Z" fill="currentColor" fillOpacity=".12"/><path d="M7 18v7m6-7v7m6-7v7m6-7v7M4 28h24M16 9h.01"/></>}
  </g>
 </svg>;
}
