import { supa } from '@/lib/supabase';
// Every request uses the caller's token; RLS applies to every page.
export async function readOwnerRows<T>(table:string,token:string,extra:Record<string,string>={}) {
 const rows:T[]=[];
 for(let offset=0;;offset+=500){
  const params=new URLSearchParams({select:'*',order:'id.asc',limit:'500',offset:String(offset),...extra});
  const response=await supa('/rest/v1/'+table+'?'+params,{},token);
  if(!response.ok)throw Error('Could not load planning data. Check that the latest migrations are installed.');
  const batch=await response.json() as T[];rows.push(...batch);if(batch.length<500)return rows;
 }
}
