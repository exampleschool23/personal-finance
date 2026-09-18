import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';
const id='b0000000-0000-4000-8000-000000000001';
function api(auth=true,origin=true){const calls=[];return {...loadTS('app/api/goal-tools/route.ts',{'@/lib/supabase':{session:async()=>auth?{token:'owner'}:null,sameOrigin:()=>origin,supa:async(path,init,token)=>{calls.push({path,body:JSON.parse(init.body),token});return Response.json({});}},'@/lib/server-records':{readOwnerRows:async(table,token,options)=>{calls.push({table,token,options});return [];}}}),calls};}
const request=data=>new Request('https://local',{method:'POST',body:JSON.stringify(data)});
test('goal API validates action, precision and real dates before owner-scoped RPC execution',async()=>{
 const activity={action:'activity',data:{id,goal_id:id,target_id:null,source_id:null,amount:.125,date:'2026-09-18',type:'contribution',notes:''}};
 for(const [auth,origin,status] of [[false,true,401],[true,false,403]]){const route=api(auth,origin);assert.equal((await route.POST(request(activity))).status,status);assert.equal(route.calls.length,0);}
 for(const change of [{amount:0},{date:'2026-02-30'},{type:'trade'},{source_id:'foreign-id'}])assert.equal((await api().POST(request({...activity,data:{...activity.data,...change}}))).status,400);
 const route=api();assert.equal((await route.POST(request({...activity,data:{...activity.data,user_id:'other'}}))).status,200);assert.equal(route.calls[0].path,'/rest/v1/rpc/record_goal_activity');assert.equal(route.calls[0].body.p_data.amount,.125);assert.equal(route.calls[0].body.p_data.user_id,undefined);assert.equal(route.calls[0].token,'owner');
 assert.equal((await route.GET()).status,200);assert.equal(route.calls[1].token,'owner');assert.equal(route.calls[1].options.order,'occurred_on.desc,created_at.desc,id.asc');
});
