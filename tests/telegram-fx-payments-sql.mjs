import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const id=n=>`9500000${n}-0000-4000-8000-00000000000${n}`;
const owner=id(1),other=id(2);
async function database(){
 const db=new PGlite();
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;GRANT USAGE ON SCHEMA auth TO authenticated;GRANT USAGE ON SCHEMA auth TO service_role;INSERT INTO auth.users VALUES('${owner}'),('${other}');`);
 await db.exec(fs.readFileSync('database/setup.sql','utf8'));
 await db.exec('GRANT USAGE ON SCHEMA public TO service_role');
 return db;
}
const asOwner=`RESET ROLE;SET request.jwt.claim.sub='${owner}';SET ROLE authenticated;`;
const asServer='RESET ROLE;RESET request.jwt.claim.sub;SET ROLE service_role;';
const wallet={id:id(3),name:'Wallet',kind:'Cash',currency:'UZS',amount:10000000,quantity:0,cost:0,rate:0,date:'2026-01-01',frequency:'Once',notes:''};
const loan={id:id(4),name:'Car loan',kind:'Loan',currency:'USD',amount:2000,quantity:0,cost:0,rate:0,date:'2027-12-31',opened_on:'2026-01-01',frequency:'Once',notes:''};

test('the migration and the fresh-database script agree, and the wrapper is server-only',()=>{
 const migration=fs.readFileSync('migrations/095_telegram_fx_payments.sql','utf8'),setup=fs.readFileSync('database/setup.sql','utf8');
 assert.ok(setup.includes(migration));
 for(const piece of ['CREATE OR REPLACE FUNCTION public.telegram_payment_with_fx','FROM PUBLIC,anon,authenticated'])assert.ok(migration.includes(piece),piece);
 for(const gone of ['timezone','digest_sent_on','recap_sent_on'])assert.ok(!migration.includes(gone),'the digest keeps its fixed daily time: '+gone);
});

test('the bot saves an expense in another currency with its dated rate, and pays a USD loan from a UZS account',async()=>{
 const db=await database();try{
  // Cash balances start on the database's today, so transactions are dated then and the rate the day before.
  const {day,before,after}=(await db.query("SELECT current_date::text AS day,(current_date-1)::text AS before,(current_date+1)::text AS after")).rows[0];
  await db.exec(asOwner);
  await db.query('SELECT save_finance_record($1,NULL)',[wallet]);
  await db.query('SELECT save_finance_record($1,NULL)',[loan]);
  await db.exec(`INSERT INTO telegram_subscriptions(user_id,chat_id,linked_at) VALUES('${owner}',500,now());`);
  await assert.rejects(db.query('SELECT telegram_payment_with_fx($1,$2,$3,$4,$5,$6,$7)',[owner,'repayment',{},0.00008,day,'UZS','USD']),/permission denied/);
  await db.exec(asServer);
  // 12 USD at 1 UZS = 0.00008 USD takes 150,000 UZS.
  const lunch={id:id(5),name:'Lunch',kind:'Living expense',currency:'USD',amount:12,quantity:0,cost:0,rate:0,date:day,frequency:'Once',notes:'',account_id:id(3),account_exchange_rate:0.00008,account_rate_date:before,account_currency:'UZS'};
  await db.query('SELECT telegram_save_finance_record($1,$2)',[owner,lunch]);
  // A rate dated after the record is refused, as in the app.
  await assert.rejects(db.query('SELECT telegram_save_finance_record($1,$2)',[owner,{...lunch,id:id(6),account_rate_date:after}]),/dated exchange rate/);
  const payment={id:id(7),account_id:id(3),target_id:id(4),amount:40,received:0,fee:0,date:day,notes:''};
  await db.query('SELECT telegram_payment_with_fx($1,$2,$3,$4,$5,$6,$7)',[owner,'repayment',payment,0.00008,day,'UZS','USD']);
  // A redelivered update is the same payment, saved once.
  await db.query('SELECT telegram_payment_with_fx($1,$2,$3,$4,$5,$6,$7)',[owner,'repayment',payment,0.00008,day,'UZS','USD']);
  await assert.rejects(db.query('SELECT telegram_payment_with_fx($1,$2,$3,$4,$5,$6,$7)',[other,'repayment',{...payment,id:id(8)},0.00008,day,'UZS','USD']),/Telegram is not connected/);
  await assert.rejects(db.query('SELECT telegram_payment_with_fx($1,$2,$3,$4,$5,$6,$7)',[owner,'transfer',{...payment,id:id(8)},0.00008,day,'UZS','USD']),/Check the account fields/);
  await assert.rejects(db.query('SELECT telegram_payment_with_fx($1,$2,$3,$4,$5,$6,$7)',[owner,'mortgage',{...payment,id:id(8)},0.00008,day,'UZS','USD']),/Check the account fields/,'a loan is not a mortgage');
  await db.exec(asOwner);
  const rows=Object.fromEntries((await db.query('SELECT id,amount FROM finance_records WHERE id IN ($1,$2)',[id(3),id(4)])).rows.map(row=>[row.id,Number(row.amount)]));
  assert.equal(rows[id(3)],10000000-150000-500000);
  assert.equal(rows[id(4)],1960);
 }finally{await db.close();}
});
