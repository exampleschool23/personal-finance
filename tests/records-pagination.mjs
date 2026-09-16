import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { z } from 'zod';
import { kinds } from '../lib/finance.ts';
let source=fs.readFileSync(new URL('../app/api/records/route.ts',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/export const /g,'const ');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
let calls=[];
const supa=async(path,init,token)=>{calls.push({path,body:JSON.parse(init.body),token});return Response.json({records:[],total:45,page:2,pageSize:20});};
const get=new Function('z','kinds','session','supa','sameOrigin',js+';return GET;')(z,kinds,async()=>({user:{id:'owner'},token:'test-token'}),supa,()=>true);
test('requests a bounded server page with section and optional currency',async()=>{
 calls=[];const response=await get(new Request('https://local/api/records?page=2&section=assets&currency=UZS&summary=1'));
 assert.equal(response.status,200);assert.equal(calls.length,1);
 assert.equal(calls[0].path,'/rest/v1/rpc/finance_records_page');
 assert.deepEqual(calls[0].body,{p_page:2,p_section:'assets',p_currency:'UZS',p_summary:true});
 assert.equal(calls[0].token,'test-token');
});
test('rejects invalid pagination rather than issuing an unrestricted query',async()=>{
 for(const query of ['page=0','page=-1','page=1.5','page=1000001','section=bad','currency=EUR','summary=yes']){
  calls=[];assert.equal((await get(new Request('https://local/api/records?'+query))).status,400);assert.equal(calls.length,0);
 }
});
test('normal page changes do not request summary again',async()=>{
 calls=[];await get(new Request('https://local/api/records?page=3'));
 assert.equal(calls[0].body.p_summary,false);assert.equal(calls[0].body.p_currency,null);
});
