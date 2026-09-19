import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import ts from 'typescript';import {z} from 'zod';
let auth=true,calls=[],fail=null;
const source=ts.transpileModule(fs.readFileSync('app/api/investment-history/route.ts','utf8').replace(/^import .*;\n/gm,'').replace(/export /g,''),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const api=new Function('z','session','supa','sameOrigin',source+';return DELETE;')(z,async()=>auth?{token:'owner-token'}:null,async(path,init,token)=>{calls.push({path,body:JSON.parse(init.body),token});return fail?Response.json({message:fail},{status:400}):Response.json({ok:true});},req=>req.headers.get('origin')==='https://local');
const id='e0000000-0000-4000-8000-000000000001',record_id='e0000000-0000-4000-8000-000000000010';
const request=(body={id,record_id},origin='https://local')=>new Request('https://local/api/investment-history',{method:'DELETE',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
test('delete endpoint authenticates, checks origin and identifiers, passes owner token and hides unexpected database errors',async()=>{
 assert.equal((await api(request(undefined,'https://other'))).status,403);
 auth=false;assert.equal((await api(request())).status,401);auth=true;
 assert.equal((await api(request({id:'bad',record_id}))).status,400);assert.equal(calls.length,0);
 assert.equal((await api(request({id,record_id,user_id:'other'}))).status,200);
 assert.deepEqual(calls[0],{path:'/rest/v1/rpc/delete_tracker_update',body:{p_id:id,p_record_id:record_id},token:'owner-token'});
 fail='Delete newer balance updates first.';assert.equal((await api(request())).status,400);
 fail='secret database detail';const response=await api(request());assert.equal(response.status,503);assert.ok(!JSON.stringify(await response.json()).includes('secret'));
});
