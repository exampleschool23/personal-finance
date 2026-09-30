import { diversifiedPortfolioSchema } from '@/lib/diversified-portfolio';
import { z } from 'zod';
import { session, supa, sameOrigin } from '@/lib/supabase';
import { isCurrency } from '@/lib/currencies';
import { investmentKinds, defaultComparisonPreferences } from '@/lib/comparison-profile';
import { benchmarkSelectionSchema } from '@/lib/benchmark-selection';
import { validDay } from '@/lib/benchmark-data';
import { benchmarkHistoryStart } from '@/lib/investment-benchmarks';
const preferences = z.object({benchmarks:benchmarkSelectionSchema,portfolio:diversifiedPortfolioSchema.nullable().optional(),custom_symbol:z.string().regex(/^$|^[A-Z][A-Z0-9.-]{0,14}$/)}).refine(value=>!value.benchmarks.includes('CUSTOM')||!!value.custom_symbol).refine(value=>!value.benchmarks.includes('PORTFOLIO')||!!value.portfolio).refine(value=>!value.portfolio?.assets?.some(asset=>asset.currency&&!isCurrency(asset.currency)));
// Null returns to tracking from the first investment activity.
const tracking = z.object({tracking_start:z.string().refine(date=>validDay(date)&&date>=benchmarkHistoryStart).nullable()});
const baseline = z.object({starting_amount:z.number().finite().min(0).max(1e27),currency:z.string().refine(isCurrency),holdings:z.array(z.object({id:z.string().uuid(),kind:z.enum(investmentKinds),currency:z.string().refine(isCurrency),balance:z.number().finite().min(0).max(1e27)})).max(10000)}).refine(value=>new Set(value.holdings.map(holding=>holding.id)).size===value.holdings.length);
export async function GET() {
 try {
  const auth=await session();if(!auth)return Response.json({error:'Please sign in again.'},{status:401});
  const activity=await supa('/rest/v1/rpc/mark_app_started',{method:'POST',body:'{}'},auth.token);
  const [saved,capital]=await Promise.all([supa('/rest/v1/investment_comparison_preferences?select=*',{},auth.token),supa('/rest/v1/investment_comparison_baselines?select=starting_amount,currency,capital_as_of,holdings',{},auth.token)]);
  if(!activity.ok||!saved.ok||!capital.ok)throw Error();
  const rows=await saved.json() as Array<Record<string,unknown>>,baselines=await capital.json() as unknown[];
  // Every column is read so the profile still loads before migration 073 adds tracking_start.
  const row=rows[0],preferences=row?{benchmarks:row.benchmarks,custom_symbol:row.custom_symbol,...(row.portfolio===undefined?{}:{portfolio:row.portfolio})}:defaultComparisonPreferences;
  return Response.json({owner_id:auth.user.id,activity:await activity.json(),preferences,baseline:baselines[0]??null,tracking_start:typeof row?.tracking_start==='string'?row.tracking_start:null},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Investment comparisons are not set up for this account yet.'},{status:503});}
}
async function write(req:Request,capture:boolean){
 if(!sameOrigin(req))return new Response(null,{status:403});
 try{
  const auth=await session();if(!auth)return Response.json({error:'Please sign in again.'},{status:401});
  const parsed=(capture?baseline:preferences).safeParse(await req.json());
  if(!parsed.success)return Response.json({error:'Check the comparison settings.'},{status:400});
  const table=capture?'investment_comparison_baselines':'investment_comparison_preferences';
  const response=await supa('/rest/v1/'+table+'?on_conflict=user_id',{method:'POST',headers:{Prefer:capture?'resolution=ignore-duplicates':'resolution=merge-duplicates'},body:JSON.stringify({...parsed.data,user_id:auth.user.id})},auth.token);
  if(!response.ok)throw Error();
  return Response.json({ok:true});
 }catch{return Response.json({error:'Could not save comparison settings.'},{status:503});}
}
// Only the tracking start changes; a first save also stores the default benchmark choices.
export async function PATCH(req:Request){
 if(!sameOrigin(req))return new Response(null,{status:403});
 try{
  const auth=await session();if(!auth)return Response.json({error:'Please sign in again.'},{status:401});
  const parsed=tracking.safeParse(await req.json());
  if(!parsed.success)return Response.json({error:'Choose a valid tracking start date.'},{status:400});
  const updated=await supa('/rest/v1/investment_comparison_preferences?user_id=eq.'+auth.user.id,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(parsed.data)},auth.token);
  if(!updated.ok)throw Error();
  if(!(await updated.json() as unknown[]).length){
   const created=await supa('/rest/v1/investment_comparison_preferences?on_conflict=user_id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates'},body:JSON.stringify({...defaultComparisonPreferences,...parsed.data,user_id:auth.user.id})},auth.token);
   if(!created.ok)throw Error();
  }
  return Response.json({ok:true});
 }catch{return Response.json({error:'Could not save the tracking start date.'},{status:503});}
}
export const PUT=(req:Request)=>write(req,false);
export const POST=(req:Request)=>write(req,true);
