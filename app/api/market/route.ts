import { loadMarket } from '@/lib/server-market';
import { tooManyAttempts } from '@/lib/api-route';
import { limits, rateLimited } from '@/lib/rate-limit';
import { session } from '@/lib/supabase';
import { coins, isMetalCode } from '@/lib/market';

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const crypto = [...new Set((params.get('crypto') || '').split(',').filter(Boolean))];
  const stocks = [...new Set((params.get('stocks') || '').split(',').filter(Boolean))];
  const metals = [...new Set((params.get('metals') || '').split(',').filter(Boolean))];
  if (crypto.length > 16 || stocks.length > 20 || crypto.some(s => !coins.some(c => c[0] === s)) || stocks.some(s => !/^[A-Z][A-Z0-9.-]{0,14}$/.test(s)) || !metals.every(isMetalCode)) {
    return Response.json({ error: 'Invalid market symbols.' }, { status: 400 });
  }
  // Stock and metal quotes are for signed-in people only; anonymous reads (the sample workspace) are counted per address,
  // and signed-in ones per person, since each stock or metal is one request to the paid quote feed.
  const auth=await session().catch(()=>null),signedIn=!!auth;
  if(auth?await rateLimited(req,'market-user',limits.market,auth.user.id,{perIp:false}):await rateLimited(req,'market',limits.publicMarket))return tooManyAttempts();
  const stockAccess=signedIn&&stocks.length+metals.length>0&&!!process.env.TWELVE_DATA_API_KEY;
  const data=await loadMarket(crypto,stocks,stockAccess,metals);
  return Response.json(data,{headers:{'Cache-Control':'private, no-store'}});
}
