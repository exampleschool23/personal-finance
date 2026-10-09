import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';

// The tag and transaction-rule routes with their network-facing imports replaced; schemas and owner ids stay real.
const [ID,RECORD,ACCOUNT,BUSINESS,CATEGORY,TAG]=Array.from({length:6},(_,index)=>`20000000-0000-4000-8000-00000000000${index+1}`);
function harness(file){
 const state={auth:{token:'member-token',user:{id:'member'},owner:'owner'},calls:[],reads:[],reports:[],rows:{},readError:null,reply:()=>Response.json(3),throws:false};
 const api=loadTS(file,{
  '@/lib/supabase':{session:async()=>state.auth,sameOrigin:loadTS('lib/api-route.ts',{'@/lib/monitoring':{reportError:async()=>{}}}).sameOrigin,supa:async(path,init,token)=>{
   if(state.throws)throw Error('offline');
   state.calls.push({path,method:init?.method,prefer:init?.headers?.Prefer,token,body:init?.body?JSON.parse(init.body):undefined});
   return state.reply(path);
  }},
  '@/lib/server-records':{readOwnerRows:async(table,token,extra)=>{state.reads.push({table,token,extra});if(state.readError)throw state.readError;return state.rows[table]??[];}},
  '@/lib/monitoring':{reportError:async(...args)=>{state.reports.push(args);}},
 });
 return {api,state};
}
const post=(url,body,headers={origin:'https://app.local'})=>new Request('https://app.local'+url,{method:'POST',headers,body:typeof body==='string'?body:JSON.stringify(body)});
const json=async response=>({status:response.status,body:await response.json()});

test('tags: GET reads tags and links in a stable order, never cached, and answers 503 when a read fails',async()=>{
 let {api,state}=harness('app/api/tags/route.ts');
 state.rows={transaction_tags:[{id:TAG,name:'Trip',color:'blue'}],transaction_tag_links:[{record_id:RECORD,tag_id:TAG}]};
 const response=await api.GET();
 assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
 assert.deepEqual(await response.json(),{tags:state.rows.transaction_tags,links:state.rows.transaction_tag_links});
 assert.deepEqual(state.reads,[
  {table:'transaction_tags',token:'member-token',extra:{select:'id,name,color',order:'created_at.asc,id.asc'}},
  {table:'transaction_tag_links',token:'member-token',extra:{select:'record_id,tag_id',order:'record_id.asc,tag_id.asc'}},
 ]);
 state.auth=null;assert.equal((await api.GET()).status,401);
 ({api,state}=harness('app/api/tags/route.ts'));
 state.readError=Error('down');
 assert.deepEqual(await json(await api.GET()),{status:503,body:{error:'Could not load tags. Check that the latest migrations are installed.'}});
});

test('tags: POST saves into the open workspace, deletes by id and names a duplicate',async()=>{
 const {api,state}=harness('app/api/tags/route.ts');
 const url='/api/tags';
 assert.equal((await api.POST(post(url,{action:'save',data:{id:TAG,name:'Trip',color:'blue'}},{origin:'https://evil.example'}))).status,403);
 for(const body of ['nope',{action:'rename',data:{id:TAG}},{action:'save',data:{id:TAG,name:'  ',color:'blue'}},{action:'save',data:{id:TAG,name:'Trip',color:'chartreuse'}},{action:'delete',data:{id:'x'}}])
  assert.deepEqual(await json(await api.POST(post(url,body))),{status:400,body:{error:'Check the tag fields.'}},JSON.stringify(body));
 assert.equal(state.calls.length,0);

 assert.deepEqual(await json(await api.POST(post(url,{action:'save',data:{id:TAG,name:' Trip ',color:'blue'}}))),{status:200,body:{ok:true}});
 // A household member's tag belongs to the workspace owner, not to the member.
 assert.deepEqual(state.calls[0],{path:'/rest/v1/transaction_tags?on_conflict=id',method:'POST',prefer:'resolution=merge-duplicates',token:'member-token',body:{id:TAG,user_id:'owner',name:'Trip',color:'blue'}});
 assert.deepEqual(await json(await api.POST(post(url,{action:'delete',data:{id:TAG}}))),{status:200,body:{ok:true}});
 assert.deepEqual([state.calls[1].path,state.calls[1].method],['/rest/v1/transaction_tags?id=eq.'+TAG,'DELETE']);

 state.reply=()=>Response.json({code:'23505'},{status:409});
 assert.deepEqual(await json(await api.POST(post(url,{action:'save',data:{id:TAG,name:'Trip',color:'blue'}}))),{status:409,body:{error:'A tag with this name already exists.'}});
 state.reply=()=>Response.json({code:'42P01'},{status:404});
 assert.equal((await api.POST(post(url,{action:'save',data:{id:TAG,name:'Trip',color:'blue'}}))).status,503);
 assert.equal((await api.POST(post(url,{action:'delete',data:{id:TAG}}))).status,503);
 state.throws=true;
 assert.equal((await api.POST(post(url,{action:'delete',data:{id:TAG}}))).status,503);
 state.auth=null;state.throws=false;
 assert.equal((await api.POST(post(url,{action:'delete',data:{id:TAG}}))).status,401);
});

const rule=(changes={})=>({id:ID,pattern:'Coffee',match:'contains',direction:'expense',account_id:null,match_business_id:null,match_kind:null,match_category_id:null,amount_min:null,amount_max:null,kind:'Living expense',category_id:CATEGORY,business_id:null,tag_ids:[TAG],apply:false,...changes});

