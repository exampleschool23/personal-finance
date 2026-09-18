import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadTS} from './helpers/load-ts.mjs';
import {harness} from './helpers/hooks.mjs';
const {orderedGoals,moveGoal,reorderGoal}=loadTS('lib/goal-order.ts');
const id=n=>`a0000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('saved order is stable, appends new goals, and ignores deleted goals without mutating input',()=>{
 const goals=[{id:'a'},{id:'b'},{id:'c'}];assert.deepEqual(orderedGoals(goals,['deleted','b','a']).map(g=>g.id),['b','a','c']);assert.deepEqual(goals.map(g=>g.id),['a','b','c']);
 assert.deepEqual(moveGoal(['a','hidden','b'],'b',-1,['a','b']),['b','hidden','a']);
 assert.deepEqual(moveGoal(['a','b'],'a',-1),['a','b']);assert.deepEqual(moveGoal(['a','b'],'missing',1),['a','b']);
});
test('goal order survives a remount, blocks racing saves, rolls back failures and isolates owners',async()=>{
 const make=()=>harness('hooks/use-goal-order.ts','useGoalOrder',{orderedGoals,moveGoal,reorderGoal});
 const goals=[{id:id(1)},{id:id(2)}];let saved,finish;
 const preferences={data:{preferences:[]},loading:false,error:'',save:async p=>{saved=p;await new Promise(resolve=>finish=resolve);}};
 const render=make();const pending=render(goals,preferences,'one',false).move(id(2),-1);
 assert.deepEqual(render(goals,preferences,'one',false).goals.map(g=>g.id),[id(2),id(1)]);
 await render(goals,preferences,'one',false).move(id(2),1);assert.deepEqual(saved.data.ids,[id(2),id(1)]);
 finish();await pending;
 preferences.data.preferences=[saved];assert.deepEqual(make()(goals,preferences,'one',false).goals.map(g=>g.id),saved.data.ids);
 const other={...preferences,data:{preferences:[]},save:async()=>{throw Error('Offline');}};
 assert.deepEqual(render(goals,other,'two',false).goals.map(g=>g.id),[id(1),id(2)]);
 await render(goals,other,'two',false).move(id(2),-1);assert.match(render(goals,other,'two',false).error,/Could not save/);assert.deepEqual(render(goals,other,'two',false).goals.map(g=>g.id),[id(1),id(2)]);
 assert.equal(render(goals,{...other,loading:true},'two',false).disabled,true);
});
test('goal order API validates unique IDs and stores using authenticated owner',async()=>{
 const calls=[];const route=loadTS('app/api/workspace-preferences/route.ts',{'@/lib/supabase':{session:async()=>({user:{id:id(9)},token:'owner'}),sameOrigin:()=>true,supa:async(path,init)=>{calls.push(JSON.parse(init.body));return Response.json({});}}});
 const request=ids=>new Request('https://local',{method:'POST',body:JSON.stringify({data:{key:'goal_order',data:{ids},user_id:id(8)}})});
 assert.equal((await route.POST(request([id(2),id(1)]))).status,200);assert.equal(calls[0].user_id,id(9));assert.deepEqual(calls[0].data.ids,[id(2),id(1)]);
 for(const ids of [[id(1),id(1)],['bad']])assert.equal((await route.POST(request(ids))).status,400);
});
test('goal order migration retains existing preferences and enforces owner isolation',{skip:!process.env.PGLITE_MODULE},async()=>{
 const {PGlite}=await import(process.env.PGLITE_MODULE);const db=new PGlite();
 try{await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;CREATE FUNCTION public.export_finance_backup() RETURNS jsonb LANGUAGE sql AS $$SELECT '{"tables":{}}'::jsonb$$;INSERT INTO auth.users VALUES('${id(1)}'),('${id(2)}');`);
 await db.exec(fs.readFileSync('migrations/037_workspace_preferences.sql','utf8'));await db.exec(fs.readFileSync('migrations/040_goal_display_order.sql','utf8'));
 await db.exec(`SET ROLE authenticated;SET request.jwt.claim.sub='${id(1)}';`);
 await db.query('INSERT INTO workspace_preferences VALUES($1,$2,$3)',[id(1),'goal_order',{ids:[id(3),id(4)]}]);
 assert.deepEqual((await db.query('SELECT data FROM workspace_preferences')).rows[0].data.ids,[id(3),id(4)]);
 await db.exec(`SET request.jwt.claim.sub='${id(2)}'`);assert.equal((await db.query('SELECT * FROM workspace_preferences')).rows.length,0);
 await assert.rejects(db.query('INSERT INTO workspace_preferences VALUES($1,$2,$3)',[id(1),'allocation',{weights:{Cash:100}}]),/row-level security/);
 }finally{await db.close();}
});

test('dragging inserts at the destination and preserves hidden cards',()=>{
 assert.deepEqual(reorderGoal(['a','hidden','b','c'],'a','c',['a','b','c']),['b','hidden','c','a']);
 assert.deepEqual(reorderGoal(['a','b','c'],'c','a'),['c','a','b']);
 assert.deepEqual(reorderGoal(['a','b'],'a','missing'),['a','b']);
});
