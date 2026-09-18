import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';
const id=n=>`b0000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function api({auth=true,origin=true,failure=false}={}){
 const calls=[];
 const route=loadTS('app/api/transaction-tools/route.ts',{'@/lib/supabase':{session:async()=>auth?{user:{id:id(1)},token:'owner-token'}:null,sameOrigin:()=>origin,supa:async(path,init,token)=>{calls.push({path,init,token});return failure?Response.json(typeof failure==='object'?failure:{code:'P0001',message:'Split amounts must equal the transaction amount.'},{status:400}):Response.json({ok:true});}},'@/lib/server-records':{readOwnerRows:async(table,token,options)=>{calls.push({table,token,options});return [];}}});
 return {...route,calls};
}
const request=body=>new Request('https://local/api/transaction-tools',{method:'POST',body:JSON.stringify(body)});
test('transaction tools reject anonymous, cross-origin, malformed and non-finite writes before accessing data',async()=>{
 const rule={action:'rule',data:{id:id(2),category_id:id(3),pattern:'Shop',direction:'expense',priority:0,enabled:true}};
 for(const [options,status] of [[{auth:false},401],[{origin:false},403]]){const app=api(options);assert.equal((await app.POST(request(rule))).status,status);assert.equal(app.calls.length,0);}
 for(const data of [{action:'unknown',data:{}},{...rule,data:{...rule.data,pattern:' '}},{action:'split',data:{record_id:id(4),splits:[{category_id:id(3),amount:2}]}},{action:'forecast',data:{record_id:'invalid',account_id:null}}]){const app=api();assert.equal((await app.POST(request(data))).status,400);assert.equal(app.calls.length,0);}
});
test('reads use owner token and stable unique pagination orders; writes pass only validated owner data',async()=>{
 const app=api();assert.equal((await app.GET()).status,200);assert.equal(app.calls.length,2);assert.ok(app.calls.every(call=>call.token==='owner-token'));
 assert.equal(app.calls.find(call=>call.table==='transaction_splits').options.order,'record_id.asc,position.asc');
 const before=app.calls.length;assert.equal((await app.POST(request({action:'rule',data:{id:id(2),category_id:id(3),pattern:'Shop',direction:'expense',priority:0,enabled:true}}))).status,400);assert.equal(app.calls.length,before);
 const failed=api({failure:true});assert.equal((await failed.POST(request({action:'split',data:{record_id:id(4),splits:[{category_id:id(3),amount:1},{category_id:id(3),amount:1}]}}))).status,409);
});

test('forecast saves retain directional precision and report missing database updates without blaming categories',async()=>{
 const data={record_id:id(4),account_id:id(5),exchange_rate:0.00008451,from_currency:'UZS',to_currency:'USD'};
 const app=api();assert.equal((await app.POST(request({action:'forecast',data}))).status,200);
 assert.equal(app.calls[0].path,'/rest/v1/rpc/save_forecast_assignment');
 assert.deepEqual(JSON.parse(app.calls[0].init.body),{p_record:id(4),p_account:id(5),p_rate:0.00008451,p_from:'UZS',p_to:'USD'});
 for(const code of ['PGRST202','PGRST203','42883','42703']){
  const failed=api({failure:{code,message:'Internal schema detail'}});
  const response=await failed.POST(request({action:'forecast',data}));
  assert.equal(response.status,503);assert.match((await response.json()).error,/database update 045/);assert.equal(failed.calls.length,1);
 }
 for(const [code,message,expected] of [['P0001','Choose a cash account.','Choose a cash account.'],['42501','Internal permission detail','Could not save the forecast assignment. Please try again.']]){
  const response=await api({failure:{code,message}}).POST(request({action:'forecast',data}));
  assert.equal(response.status,409);assert.equal((await response.json()).error,expected);
 }
});