test('transaction rules: GET lists rules newest first and answers 503 when the read fails',async()=>{
 let {api,state}=harness('app/api/transaction-rules/route.ts');
 state.rows={transaction_rules:[rule()]};
 const response=await api.GET();
 assert.equal(response.headers.get('cache-control'),'no-store');
 assert.deepEqual(await response.json(),{rules:[rule()]});
 assert.deepEqual(state.reads,[{table:'transaction_rules',token:'member-token',extra:{order:'created_at.desc,id.asc'}}]);
 state.auth=null;assert.equal((await api.GET()).status,401);
 ({api,state}=harness('app/api/transaction-rules/route.ts'));
 state.readError=Error('down');
 assert.equal((await api.GET()).status,503);
});

test('transaction rules: POST sends each bulk change to its function and reports how many rows changed',async()=>{
 const {api,state}=harness('app/api/transaction-rules/route.ts');
 const url='/api/transaction-rules';
 const cases=[
  [{action:'categorize',data:{ids:[RECORD],kind:'Living expense',category_id:CATEGORY}},'set_transaction_category',{p_ids:[RECORD],p_kind:'Living expense',p_category:CATEGORY}],
  [{action:'business',data:{ids:[RECORD],business_id:null}},'set_transaction_business',{p_ids:[RECORD],p_business:null}],
  [{action:'account_business',data:{account_id:ACCOUNT,business_id:BUSINESS}},'set_account_business',{p_account:ACCOUNT,p_business:BUSINESS}],
  [{action:'tags',data:{ids:[RECORD],add:[TAG],remove:[]}},'set_transaction_tags',{p_ids:[RECORD],p_add:[TAG],p_remove:[]}],
 ];
 for(const [body,name,args] of cases){
  state.calls=[];
  assert.deepEqual(await json(await api.POST(post(url,body))),{status:200,body:{changed:3}},name);
  assert.deepEqual(state.calls.map(call=>[call.path,call.body,call.token]),[['/rest/v1/rpc/'+name,args,'member-token']]);
 }
 state.reply=()=>new Response('null');
 assert.deepEqual(await json(await api.POST(post(url,cases[0][0]))),{status:200,body:{changed:0}},'an empty answer counts as nothing changed');
});

test('transaction rules: POST validates, saves a rule for the workspace owner and applies it when asked',async()=>{
 const {api,state}=harness('app/api/transaction-rules/route.ts');
 const url='/api/transaction-rules';
 assert.equal((await api.POST(post(url,{action:'delete_rule',data:{id:ID}},{origin:'https://evil.example'}))).status,403);
 const invalid=[
  'nope',
  {action:'categorize',data:{ids:[],kind:'Living expense',category_id:null}},
  {action:'tags',data:{ids:[RECORD],add:[TAG,TAG],remove:[]}},
  {action:'save_rule',data:rule({kind:null,category_id:null,tag_ids:[]})},// sets nothing
  {action:'save_rule',data:rule({direction:'income'})},// an expense category on an income rule
  {action:'save_rule',data:rule({pattern:''})},// matches everything
  {action:'save_rule',data:rule({amount_min:50,amount_max:10})},
 ];
 for(const body of invalid)assert.deepEqual(await json(await api.POST(post(url,body))),{status:400,body:{error:'Check the rule fields.'}},JSON.stringify(body));
 assert.equal(state.calls.length,0);

 assert.deepEqual(await json(await api.POST(post(url,{action:'save_rule',data:rule()}))),{status:200,body:{changed:0}});
 const {apply,...saved}=rule();
 assert.equal(apply,false);
 assert.deepEqual(state.calls,[{path:'/rest/v1/transaction_rules?on_conflict=id',method:'POST',prefer:'resolution=merge-duplicates',token:'member-token',body:{...saved,user_id:'owner'}}]);

 state.calls=[];
 assert.deepEqual(await json(await api.POST(post(url,{action:'save_rule',data:rule({apply:true})}))),{status:200,body:{changed:3}});
 assert.deepEqual(state.calls.map(call=>[call.path,call.body]),[['/rest/v1/transaction_rules?on_conflict=id',{...saved,user_id:'owner'}],['/rest/v1/rpc/apply_transaction_rule',{p_rule:ID}]]);

 state.calls=[];
 assert.deepEqual(await json(await api.POST(post(url,{action:'delete_rule',data:{id:ID}}))),{status:200,body:{ok:true}});
 assert.deepEqual(state.calls.map(call=>[call.path,call.method]),[['/rest/v1/transaction_rules?id=eq.'+ID,'DELETE']]);
});

test('transaction rules: POST passes on database refusals, reports unknown failures and stops before applying',async()=>{
 const {api,state}=harness('app/api/transaction-rules/route.ts');
 const url='/api/transaction-rules';
 state.reply=()=>Response.json({code:'P0001',message:'Choose your own category.'},{status:400});
 assert.deepEqual(await json(await api.POST(post(url,{action:'categorize',data:{ids:[RECORD],kind:'Living expense',category_id:CATEGORY}}))),{status:409,body:{error:'Choose your own category.'}});
 state.reply=()=>Response.json({code:'42883'},{status:404});
 const unavailable={status:503,body:{error:'Could not update transactions. Check that the latest migrations are installed.'}};
 assert.deepEqual(await json(await api.POST(post(url,{action:'delete_rule',data:{id:ID}}))),unavailable);
 state.calls=[];
 assert.deepEqual(await json(await api.POST(post(url,{action:'save_rule',data:rule({apply:true})}))),unavailable);
 assert.equal(state.calls.length,1,'a rule that failed to save is not applied');
 assert.ok(state.reports.length>=2,'5xx database failures reach monitoring');
 state.throws=true;
 assert.deepEqual(await json(await api.POST(post(url,{action:'delete_rule',data:{id:ID}}))),unavailable);
 state.auth=null;
 assert.equal((await api.POST(post(url,{action:'delete_rule',data:{id:ID}}))).status,401);
});
