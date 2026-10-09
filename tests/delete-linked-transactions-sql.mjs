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
  assert.ok(Number((await db.query('SELECT finance_capabilities()->>\'schema_version\' AS v')).rows[0].v)>=126,'reports 126 or a later migration');
  const before=await functions(db);
  await db.exec(migration);
  assert.equal(await functions(db),before);
  const grants=(await db.query(`SELECT p.proname,has_function_privilege('authenticated',p.oid,'EXECUTE') AS run FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('delete_linked_transaction','delete_linked_rows','restore_linked_balance','reverse_cash_link','linked_state','linked_missing','restore_linked_transaction') ORDER BY 1`)).rows;
  // Only the delete is called directly; restoring goes through restore_deleted_item.
  assert.deepEqual(grants.filter(row=>row.run).map(row=>row.proname),['delete_linked_transaction']);
  assert.equal(grants.length,7);
 }finally{await db.close();}
});

test('linked transactions delete with their whole operation, restore exactly from Recently deleted and refuse what would break a balance',{skip},async()=>{
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
  const ids=[10,11,12,13,14,15,16,17].map(id);
  const rows=async(sql,params=[])=>(await db.query(sql,params)).rows;
  // Balances and quantities. A purchase into an empty holding replaced its quote and cost, which
  // nothing recorded, so a holding's cost is checked where a purchase moved it.
  const balances=async()=>Object.fromEntries((await rows('SELECT id,amount,quantity FROM finance_records WHERE id=ANY($1) ORDER BY id',[ids])).map(r=>[r.id,[Number(r.amount),Number(r.quantity)]]));
  // Everything an operation writes, exactly (record revisions move with every balance change).
  const state=async()=>({
   balances:Object.fromEntries((await rows('SELECT id,amount,quantity,cost FROM finance_records WHERE id=ANY($1) ORDER BY id',[ids])).map(r=>[r.id,[Number(r.amount),Number(r.quantity),Number(r.cost)]])),
   transactions:await rows("SELECT to_jsonb(r)-'revision' AS r FROM finance_records r WHERE NOT (id=ANY($1)) ORDER BY id",[ids]),
   history:await rows('SELECT to_jsonb(h) AS h FROM investment_history h ORDER BY id'),
   links:await rows('SELECT to_jsonb(l) AS l FROM investment_account_links l ORDER BY id'),
   payments:await rows('SELECT to_jsonb(m) AS m FROM mortgage_payments m ORDER BY id'),
   movements:await rows('SELECT to_jsonb(m) AS m FROM asset_movements m ORDER BY id'),
   activity:await rows('SELECT to_jsonb(a) AS a FROM account_activity a ORDER BY id'),
  });
  const value=async(n,field='amount')=>Number((await rows(`SELECT ${field} FROM finance_records WHERE id=$1`,[id(n)]))[0][field]);
  const count=async(table,where,params=[])=>Number((await rows(`SELECT count(*) AS n FROM ${table} WHERE ${where}`,params))[0].n);
  const remove=key=>db.query('SELECT delete_linked_transaction($1) AS r',[key]).then(r=>r.rows[0].r);
  const restore=entry=>db.query('SELECT restore_deleted_item($1)',[entry]);
  const forget=entry=>db.query('SELECT permanently_delete_item($1)',[entry]);
  const feeRow=async(column,key)=>(await rows(`SELECT id FROM finance_records WHERE ${column}=$1`,[key]))[0].id;
  const fx=(n,target,type,amount,account,rate,accountCurrency,recordCurrency,principal=0,interest=0)=>db.query('SELECT record_investment_with_fx($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)',[id(n),id(target),type,today,amount,null,'',id(account),rate,today,accountCurrency,recordCurrency,principal,interest]);
  const move=data=>db.query('SELECT record_asset_movement($1)',[{fee:0,date:today,notes:'',...data}]);
  const start=await balances();
  // Deletes the row's operation and checks the single Recently deleted entry, restores it and checks every
  // written row and balance is back exactly, then deletes it again. Returns the entry of the final delete.
  const cycle=async(key,expected=start)=>{
   const written=await state();
   const row=(await rows('SELECT name,kind,date::text,amount FROM finance_records WHERE id=$1',[key]))[0];
   const entries=await count('deleted_items','true');
   await remove(key);
   assert.deepEqual(await balances(),expected);
   assert.equal(await count('deleted_items','true'),entries+1,'one Recently deleted entry per operation');
   const [entry]=await rows("SELECT id,source,data FROM deleted_items WHERE data->>'id'=$1",[key]);
   assert.equal(entry.source,'finance_records');
   assert.deepEqual([entry.data.name,entry.data.kind,entry.data.date,Number(entry.data.amount)],[row.name,row.kind,row.date,Number(row.amount)]);
   await restore(entry.id);
   assert.deepEqual(await state(),written,'restore puts every row and balance back');
   assert.equal(await count('deleted_items','true'),entries);
   await remove(key);
   assert.deepEqual(await balances(),expected);
   return (await rows("SELECT id FROM deleted_items WHERE data->>'id'=$1",[key]))[0].id;
  };

  // A plain row deletes and restores as before.
  await db.query("INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,account_id) VALUES($1,$2,'Coffee','Other expense','USD',5,$3,$4)",[id(90),owner,today,id(10)]);
  await assert.rejects(remove(id(90)),/no linked operation\. Delete it normally/);
  await db.query('SELECT move_item_to_deleted($1,$2)',[id(90),'finance_records']);
  assert.equal(await value(10),1000);
  await restore((await rows("SELECT id FROM deleted_items WHERE data->>'id'=$1",[id(90)]))[0].id);
  assert.equal(await value(10),995);
  await db.query('SELECT move_item_to_deleted($1,$2)',[id(90),'finance_records']);
  await forget((await rows("SELECT id FROM deleted_items WHERE data->>'id'=$1",[id(90)]))[0].id);
  assert.deepEqual(await balances(),start);

  // Tracker income paid into a cash account in another currency, at its own dated rate.
  await fx(20,12,'income',1200000,10,12000,'USD','UZS');
  assert.equal(await value(10),1100);
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
  const blocked=await state();
  await assert.rejects(remove(id(20)),/cash reversal would create an invalid balance/);
  assert.deepEqual(await state(),blocked);
  await db.query('SELECT move_item_to_deleted($1,$2)',[id(91),'finance_records']);
  await as(member,owner);
  const tracker=await cycle(id(20));
  await as(owner);
  for(const [table,column] of [['finance_records','id'],['investment_history','id'],['investment_account_links','id']])assert.equal(await count(table,`${column}=$1`,[id(20)]),0,table);
  // While deleted the update cannot be replayed, and a retried delete is fine.
  await assert.rejects(fx(20,12,'income',1200000,10,12000,'USD','UZS'),/was deleted/);
  await assert.rejects(db.query('SELECT record_investment_event($1,$2,$3,$4,$5,$6,$7)',[id(20),id(12),'income',today,1200000,null,'']),/was deleted/);
  assert.deepEqual(await remove(id(20)),{ok:true});
  // Others cannot restore it; a viewer is refused; deleting it for good leaves the operation undone.
  await as(stranger);await restore(tracker);
  await as(viewer,owner);await assert.rejects(restore(tracker),/view-only/);
  await as(owner);
  assert.equal(await count('deleted_items','id=$1',[tracker]),1);
  await forget(tracker);
  assert.equal(await count('deleted_items','id=$1',[tracker]),0);
  assert.deepEqual(await balances(),start);
  await assert.rejects(fx(20,12,'income',1200000,10,12000,'USD','UZS'),/was deleted/);
  // A tracker expense without a cash account.
  await db.query('SELECT record_investment_event($1,$2,$3,$4,$5,$6,$7)',[id(21),id(12),'expense',today,50000,null,'Feed']);
  await forget(await cycle(id(21)));

  // Mortgage payments: from Accounts (principal plus interest from cash) and with a dated cash link.
  await db.query("SELECT planning_action('mortgage',$1)",[{id:id(30),account_id:id(10),target_id:id(13),amount:600,received:0,fee:200,date:today,notes:'June'}]);
  assert.equal(await value(10),200);assert.equal(await value(13),99400);
  const payment=await cycle(id(30));
  for(const table of ['finance_records','mortgage_payments','account_activity','investment_history'])assert.equal(await count(table,'id=$1',[id(30)]),0,table);
  await assert.rejects(db.query("SELECT planning_action('mortgage',$1)",[{id:id(30),account_id:id(10),target_id:id(13),amount:600,received:0,fee:200,date:today,notes:'June'}]),/was deleted/);
  // Restoring is refused when the cash was spent meanwhile, and nothing changes.
  await db.query("INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,account_id) VALUES($1,$2,'Laptop','Other expense','USD',900,$3,$4)",[id(92),owner,today,id(10)]);
  const spent=await state();
  await assert.rejects(restore(payment),/Insufficient balance or holding quantity/);
  assert.deepEqual(await state(),spent);
  assert.equal(await count('deleted_items','id=$1',[payment]),1);
  await db.query('SELECT move_item_to_deleted($1,$2)',[id(92),'finance_records']);
  // Restored, the instalment is paid again.
  await restore(payment);
  assert.equal(await count('mortgage_payments','id=$1',[id(30)]),1);
  assert.equal(await value(10),200);assert.equal(await value(13),99400);
  await forget(await cycle(id(30)));
  await fx(31,13,'mortgage_payment',800,10,1,'USD','USD',600,200);
  assert.equal(await value(10),200);assert.equal(await value(13),99400);
  await forget(await cycle(id(31)));
  for(const table of ['finance_records','mortgage_payments','investment_account_links','investment_history'])assert.equal(await count(table,'id=$1',[id(31)]),0,table);
  await db.query('SELECT record_mortgage_payment($1,$2,$3,$4,$5,$6)',[id(32),id(13),500,0,today,'']);
  await forget(await cycle(id(32)));

  // A transfer with a fee goes with both legs, its fee and its history entries.
  await move({id:id(40),kind:'transfer',source_id:id(10),target_id:id(11),sent:100,received:95,source_value:100,target_value:95,fee:5,notes:'Move'});
  assert.equal(await value(11),595);
  await forget(await cycle(await feeRow('movement_id',id(40))));
  assert.equal(await count('asset_movements','id=$1',[id(40)]),0);
  assert.equal(await count('investment_history',"notes='Move'"),0);

  // Bought units sold since cannot be given back; the sale goes first.
  await move({id:id(41),kind:'buy',source_id:id(10),target_id:id(14),sent:1000,received:10,source_value:1000,target_value:1000,fee:5});
  await move({id:id(42),kind:'sell',source_id:id(14),target_id:id(10),sent:6,received:720,source_value:720,target_value:720,fee:2});
  const sold=await state();
  const buyFee=await feeRow('movement_id',id(41));
  await assert.rejects(remove(buyFee),/Insufficient balance or holding quantity/);
  assert.deepEqual(await state(),sold);
  const sale=await cycle(await feeRow('movement_id',id(42)),{...start,[id(10)]:[0,1],[id(14)]:[100,10]});
  const bought=await cycle(buyFee);
  // The sale cannot come back before its purchase.
  await assert.rejects(restore(sale),/Insufficient balance or holding quantity/);
  await forget(sale);await forget(bought);
  // Purchases on top of each other come off newest first, each giving back the earlier average cost.
  await move({id:id(43),kind:'buy',source_id:id(10),target_id:id(14),sent:400,received:4,source_value:400,target_value:400,fee:1});
  await move({id:id(44),kind:'buy',source_id:id(10),target_id:id(14),sent:400,received:2,source_value:400,target_value:400,fee:1});
  assert.equal(await value(14,'cost'),800/6);
  await assert.rejects(remove(await feeRow('movement_id',id(43))),/Delete later trades of this holding first/);
  const second=await cycle(await feeRow('movement_id',id(44)),{...start,[id(10)]:[600,1],[id(14)]:[100,4]});
  assert.equal(Math.round(await value(14,'cost')*1e8)/1e8,100);
  await forget(second);
  await forget(await cycle(await feeRow('movement_id',id(43))));
  // Capitalized interest.
  await move({id:id(45),kind:'interest',source_id:id(17),target_id:id(17),sent:0,received:5,source_value:0,target_value:5});
  await forget(await cycle(await feeRow('movement_id',id(45))));
  assert.equal(await count('asset_movements','true'),0);

  // Account operation fees: a transfer, a repayment, and a repayment in another currency.
  await db.query("SELECT planning_action('transfer',$1)",[{id:id(50),account_id:id(10),target_id:id(11),amount:100,received:100,fee:3,date:today}]);
  assert.equal(await value(10),897);
  await forget(await cycle(await feeRow('operation_id',id(50))));
  assert.equal(await count('account_activity','id=$1',[id(50)]),0);
  await db.query("SELECT planning_action('repayment',$1)",[{id:id(51),account_id:id(10),target_id:id(16),amount:100,fee:10,date:today}]);
  assert.equal(await value(16),900);assert.equal(await value(10),890);
  await forget(await cycle(await feeRow('operation_id',id(51))));
  await db.query('SELECT record_repayment_with_fx($1,$2,$3,$4,$5)',[{id:id(52),account_id:id(15),target_id:id(16),amount:100,fee:10,date:today,notes:''},0.0001,today,'UZS','USD']);
  assert.equal(await value(16),900);assert.equal(await value(15),3900000);
  await forget(await cycle(await feeRow('operation_id',id(52))));
  for(const table of ['account_activity','investment_account_links','investment_history'])assert.equal(await count(table,'id=$1',[id(52)]),0,table);
  await assert.rejects(db.query('SELECT record_repayment_with_fx($1,$2,$3,$4,$5)',[{id:id(52),account_id:id(15),target_id:id(16),amount:100,fee:10,date:today,notes:''},0.0001,today,'UZS','USD']),/was deleted/);
  assert.deepEqual(await balances(),start);
  assert.equal(await count('finance_records',"frequency='Once' AND (history_event_id IS NOT NULL OR mortgage_payment_id IS NOT NULL OR movement_id IS NOT NULL OR operation_id IS NOT NULL)"),0);
  assert.equal(await count('deleted_items','linked_operation IS NOT NULL'),0,'deleting for good drops every snapshot');
 }finally{await db.close();}
});
