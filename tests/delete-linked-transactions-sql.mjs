import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const id=n=>`12600000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const [owner,stranger,viewer,member]=[1,2,3,4].map(id);
const setup=fs.readFileSync('database/setup.sql','utf8');
const migration=fs.readFileSync('migrations/126_delete_linked_transactions.sql','utf8');
const skip=!process.env.PGLITE_MODULE;
async function database(){
 const {PGlite}=await import(process.env.PGLITE_MODULE);const db=new PGlite();
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${owner}'),('${stranger}'),('${viewer}'),('${member}');`);
 await db.exec(setup);
 return db;
}
const functions=db=>db.query(`SELECT md5(string_agg(pg_get_functiondef(p.oid),'' ORDER BY p.oid::regprocedure::text)) AS sum FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f' AND p.proname<>'finance_capabilities'`).then(r=>r.rows[0].sum);

test('migration 126 is in setup.sql, reports its schema version and changes nothing when applied again',{skip},async()=>{
 assert.ok(setup.includes(migration),'setup.sql includes migration 126');
 const db=await database();
 try{
  assert.equal((await db.query('SELECT finance_capabilities()->>\'schema_version\' AS v')).rows[0].v,'126');
  const before=await functions(db);
  await db.exec(migration);
  assert.equal(await functions(db),before);
  const grants=(await db.query(`SELECT p.proname,has_function_privilege('authenticated',p.oid,'EXECUTE') AS run FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('delete_linked_transaction','delete_linked_rows','restore_linked_balance','reverse_cash_link') ORDER BY 1`)).rows;
  assert.deepEqual(grants.map(row=>[row.proname,row.run]),[['delete_linked_rows',false],['delete_linked_transaction',true],['restore_linked_balance',false],['reverse_cash_link',false]]);
 }finally{await db.close();}
});

