import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';
const owner='a0000000-0000-4000-8000-000000000001';
function api({auth=true,origin=true,rows=[],ok=true}={}){const calls=[];return {...loadTS('app/api/workspace-preferences/route.ts',{'@/lib/supabase':{session:async()=>auth?{user:{id:owner},token:'owner'}:null,sameOrigin:()=>origin,supa:async(path,init,token)=>{calls.push({path,init,token});return Response.json(rows,{status:ok?200:500});}}}),calls};}
const request=data=>new Request('https://local',{method:'POST',body:JSON.stringify({data})});
test('workspace preferences enforce owner, valid weights and strict supported schemas',async()=>{
 const data={key:'allocation',data:{weights:{Stock:60,Cash:40}},user_id:'other'};
 for(const [options,status] of [[{auth:false},401],[{origin:false},403]]){const route=api(options);assert.equal((await route.POST(request(data))).status,status);assert.equal(route.calls.length,0);}
 const route=api();assert.equal((await route.POST(request(data))).status,200);assert.equal(JSON.parse(route.calls[0].init.body).user_id,owner);assert.equal(route.calls[0].token,'owner');
 for(const invalid of [{key:'allocation',data:{weights:{Cash:99}}},{key:'allocation',data:{weights:{Cash:-1,Stock:101}}},{key:'unknown',data:{}},{key:'watchlists',data:{items:[{id:owner,name:'Test',query:'',category:'',currency:'ZZZ',target:1}]}}])assert.equal((await api().POST(request(invalid))).status,400);
});
test('preference reads do not hide invalid saved data or provide successful defaults on a failed read',async()=>{
 assert.equal((await api({rows:[{key:'allocation',data:{weights:{Cash:10}}}]}).GET()).status,503);assert.equal((await api({ok:false}).GET()).status,503);
 const response=await api({rows:[{key:'allocation',data:{weights:{Cash:100}}}]}).GET();assert.equal(response.headers.get('cache-control'),'no-store');assert.equal((await response.json()).preferences.length,1);
});
