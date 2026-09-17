import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {instrumentFor} from '../lib/market.ts';
const compile=path=>ts.transpileModule(fs.readFileSync(path,'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,''),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const {projectGoal}=new Function(compile('lib/goal-projection.ts')+';return {projectGoal};')();
const {investmentGoalProgress,investmentGoalPlan,investmentGoalTargets,investmentGoalItems,investmentGoalCompletion}=new Function('instrumentFor','projectGoal',compile('lib/investment-goals.ts')+';return {investmentGoalProgress,investmentGoalPlan,investmentGoalTargets,investmentGoalItems,investmentGoalCompletion};')(instrumentFor,projectGoal);
const goal={id:'g',kind:'investment',holding_account_id:'wallet',asset_kind:'Crypto',asset_symbol:'BTC',target:1,allocated:0,account_id:null,target_date:'2027-09-17'};
const holding=(id,kind,name,quantity,holding_account_id='wallet')=>({id,kind,name,quantity,holding_account_id,amount:100,currency:'USD'});
const data={holdingAccounts:[{id:'wallet',kind:'Crypto',name:'Wallet'},{id:'broker',kind:'Stock',name:'Broker'}],records:[holding('btc','Crypto','Bitcoin (BTC)',.2),holding('btc2','Crypto','BTC',.1),holding('eth','Crypto','ETH',5),holding('other','Crypto','BTC',2,'another'),holding('cash','Cash','Cash',100),holding('stock','Stock','AAPL',12,'broker')]};

test('accumulation counts matching units in one account and never uses price or cash',()=>{
 const snapshot=structuredClone(data);
 const result=investmentGoalProgress(goal,data);
 assert.ok(Math.abs(result.current-.3)<1e-12);assert.ok(Math.abs(result.percent-30)<1e-10);assert.equal(result.remaining,.7);
 const repriced={...data,records:data.records.map(row=>({...row,amount:1000000}))};
 assert.deepEqual(investmentGoalProgress(goal,repriced),result);assert.deepEqual(data,snapshot);
 assert.equal(investmentGoalProgress({...goal,asset_symbol:'TON'},data).current,0);
 assert.equal(investmentGoalProgress({...goal,holding_account_id:'missing'},data),null);
 assert.equal(investmentGoalProgress({...goal,asset_kind:'Stock'},data),null);
 assert.equal(investmentGoalProgress({...goal,holding_account_id:'broker',asset_kind:'Stock',asset_symbol:'AAPL',target:100},data).current,12);
});
test('purchases, sales, and moving a holding update progress without changing the goal',()=>{
 const bought={...data,records:[...data.records,holding('new','Crypto','BTC',.7)]};
 assert.equal(investmentGoalProgress(goal,bought).percent,100);
 const sold={...data,records:data.records.map(row=>row.id==='btc'?{...row,quantity:0}:row)};
 assert.equal(investmentGoalProgress(goal,sold).current,.1);
 const moved={...data,records:data.records.map(row=>row.id==='btc'?{...row,holding_account_id:'another'}:row)};
 assert.equal(investmentGoalProgress(goal,moved).current,.1);
});
test('unit plans preserve fractional targets and never compound market returns',()=>{
 const plan=investmentGoalPlan({...goal,annual_return:99},.25,'2026-09-17',.05);
 assert.equal(plan.months,12);assert.equal(plan.required,.0625);assert.ok(Math.abs(plan.projected-.85)<1e-12);
 const exact=investmentGoalPlan(goal,.25,'2026-09-17',plan.required);assert.equal(exact.projected,1);
 assert.equal(investmentGoalPlan({...goal,target_date:null},0,'2026-09-17',1),null);
 assert.equal(investmentGoalPlan({...goal,target_date:'2026-09-18'},0,'2026-09-17',1).required,null);
 const fractional=investmentGoalPlan({...goal,target:.1,target_date:'2026-12-17'},0,'2026-09-17',0);
 assert.equal(fractional.required,.03333334);
 assert.ok(investmentGoalPlan({...goal,target:.1,target_date:'2026-12-17'},0,'2026-09-17',fractional.required).projected>=.1);
});

test('investment goal migration preserves existing goals and enforces account ownership and shape',{skip:!process.env.PGLITE_MODULE},async()=>{
 const {PGlite}=await import(process.env.PGLITE_MODULE);const db=new PGlite();
 const id=n=>`70000000-0000-4000-8000-${String(n).padStart(12,'0')}`,owner=id(1),other=id(2);
 try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${owner}'),('${other}');`);
  await db.exec(fs.readFileSync('database/setup.sql','utf8').split('-- Investment accumulation goals.')[0]);
  await db.exec(`SET request.jwt.claim.sub='${owner}';INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date) VALUES('${id(3)}','${owner}','Cash','Cash','USD',1000,'2026-09-17');INSERT INTO holding_accounts(id,user_id,name,kind,currency) VALUES('${id(4)}','${owner}','Crypto','Crypto','USD'),('${id(5)}','${owner}','Broker','Stock','EUR'),('${id(6)}','${other}','Private','Crypto','USD');`);
  const save=data=>db.query("SELECT planning_action('goal',$1)",[data]);
  const cash={id:id(10),name:'Cash goal',account_id:id(3),target:2000,allocated:500,target_date:null,kind:'savings'};
  const wealth={id:id(11),name:'Wealth',account_id:null,target:1000000,allocated:0,target_date:'2030-01-01',kind:'net_worth',currency:'USD'};
  await save(cash);await save(wealth);
  const before=(await db.query('SELECT * FROM savings_goals ORDER BY id')).rows;
  await db.exec(fs.readFileSync('migrations/026_investment_goals.sql','utf8'));
  await db.exec('SET ROLE authenticated');
  const after=(await db.query('SELECT * FROM savings_goals ORDER BY id')).rows;
  assert.deepEqual(after.map(row=>Object.fromEntries(Object.entries(row).filter(([key])=>!['holding_account_id','asset_kind','asset_symbol'].includes(key)))),before);
  const investment={id:id(12),name:'One BTC',account_id:null,kind:'investment',holding_account_id:id(4),asset_kind:'Crypto',asset_symbol:'BTC',target:1,allocated:0,target_date:'2028-01-01',monthly_contribution:.01,annual_return:0};
  await save(investment);await save({...investment,monthly_contribution:.02});
  let stored=(await db.query('SELECT * FROM savings_goals WHERE id=$1',[id(12)])).rows[0];
  assert.equal(stored.currency,'USD');assert.equal(Number(stored.monthly_contribution),.02);
  await save({...investment,id:id(13),holding_account_id:id(5),asset_kind:'Stock',asset_symbol:'AAPL',target:100,target_date:null});
  assert.equal((await db.query('SELECT currency FROM savings_goals WHERE id=$1',[id(13)])).rows[0].currency,'EUR');
  for(const bad of [{holding_account_id:id(6)},{holding_account_id:id(5)},{holding_account_id:null},{account_id:id(3)},{allocated:1},{asset_symbol:null},{asset_symbol:'bad symbol'},{annual_return:5},{target:1e13},{asset_kind:null}])await assert.rejects(save({...investment,...bad}));
  assert.equal(Number((await db.query('SELECT amount FROM finance_records WHERE id=$1',[id(3)])).rows[0].amount),1000);
  assert.equal((await db.query('SELECT count(*)::integer AS count FROM finance_records')).rows[0].count,1);
  await assert.rejects(db.query("UPDATE holding_accounts SET kind='Stock' WHERE id=$1",[id(4)]),/investment goals/);
  await save({...investment,archived:true});
  assert.equal((await db.query('SELECT archived FROM savings_goals WHERE id=$1',[id(12)])).rows[0].archived,true);
  const backup=(await db.query('SELECT export_finance_backup() AS result')).rows[0].result;
  assert.equal(backup.tables.savings_goals.filter(row=>row.kind==='investment').length,2);
  await db.exec(`SET request.jwt.claim.sub='${other}'`);
  assert.equal((await db.query('SELECT * FROM savings_goals')).rows.length,0);
  await assert.rejects(save(investment),/matching stock or crypto/);
  await assert.rejects(save({...investment,holding_account_id:id(6)}),/Goal not found/);
  await db.exec(`SET request.jwt.claim.sub='${owner}'`);
  // Switching goal kinds clears investment metadata and keeps the existing goal id.
  await save({...wealth,id:id(12)});
  stored=(await db.query('SELECT * FROM savings_goals WHERE id=$1',[id(12)])).rows[0];
  assert.equal(stored.kind,'net_worth');assert.equal(stored.holding_account_id,null);assert.equal(stored.asset_symbol,null);
 }finally{await db.close();}
});


test('multi-holding goals keep unlike units separate and require every target to be completed',()=>{
 const targets=[investmentGoalTargets(goal)[0],{holding_account_id:'wallet',asset_kind:'Crypto',asset_symbol:'ETH',target:10,monthly_contribution:1},{holding_account_id:'broker',asset_kind:'Stock',asset_symbol:'AAPL',target:6}];
 const multi={...goal,investment_targets:targets};
 const items=investmentGoalItems(multi,data);
 assert.deepEqual(items.map(item=>item.progress.current),[.30000000000000004,5,12]);
 assert.equal(items[2].progress.percent,100); // Extra shares cannot compensate for missing BTC/ETH.
 assert.equal(investmentGoalCompletion(multi,data),60);
 assert.equal(investmentGoalTargets(goal).length,1);
 assert.deepEqual(investmentGoalTargets({...goal,kind:'net_worth'}),[]);
 assert.equal(investmentGoalCompletion(multi,{...data,holdingAccounts:[]}),null);
 const complete={...data,records:[holding('btc','Crypto','BTC',1),holding('eth','Crypto','ETH',10),holding('stock','Stock','AAPL',6,'broker')]};
 assert.equal(investmentGoalCompletion(multi,complete),100);
 assert.equal(investmentGoalCompletion({...multi,investment_targets:targets.slice(1)},data),75);
 assert.equal(investmentGoalPlan({...multi,...targets[1]},5,'2026-09-17',1).projected,17);
});

test('multi-holding migration preserves legacy goals, saves atomically, and guards every account',{skip:!process.env.PGLITE_MODULE},async()=>{
 const {PGlite}=await import(process.env.PGLITE_MODULE);const db=new PGlite();
 const id=n=>`71000000-0000-4000-8000-${String(n).padStart(12,'0')}`,owner=id(1),other=id(2);
 try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${owner}'),('${other}');`);
  await db.exec(fs.readFileSync('database/setup.sql','utf8').split('-- Multi-holding accumulation goals.')[0]);
  await db.exec(`SET request.jwt.claim.sub='${owner}';INSERT INTO holding_accounts(id,user_id,name,kind,currency) VALUES('${id(4)}','${owner}','Crypto','Crypto','USD'),('${id(5)}','${owner}','Broker','Stock','EUR'),('${id(6)}','${other}','Private','Crypto','USD');`);
  const save=data=>db.query("SELECT planning_action('goal',$1)",[data]);
  const legacy={id:id(12),name:'One BTC',account_id:null,kind:'investment',holding_account_id:id(4),asset_kind:'Crypto',asset_symbol:'BTC',target:4,allocated:0,target_date:'2030-12-01',monthly_contribution:.02,annual_return:0};
  await save(legacy);
  const before=(await db.query('SELECT * FROM savings_goals WHERE id=$1',[legacy.id])).rows[0];
  await db.exec(fs.readFileSync('migrations/027_multi_holding_goals.sql','utf8'));
  const read=async()=>(await db.query('SELECT * FROM savings_goals WHERE id=$1',[legacy.id])).rows[0];
  let stored=await read();const {investment_targets,...unchanged}=stored;assert.deepEqual(unchanged,before);
  assert.equal(investment_targets.length,1);assert.equal(investment_targets[0].target,4);assert.equal(investment_targets[0].monthly_contribution,.02);
  await db.exec('SET ROLE authenticated');
  const targets=[investment_targets[0],{holding_account_id:id(4),asset_kind:'Crypto',asset_symbol:'TON',target:1000,monthly_contribution:30},{holding_account_id:id(5),asset_kind:'Stock',asset_symbol:'AAPL',target:25,monthly_contribution:.5}];
  const multi={...legacy,investment_targets:targets};await db.query('SELECT planning_investment_goal($1)',[multi]);
  stored=await read();assert.deepEqual(stored.investment_targets,targets);assert.equal(Number(stored.target),4);
  const backup=(await db.query('SELECT export_finance_backup() AS result')).rows[0].result;
  assert.deepEqual(backup.tables.savings_goals[0].investment_targets,targets);
  for(const bad of [[],[targets[0],targets[0]],[targets[0],{...targets[2],holding_account_id:id(6)}],[targets[0],{...targets[1],asset_kind:'Stock'}],[targets[0],{...targets[1],target:0}],[targets[0],{...targets[1],target:1e13}],[targets[0],{...targets[1],monthly_contribution:-1}],[targets[0],{...targets[1],asset_symbol:'invalid symbol'}],[targets[0],{...targets[1],target:'10'}],null]){
   await assert.rejects(save({...multi,investment_targets:bad}));assert.deepEqual((await read()).investment_targets,targets);
  }
  await assert.rejects(save(legacy),/Reload this goal/);
  await assert.rejects(db.query("UPDATE holding_accounts SET kind='Crypto' WHERE id=$1",[id(5)]),/investment goals/);
  await assert.rejects(db.query('UPDATE holding_accounts SET id=$1 WHERE id=$2',[id(50),id(5)]),/investment goals/);
  // Ordinary clients can only save through the RPC. Privileged writes still validate every target.
  const invalidUpdate=()=>db.query('UPDATE savings_goals SET investment_targets=$1 WHERE id=$2',[[targets[0],{...targets[2],holding_account_id:id(6)}],legacy.id]);
  await assert.rejects(invalidUpdate(),/permission denied/);
  await db.exec('RESET ROLE');
  await assert.rejects(invalidUpdate(),/matching stock or crypto/);
  await assert.rejects(db.query('DELETE FROM holding_accounts WHERE id=$1',[id(5)]),/investment goals/);
  await db.exec('SET ROLE authenticated');
  await save({...multi,archived:true});assert.equal((await read()).archived,true);
  await db.exec(`SET request.jwt.claim.sub='${other}'`);assert.equal((await db.query('SELECT * FROM savings_goals')).rows.length,0);
  await assert.rejects(save(multi),/matching stock or crypto/);
  await assert.rejects(save({...legacy,investment_targets:[{...targets[0],holding_account_id:id(6)}]}),/Goal not found/);
  await db.exec(`SET request.jwt.claim.sub='${owner}'`);
  // Removal/reordering preserves remaining targets and changes the first-target compatibility fields.
  await save({...multi,investment_targets:[targets[2],targets[1]]});stored=await read();assert.equal(stored.asset_symbol,'AAPL');assert.equal(stored.currency,'EUR');assert.equal(Number(stored.target),25);
  await save({...multi,investment_targets:[targets[1]]});
  await db.query("UPDATE holding_accounts SET kind='Crypto' WHERE id=$1",[id(5)]);
  await save({id:legacy.id,name:'Wealth',account_id:null,kind:'net_worth',currency:'USD',target:1000000,allocated:0,target_date:'2030-12-01',investment_targets:[]});
  stored=await read();assert.deepEqual(stored.investment_targets,[]);assert.equal(stored.holding_account_id,null);
  assert.equal((await db.query('SELECT count(*)::integer AS count FROM finance_records')).rows[0].count,0);
 }finally{await db.close();}
});