test('linked transactions delete with their whole operation and give every balance back exactly',{skip},async()=>{
 const db=await database();
 try{
  const as=(user,workspace=null)=>db.exec(`RESET ROLE;SET request.jwt.claim.sub='${user}';SET request.headers='${JSON.stringify(workspace?{'x-workspace-owner':workspace}:{})}';SET ROLE authenticated;`);
  await as(owner);
  const today=(await db.query("SELECT (now() AT TIME ZONE 'Asia/Tashkent')::date::text AS day")).rows[0].day;
  const record=(n,name,kind,currency,amount,quantity=1,cost=0)=>db.query('INSERT INTO finance_records(id,user_id,name,kind,currency,amount,quantity,cost,date) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[id(n),owner,name,kind,currency,amount,quantity,cost,today]);
  await record(10,'Wallet','Cash','USD',1000);
  await record(11,'Savings','Cash','USD',500);
  await record(12,'Sheep farm','Business','UZS',160000000);
  await record(13,'Home','Mortgage','USD',100000);
  await record(14,'AAPL','Stock','USD',100,0);
  await record(15,'Sum account','Cash','UZS',5000000);
  await record(16,'Car loan','Loan','USD',1000);
  await record(17,'Term deposit','Deposit','USD',0);
  const ids=[10,11,12,13,14,15,16,17];
  // Balances and quantities. A holding's average cost is checked where a purchase moved it: a
  // purchase into an empty holding replaced its quote and cost, which nothing recorded, so they stay.
  const snapshot=async()=>Object.fromEntries((await db.query('SELECT id,amount,quantity,cost FROM finance_records WHERE id=ANY($1) ORDER BY id',[ids.map(id)])).rows.map(r=>[r.id,[Number(r.amount),Number(r.quantity)]]));
  const value=async(n,field='amount')=>Number((await db.query(`SELECT ${field} FROM finance_records WHERE id=$1`,[id(n)])).rows[0][field]);
  const count=async(table,where,params=[])=>Number((await db.query(`SELECT count(*) AS n FROM ${table} WHERE ${where}`,params)).rows[0].n);
  const remove=key=>db.query('SELECT delete_linked_transaction($1) AS r',[key]).then(r=>r.rows[0].r);
  const feeRow=async(column,key)=>(await db.query(`SELECT id FROM finance_records WHERE ${column}=$1`,[key])).rows[0].id;
  const fx=(n,target,type,amount,account,rate,accountCurrency,recordCurrency,principal=0,interest=0)=>db.query('SELECT record_investment_with_fx($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)',[id(n),id(target),type,today,amount,null,'',id(account),rate,today,accountCurrency,recordCurrency,principal,interest]);
  const move=data=>db.query('SELECT record_asset_movement($1)',[{fee:0,date:today,notes:'',...data}]);
  const start=await snapshot();

  // A plain row is deleted the ordinary way.
  await db.query("INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,account_id) VALUES($1,$2,'Coffee','Other expense','USD',5,$3,$4)",[id(90),owner,today,id(10)]);
  await assert.rejects(remove(id(90)),/no linked operation\. Delete it normally/);
  await db.query('SELECT move_item_to_deleted($1,$2)',[id(90),'finance_records']);
  await db.exec(`RESET ROLE;DELETE FROM deleted_items;`);await as(owner);
  assert.deepEqual(await snapshot(),start);

  // Tracker income paid into a cash account in another currency, at its own dated rate.
  await fx(20,12,'income',1200000,10,12000,'USD','UZS');
  assert.equal(await value(10),1100);
  assert.equal(await count('finance_records','history_event_id=$1',[id(20)]),1);
  // Others never see or delete it.
  await as(stranger);
  await assert.rejects(remove(id(20)),/Record not found/);
  // A viewer of the household reads but cannot delete; a member can.
  await db.exec(`RESET ROLE;INSERT INTO household_members(owner_id,member_id,role) VALUES('${owner}','${viewer}','viewer'),('${owner}','${member}','member');`);
  await as(viewer,owner);
  assert.equal(await count('finance_records','id=$1',[id(20)]),1);
  await assert.rejects(remove(id(20)),/view-only/);
  // A reversal that would leave the cash account below zero changes nothing.
  await as(owner);
  await db.query("INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,account_id) VALUES($1,$2,'Rent','Other expense','USD',1050,$3,$4)",[id(91),owner,today,id(10)]);
  const blocked=await snapshot();
  await assert.rejects(remove(id(20)),/cash reversal would create an invalid balance/);
  assert.deepEqual(await snapshot(),blocked);
  assert.equal(await count('investment_account_links','id=$1',[id(20)]),1);
  await db.query('SELECT move_item_to_deleted($1,$2)',[id(91),'finance_records']);
  await as(member,owner);
  assert.deepEqual(await remove(id(20)),{ok:true});
  await as(owner);
  assert.deepEqual(await snapshot(),start);
  for(const [table,column] of [['finance_records','id'],['investment_history','id'],['investment_account_links','id']])assert.equal(await count(table,`${column}=$1`,[id(20)]),0,table);
  assert.equal(await count('deleted_items',"data->>'id'=$1",[id(20)]),0,'never reaches Recently deleted');
  assert.equal(await count('deleted_tracker_updates','id=$1',[id(20)]),1);
  // The same update cannot be replayed, and a retried delete is fine.
  await assert.rejects(fx(20,12,'income',1200000,10,12000,'USD','UZS'),/was deleted/);
  await assert.rejects(db.query('SELECT record_investment_event($1,$2,$3,$4,$5,$6,$7)',[id(20),id(12),'income',today,1200000,null,'']),/was deleted/);
  assert.deepEqual(await remove(id(20)),{ok:true});
  // A tracker expense without a cash account.
  await db.query('SELECT record_investment_event($1,$2,$3,$4,$5,$6,$7)',[id(21),id(12),'expense',today,50000,null,'Feed']);
  await remove(id(21));
  assert.equal(await count('investment_history','id=$1',[id(21)]),0);
  assert.deepEqual(await snapshot(),start);

  // Mortgage payments: from Accounts (principal plus interest from cash) and with a dated cash link.
  await db.query("SELECT planning_action('mortgage',$1)",[{id:id(30),account_id:id(10),target_id:id(13),amount:600,received:0,fee:200,date:today,notes:'June'}]);
  assert.equal(await value(10),200);assert.equal(await value(13),99400);
  await remove(id(30));
  assert.deepEqual(await snapshot(),start);
  for(const table of ['finance_records','mortgage_payments','account_activity','investment_history'])assert.equal(await count(table,'id=$1',[id(30)]),0,table);
  await assert.rejects(db.query("SELECT planning_action('mortgage',$1)",[{id:id(30),account_id:id(10),target_id:id(13),amount:600,received:0,fee:200,date:today,notes:'June'}]),/was deleted/);
  assert.deepEqual(await snapshot(),start);
  const withdrawals=await count('investment_history',"record_id=$1 AND event_type='withdrawal'",[id(10)]);
  await fx(31,13,'mortgage_payment',800,10,1,'USD','USD',600,200);
  assert.equal(await value(10),200);assert.equal(await value(13),99400);
  assert.equal(await count('investment_history',"record_id=$1 AND event_type='withdrawal'",[id(10)]),withdrawals+1);
  await remove(id(31));
  assert.deepEqual(await snapshot(),start);
  assert.equal(await count('investment_history',"record_id=$1 AND event_type='withdrawal'",[id(10)]),withdrawals,'the mirrored cash entry goes too');
  for(const table of ['finance_records','mortgage_payments','investment_account_links','investment_history'])assert.equal(await count(table,'id=$1',[id(31)]),0,table);
  await db.query('SELECT record_mortgage_payment($1,$2,$3,$4,$5,$6)',[id(32),id(13),500,0,today,'']);
  await remove(id(32));
  assert.deepEqual(await snapshot(),start);

  // A transfer with a fee goes with both legs, its fee and its history entries.
  await move({id:id(40),kind:'transfer',source_id:id(10),target_id:id(11),sent:100,received:95,source_value:100,target_value:95,fee:5,notes:'Move'});
  assert.equal(await value(11),595);
  await remove(await feeRow('movement_id',id(40)));
  assert.deepEqual(await snapshot(),start);
  assert.equal(await count('asset_movements','id=$1',[id(40)]),0);
  assert.equal(await count('investment_history',"notes='Move'"),0);

  // Bought units sold since cannot be given back; the sale goes first.
  await move({id:id(41),kind:'buy',source_id:id(10),target_id:id(14),sent:1000,received:10,source_value:1000,target_value:1000,fee:5});
  await move({id:id(42),kind:'sell',source_id:id(14),target_id:id(10),sent:6,received:720,source_value:720,target_value:720,fee:2});
  const sold=await snapshot();
  await assert.rejects(remove(await feeRow('movement_id',id(41))),/Insufficient balance or holding quantity/);
  assert.deepEqual(await snapshot(),sold);
  await remove(await feeRow('movement_id',id(42)));
  assert.equal(await value(14,'quantity'),10);assert.equal(await value(10),0);
  await remove(await feeRow('movement_id',id(41)));
  assert.equal(await value(14,'quantity'),0);assert.equal(await value(10),1000);
  // Purchases on top of each other come off newest first, each giving back the earlier average cost.
  await move({id:id(43),kind:'buy',source_id:id(10),target_id:id(14),sent:400,received:4,source_value:400,target_value:400,fee:1});
  await move({id:id(44),kind:'buy',source_id:id(10),target_id:id(14),sent:400,received:2,source_value:400,target_value:400,fee:1});
  assert.equal(await value(14,'cost'),800/6);
  await assert.rejects(remove(await feeRow('movement_id',id(43))),/Delete later trades of this holding first/);
  await remove(await feeRow('movement_id',id(44)));
  assert.equal(await value(14,'quantity'),4);assert.equal(Math.round(await value(14,'cost')*1e8)/1e8,100);assert.equal(await value(10),600);
  await remove(await feeRow('movement_id',id(43)));
  assert.equal(await value(14,'quantity'),0);assert.equal(await value(10),1000);
  // Capitalized interest.
  await move({id:id(45),kind:'interest',source_id:id(17),target_id:id(17),sent:0,received:5,source_value:0,target_value:5});
  await remove(await feeRow('movement_id',id(45)));
  assert.equal(await value(17),0);
  assert.equal(await count('asset_movements','true'),0);

  // Account operation fees: a transfer, a repayment, and a repayment in another currency.
  await db.query("SELECT planning_action('transfer',$1)",[{id:id(50),account_id:id(10),target_id:id(11),amount:100,received:100,fee:3,date:today}]);
  assert.equal(await value(10),897);
  await remove(await feeRow('operation_id',id(50)));
  assert.equal(await count('account_activity','id=$1',[id(50)]),0);
  await db.query("SELECT planning_action('repayment',$1)",[{id:id(51),account_id:id(10),target_id:id(16),amount:100,fee:10,date:today}]);
  assert.equal(await value(16),900);assert.equal(await value(10),890);
  await remove(await feeRow('operation_id',id(51)));
  await db.query('SELECT record_repayment_with_fx($1,$2,$3,$4,$5)',[{id:id(52),account_id:id(15),target_id:id(16),amount:100,fee:10,date:today,notes:''},0.0001,today,'UZS','USD']);
  assert.equal(await value(16),900);assert.equal(await value(15),3900000);
  await remove(await feeRow('operation_id',id(52)));
  for(const table of ['account_activity','investment_account_links','investment_history'])assert.equal(await count(table,'id=$1',[id(52)]),0,table);
  await assert.rejects(db.query('SELECT record_repayment_with_fx($1,$2,$3,$4,$5)',[{id:id(52),account_id:id(15),target_id:id(16),amount:100,fee:10,date:today,notes:''},0.0001,today,'UZS','USD']),/was deleted/);
  assert.deepEqual(await snapshot(),start);
  assert.equal(await count('finance_records',"frequency='Once' AND (history_event_id IS NOT NULL OR mortgage_payment_id IS NOT NULL OR movement_id IS NOT NULL OR operation_id IS NOT NULL)"),0);
  assert.equal(await count('deleted_items','true'),1,'only the plain row deleted last is in Recently deleted');
 }finally{await db.close();}
});
