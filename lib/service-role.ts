// Database access for background work with no signed-in user: the Telegram
// webhook and cron routes. The service role bypasses row security, so every
// caller must scope its queries to an owner it has verified itself.
/** Headers for a request made with the project's server-only key. The newer opaque `sb_secret_` keys travel in `apikey` alone, because Supabase rejects them as a Bearer token. Legacy `service_role` keys are JWTs and need both headers. */
export const serviceKeyHeaders=(key:string):Record<string,string>=>key.startsWith('sb_')?{apikey:key}:{apikey:key,Authorization:'Bearer '+key};
export type ServiceDatabase={read:<T>(path:string,init?:RequestInit)=>Promise<T>;write:(path:string,init?:RequestInit)=>Promise<Response>};
export function serviceDatabase(env:Record<string,string|undefined>=process.env,fetcher:typeof fetch=fetch):ServiceDatabase|null{
 const key=env.SUPABASE_SERVICE_ROLE_KEY,url=env.SUPABASE_URL;
 if(!key||!url)return null;
 const headers={...serviceKeyHeaders(key),'Content-Type':'application/json'};
 const request=(path:string,init:RequestInit={})=>fetcher(url+path,{...init,headers:{...headers,...init.headers},cache:'no-store',signal:AbortSignal.timeout(10000)});
 return {
  async read<T>(path:string,init:RequestInit={}){const response=await request(path,init);if(!response.ok)throw Error('Database request failed.');return await response.json() as T;},
  write:request,
 };
}
