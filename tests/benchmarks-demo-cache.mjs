import test from 'node:test';
import assert from 'node:assert/strict';
import {AsyncLocalStorage} from 'node:async_hooks';
import {loadTS} from './helpers/load-ts.mjs';
const dates=loadTS('lib/benchmark-data.ts');

// The Workers runtime rejects any use of a response body from a request other
// than the one that created it. Node allows it, so emulate that ownership rule.
const NativeResponse=globalThis.Response;
const requests=new AsyncLocalStorage();
const inRequest=(id,run)=>requests.run(id,run);
class RequestBoundResponse extends NativeResponse{
 #owner=requests.getStore();
 static json(data,init={}){const headers=new Headers(init.headers);headers.set('content-type','application/json');return new RequestBoundResponse(JSON.stringify(data),{...init,headers});}
 #use(){if(this.#owner!==requests.getStore())throw new Error('Cannot perform I/O on behalf of a different request.');}
 clone(){this.#use();return new RequestBoundResponse(super.clone().body,{status:this.status,headers:this.headers});}
 text(){this.#use();return super.text();}
 json(){this.#use();return super.json();}
 get body(){this.#use();return super.body;}
}
function route({today=()=>'2026-09-17'}={}){
 return loadTS('app/api/benchmarks/route.ts',{'@/lib/supabase':{session:async()=>null},'@/lib/deposit-interest':{depositToday:today}}).GET;
}
const demo=()=>new Request('https://local/api/benchmarks?demo=1');
async function withRuntime(feed,run){
 const original=globalThis.fetch,key=process.env.TWELVE_DATA_API_KEY;
 try{globalThis.Response=RequestBoundResponse;globalThis.fetch=feed;process.env.TWELVE_DATA_API_KEY='test-secret';await run();}
 finally{globalThis.Response=NativeResponse;globalThis.fetch=original;if(key===undefined)delete process.env.TWELVE_DATA_API_KEY;else process.env.TWELVE_DATA_API_KEY=key;}
}
function liveFeed(counter){
 return async raw=>{
  counter.calls++;const url=new URL(raw);
  if(url.hostname==='api.twelvedata.com')return Response.json({meta:{symbol:url.searchParams.get('symbol'),currency:'USD'},values:[{datetime:'2025-09-17',close:'500'},{datetime:'2026-09-17',close:'550'}]});
  if(url.hostname==='api.exchange.coinbase.com'){
   const start=url.searchParams.get('start').slice(0,10),end=url.searchParams.get('end').slice(0,10),rows=[];
   for(let date=start;date<end;date=dates.shiftDay(date,1))rows.push([dates.dateMillis(date)/1000,0,0,0,65000,1]);
   return Response.json(rows);
  }
  const date=url.pathname.split('/').filter(Boolean).at(-1);
  return Response.json([{Ccy:'USD',Rate:'12500',Nominal:'1',Date:date.split('-').reverse().join('.')}]);
 };
}

// Each visitor runs the handler and reads its body inside its own request.
const visit=(GET,id)=>inRequest(id,async()=>{const response=await GET(demo());return{status:response.status,type:response.headers.get('content-type'),cache:response.headers.get('cache-control'),data:await response.json()};});

test('cached demo benchmarks are served to later requests without reusing the first request body',async()=>{
 const counter={calls:0};
 await withRuntime(liveFeed(counter),async()=>{
  const GET=route();
  const first=await visit(GET,1);assert.equal(first.status,200);
  assert.deepEqual(first.data.errors,{});assert.equal(first.data.prices.SPY[0].close,500);assert.equal(first.data.prices.BTC[0].close,65000);
  const calls=counter.calls;
  for(const id of [2,3]){
   const later=await visit(GET,id);
   assert.equal(later.status,200);
   assert.match(later.type,/^application\/json/);
   assert.equal(later.cache,'private, max-age=300');
   assert.deepEqual(later.data,first.data);
  }
  assert.equal(counter.calls,calls,'Later visitors reuse the cached result without new feed requests');
 });
});

test('demo visitors arriving during the first load share it and each receive a readable body',async()=>{
 const counter={calls:0};
 await withRuntime(liveFeed(counter),async()=>{
  const GET=route();
  const [first,second]=await Promise.all([visit(GET,1),visit(GET,2)]);
  const calls=counter.calls;
  assert.equal(second.status,200);assert.deepEqual(second.data,first.data);assert.deepEqual(second.data.errors,{});
  assert.ok(!JSON.stringify(second.data).includes('test-secret'));
  await visit(GET,3);assert.equal(counter.calls,calls);
 });
});

test('demo feed failures stay explicit JSON errors for every request',async()=>{
 await withRuntime(async()=>{throw Error('offline');},async()=>{
  const GET=route();
  const first=await visit(GET,1),later=await visit(GET,2);
  assert.equal(later.cache,'private, no-store');
  assert.deepEqual(later.data,first.data);assert.deepEqual(later.data.prices,{});
  for(const name of ['SPY','BTC','fx'])assert.ok(later.data.errors[name]);
 });
});

test('an unexpected demo failure returns a JSON message instead of an empty error',async()=>{
 let failures=1;const counter={calls:0};
 await withRuntime(liveFeed(counter),async()=>{
  const GET=route({today:()=>{if(failures-->0)throw Error('clock unavailable');return '2026-09-17';}});
  const failed=await visit(GET,1);
  assert.equal(failed.status,503);
  assert.deepEqual(failed.data,{error:'Could not load comparisons.'});
  const recovered=await visit(GET,2);
  assert.equal(recovered.status,200);assert.deepEqual(recovered.data.errors,{});
 });
});
