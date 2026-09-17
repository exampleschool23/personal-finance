import test from 'node:test';
import assert from 'node:assert/strict';
import {depositInterest,depositToday} from '../lib/deposit-interest.ts';
import {estimatedCashFlow} from '../lib/finance.ts';
import {marketEntry} from '../lib/market.ts';
const e=(date,balance,id='a',type='valuation')=>({id,record_id:'d',occurred_on:date,balance,created_at:date+'T12:00:00Z',event_type:type,amount:0,ownership_percentage:100});
test('annual interest, dated withdrawal, next month and cash-flow inclusion',()=>{
 const history=[e('2026-08-01',10000000),e('2026-09-16',8000000)];
 assert.equal(depositInterest(history,21,'2026-09'),157500);
 assert.equal(depositInterest(history,21,'2026-10'),140000);
 const deposit={id:'d',name:'Savings',kind:'Deposit',currency:'UZS',amount:8000000,cost:0,rate:21,estimated_monthly_income:157500};
 assert.equal(estimatedCashFlow([deposit]).plannedIncome,157500);
 assert.equal(marketEntry(deposit,'USD',{fx:{rate:10000},quotes:{}}).estimated_monthly_income,15.75);
});
test('first snapshot, top-ups, full withdrawal and same-day updates',()=>{
 assert.equal(depositInterest([e('2026-09-16',10000000)],21,'2026-09'),87500);
 assert.equal(depositInterest([e('2026-09-01',10000000),e('2026-09-16',0)],21,'2026-09'),87500);
 assert.equal(depositInterest([e('2026-09-01',10000000),e('2026-09-16',20000000)],21,'2026-09'),262500);
 assert.equal(depositInterest([e('2026-09-01',8000000,'b'),e('2026-09-01',10000000,'a')],21,'2026-09'),140000);
});
test('leap years, month boundaries, receipts, missing history and zero rates',()=>{
 assert.equal(depositInterest([e('2024-02-01',1200),e('2024-02-29',0)],12,'2024-02'),12*28/29);
 assert.equal(depositInterest([e('2026-09-01',1200),e('2026-10-01',0),e('2026-09-16',null,'c','income')],12,'2026-09'),12);
 assert.equal(depositInterest([],21,'2026-09'),0);
 assert.equal(depositInterest([e('2026-09-01',1200)],0,'2026-09'),0);
 assert.equal(depositInterest([e('2026-10-01',1200)],12,'2026-09'),0);
 assert.equal(depositToday(new Date('2026-09-30T20:00:00Z')),'2026-10-01');
});
