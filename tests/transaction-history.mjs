import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {income,expenses} from '../lib/finance.ts';
const source=fs.readFileSync('lib/transaction-history.ts','utf8').replace(/^import .*;\n/gm,'').replace('export function','function');
const isHistory=new Function('income','expenses',ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText+';return isTransactionHistory;')(income,expenses);
test('history includes recorded payments and expenses, not their recurring schedules or balances',()=>{
 const records=[{id:'salary-plan',kind:'Salary',frequency:'Monthly'},{id:'salary-payment',kind:'Salary',frequency:'Once'},{id:'yearly-plan',kind:'Rent expense',frequency:'Yearly'},{id:'rent-payment',kind:'Rent expense',frequency:'Once'},{id:'cash',kind:'Cash',frequency:'Once'}];
 assert.deepEqual(records.filter(isHistory).map(r=>r.id),['salary-payment','rent-payment']);
 for(const kind of [...income,...expenses])assert.equal(isHistory({kind,frequency:'Once'}),true);
});
