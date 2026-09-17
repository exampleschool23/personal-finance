// Run with PGLITE_MODULE pointing to an installed @electric-sql/pglite module.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('mortgage payments are atomic, owner-scoped, immutable, and idempotent', { skip: !process.env.PGLITE_MODULE }, async () => {
 const { PGlite } = await import(process.env.PGLITE_MODULE);
 const db = new PGlite();
 const owner='10000000-0000-4000-8000-000000000001', other='10000000-0000-4000-8000-000000000002';
 const mortgage='20000000-0000-4000-8000-000000000001';
 const payment='30000000-0000-4000-8000-000000000001';
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
 CREATE TABLE auth.users(id uuid PRIMARY KEY);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 GRANT USAGE ON SCHEMA auth TO authenticated;
 INSERT INTO auth.users VALUES ('${owner}'),('${other}');`);
 await db.exec(fs.readFileSync('database/setup.sql','utf8'));
 // Migration 010 must also finish when its column was already created.
 await db.exec(fs.readFileSync('migrations/010_estimated_mortgage_payments.sql','utf8'));
 await db.exec(fs.readFileSync('migrations/010_estimated_mortgage_payments.sql','utf8'));
 await db.exec(`INSERT INTO public.finance_records(id,user_id,name,kind,currency,amount,date) VALUES('${mortgage}','${owner}','Mortgage','Mortgage','USD',92463.94,'2034-05-05');
 SET ROLE authenticated; SET request.jwt.claim.sub='${owner}';`);
 const pay=(id=payment,principal=506.79,interest=1062.31)=>db.query('SELECT public.record_mortgage_payment($1,$2,$3,$4,$5,$6)',[id,mortgage,principal,interest,'2025-11-05','']);
 const balance=async()=>Number((await db.query('SELECT amount FROM finance_records WHERE id=$1',[mortgage])).rows[0].amount);
 await db.query('UPDATE finance_records SET estimated_monthly_payment=1570 WHERE id=$1',[mortgage]);
 const estimates=async()=> (await db.query("SELECT finance_records_page(1,'all',null,true) AS result")).rows[0].result.summary.filter(row=>row.kind==='Mortgage');
 assert.equal(Number((await estimates())[0].estimated_monthly_payment),1570);
 await pay();assert.equal(await balance(),91957.15);
 await pay();assert.equal(await balance(),91957.15);
 const records=(await db.query('SELECT * FROM finance_records WHERE mortgage_payment_id=$1',[payment])).rows;
 assert.equal(records.length,1);assert.equal(Number(records[0].amount),1569.10);
 assert.equal(Number(records[0].payment_principal),506.79);assert.equal(Number(records[0].payment_interest),1062.31);
 assert.equal(records[0].frequency,'Once');
 await assert.rejects(pay(payment,500),/different details/);
 await assert.rejects(pay('30000000-0000-4000-8000-000000000002',100000),/exceeds/);
 assert.equal(await balance(),91957.15);
 await assert.rejects(db.query('DELETE FROM finance_records WHERE id=$1',[payment]),/cannot be edited or deleted/);
 await assert.rejects(db.query('UPDATE finance_records SET amount=1 WHERE id=$1',[payment]),/cannot be edited or deleted/);
 await assert.rejects(db.query('UPDATE finance_records SET currency=\'UZS\' WHERE id=$1',[mortgage]),/keep its category and currency/);
 await assert.rejects(db.query('DELETE FROM mortgage_payments'),/permission denied/);
 // Force the outflow insertion to fail after the ledger insert/balance update.
 await assert.rejects(pay(mortgage,10,0),/duplicate key/);
 assert.equal(await balance(),91957.15);
 assert.equal((await db.query('SELECT count(*) FROM mortgage_payments')).rows[0].count,1);
 await db.exec(`SET request.jwt.claim.sub='${other}';`);
 await assert.rejects(pay(),/not found/);
 assert.equal((await db.query('SELECT * FROM mortgage_payments')).rows.length,0);
 await db.exec(`SET request.jwt.claim.sub='${owner}';`);
 // Interest-only and extra-principal payments.
 await pay('30000000-0000-4000-8000-000000000003',0,100);assert.equal(await balance(),91957.15);
 await pay('30000000-0000-4000-8000-000000000004',91957.15,0);assert.equal(await balance(),0);
 assert.equal(Number((await estimates())[0].estimated_monthly_payment),0);
 await db.close();
});
