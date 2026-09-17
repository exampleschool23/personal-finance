import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {estimatedCashFlow} from '../lib/finance.ts';
test('stopping preserves prior forecasts and excludes later months for monthly and yearly records',()=>{
 const entries=[{kind:'Salary',amount:1200,frequency:'Monthly',date:'2026-01-15',end_date:'2026-06-02'},{kind:'Living expense',amount:1200,frequency:'Yearly',date:'2026-02-01',end_date:'2026-06-30'}];
 assert.equal(estimatedCashFlow(entries,0,'2025-12').forecast,0);
 assert.equal(estimatedCashFlow(entries,0,'2026-01').forecast,1200);
 assert.equal(estimatedCashFlow(entries,0,'2026-05').forecast,1100);
 assert.equal(estimatedCashFlow(entries,0,'2026-06').forecast,1100);
 assert.equal(estimatedCashFlow(entries,0,'2026-07').forecast,0);
 assert.equal(entries.length,2);
 assert.equal(estimatedCashFlow([{...entries[0],end_date:null}],0,'2026-07').forecast,1200);
});
test('summary preserves recurrence intervals rather than merging stopped and active records',()=>{
 const sql=readFileSync(new URL('../migrations/014_recurring_stop_dates.sql',import.meta.url),'utf8');
 assert.match(sql,/r.end_date,CASE WHEN r.frequency<>'Once' THEN r.date ELSE NULL END/);
 assert.match(sql,/end_date>=date/);
 assert.match(sql,/SECURITY INVOKER/);
 assert.ok(readFileSync(new URL('../database/setup.sql',import.meta.url),'utf8').includes(sql));
});
