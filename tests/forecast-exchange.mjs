import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {loadTS} from './helpers/load-ts.mjs';
const {accountForecast}=loadTS('lib/transaction-tools.ts');
const id=n=>`55000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
test('forecast applies explicit directional rates without rounding stored amounts',()=>{
 const records=[{id:'a',kind:'Cash',currency:'USD',amount:100,frequency:'Once'},{id:'s',kind:'Salary',currency:'UZS',amount:1200000,date:'2026-09-01',frequency:'Monthly'}];
 const assignment={record_id:'s',account_id:'a',exchange_rate:1/12000,from_currency:'UZS',to_currency:'USD'};
 const run=a=>accountForecast(records,[],[a],'2026-09-01','2026-09-30');
 assert.equal(run(assignment).accounts[0].ending,200);
 for(const rate of [0,-1,NaN,undefined])assert.equal(run({...assignment,exchange_rate:rate}).unassigned.length,1);
 assert.equal(run({...assignment,to_currency:'EUR'}).unassigned.length,1);
 assert.equal(records[0].amount,100);
});
test('database supports cross-currency assignments and rejects missing rates and foreign accounts',async()=>{
 const db=new PGlite();try{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;INSERT INTO auth.users VALUES('${id(1)}'),('${id(2)}');`);
 const setup=fs.readFileSync('database/setup.sql','utf8');
 const migration=fs.readFileSync('migrations/045_forecast_account_exchange_rates.sql','utf8');
 assert.ok(setup.includes(migration));
 await db.exec(setup.slice(0,setup.indexOf(migration)));
 await db.exec(`SET request.jwt.claim.sub='${id(1)}';INSERT INTO finance_records(id,user_id,name,kind,currency,amount,date,frequency) VALUES('${id(10)}','${id(1)}','Salary','Salary','UZS',1200000,'2020-01-01','Monthly'),('${id(11)}','${id(1)}','Cash','Cash','USD',100,'2020-01-01','Once');SET ROLE authenticated;`);
 await db.exec('RESET ROLE');
 await db.exec(migration);
 await db.exec('SET ROLE authenticated');
 const save=rate=>db.query('SELECT save_forecast_assignment($1,$2,$3,$4,$5)',[id(10),id(11),rate,'UZS','USD']);
 await assert.rejects(save(null),/positive exchange/);await assert.rejects(save(-1),/positive exchange/);
 await save(0.00008451);
 const saved=(await db.query('SELECT * FROM forecast_assignments')).rows;
 assert.equal(saved.length,1);assert.equal(Number(saved[0].exchange_rate),0.00008451);
 assert.equal(saved[0].from_currency,'UZS');assert.equal(saved[0].to_currency,'USD');
 await assert.rejects(db.query('SELECT save_forecast_assignment($1,$2,$3,$4,$5)',[id(10),id(11),1,'USD','UZS']),/positive exchange/);
 assert.equal(Number((await db.query('SELECT * FROM forecast_assignments')).rows[0].exchange_rate),0.00008451);
 await db.exec(`SET request.jwt.claim.sub='${id(2)}'`);assert.equal((await db.query('SELECT * FROM forecast_assignments')).rows.length,0);await assert.rejects(save(1),/recurring schedule/);
 }finally{await db.close();}
});
