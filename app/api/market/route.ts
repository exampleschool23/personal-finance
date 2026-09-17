import { loadMarket } from '@/lib/server-market';
import { session } from '@/lib/supabase';
import { coins } from '@/lib/market';

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const crypto = [...new Set((params.get('crypto') || '').split(',').filter(Boolean))];
  const stocks = [...new Set((params.get('stocks') || '').split(',').filter(Boolean))];
  if (crypto.length > 16 || stocks.length > 20 || crypto.some(s => !coins.some(c => c[0] === s)) || stocks.some(s => !/^[A-Z][A-Z0-9.-]{0,14}$/.test(s))) {
    return Response.json({ error: 'Invalid market symbols.' }, { status: 400 });
  }
  let stockAccess=false;
  if(stocks.length&&process.env.TWELVE_DATA_API_KEY){try{stockAccess=!!(await session());}catch{}}
  const data=await loadMarket(crypto,stocks,stockAccess);
  return Response.json(data,{headers:{'Cache-Control':'private, no-store'}});
}
