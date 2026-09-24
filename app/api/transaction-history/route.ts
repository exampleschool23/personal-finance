import { z } from 'zod';
import { fiatCurrency,isoDate,uuid } from '@/lib/api-validation';
import { kinds } from '@/lib/finance';
import { session,supa } from '@/lib/supabase';
const schema=z.object({page:z.coerce.number().int().min(1).max(1000000),currency:fiatCurrency.nullable(),query:z.string().trim().max(200),category:z.union([z.literal('all'),z.enum(kinds),uuid]),from:isoDate.nullable(),to:isoDate.nullable(),order:z.enum(['newest','oldest','name'])}).refine(value=>!value.from||!value.to||value.from<=value.to);
export async function GET(req:Request){
 try{
  const auth=await session();if(!auth)return Response.json({error:'Please sign in again.'},{status:401});
  const params=new URL(req.url).searchParams;
  const parsed=schema.safeParse({page:params.get('page')??1,currency:params.get('currency')||null,query:params.get('query')??'',category:params.get('category')??'all',from:params.get('from')||null,to:params.get('to')||null,order:params.get('order')??'newest'});
  if(!parsed.success)return Response.json({error:'Invalid history filters.'},{status:400});
  const p=parsed.data;
  const response=await supa('/rest/v1/rpc/transaction_history_page',{method:'POST',body:JSON.stringify({p_page:p.page,p_currency:p.currency,p_query:p.query,p_category:p.category,p_from:p.from,p_to:p.to,p_order:p.order})},auth.token);
  if(!response.ok)throw Error();
  return Response.json(await response.json(),{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Could not load transaction history. Check that the latest migrations are installed.'},{status:503});}
}
