import test from 'node:test';
import assert from 'node:assert/strict';
import {depositInterest,depositProjection,depositToday} from '../lib/deposit-interest.ts';
import {estimatedCashFlow} from '../lib/finance.ts';
import {marketEntry} from '../lib/market.ts';
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<Math.max(1,Math.abs(expected))*1e-12, `${actual} != ${expected}`);
const e=(date,balance,id='a',type='valuation')=>({id,record_id:'d',occurred_on:date,balance,created_at:date+'T12:00:00Z',event_type:type,amount:0,ownership_percentage:100});
test('annual interest, dated withdrawal, next month and cash-flow inclusion',()=>{
 const history=[e('2026-08-01',10000000),e('2026-09-16',8000000)];
 close(depositInterest(history,21,'2026-09','none'),157500);
 close(depositInterest(history,21,'2026-10','none'),140000);
 const deposit={id:'d',name:'Savings',kind:'Deposit',currency:'UZS',amount:8000000,cost:0,rate:21,estimated_monthly_income:157500};
 assert.equal(estimatedCashFlow([deposit]).plannedIncome,157500);
 assert.equal(marketEntry(deposit,'USD',{fx:{rate:10000},quotes:{}}).estimated_monthly_income,15.75);
});
test('first snapshot, top-ups, full withdrawal and same-day updates',()=>{
 close(depositInterest([e('2026-09-16',10000000)],21,'2026-09'),87500);
 close(depositInterest([e('2026-09-01',10000000),e('2026-09-16',0)],21,'2026-09'),87500);
 close(depositInterest([e('2026-09-01',10000000),e('2026-09-16',20000000)],21,'2026-09'),262500);
 close(depositInterest([e('2026-09-01',8000000,'b'),e('2026-09-01',10000000,'a')],21,'2026-09'),140000);
});
test('leap years, month boundaries, receipts, missing history and zero rates',()=>{
 close(depositInterest([e('2024-02-01',1200),e('2024-02-29',0)],12,'2024-02'),12*28/29);
 close(depositInterest([e('2026-09-01',1200),e('2026-10-01',0),e('2026-09-16',null,'c','income')],12,'2026-09'),12);
 close(depositInterest([],21,'2026-09'),0);
 close(depositInterest([e('2026-09-01',1200)],0,'2026-09'),0);
 close(depositInterest([e('2026-10-01',1200)],12,'2026-09'),0);
 assert.equal(depositToday(new Date('2026-09-30T20:00:00Z')),'2026-10-01');
});

test('monthly compounding retains earned interest across dated cash movements',()=>{
 const history=[e('2026-01-01',1200,'a','baseline'),{...e('2026-02-15',1800,'b','contribution'),amount:600}];
 // January credits 12. February earns 1212 for 14 days and 1812 for 14 days.
 close(depositInterest(history,12,'2026-02'),15.12);
 close(depositProjection(history,12,'2026-02-28').total,1827.12);
 const withdrawn=[...history,{...e('2026-03-01',1500,'c','withdrawal'),amount:300}];
 close(depositInterest(withdrawn,12,'2026-03'),15.2712);
 close(depositProjection(withdrawn,12,'2026-03-31').total,1542.3912);
});
test('daily compounding uses actual year length and full withdrawals stop further earnings',()=>{
 const history=[e('2024-02-01',1000)];
 close(depositProjection(history,12,'2024-02-29','daily').total,1000*(1+.12/366)**29);
 const dailyEnd=depositProjection(history,12,'2024-02-28','daily').total;
 close(depositProjection([...history,{...e('2024-02-29',0,'b','withdrawal'),amount:dailyEnd}],12,'2024-03-31','daily').total,0);
});
test('confirmed capitalized interest resets projected accrual without double counting',()=>{
 const history=[e('2026-01-01',1200,'a','baseline'),{...e('2026-02-01',1212,'b','income'),amount:12}];
 close(depositInterest(history,12,'2026-02'),12.12);
 close(depositProjection(history,12,'2026-02-28').total,1224.12);
 close(depositProjection(history,12,'2026-02-28','none').total,1212);
 assert.deepEqual(depositProjection([],12),{balance:0,accrued:0,total:0,monthInterest:0});
 assert.equal(depositInterest(history,12,'2026-13'),0);
});

test('withdrawing the entire confirmed deposit stops projected compounding',()=>{
 const history=[e('2026-01-01',1200,'a','baseline'),{...e('2026-03-01',0,'b','withdrawal'),amount:1200}];
 close(depositProjection(history,12,'2026-03-31').total,0);
 close(depositInterest(history,12,'2026-03'),0);
});
