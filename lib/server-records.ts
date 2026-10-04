import { supa } from '@/lib/supabase';
import { pagePath, readAllPages } from '@/lib/owner-rows';
// Every request uses the caller's token; RLS applies to every page.
export function readOwnerRows<T>(table:string,token:string,extra:Record<string,string>={}) {
 const params=new URLSearchParams({select:'*',order:'id.asc',...extra});
 return readAllPages<T>(range=>supa(pagePath('/rest/v1/'+table+'?'+params,range),{},token),'Could not load planning data. Check that the latest migrations are installed.');
}
/** Every row of a ready-made query path, read with the caller's token. */
export function readPathRows<T>(path:string,token:string,error?:string){return readAllPages<T>(range=>supa(pagePath(path,range),{},token),error);}
