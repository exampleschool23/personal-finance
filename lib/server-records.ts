import { supa } from '@/lib/supabase';
import { pagePath, readAllPages, readIdPages } from '@/lib/owner-rows';
// Every request uses the caller's token; RLS applies to every page.
const readError='Could not load planning data. Check that the latest migrations are installed.';
/** The top-level columns of a PostgREST `select`, embedded resources left whole. */
const selectColumns=(select:string)=>{const columns:string[]=[];let depth=0,start=0;for(let i=0;i<=select.length;i++){const c=select[i];if(c==='(')depth++;else if(c===')')depth--;else if((c===','||c===undefined)&&depth===0){columns.push(select.slice(start,i).trim());start=i+1;}}return columns;};
export async function readOwnerRows<T>(table:string,token:string,extra:Record<string,string>={}):Promise<T[]> {
 const params=new URLSearchParams({select:'*',order:'id.asc',...extra});
 const columns=selectColumns(params.get('select')!);
 // Rows in id order are read after the last id (one index range per page); any other order, or an aliased id, keeps offsets.
 if(params.get('order')!=='id.asc'||columns.some(column=>/^id:(?!:)/.test(column)))return readAllPages<T>(range=>supa(pagePath('/rest/v1/'+table+'?'+params,range),{},token),readError);
 // A select without the id reads it too, for the next page, and hands back only the columns asked for.
 const added=!columns.some(column=>column==='*'||column==='id'||column.startsWith('id::'));
 if(added)params.set('select',params.get('select')+',id');
 const rows=await readIdPages<T&{id:string}>(range=>supa(pagePath('/rest/v1/'+table+'?'+params,range),{},token),readError);
 return added?rows.map(row=>{const copy:Partial<typeof row>={...row};delete copy.id;return copy as T;}):rows;
}
