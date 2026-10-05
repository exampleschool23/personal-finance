// Every row of a PostgREST query, read in pages. readOwnerRows (lib/server-records.ts) reads with the
// signed-in person's token; ownerRows reads one owner's rows with the server-only key.
import type {ServiceDatabase} from './service-role';
export const pageSize=500;
/** Calls `page` with `limit=…&offset=…` until a short page. A failed page throws `error`, so nobody sees a partial list. */
export async function readAllPages<T>(page:(range:string)=>Promise<Response|T[]>,error='Database request failed.'):Promise<T[]>{
 const rows:T[]=[];
 for(let offset=0;;offset+=pageSize){
  const result=await page(`limit=${pageSize}&offset=${offset}`);
  if(result instanceof Response&&!result.ok)throw Error(error);
  const batch=result instanceof Response?await result.json() as T[]:result;
  rows.push(...batch);if(batch.length<pageSize)return rows;
 }
}
/** Every row of an `order=id.asc` query. Each page asks for the rows after the last id it has (`id=gt.…`), so a page is
 * one index range of (user_id,id) rather than an offset the database counts past again; a failed page throws `error`. */
export async function readIdPages<T extends {id:string}>(page:(range:string)=>Promise<Response|T[]>,error='Database request failed.'):Promise<T[]>{
 const rows:T[]=[];
 for(let after:string|null=null;;){
  const result=await page(`limit=${pageSize}`+(after===null?'':`&id=gt.${encodeURIComponent(after)}`));
  if(result instanceof Response&&!result.ok)throw Error(error);
  const batch=result instanceof Response?await result.json() as T[]:result;
  rows.push(...batch);if(batch.length<pageSize)return rows;
  after=String(batch[batch.length-1].id);
 }
}
/** `path` with the page range appended, whether or not it already has a query. */
export const pagePath=(path:string,range:string)=>path+(path.includes('?')?'&':'?')+range;
export function ownerRows<T>(db:ServiceDatabase,table:string,owner:string,select='*'){
 return readAllPages<T>(range=>db.read<T[]>(`/rest/v1/${table}?select=${select}&user_id=eq.${owner}&order=id.asc&${range}`));
}
