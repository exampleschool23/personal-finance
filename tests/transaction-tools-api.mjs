import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';
const id=n=>`b0000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function api({auth=true,origin=true,failure=false}={}){
 const calls=[];
 const route=loadTS('app/api/transaction-tools/route.ts',{'@/lib/supabase':{session:async()=>auth?{user:{id:id(1)},token:'owner-token'}:null,sameOrigin:()=>origin,supa:async(path,init,token)=>{calls.push({path,init,token});return failure?Response.json({code:'P0001',message:'Split amounts must equal the transaction amount.'},{status:400}):Response.json({ok:true});}},'@/lib/server-records':{readOwnerRows:async(table,token,options)=>{calls.push({table,token,options});return [];}}});
 return {...route,calls};
}
const request=body=>new Request('https://local/api/transaction-tools',{method:'POST',body:JSON.stringify(body)});
test('transaction tools reject anonymous, cross-origin, malformed and non-finite writes before accessing data',async()=>{
 const rule={action:'rule',data:{id:id(2),category_id:id(3),pattern:'Shop',direction:'expense',priority:0,enabled:true}};
 for(const [options,status] of [[{auth:false},401],[{origin:false},403]]){const app=api(options);assert.equal((await app.POST(request(rule))).status,status);assert.equal(app.calls.length,0);}
 for(const data of [{action:'unknown',data:{}},{...rule,data:{...rule.data,pattern:' '}},{action:'split',data:{record_id:id(4),splits:[{category_id:id(3),amount:2}]}},{action:'forecast',data:{record_id:'invalid',account_id:null}}]){const app=api();assert.equal((await app.POST(request(data))).status,400);assert.equal(app.calls.length,0);}
});
test('reads use owner token and stable unique pagination orders; writes pass only validated owner data',async()=>{
 const app=api();assert.equal((await app.GET()).status,200);assert.equal(app.calls.length,3);assert.ok(app.calls.every(call=>call.token==='owner-token'));
 assert.equal(app.calls.find(call=>call.table==='transaction_splits').options.order,'record_id.asc,position.asc');
 await app.POST(request({action:'rule',data:{id:id(2),category_id:id(3),pattern:' Shop ',direction:'expense',priority:0,enabled:true,user_id:id(99)}}));
 const payload=JSON.parse(app.calls.at(-1).init.body);assert.equal(payload.user_id,id(1));assert.equal(payload.pattern,'Shop');
 const failed=api({failure:true});assert.equal((await failed.POST(request({action:'split',data:{record_id:id(4),splits:[{category_id:id(3),amount:1},{category_id:id(3),amount:1}]}}))).status,409);
});
