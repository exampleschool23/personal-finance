import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';
const {emptyRecordFilters,changeFilterStart,filterRecords,recordsRequestKey,activeFilterCount}=loadTS('lib/record-filters.ts');
const {monthlyReview}=loadTS('lib/transaction-tools.ts');
const {decimalTotalEquals}=loadTS('lib/decimal-amounts.ts');
const entry=(id,kind,amount,extra={})=>({id,name:id,kind,amount,currency:'USD',date:'2026-09-01',frequency:'Once',quantity:1,cost:0,notes:'',rate:0,...extra});
test('filters clear contradictory end dates and changing local search never changes request identity',()=>{
 const filters={...emptyRecordFilters,to:'2026-09-10'};
 assert.equal(changeFilterStart(filters,'2026-09-11').to,'');assert.equal(changeFilterStart(filters,'2026-09-10').to,filters.to);
 assert.equal(changeFilterStart(filters,'').to,filters.to);
 const a={cashflow:{...filters,category:'Living expense'},debts:emptyRecordFilters};
 assert.equal(activeFilterCount(a.debts),0);assert.equal(a.cashflow.category,'Living expense');
 const records=[entry('Shop','Other expense',3),entry('Rent','Rent expense',5)];
 assert.equal(filterRecords(records,{...filters,query:'shop'},'en-US')[0].id,'Shop');
 assert.notEqual(recordsRequestKey('owner','cashflow','USD',1),recordsRequestKey('owner','cashflow','USD',2));
 assert.equal(filterRecords(records,{...filters,category:'Loan'},'en-US').length,0);
});
test('decimal split equality preserves small, fractional and very large entered amounts',()=>{
 assert.equal(decimalTotalEquals([.1,.2],.3),true);assert.equal(decimalTotalEquals([1e-8,2e-8],3e-8),true);
 assert.equal(decimalTotalEquals([100000000000000,.25],100000000000000.25),true);
 assert.equal(decimalTotalEquals([.1,.2000000001],.3),false);assert.equal(decimalTotalEquals([NaN],1),false);
});
test('monthly review uses actuals and splits once, keeps currencies separate and requires observed net-worth coverage',()=>{
 const records=[entry('salary','Salary',1000),entry('shop','Other expense',100),entry('plan','Salary',1000,{frequency:'Monthly'}),entry('foreign','Other expense',999,{currency:'EUR'}),entry('future','Other expense',999,{date:'2026-09-25'}),entry('principal','Loan',100)];
 const splits=[{record_id:'shop',category_id:'food',amount:60},{record_id:'shop',category_id:'home',amount:40}];
 const snapshots=[{occurred_on:'2026-08-31',assets:100,debt:0,rates:{USD:1}},{occurred_on:'2026-09-10',assets:300,debt:50,rates:{USD:1}}];
 const result=monthlyReview(records,splits,snapshots,'2026-09','USD','2026-09-18');
 assert.equal(result.received,1000);assert.equal(result.spent,100);assert.equal(result.saved,900);assert.equal(result.netWorthChange,150);assert.equal(result.categories.reduce((sum,item)=>sum+item.amount,0),100);
 assert.equal(monthlyReview(records,splits,snapshots.slice(1),'2026-09','USD','2026-09-18').netWorthChange,null);
});

test('monthly spending counts only a mortgage payment\'s interest and category totals reconcile',()=>{
 const records=[entry('mortgage-payment','Other expense',110,{mortgage_payment_id:'payment',payment_principal:100,payment_interest:10})];
 const result=monthlyReview(records,[],[],'2026-09','USD','2026-09-18');
 assert.equal(result.spent,10);assert.equal(result.saved,-10);assert.equal(result.categories[0].amount,10);
});

