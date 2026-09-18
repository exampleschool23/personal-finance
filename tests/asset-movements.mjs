import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {z} from 'zod';
const compile=path=>ts.transpileModule(fs.readFileSync(path,'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,''),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const id=n=>`60000000-0000-4000-8000-${String(n).padStart(12,'0')}`;

test('movement API checks origin, authentication, dates and finite amounts',async()=>{
 let signedIn=true,calls=[];
 const post=new Function('z','session','sameOrigin','supa',compile('app/api/asset-movements/route.ts')+';return POST;')(z,async()=>signedIn?{token:'owner'}:null,req=>req.headers.get('origin')==='https://local',async(path,init,token)=>{calls.push({path,data:JSON.parse(init.body),token});return Response.json({ok:true});});
 const data={id:id(1),kind:'sell',source_id:id(2),target_id:id(3),sent:.01,received:600,source_value:600,target_value:600,fee:1,date:'2026-09-17',notes:''};
 const req=(body,origin='https://local')=>new Request('https://local',{method:'POST',headers:{origin},body:JSON.stringify(body)});
 assert.equal((await post(req(data,'https://evil'))).status,403);
 signedIn=false;assert.equal((await post(req(data))).status,401);signedIn=true;
 for(const invalid of [{sent:-1},{received:0},{date:'2026-02-30'},{target_id:id(2)},{kind:'bad'},{source_value:null}])assert.equal((await post(req({...data,...invalid}))).status,400);
 assert.equal(calls.length,0);assert.equal((await post(req(data))).status,200);
 assert.equal(calls[0].token,'owner');assert.deepEqual(calls[0].data,{p_data:data});
});

test('trades, stablecoin conversion, deposits and mortgage payments conserve recorded balances',{skip:!process.env.PGLITE_MODULE},async()=>{
 const {PGlite}=await import(process.env.PGLITE_MODULE);const db=new PGlite();
 const owner=id(1),other=id(2);
 try{
  await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${owner}'),('${other}');`);
  // Verify the migration against existing data, as well as fresh setup in other SQL tests.
  await db.exec(fs.readFileSync('database/setup.sql','utf8').split('-- Trades, deposit transfers and compounding settings.')[0]);
  const migration=fs.readFileSync('migrations/025_asset_movements.sql','utf8');
  const ddlStart=migration.indexOf('ALTER TABLE public.finance_records ADD COLUMN deposit_compounding');
  const originalTimeout=(await db.query('SHOW lock_timeout')).rows[0].lock_timeout;
  await db.exec(migration.slice(0,ddlStart));
  assert.equal((await db.query('SHOW lock_timeout')).rows[0].lock_timeout,'500ms');
  const locks=(await db.query("SELECT relation::regclass::text AS relation, mode FROM pg_locks WHERE pid=pg_backend_pid() AND granted")).rows;
  assert.ok(locks.some(lock=>lock.relation==='finance_records'&&lock.mode==='AccessExclusiveLock'));
  assert.ok(locks.some(lock=>lock.relation==='auth.users'&&lock.mode==='ShareRowExclusiveLock'));
  // A failure after schema mutation still rolls back the complete migration.
  await assert.rejects(db.exec(migration.slice(ddlStart,migration.indexOf('CREATE FUNCTION public.guard_opening_balance_date'))+'SELECT 1/0;'),/division by zero/);
  await db.exec('ROLLBACK');
  assert.equal((await db.query("SELECT count(*)::integer AS count FROM information_schema.columns WHERE table_schema='public' AND table_name='finance_records' AND column_name IN ('deposit_compounding','opened_on')")).rows[0].count,0);
  await db.exec(migration);
  assert.equal((await db.query('SHOW lock_timeout')).rows[0].lock_timeout,originalTimeout);
  await db.exec(`SET ROLE authenticated;SET request.jwt.claim.sub='${owner}';`);
  const today=(await db.query("SELECT (now() AT TIME ZONE 'Asia/Tashkent')::date::text AS day")).rows[0].day;
  const record=(n,name,kind,amount,quantity=1,currency='USD',cost=0)=>db.query('INSERT INTO finance_records(id,user_id,name,kind,amount,quantity,currency,cost,date) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[id(n),owner,name,kind,amount,quantity,currency,cost,today]);
  await record(10,'Bitcoin (BTC)','Crypto',50000,1,'USD',40000);
  await record(11,'Tether (USDT)','Crypto',1,0);
  await record(12,'Bank','Cash',0);
  await record(13,'Deposit','Deposit',0);
  await record(14,'AAPL','Stock',100,0);
  await record(15,'Mortgage','Mortgage',1000);
  await record(16,'UZS bank','Cash',0,1,'UZS');
  await db.query('INSERT INTO holding_accounts(id,user_id,name,kind,currency) VALUES($1,$2,$3,$4,$5)',[id(20),owner,'Broker','Stock','USD']);
  await db.query('UPDATE finance_records SET holding_account_id=$1 WHERE id=$2',[id(20),id(12)]);
  const balance=async n=>(await db.query('SELECT * FROM finance_records WHERE id=$1',[id(n)])).rows[0];
  const move=(n,kind,source,target,sent,received,extra={})=>({id:id(n),kind,source_id:id(source),target_id:id(target),sent,received,source_value:sent,target_value:received,fee:0,date:today,notes:'',...extra});
  const save=data=>db.query('SELECT record_asset_movement($1)',[data]);
  // Sell BTC into USDT, then convert USDT to fiat. Neither implies dollar parity.
  const sale=move(30,'sell',10,11,.1,5000,{source_value:4990,target_value:4990,fee:10});
  await save(sale);await save(sale);
  assert.equal(Number((await balance(10)).quantity),.9);assert.equal(Number((await balance(10)).amount),50000);
  assert.equal(Number((await balance(11)).quantity),5000);assert.equal(Number((await balance(11)).cost),.998);
  await assert.rejects(save({...sale,received:5001}),/different details/);
  const conversion=move(31,'sell',11,12,5000,4980,{source_value:4980,target_value:4980,fee:10});await save(conversion);
  assert.equal(Number((await balance(11)).quantity),0);assert.equal(Number((await balance(12)).amount),4980);
  // Buy shares, partially sell, then sell everything: quotes stay quotes, quantities change.
  await save(move(32,'buy',12,14,1000,10,{source_value:1000,target_value:1000,fee:5}));
  assert.equal(Number((await balance(14)).quantity),10);assert.equal(Number((await balance(14)).cost),100);
  await save(move(33,'sell',14,12,4,480,{source_value:480,target_value:480}));
  await save(move(34,'sell',14,12,6,720,{source_value:720,target_value:720}));
  assert.equal(Number((await balance(14)).quantity),0);assert.equal(Number((await balance(14)).amount),100);
  assert.equal(Number((await balance(12)).amount),5180);
  // A sale followed by a deposit top-up, withdrawal, and mortgage payment.
  await save(move(35,'transfer',12,13,1000,995,{fee:5}));
  assert.equal(Number((await balance(12)).amount),4180);assert.equal(Number((await balance(13)).amount),995);
  await save(move(36,'interest',13,13,0,5,{source_value:0,target_value:5}));
  assert.equal(Number((await balance(13)).amount),1000);
  await save(move(37,'transfer',13,12,200,200));
  assert.equal(Number((await balance(13)).amount),800);assert.equal(Number((await balance(12)).amount),4380);
  await db.query('SELECT planning_action($1,$2)',['mortgage',{id:id(38),account_id:id(12),target_id:id(15),amount:100,fee:20,received:0,date:today,notes:''}]);
  assert.equal(Number((await balance(12)).amount),4260);assert.equal(Number((await balance(15)).amount),900);
  await save(move(39,'transfer',12,16,10,125000));assert.equal(Number((await balance(16)).amount),125000);
  // A deliberately rejected history write must roll back both sides and the ledger.
  await db.exec(`RESET ROLE;CREATE FUNCTION reject_test_history() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.notes='reject for rollback test' THEN RAISE EXCEPTION 'History write rejected'; END IF; RETURN NEW; END$$;CREATE TRIGGER reject_test_history BEFORE INSERT ON investment_history FOR EACH ROW EXECUTE FUNCTION reject_test_history();SET ROLE authenticated;`);
  await assert.rejects(save(move(42,'transfer',12,13,10,10,{notes:'reject for rollback test'})),/History write rejected/);
  assert.equal((await db.query('SELECT * FROM asset_movements WHERE id=$1',[id(42)])).rows.length,0);
  assert.equal(Number((await balance(13)).amount),800);
  // Explicit opening dates support historical funding without inventing a prior balance.
  await db.query('INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,opened_on) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id(50),owner,'Old cash','Cash','USD',1000,today,'2020-01-01']);
  await db.query('INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,opened_on) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id(51),owner,'Old deposit','Deposit','USD',0,today,'2020-01-01']);
  await save(move(52,'transfer',50,51,500,500,{date:'2020-01-15'}));
  const dated=(await db.query('SELECT occurred_on::text AS day,balance FROM investment_history WHERE record_id=$1 ORDER BY occurred_on',[id(51)])).rows;
  assert.equal(dated[0].day,'2020-01-01');assert.equal(dated[1].day,'2020-01-15');assert.equal(Number(dated[1].balance),500);
  await assert.rejects(db.query('UPDATE finance_records SET opened_on=$1 WHERE id=$2',['2019-01-01',id(51)]),/cannot change/);
  const before=Number((await balance(12)).amount);
  await assert.rejects(save(move(40,'buy',12,14,99999,10,{target_value:99999})),/Insufficient/);
  await assert.rejects(save(move(40,'sell',14,12,1,100,{source_value:100})),/Insufficient/);
  await assert.rejects(save(move(40,'transfer',12,13,100,99)),/plus fee/);
  await assert.rejects(save(move(40,'transfer',12,13,100,100,{date:'2000-01-01'})),/latest balance/);
  assert.equal(Number((await balance(12)).amount),before);
  assert.equal((await db.query('SELECT * FROM asset_movements WHERE id=$1',[id(40)])).rows.length,0);
  const capitalized=(await db.query('SELECT * FROM finance_records WHERE movement_id=$1',[id(36)])).rows;
  assert.equal(capitalized.length,1);assert.equal(capitalized[0].kind,'Other income');assert.equal(Number(capitalized[0].amount),5);
  await assert.rejects(db.query('UPDATE finance_records SET amount=1 WHERE movement_id=$1',[id(36)]),/cannot be edited/);
  await assert.rejects(db.query('DELETE FROM asset_movements'),/permission denied/);
  const backup=(await db.query('SELECT export_finance_backup() AS data')).rows[0].data;
  assert.equal(backup.tables.asset_movements.length,10);
  await db.exec(`SET request.jwt.claim.sub='${other}';`);
  assert.equal((await db.query('SELECT * FROM asset_movements')).rows.length,0);
  await assert.rejects(save(move(41,'transfer',12,13,10,10)),/own source/);
  await assert.rejects(save(sale),/different details/);
 // Upgrade this historical fixture before exercising the new account-deletion fix.
 await db.exec('RESET ROLE');const setup=fs.readFileSync('database/setup.sql','utf8'),next=fs.readFileSync('migrations/026_investment_goals.sql','utf8');assert.ok(setup.includes(next));await db.exec(setup.slice(setup.indexOf(next)));
 await db.exec(`DELETE FROM auth.users WHERE id='${owner}';`);assert.equal((await db.query('SELECT * FROM finance_records WHERE user_id=$1',[owner])).rows.length,0);
 }finally{await db.close();}
});
