// Every row an owner has in a table, read with the server-only key in pages.
import type {ServiceDatabase} from './service-role';
export async function ownerRows<T>(db:ServiceDatabase,table:string,owner:string,select='*'){
 const rows:T[]=[];
 for(let offset=0;;offset+=500){const batch=await db.read<T[]>(`/rest/v1/${table}?select=${select}&user_id=eq.${owner}&order=id.asc&limit=500&offset=${offset}`);rows.push(...batch);if(batch.length<500)return rows;}
}