test('monthly spending converts groceries, counts mortgage interest and fees, and treats repayments as transfers',()=>{
 const records=[entry('cash','Cash',1000),entry('car','Loan',5000),entry('home','Mortgage',9000),entry('groceries','Living expense',125000,{currency:'UZS'}),entry('mortgage','Other expense',110,{mortgage_payment_id:'mp',payment_principal:100,payment_interest:10}),entry('fee','Other expense',5,{operation_id:'lp'}),entry('income','Salary',1250000,{currency:'UZS'})];
 const payment=(id,action,target_id,amount,fee=0)=>({id,action,target_id,account_id:'cash',amount,fee,occurred_on:'2026-09-10'});
 const loan=payment('lp','repayment','car',50,5);
 const activity=[payment('mp','mortgage','home',100,10),loan,loan,payment('transfer','transfer','cash',999),{...loan,id:'unfeed',fee:0}];
 const result=monthlyReview(records,[],[],'2026-09','USD','2026-09-18',activity,{USD:1,UZS:12500});
 // $10 groceries + $10 mortgage interest + $5 repayment fee; the $50 loan principal and $100 mortgage principal are transfers.
 assert.equal(result.spent,25);assert.equal(result.received,100);assert.equal(result.saved,75);assert.equal(result.missing,0);
 assert.equal(result.categories.reduce((sum,row)=>sum+row.amount,0),25);
 assert.ok(!result.categories.some(row=>['Loan','Debt','Mortgage'].includes(row.id)));
});
test('missing rates are explicit and repayments received or transfers are not spending',()=>{
 const records=[entry('cash','Cash',100),entry('lent','Money lent',200),entry('foreign','Living expense',200,{currency:'EUR'})];
 const activity=[{id:'receipt',action:'repayment',target_id:'lent',account_id:'cash',amount:100,fee:5,occurred_on:'2026-09-10'}];
 for(const rates of [undefined,{EUR:0},{EUR:-1},{EUR:NaN}]){
  const result=monthlyReview(records,[],[],'2026-09','USD','2026-09-18',activity,rates);
  assert.equal(result.spent,0);assert.equal(result.missing,1);
 }
});
test('loan repayment principal from account activity is a transfer, not spending',()=>{
 const records=[entry('cash','Cash',100,{currency:'EUR'}),entry('loan','Loan',200)];
 const activity=[{id:'paid',action:'repayment',target_id:'loan',account_id:'cash',amount:10.125,fee:0,occurred_on:'2026-09-10'}];
 const result=monthlyReview(records,[],[],'2026-09','USD','2026-09-18',activity,{EUR:2});
 assert.equal(result.spent,0);assert.deepEqual(result.categories,[]);
});

test('Tracker car repayments are transfers; Tracker expenses count once from cash links',()=>{
 const records=[entry('cash','Cash',1000),entry('car','Loan',5000),entry('deposit','Deposit',100),entry('groceries','Living expense',25)];
 const link={id:'car-payment',account_id:'cash',account_currency:'USD',amount:-250.125,investment_history:{record_id:'car',event_type:'withdrawal',occurred_on:'2026-09-10'}};
 const cost={id:'repair',account_id:'cash',account_currency:'USD',amount:-40.5,investment_history:{record_id:'deposit',event_type:'expense',occurred_on:'2026-09-10'}};
 const review=(links,rows=records)=>monthlyReview(rows,[],[],'2026-09','USD','2026-09-18',[],undefined,links);
 assert.equal(review([link,link]).spent,25);
 assert.equal(review([link,cost,cost]).spent,65.5);
 assert.equal(review([cost],[...records,entry('copy','Other expense',40.5,{history_event_id:'repair'})]).spent,65.5,'a copied Tracker expense counts once');
 assert.equal(review([{...cost,investment_history:{...cost.investment_history,occurred_on:'2026-09-20'}}]).spent,25);
});
test('tracker expenses convert saved cash currency and exclude investments and money lent',()=>{
 const records=[entry('cash','Cash',1000),entry('car','Loan',5000),entry('deposit','Deposit',100),entry('lent','Money lent',100)];
 const link=(id,record_id,event_type,amount=-200)=>({id,account_id:'cash',account_currency:'UZS',amount,investment_history:{record_id,event_type,occurred_on:'2026-09-10'}});
 const links=[link('car','car','withdrawal',-125000),link('expense','deposit','expense',-12500),link('deposit','deposit','contribution'),link('lent','lent','contribution'),link('inflow','lent','withdrawal',200)];
 const result=monthlyReview(records,[],[],'2026-09','USD','2026-09-18',[],{UZS:12500},links);
 // Only the Tracker expense counts ($1); the car withdrawal is a principal repayment, a transfer.
 assert.equal(result.spent,1);assert.equal(result.missing,0);
 assert.equal(monthlyReview(records,[],[],'2026-09','USD','2026-09-18',[],undefined,links).missing,1);
});
