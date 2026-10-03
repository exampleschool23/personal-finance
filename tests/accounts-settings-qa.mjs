import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import {PGlite} from '@electric-sql/pglite';
import {loadTS} from './helpers/load-ts.mjs';
import {harness} from './helpers/hooks.mjs';

const id=n=>`89000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const {orderedGoals,reorderGoal}=loadTS('lib/goal-order.ts');
const {accountHasLinks,linkedAccountMessage}=loadTS('lib/account-deletion.ts');
const {categoryNameTaken,duplicateCategoryMessage}=loadTS('lib/category-names.ts');
const {workspacePreferenceSchema}=loadTS('lib/workspace-preferences.ts');
const t=(key,params={})=>key.replace(/\{(\w+)\}/g,(_,name)=>params[name]??name);
function find(node,predicate){
 if(!node||typeof node!=='object')return;
 if(predicate(node))return node;
 for(const child of React.Children.toArray(node.props?.children)){const match=find(child,predicate);if(match)return match;}
}

test('accounts and categories keep a dragged order per group, roll back failed saves and isolate owners',async()=>{
 const make=()=>harness('hooks/use-display-order.ts','useDisplayOrder',{orderById:orderedGoals,reorderIds:reorderGoal});
 const items=[{id:id(1)},{id:id(2)},{id:id(3)}];let saved;
 const preferences={data:{preferences:[{key:'account_order',data:{ids:[id(3),id(1)]}}]},loading:false,error:'',save:async p=>{saved=p;}};
 const render=make();
 // Saved order first; an account added later goes to the end.
 assert.deepEqual(render('account_order',items,preferences,'one',false).items.map(i=>i.id),[id(3),id(1),id(2)]);
 // Moving within one group keeps the other group's accounts in their slots.
 await render('account_order',items,preferences,'one',false).reorder(id(2),id(3),[id(3),id(2)]);
 assert.deepEqual(saved,{key:'account_order',data:{ids:[id(2),id(1),id(3)]}});
 assert.deepEqual(render('account_order',items,preferences,'one',false).items.map(i=>i.id),[id(2),id(1),id(3)]);
 const failing={...preferences,save:async()=>{throw Error('Offline');}};
 const other=make();
 await other('category_order',items,failing,'two',false).reorder(id(1),id(3));
 assert.match(other('category_order',items,failing,'two',false).error,/Could not save the order/);
 assert.deepEqual(other('category_order',items,failing,'two',false).items.map(i=>i.id),[id(1),id(2),id(3)]);
 assert.equal(make()('account_order',items,{...preferences,loading:true},'one',false).disabled,true);
 // The sample workspace reorders in memory without saving.
 const demo=make();let demoSaves=0;
 await demo('category_order',items,{...preferences,save:async()=>{demoSaves++;}},null,true).reorder(id(3),id(1));
 assert.equal(demoSaves,0);assert.deepEqual(demo('category_order',items,preferences,null,true).items.map(i=>i.id),[id(3),id(1),id(2)]);
});

test('order preferences hold unique ids only; categories may use built-in names',()=>{
 assert.ok(workspacePreferenceSchema.safeParse({key:'account_order',data:{ids:[id(1),id(2)]}}).success);
 assert.ok(!workspacePreferenceSchema.safeParse({key:'account_order',data:{ids:[id(1),id(1)]}}).success);
 assert.ok(!workspacePreferenceSchema.safeParse({key:'account_order',data:{ids:['Salary']}}).success);
 assert.ok(workspacePreferenceSchema.safeParse({key:'category_order',data:{ids:['Salary',id(1)]}}).success);
 const migration=fs.readFileSync('migrations/089_account_and_category_order.sql','utf8');
 assert.match(migration,/'dashboard','account_order','category_order'\)/);
 assert.ok(fs.readFileSync('database/setup.sql','utf8').includes(migration.trim()));
});

test('a category name that differs only in case or spacing is refused, also against built-in names',()=>{
 const categories=[{id:id(1),name:'QA Coffee',direction:'expense'}];
 assert.equal(categoryNameTaken('qa coffee','expense',categories),true);
 assert.equal(categoryNameTaken('  QA COFFEE ','expense',categories),true);
 assert.equal(categoryNameTaken('charity','expense',categories),true);
 assert.equal(categoryNameTaken('Благотворительность','expense',categories,['Благотворительность']),true);
 assert.equal(categoryNameTaken('qa coffee','income',categories),false);
 assert.equal(categoryNameTaken('qa coffee','expense',categories,[],id(1)),false);
 assert.equal(categoryNameTaken('Coffee beans','expense',categories),false);
 assert.equal(categoryNameTaken('   ','expense',categories),false);
});

test('an account is only offered for deletion when nothing loaded still uses it',()=>{
 const empty={records:[{id:id(1),kind:'Cash'}],goals:[],activity:[],movements:[],investmentLinks:[]};
 assert.equal(accountHasLinks(id(1),empty),false);
 for(const linked of [{records:[{id:id(2),account_id:id(1)}]},{goals:[{id:id(2),account_id:id(1)}]},{activity:[{id:id(2),account_id:id(9),target_id:id(1)}]},{movements:[{id:id(2),source_id:id(1),target_id:id(9)}]},{investmentLinks:[{id:id(2),account_id:id(1)}]}])
  assert.equal(accountHasLinks(id(1),{...empty,...linked}),true);
});

test('deleting a linked account explains why instead of a generic failure',async()=>{
 const failure={code:'23503',message:'update or delete on table "finance_records" violates foreign key constraint "finance_records_account_id_fkey" on table "finance_records"',details:'Key (id) is still referenced from table "finance_records".'};
 const {DELETE}=loadTS('app/api/records/route.ts',{'@/lib/supabase':{session:async()=>({token:'owner',user:{id:id(9)}}),sameOrigin:()=>true,supa:async()=>Response.json(failure,{status:409})}});
 const response=await DELETE(new Request('https://local/api/records',{method:'DELETE',body:JSON.stringify({id:id(1)})}));
 assert.equal(response.status,409);assert.equal((await response.json()).error,linkedAccountMessage);
});

async function database(){
 const db=new PGlite();
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${id(1)}'),('${id(2)}');`);
 await db.exec(fs.readFileSync('database/setup.sql','utf8'));await db.exec(`SET request.jwt.claim.sub='${id(1)}';SET ROLE authenticated;`);return db;
}
test('the database refuses case-only duplicate categories per owner and keeps linked accounts',async()=>{
 const db=await database();
 try{
  const add=(n,name,direction='expense')=>db.query('SELECT planning_action($1,$2)',['category',{id:id(n),name,direction}]);
  await add(10,'QA Coffee');
  await assert.rejects(add(11,'qa coffee'),new RegExp(duplicateCategoryMessage.replace('.','\\.')));
  await assert.rejects(add(12,' Other Expense'),/already exists/);
  await add(13,'qa coffee','income');
  await add(14,'Tea');
  // Renaming goes through the same check, but changing only the letter case of a name is fine.
  await assert.rejects(add(14,'QA COFFEE'),/already exists/);
  await add(10,'QA coffee');
  await db.exec(`SET request.jwt.claim.sub='${id(2)}'`);
  await add(15,'QA Coffee');
  await db.exec(`SET request.jwt.claim.sub='${id(1)}'`);
  const guard=(await db.query("SELECT position('public.finance_restore_active()' in prosrc)>0 AS guarded FROM pg_proc WHERE proname='reject_duplicate_category_name'")).rows[0];
  assert.equal(guard.guarded,true);
  // An account still used by a transaction stays put, with an error the API can explain.
  await db.exec('RESET ROLE');
  await db.query("INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,frequency) VALUES($1,auth.uid(),'Wallet','Cash','USD',100,'2026-01-01','Once')",[id(20)]);
  await db.query("INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,frequency,account_id) VALUES($1,auth.uid(),'Lunch','Living expense','USD',5,'2026-01-02','Once',$2)",[id(21),id(20)]);
  await db.exec('SET ROLE authenticated');
  await assert.rejects(db.query('SELECT move_item_to_deleted($1,$2)',[id(20),'finance_records']),/cannot be deleted|account_id/);
  await db.exec('RESET ROLE');
  await db.query("INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,frequency) VALUES($1,auth.uid(),'Spare','Cash','USD',0,'2026-01-01','Once')",[id(22)]);
  await db.exec('SET ROLE authenticated');
  await db.query('SELECT move_item_to_deleted($1,$2)',[id(22),'finance_records']);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM deleted_items WHERE data->>'id'=$1",[id(22)])).rows[0].n,1);
 }finally{await db.close();}
});

