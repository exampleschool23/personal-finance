import { session,supa } from '@/lib/supabase';
import { readOwnerRows } from '@/lib/server-records';
import { exportCSV } from '@/lib/csv';
export async function GET(req:Request){
 try{const auth=await session();if(!auth)return Response.json({error:'Please sign in again.'},{status:401});
 if(new URL(req.url).searchParams.get('format')==='csv'){
 const records=await readOwnerRows<Record<string,unknown>>('finance_records',auth.token);
 return new Response(exportCSV(records,['id','name','kind','currency','amount','quantity','cost','rate','date','frequency','end_date','notes','account_id','custom_category_id','expense_plan_id']),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="finance-records.csv"','Cache-Control':'no-store'}});
 }
 const result=await supa('/rest/v1/rpc/export_finance_backup',{method:'POST',body:'{}'},auth.token);
 if(!result.ok)throw Error('Incomplete backup');
 return Response.json(await result.json(),{headers:{'Content-Disposition':'attachment; filename="finance-backup.json"','Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Could not export all data. No incomplete backup was created.'},{status:503});}
}
