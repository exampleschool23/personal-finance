import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {z} from 'zod';
import React from 'react';
import {loadTS} from './helpers/load-ts.mjs';
import {apiFunction} from './helpers/api-function.mjs';
import {sourceWithParts} from './helpers/source.mjs';
import {stylesheet} from './helpers/stylesheet.mjs';

const {decimalSum,decimalTotalEquals}=loadTS('lib/decimal-amounts.ts');
const {requiresCashAccount,cashFlowAmountMissing}=loadTS('lib/cash-account-required.ts');
const {normalizeEntry}=loadTS('lib/finance.ts');

test('entered amounts add and subtract without binary floating point tails',()=>{
 assert.equal(decimalSum([500.35,-2.2]),498.15);assert.equal(decimalSum([99.99,-.01]),99.98);
 assert.equal(decimalSum([100.01,3.01]),103.02);assert.equal(decimalSum([.1,.2]),.3);
 assert.equal(decimalSum([1e-8,2e-8]),3e-8);assert.equal(decimalSum([100000000000000,.25]),100000000000000.25);
 assert.equal(decimalSum([2.2,-500.35]),-498.15);assert.equal(decimalSum([5,-5]),0);assert.equal(decimalSum([]),0);
 assert.ok(Number.isNaN(decimalSum([1,NaN])));
 // Every cent pair reconciles with the exact comparison PostgreSQL applies.
 for(let sent=1;sent<400;sent+=7)for(let fee=1;fee<sent;fee+=13){
  const a=sent/100+500,b=fee/100;assert.ok(decimalTotalEquals([decimalSum([a,-b]),b],a),a+' - '+b);
 }
});