test('deleting a rule asks first and confirms with Deleted, never Saved',async()=>{
 const values=[];let cursor=0;
 const {RulesDialog}=loadTS('components/transactions-page.tsx',{
  react:{...React,useState(initial){const i=cursor++;if(!(i in values))values[i]=initial;return [values[i],value=>{values[i]=value;}];}},
  '@/components/language-provider':{useLanguage:()=>({t,locale:'en-US'})},
 });
 const rule={id:id(1),pattern:'coffee',direction:'expense',kind:'Living expense',category_id:null};const removed=[];
 const render=()=>{cursor=0;return RulesDialog({rules:[rule],categories:[],onEdit(){},onAdd(){},onRemove:async item=>{removed.push(item.id);},onClose(){}});};
 let tree=render();
 assert.equal(find(tree,node=>node.type?.name==='ConfirmDialog').props.open,false);
 // A rule is named by what it matches, since its name test may be empty.
 find(tree,node=>node.props?.['aria-label']==='Delete Name contains “coffee”').props.onClick();
 tree=render();
 const confirm=find(tree,node=>node.type?.name==='ConfirmDialog');
 assert.equal(confirm.props.open,true);assert.equal(removed.length,0);assert.equal(confirm.props.confirmLabel,'Delete rule');
 await confirm.props.onConfirm();assert.deepEqual(removed,[id(1)]);
 assert.equal(find(render(),node=>node.type?.name==='ConfirmDialog').props.open,false);
 const hook=fs.readFileSync('hooks/use-transaction-rules.ts','utf8');
 const removal=hook.slice(hook.indexOf('async remove('));const body=removal.slice(0,removal.indexOf('\n  },'));
 assert.match(body,/showNotice\('Deleted'\)/);assert.doesNotMatch(body,/showSaved/);
});

