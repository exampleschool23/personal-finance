import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {loadTS} from './helpers/load-ts.mjs';
test('investment choice is set on creation and cannot change during later balance updates',async()=>{
 const db=new PGlite();
 try{
  await db.exec('CREATE TABLE finance_records(id int primary key, amount numeric, is_investment boolean NOT NULL DEFAULT false);');
  await db.exec(fs.readFileSync('migrations/056_lock_cash_investment_choice.sql','utf8'));
  await db.exec('INSERT INTO finance_records VALUES (1,123.456,true),(2,40,false); UPDATE finance_records SET amount=200.125 WHERE id=1;');
  for(const id of [1,2])await assert.rejects(db.exec(`UPDATE finance_records SET is_investment=NOT is_investment WHERE id=${id}`),/fixed when/);
  assert.deepEqual((await db.query('SELECT is_investment FROM finance_records ORDER BY id')).rows,[{is_investment:true},{is_investment:false}]);
 }finally{await db.close();}
});
test('creation checkbox emits a choice; existing account has a disabled checkbox',()=>{
 const {CashInvestmentOption}=loadTS('components/cash-investment-option.tsx',{'@/components/language-provider':{useLanguage:()=>({t:s=>s})}});
 let value;const props={record:{is_investment:false},onChange:v=>{value=v;}};
 const input=CashInvestmentOption(props).props.children[0].props.children[0];
 assert.equal(input.props.disabled,false);input.props.onChange({target:{checked:true}});assert.equal(value,true);
 assert.equal(CashInvestmentOption({record:{is_investment:true}}).props.children[0].props.children[0].props.disabled,true);
});