const compile=path=>ts.transpileModule(fs.readFileSync(path,'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,''),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
function recordsApi(calls){
 const kinds=['Cash','Living expense','Other income','Mortgage'];
 return apiFunction('cashFlowAmountMissing','requiresCashAccount','loadDatedExchangeRate','depositForecasts','isCurrency','z','kinds','income','expenses','assetRecordKinds','session','supa','sameOrigin',compile('app/api/records/route.ts')+';return POST;')
  .bind(null,cashFlowAmountMissing,requiresCashAccount)(async()=>({rate:1,effective_date:'2026-09-01'}),()=>[],value=>['USD','UZS'].includes(value),z,kinds,['Other income'],['Living expense'],['Cash'],async()=>({user:{id:'owner'},token:'owner'}),
  async(path,init)=>{if(path.includes('select='))return Response.json([{id:'00000000-0000-4000-8000-000000000010',kind:'Cash',currency:'USD'}]);calls.push(JSON.parse(init.body).p_record);return Response.json([]);},()=>true);
}
const expense={id:'00000000-0000-4000-8000-000000000050',name:'Groceries',kind:'Living expense',currency:'USD',amount:250.4,quantity:1,cost:0,rate:0,date:'2026-09-29',frequency:'Once',notes:'',account_id:'00000000-0000-4000-8000-000000000010'};
const post=(api,patch)=>api(new Request('https://local',{method:'POST',body:JSON.stringify({...expense,...patch})}));

test('a saved transaction can be edited: raw history rows with empty optional fields are accepted',async()=>{
 const calls=[],api=recordsApi(calls);
 // Transaction history returns database rows, where unused fields are null rather than absent.
 const raw={...expense,amount:260,lent_date:null,end_date:null,recurrence_days:null,opened_on:null,account_exchange_rate:null,custom_category_id:null,business_id:null,expense_plan_id:null,holding_account_id:null,earning_source_id:null,income_source_id:null,income_due_on:null,earning_due_on:null};
 const response=await post(api,raw);
 assert.equal(response.status,200,JSON.stringify(await response.clone().json()));
 assert.equal(calls[0].amount,260);assert.equal(calls[0].lent_date,null);assert.equal(calls[0].account_exchange_rate,null);
 // The edit form receives the same row normalized to the record shape.
 const normalized=normalizeEntry({...raw,date:null,amount:'260.00',quantity:'1',cost:'0',rate:'0'});
 assert.deepEqual([normalized.lent_date,normalized.date,normalized.amount],['','',260]);
});

test('income and expenses cannot be saved with a blank or zero amount',async()=>{
 const calls=[],api=recordsApi(calls);
 for(const patch of [{amount:0},{amount:0,kind:'Other income'},{amount:0,frequency:'Monthly',account_id:null}]){
  const response=await post(api,patch);
  assert.equal(response.status,400);assert.equal((await response.json()).error,'Enter an amount greater than zero.');
 }
 assert.equal(calls.length,0);
 // Balances may legitimately be zero.
 assert.equal((await post(api,{kind:'Cash',name:'Wallet',amount:0,account_id:null})).status,200);
 assert.equal((await post(api,{kind:'Mortgage',name:'Home',amount:0,account_id:null,opened_on:'2026-01-01'})).status,200);
 assert.equal(calls.length,2);
});

function numberInput(props){
 // The caret is restored after the browser paints; there is no browser here.
 globalThis.requestAnimationFrame??=()=>0;
 const {FormattedNumberInput}=loadTS('components/presentation-foundation/formatted-number-input.tsx',{
  react:{...React,useState:initial=>[typeof initial==='function'?initial():initial,()=>{}],useRef:current=>({current}),useEffect:()=>{}},
  '@/components/ui/input':{Input:'input'},
  '@/components/language-provider':{useLanguage:()=>({locale:'en-US'})},
 });
 // The field is the first child; a limit message may follow it.
 return FormattedNumberInput(props).props.children[0];
}
const typed=value=>({currentTarget:{value,selectionStart:value.length,setSelectionRange(){}}});
test('number fields report a blank entry separately from a typed zero',()=>{
 const calls=[];
 const field=numberInput({value:0,onValueChange:(value,blank)=>calls.push([value,blank])});
 assert.equal(field.props.value,'');assert.equal(field.props.placeholder,'0');assert.equal(field.props.required,false);
 field.props.onChange(typed(''));field.props.onChange(typed('0'));field.props.onChange(typed('1,250.5'));
 assert.deepEqual(calls,[[0,true],[0,false],[1250.5,false]]);
 // Fields that must be typed block submission while blank; optional fields never do.
 assert.equal(numberInput({value:0,requireEntry:true,onValueChange(){}}).props.required,true);
 assert.equal(numberInput({value:0,required:false,onValueChange(){}}).props.required,false);
 assert.equal(numberInput({value:12,requireEntry:true,onValueChange(){}}).props.value,'12');
});

test('tracker valuations must be typed and amounts use the required entry rule',()=>{
 const tracker=fs.readFileSync('components/investment-tracker.tsx','utf8');
 assert.match(tracker,/\(!hasBalance\|\|!balanceBlank\)/);
 assert.match(tracker,/<FormattedNumberInput value=\{draft\.balance\?\?0\} requireEntry onValueChange=\{\(balance,blank\)=>\{setBalanceBlank\(blank\)/);
 // Every reset of the draft starts from a blank value again.
 assert.equal(tracker.match(/setBalanceBlank\(true\)/g).length,3);
 assert.doesNotMatch(tracker,/stroke="#/);
 assert.match(fs.readFileSync('components/presentation-foundation/amount-currency-fields.tsx','utf8'),/<FormattedNumberInput[^>]* requireEntry /);
});

test('actual transactions and payments cannot be dated in the future',()=>{
 const dialog=sourceWithParts('components/record-dialog.tsx'),income=fs.readFileSync('components/income-record-form.tsx','utf8');
 assert.match(dialog,/max=\{editing\.frequency==='Once'\?today\(\):undefined\}/);
 assert.match(income,/const actual=editing\.frequency==='Once'&&!salaryPlan;/);assert.match(income,/<DatePicker value=\{editing\.date\}[^>]*max=\{latestDate\}/);
 assert.match(fs.readFileSync('components/mortgage-payment-dialog.tsx','utf8'),/<DatePicker value=\{payment\.date\}[^>]*max=\{depositToday\(\)\}/);
 assert.match(fs.readFileSync('components/planning/asset-movement-dialog.tsx','utf8'),/<DatePicker value=\{draft\.date\} max=\{depositToday\(\)\}/);
 assert.match(fs.readFileSync('lib/record-save.ts','utf8'),/requiresCashAccount\(editing\) && editing\.date > today\(\)/);
});

test('dialogs open the saved record, and the exchange rate reads in the stored direction',()=>{
 const table=fs.readFileSync('components/workspace/records-table.tsx','utf8');
 for(const action of ['setViewing','setStopping','setTracking','setPayingMortgage','setSplitting'])assert.match(table,new RegExp(action+'\\(storedRecord\\(r\\)\\)'),action);
 assert.doesNotMatch(table,/rows\.find/);
 // account_exchange_rate is record currency per one unit of account currency.
 assert.match(fs.readFileSync('components/transaction-details-dialog.tsx','utf8'),/`1 \$\{record\.account_currency\} = \$\{formatNumber\(record\.account_exchange_rate,locale\)\} \$\{record\.currency\}`/);
});

test('the edit form and its history panel are siblings with different keys',()=>{
 const dialog=sourceWithParts('components/record-dialog.tsx');
 assert.match(dialog,/<RecordEditHistory key=\{'history:'\+editing\.id\}/);
 assert.doesNotMatch(dialog,/<RecordEditHistory key=\{editing\.id\}/);
});

test('money lent is filtered and sorted by the day it was lent, with or without a due date',()=>{
 const {filterRecords,emptyRecordFilters}=loadTS('lib/record-filters.ts');
 const row=(id,kind,date,lent_date='')=>({id,name:id,kind,notes:'',date,lent_date});
 const records=[row('loan','Loan','2026-09-10'),row('open','Money lent','','2026-09-20'),row('due','Money lent','2028-01-01','2026-09-05'),row('old','Money lent','','2025-01-01')];
 assert.deepEqual(filterRecords(records,{...emptyRecordFilters,from:'2026-09-01',to:'2026-09-30'},'en-US').map(item=>item.id),['open','loan','due']);
 assert.deepEqual(filterRecords(records,{...emptyRecordFilters,order:'oldest'},'en-US').map(item=>item.id),['old','due','loan','open']);
 assert.deepEqual(filterRecords(records,{...emptyRecordFilters,from:'2027-01-01'},'en-US').map(item=>item.id),[]);
});

test('account activity shows spending as money out and income as money in',()=>{
 const page=fs.readFileSync('components/planning/accounts/account-activity.tsx','utf8');
 assert.match(page,/formatMoney\(income\.includes\(record\.kind\)\?record\.amount:-record\.amount,record\.currency,locale\)/);
});

test('deleting an account that still has savings goals explains what blocks it',async()=>{
 const kinds=['Cash','Living expense','Other income','Mortgage'];
 const remove=apiFunction('cashFlowAmountMissing','requiresCashAccount','loadDatedExchangeRate','depositForecasts','isCurrency','z','kinds','income','expenses','assetRecordKinds','session','supa','sameOrigin',compile('app/api/records/route.ts')+';return DELETE;')
  .bind(null,cashFlowAmountMissing,requiresCashAccount)(async()=>({rate:1,effective_date:'2026-09-01'}),()=>[],()=>true,z,kinds,['Other income'],['Living expense'],['Cash'],async()=>({user:{id:'owner'},token:'owner'}),
  async()=>Response.json({code:'23503',message:'update or delete on table "finance_records" violates foreign key constraint',details:'Key (id) is still referenced from table "savings_goals".'},{status:409}),()=>true);
 const response=await remove(new Request('https://local',{method:'DELETE',body:JSON.stringify({id:expense.account_id})}));
 assert.equal(response.status,409);assert.equal((await response.json()).error,'This account has savings goals. Delete or move those goals first.');
});

test('QA 2026-10-02: dialogs explain limits, prefill scheduled amounts and offer the right choices',()=>{
 const read=file=>fs.readFileSync(file,'utf8');
 // Add transaction offers income as well as expense, through the existing forms.
 const transactions=read('components/workspace/screens/transactions-screen.tsx');
 assert.match(transactions,/onAdd\('Other income'\)/);assert.match(transactions,/onAdd\('Other expense'\)/);
 // Split choices are built-in plus added categories of the transaction's type.
 assert.match(read('components/transaction-tools-panel.tsx'),/categoryChoices\(categories,income\.includes\(record\.kind\)\?'income':'expense',removed\)/);
 // A scheduled payment starts at its scheduled amount instead of a placeholder.
 const operation=read('components/planning/account-operation.tsx');
 assert.match(operation,/amount:operation\.amount\?\?\(operation\.action==='occurrence'/);
 assert.doesNotMatch(operation,/placeholder=\{formatNumber\(target/);
 // Over-limit quantities and oversized fees say why; the stablecoin note is for crypto only.
 const movement=read('components/planning/asset-movement-dialog.tsx');
 assert.match(movement,/max=\{available\} maxMessage=\{t\('Only \{amount\} available'/);
 assert.match(movement,/feeTooHigh&&<small role="alert"/);
 assert.match(movement,/\(source\.kind==='Crypto'\|\|target\.kind==='Crypto'\)&&<p className="muted">\{t\('USDT and USDC/);
 // Cash account pickers show balances through the shared label.
 for(const file of ['components/planning/asset-movement-dialog.tsx','components/planning/account-operation.tsx','components/planning/goals-page.tsx','components/data-tools.tsx','components/cash-account-field.tsx'])assert.match(read(file),/formatAccountOption\(/,file);
 assert.doesNotMatch(read('components/planning/account-operation.tsx'),/\{a\.name\} · \{a\.currency\}/);
 // Loans & debts: currency choice for new records, loan-only filter, payments for loans and debts, plural counts.
 assert.match(sourceWithParts('components/record-dialog.tsx'),/!existing&&\(assetRecord\|\|lendingRecordKinds\.includes\(editing\.kind\)\)/);
 const table=read('components/workspace/records-table.tsx');
 assert.match(table,/categories=\{sectionKey === 'debts' \? \[\] : planning\.data\.categories\}/);
 assert.match(table,/\(r\.kind === 'Loan' \|\| r\.kind === 'Debt'\) && <Button.*?setDebtPayment/);
 assert.match(table,/<Pagination /);assert.match(read('components/recently-deleted.tsx'),/<Pagination /);
 assert.match(read('components/debt-summary.tsx'),/lentCount===1\?'1 lending record'/);
});
test('dashboard payments show each instalment, and the comparison line is labelled as investments',()=>{
 const read=path=>fs.readFileSync(path,'utf8');
 const overview=read('components/overview-page.tsx');
 assert.match(overview,/show\(item\.amount, item\.record\.currency\)/,'a loan shows its monthly payment, not the outstanding balance');
 assert.doesNotMatch(overview,/money\(item\.record\.amount, item\.record\.currency\)/);
 assert.match(overview,/upcomingPayments\(planning\.records, planning\.occurrences, undefined, undefined, planning\.debtPayments\)/);
 const comparison=read('components/investment-comparison.tsx');
 assert.match(comparison,/key:'actual',label:t\('Investments'\)/);
 assert.match(read('components/dashboard-cards.tsx'),/budgetRowsForMode\(rows, budget\.state\.mode\)\.filter\(row => row\.budget\)/,'flex mode hides per-category budgets on the dashboard too');
 assert.match(read('lib/dashboard-layout.ts'),/upcoming: 'Upcoming payments'/);assert.doesNotMatch(comparison,/label=\{t\('Net worth'\)\}/);
});

test('a transaction opened from the list keeps its date, account and notes instead of the summary row',()=>{
 const {storedEntry}=loadTS('lib/record-table.ts');
 const full={id:'t1',name:'QA groceries UI',kind:'Living expense',currency:'USD',amount:84.3,quantity:1,cost:0,rate:0,date:'2026-10-06',frequency:'Once',notes:'QA groceries UI',account_id:'a1',revision:1};
 const summaryRow={id:'t1',name:'QA groceries UI',kind:'Living expense',currency:'USD',amount:84.3,quantity:1,cost:0,rate:0,date:null,frequency:'Once',notes:'',record_count:1};
 const none={history:[],planning:[],rows:[],summary:[summaryRow]};
 const opened=storedEntry(full,none,false);
 assert.equal(opened.date,'2026-10-06');assert.equal(opened.account_id,'a1');assert.equal(opened.notes,'QA groceries UI');assert.equal(opened.revision,1);
 // A slim row handed in still borrows nothing worse; a stored copy elsewhere wins over both.
 assert.equal(storedEntry(summaryRow,{...none,rows:[full]},false).date,'2026-10-06');
 assert.equal(storedEntry({...summaryRow,date:''},none,false).record_count,1);
});

test('every account picker lists accounts in the Accounts order, then newest last, never by internal id',()=>{
 const {inAccountOrder}=loadTS('lib/account-directory.ts');
 const cash=(id,name,created_at)=>({id,name,kind:'Cash',currency:'USD',amount:1,quantity:1,cost:0,rate:0,date:'2026-10-01',frequency:'Once',notes:'',created_at});
 const spend={id:'00-spend',name:'QA Lunch',kind:'Living expense',currency:'USD',amount:5,quantity:1,cost:0,rate:0,date:'2026-10-01',frequency:'Once',notes:''};
 const records=[cash('aa','QA Newer','2026-10-05'),spend,cash('ff','QA Saved','2026-09-01'),cash('bb','QA Older','2026-10-01')];
 const ordered=inAccountOrder(records,['ff']);
 assert.deepEqual(ordered.map(r=>r.name),['QA Saved','QA Lunch','QA Older','QA Newer'],'transactions keep their places; accounts follow the saved order, then creation');
 assert.deepEqual(inAccountOrder(records,[]).filter(r=>r.kind==='Cash').map(r=>r.name),['QA Saved','QA Older','QA Newer']);
});

test('an expense amount in the transaction details stays in the ink colour',()=>{
 const dialog=fs.readFileSync('components/transaction-details-dialog.tsx','utf8');
 assert.match(dialog,/className=\{incoming\?'positive':undefined\}/);
 assert.doesNotMatch(dialog,/'negative'/,'red is for overdue, overspent or owed amounts only');
});

test('Cash flow, Dashboard and Goals estimate the monthly surplus from the same full rows, loan payments included',()=>{
 const provider=fs.readFileSync('components/workspace/workspace-provider.tsx','utf8');
 // Summary rows carry no estimated_monthly_payment for loans and debts; Goals already reads the planning rows.
 assert.match(provider,/estimatedCashFlow\(monthlyIncomeEntries, planningMonth, monthBudget\.lines\)/);
 assert.match(fs.readFileSync('components/planning/goals-page.tsx','utf8'),/goalFinancials\(data\.records,/);
 const {estimatedCashFlow}=loadTS('lib/finance.ts');
 const loan={id:'l',name:'QA Car loan',kind:'Loan',currency:'USD',amount:7200,quantity:1,cost:0,rate:7.5,date:'2028-12-31',frequency:'Once',notes:'',estimated_monthly_payment:350};
 assert.equal(estimatedCashFlow([loan],'2026-10').forecast,-350);
});

// Full QA run, 6 October 2026.
test('going back to an earlier Transactions period opens its first page, not the page left there',()=>{
 const screen=fs.readFileSync('components/workspace/screens/transactions-screen.tsx','utf8');
 assert.match(screen,/if \(paging\.key !== listKey\) setPaging\(\{ key: listKey, page: 1 \}\);/);
});

test('Edit multiple says how many rows kept their category instead of a bare "1 updated"',()=>{
 const screen=fs.readFileSync('components/workspace/screens/transactions-screen.tsx','utf8');
 assert.match(screen,/fixedCategory = chosen\.length - movable\.length;/);
 assert.match(screen,/fixedCategory \? t\('\{changed\} updated; \{skipped\} could not change category here\.'/);
});

test('a transaction saved without a name reads in the current language and follows its category',()=>{
 const {shownName}=loadTS('lib/record-names.ts');
 const {renamedForCategory}=loadTS('lib/transaction-rules.ts');
 const ru=key=>({'Other expense':'Прочие расходы','Transaction fee':'Комиссия'}[key]??key);
 assert.equal(shownName({name:'Other expense'},ru),'Прочие расходы');
 assert.equal(shownName({name:'QA Taxi home'},ru),'QA Taxi home','a typed name is shown as typed');
 assert.equal(shownName({name:'Transaction fee',movement_id:'m'},ru),'Комиссия');
 assert.equal(shownName({name:'Transaction fee'},ru),'Transaction fee','only an app-made fee is translated');
 const categories=[{id:'c1',name:'Transport'},{id:'c2',name:'Utilities'}];
 assert.equal(renamedForCategory({name:'Other expense',kind:'Other expense',custom_category_id:null},{kind:'Other expense',category_id:'c1'},categories),'Transport');
 assert.equal(renamedForCategory({name:'utilities',kind:'Other expense',custom_category_id:'c2'},{kind:'Living expense',category_id:null},categories),'Living expense');
 assert.equal(renamedForCategory({name:'QA Taxi home',kind:'Other expense',custom_category_id:null},{kind:'Other expense',category_id:'c1'},categories),'QA Taxi home');
 assert.match(fs.readFileSync('components/workspace/state/use-record-save.ts','utf8'),/expenseName\(editing,[^;]*,editing\.kind\)/,'the key is stored, not a translation');
});

test('a back-dated schedule is not overdue for the months before it was added',()=>{
 const {upcomingPayments}=loadTS('lib/planning.ts');
 const {carriedOverdue}=loadTS('lib/recurring.ts');
 const gym={id:'gym',name:'QA Gym',kind:'Living expense',currency:'USD',amount:45,quantity:1,cost:0,rate:0,date:'2023-02-05',frequency:'Monthly',notes:'',created_at:'2026-10-03T07:30:00Z'};
 const due=upcomingPayments([gym],[],'2026-10-06');
 assert.deepEqual(due.filter(item=>item.overdue).map(item=>item.date),['2026-10-05'],'only the payment due after it was added');
 assert.deepEqual(carriedOverdue([gym],[],'2026-10','2026-10-06'),[],'no "Open from earlier months" backlog');
 const old={...gym,created_at:'2023-01-01T00:00:00Z'};
 assert.ok(upcomingPayments([old],[],'2026-10-06').filter(item=>item.overdue).length>40,'a schedule kept since 2023 still reminds');
});

test('Budget contributions are the goals Goals funds, so Left to budget and Available for goals agree',()=>{
 const {goalContribution}=loadTS('lib/budget.ts');
 const {fundingPlan}=loadTS('lib/goal-funding.ts');
 const goal=(id,extra)=>({id,name:id,kind:'savings',account_id:'a',currency:'USD',target:10000,allocated:0,target_date:null,archived:false,monthly_contribution:500,...extra});
 const goals=[goal('planner only',{}),goal('funded',{funding_enabled:true,funding_monthly:300}),goal('paused',{funding_enabled:true,paused_until:'2026-12-01'})];
 const budget=goals.reduce((sum,item)=>sum+goalContribution(item,'2026-10-06'),0);
 assert.equal(budget,300);
 assert.equal(fundingPlan(goals,10000,'USD','2026-10-06').requested,budget);
});

test('goal pickers, recurring categories and deposit benchmarks follow the person, not internal order or one country',()=>{
 assert.equal((fs.readFileSync('components/planning/goals-page.tsx','utf8').match(/<GoalFundingPanel data=\{\{\.\.\.data,goals:order\.goals\}\}/g)??[]).length,2);
 const rows=fs.readFileSync('components/planning/recurring-rows.tsx','utf8');
 assert.match(rows,/<CategoryIcon kind=\{category \?\? item\.record\.kind\}\/>/);
 assert.match(rows,/category \?\? t\(item\.record\.kind\)/);
 assert.match(fs.readFileSync('components/planning/upcoming-page.tsx','utf8'),/<OccurrenceRow [^>]*categories=\{data\.categories\}/);
 assert.match(fs.readFileSync('components/investment-comparison-settings.tsx','utf8'),/currencies\.includes\(option\.key\.slice\('deposit'\.length\)\)\|\|draft\.benchmarks\.includes\(option\.key\)/);
});

test('transaction labels never narrow below a word',()=>{
 const css=stylesheet();
 assert.match(css,/\.transaction-labels\{[^}]*grid-auto-columns:minmax\(min-content,1fr\)/);
 assert.match(css,/\.transaction-row:has\(>input\)\{grid-template-columns:auto minmax\(0,1\.2fr\) minmax\(min-content,1\.2fr\)/);
});

// 7 October 2026: a transaction opened from the list can be deleted, not only edited.
test('the transaction details dialog offers a bin to delete and a pencil to edit, with no Close button beside the ×',()=>{
 const dialog=fs.readFileSync('components/transaction-details-dialog.tsx','utf8');
 assert.match(dialog,/<DeleteButton label=\{t\('Delete \{name\}',\{name:shownName\(record,t\)\}\)\} onClick=\{onDelete\}\/>/);
 assert.match(dialog,/aria-label=\{t\('Edit \{name\}',\{name:shownName\(record,t\)\}\)\} onClick=\{onEdit\}><Pencil /);
 assert.doesNotMatch(dialog,/t\('Close'\)/);
 const dialogs=fs.readFileSync('components/workspace/workspace-dialogs.tsx','utf8');
 assert.match(dialogs,/onDelete=\{\(\)=>\{const r=viewing;setViewing\(null\);requestDelete\(r\);\}\}/);
});

test('every Notes field is a multi-line textarea, never a one-line input', () => {
 const files = fs.globSync('{components,app}/**/*.tsx');
 const notes = files.flatMap(file => [...fs.readFileSync(file, 'utf8').matchAll(/t\(['"]Notes[^'"]*['"]\)\}\s*<(\w+)/g)].map(match => [file, match[1]]));
 assert.ok(notes.length >= 10, 'finds the Notes fields');
 assert.deepEqual(notes.filter(([, tag]) => tag !== 'textarea'), []);
});

test('Record payment starts from the account that last paid the loan or bill, else the only one in its currency', () => {
 const { suggestedPaymentAccount } = loadTS('lib/payment-account.ts');
 const cash = (id, currency) => ({ id, kind: 'Cash', currency });
 const usd = cash('usd', 'USD'), card = cash('card', 'USD'), som = cash('som', 'UZS'), home = { id: 'home', kind: 'Mortgage', currency: 'USD' };
 const activity = [{ account_id: 'usd', target_id: 'home', occurred_on: '2026-09-12' }, { account_id: 'card', target_id: 'home', occurred_on: '2026-10-08' }, { account_id: 'som', target_id: 'other', occurred_on: '2026-10-09' }];
 assert.equal(suggestedPaymentAccount([usd, card, som], home, [], activity), 'card', 'the latest payment of this mortgage');
 assert.equal(suggestedPaymentAccount([usd, som], home, [], []), 'usd', 'the only account in its currency');
 assert.equal(suggestedPaymentAccount([usd, card, som], home, [], []), '', 'a real choice stays the person\'s');
 const bill = { id: 'bill', kind: 'Living expense', currency: 'UZS' };
 assert.equal(suggestedPaymentAccount([usd, som, cash('som2', 'UZS')], bill, [{ id: 'p', occurrence_record_id: 'bill', account_id: 'som2', date: '2026-09-01' }]), 'som2', 'a bill follows its last payment');
 assert.equal(suggestedPaymentAccount([usd], undefined, []), '');
});

test('a disabled Save in an account operation says why beside it', () => {
 const source = fs.readFileSync('components/planning/account-operation.tsx', 'utf8');
 assert.match(source, /\{blocked&&!busy&&<p className="muted" role="status" id=\{blockedId\}>\{t\(blocked\)\}<\/p>\}/);
 assert.match(source, /aria-describedby=\{blocked&&!busy\?blockedId:undefined\}/, 'the disabled Save names its reason');
 assert.match(source, /'Choose a cash account\.'/);
});