test('the assistant reports whether it is set up, and the screen waits for that before taking questions',async()=>{
 const previous=process.env.ANTHROPIC_API_KEY;
 try{
  delete process.env.ANTHROPIC_API_KEY;
  const {GET}=loadTS('app/api/assistant/route.ts',{'@anthropic-ai/sdk':{__esModule:true,default:class{}},'@/lib/supabase':{session:async()=>null,sameOrigin:()=>true}});
  assert.deepEqual(await GET().json(),{available:false});
  process.env.ANTHROPIC_API_KEY='test-key';
  assert.deepEqual(await GET().json(),{available:true});
 }finally{if(previous===undefined)delete process.env.ANTHROPIC_API_KEY;else process.env.ANTHROPIC_API_KEY=previous;}
 const screen=fs.readFileSync('components/workspace/screens/assistant-screen.tsx','utf8');
 assert.match(screen,/The assistant isn’t available yet/);
 assert.match(screen,/disabled=\{demo \|\| !user \|\| !available\}/);
});

test('settings headings stay one line: explanations sit behind the ⓘ',()=>{
 for(const file of ['components/settings-panel.tsx','components/telegram-panel.tsx','components/investment-comparison-settings.tsx','components/import-history.tsx','components/data-tools.tsx'])
  assert.doesNotMatch(fs.readFileSync(file,'utf8'),/<\/h[234]>(\{[^}]*&&)?<p className="(muted|my-3 text-sm text-muted-foreground)">/,file);
 assert.match(fs.readFileSync('components/settings-panel.tsx','utf8'),/<h3>\{t\('About you'\)\}<InfoHint>\{t\('Personal details for your profile\.'\)\}<\/InfoHint><\/h3>/);
});

test('opening Settings fills the browser time zone quietly, and never in the sample workspace', () => {
 const source=fs.readFileSync('components/settings-panel.tsx','utf8');
 assert.match(source,/useState\(\(\) => demo \|\| loading \|\| loadError \|\| initial\.timezone \? initial :/,'the sample workspace keeps its preferences as they are');
 assert.match(source,/const autoFill=dirty&&!saved\.timezone&&JSON\.stringify\(\{\.\.\.draft,timezone:saved\.timezone\}\)===JSON\.stringify\(saved\)/);
 assert.match(source,/if \(!quiet\) showSaved\(next\.language\)/,'an automatic time zone save shows no "Saved" notice');
 assert.match(source,/void save\(draft, autoFill\)/);
});
