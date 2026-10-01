// Checks a Supabase access token on this server instead of asking Supabase Auth on every request.
// Supabase signs tokens with ES256 and publishes the public keys; they are cached here and fetched
// again when a token names a key we do not have yet (key rotation). Anything unexpected returns null,
// and the caller falls back to Supabase Auth, so an unusual token is never rejected by mistake.
export type TokenUser={id:string;email:string;phone?:string};
type Jwk=JsonWebKey&{kid?:string;alg?:string};
type Deps={fetchKeys:()=>Promise<Jwk[]>;now:()=>number};
const keyTtl=10*60*1000;
const decode=(part:string)=>Uint8Array.from(atob(part.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(part.length/4)*4,'=')),char=>char.charCodeAt(0));
const json=(part:string)=>JSON.parse(new TextDecoder().decode(decode(part)));
export function tokenVerifier(issuer:string,deps:Deps){
 let cache:{at:number;keys:Map<string,CryptoKey>}|null=null;
 async function load(){
  const keys=new Map<string,CryptoKey>();
  for(const jwk of await deps.fetchKeys())if(jwk.kid&&jwk.kty==='EC'&&jwk.crv==='P-256')keys.set(jwk.kid,await crypto.subtle.importKey('jwk',{kty:jwk.kty,crv:jwk.crv,x:jwk.x,y:jwk.y},{name:'ECDSA',namedCurve:'P-256'},false,['verify']));
  cache={at:deps.now(),keys};return keys;
 }
 async function key(kid:string){
  const age=cache?deps.now()-cache.at:Infinity,known=age<keyTtl?cache!.keys.get(kid):undefined;
  if(known)return known;
  // An unknown key is looked up again at most every half minute, so forged tokens cannot hammer Supabase.
  return age<30*1000?undefined:(await load()).get(kid);
 }
 return async function verify(token:string):Promise<TokenUser|null>{
  try{
   const [head,body,signature]=token.split('.');
   if(!head||!body||!signature)return null;
   const header=json(head);
   if(header.alg!=='ES256'||typeof header.kid!=='string')return null;
   const publicKey=await key(header.kid);
   if(!publicKey||!await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},publicKey,decode(signature),new TextEncoder().encode(head+'.'+body)))return null;
   const claims=json(body),seconds=deps.now()/1000;
   if(claims.iss!==issuer||claims.aud!=='authenticated'||claims.role!=='authenticated'||typeof claims.sub!=='string'||typeof claims.exp!=='number'||claims.exp<=seconds)return null;
   return {id:claims.sub,email:typeof claims.email==='string'?claims.email:'',...(claims.phone?{phone:String(claims.phone)}:{})};
  }catch{return null;}
 };
}
