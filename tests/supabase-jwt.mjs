import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';
const {tokenVerifier}=loadTS('lib/supabase-jwt.ts');
const issuer='https://project.supabase.co/auth/v1';
const b64=bytes=>Buffer.from(bytes).toString('base64url');
async function keyPair(kid){
 const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
 return {kid,pair,jwk:{...await crypto.subtle.exportKey('jwk',pair.publicKey),kid,alg:'ES256'}};
}
async function sign(key,claims,header={}){
 const head=b64(JSON.stringify({alg:'ES256',typ:'JWT',kid:key.kid,...header})),body=b64(JSON.stringify(claims));
 const signature=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key.pair.privateKey,new TextEncoder().encode(head+'.'+body));
 return head+'.'+body+'.'+b64(signature);
}
const nowMs=Date.parse('2026-10-01T09:00:00Z');
const claims=(over={})=>({iss:issuer,aud:'authenticated',role:'authenticated',sub:'11111111-1111-4111-8111-111111111111',email:'a@example.com',phone:'998901234567',exp:nowMs/1000+3600,...over});
function setup(keys){
 const state={keys,fetches:0,now:nowMs};
 const verify=tokenVerifier(issuer,{now:()=>state.now,fetchKeys:async()=>{state.fetches++;return state.keys.map(key=>key.jwk);}});
 return {state,verify};
}

test('a token signed by a published key is accepted without asking Supabase Auth',async()=>{
 const key=await keyPair('k1'),{state,verify}=setup([key]);
 assert.deepEqual(await verify(await sign(key,claims())),{id:'11111111-1111-4111-8111-111111111111',email:'a@example.com',phone:'998901234567'});
 assert.deepEqual(await verify(await sign(key,claims({email:undefined,phone:undefined}))),{id:'11111111-1111-4111-8111-111111111111',email:''});
 assert.equal(state.fetches,1,'the keys are fetched once and reused');
});

test('forged, expired, foreign and malformed tokens are refused',async()=>{
 const key=await keyPair('k1'),stranger=await keyPair('k1'),{verify}=setup([key]);
 const good=await sign(key,claims());
 const [head,,signature]=good.split('.');
 const refused=[
  await sign(stranger,claims()),
  head+'.'+b64(JSON.stringify(claims({sub:'22222222-2222-4222-8222-222222222222'})))+'.'+signature,
  await sign(key,claims({exp:nowMs/1000-1})),
  await sign(key,claims({exp:undefined})),
  await sign(key,claims({iss:'https://other.supabase.co/auth/v1'})),
  await sign(key,claims({aud:'anon'})),
  await sign(key,claims({role:'anon'})),
  await sign(key,claims({sub:undefined})),
  await sign(key,claims(),{alg:'HS256'}),
  await sign(key,claims(),{alg:'none'}),
  'not-a-token','a.b','',good+'x',
 ];
 for(const token of refused)assert.equal(await verify(token),null,token.slice(0,40));
});

test('a rotated key is picked up, and unknown keys are looked up at most every half minute',async()=>{
 const first=await keyPair('k1'),second=await keyPair('k2'),{state,verify}=setup([first]);
 assert.ok(await verify(await sign(first,claims())));
 state.keys=[first,second];
 const rotated=await sign(second,claims());
 assert.equal(await verify(rotated),null,'right after a fetch the unknown key is not looked up');
 assert.equal(state.fetches,1);
 state.now+=31*1000;
 assert.ok(await verify(rotated),'after half a minute the new key is fetched');
 assert.equal(state.fetches,2);
 for(let index=0;index<5;index++)assert.equal(await verify(await sign(await keyPair('k9'),claims())),null);
 assert.equal(state.fetches,2,'forged key ids do not trigger repeated fetches');
});

test('a failed key download returns null so the caller can fall back to Supabase Auth',async()=>{
 const key=await keyPair('k1');
 const verify=tokenVerifier(issuer,{now:()=>nowMs,fetchKeys:async()=>{throw Error('offline');}});
 assert.equal(await verify(await sign(key,claims())),null);
});
