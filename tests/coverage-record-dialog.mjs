import test from 'node:test';
import assert from 'node:assert/strict';
import {createRenderer,hostModule,language,text,byText,byType,event} from './helpers/component-tree.mjs';
import {loadTS} from './helpers/load-ts.mjs';

const {formatMoney}=loadTS('lib/format.ts');
const finance=loadTS('lib/finance.ts');
const now=new Date('2026-09-30T07:00:00Z');// 30 September 2026 in Tashkent
const stubs=['loading-placeholder','form-footer','schedule-fields','error-popup','amount-currency-fields','currency-select','currency-value','record-icon','date-picker','formatted-number-input','confirm-dialog'].map(name=>'@/components/presentation-foundation/'+name);
const components=['record-edit-history','cash-investment-option','investment-tracker','mortgage-payment-dialog','income-record-form','cash-account-field','instrument-picker','record-name-input','business-profile-fields','ui/tabs','ui/button','ui/native-select','ui/dialog'].map(name=>'@/components/'+name);

const record=(id,kind,extra={})=>({id,name:id,kind,amount:100,quantity:1,cost:0,rate:0,currency:'USD',frequency:'Once',date:'2026-09-15',notes:'',...extra});
const planning=(data={},state={})=>({loading:false,error:'',...state,data:{records:[],categories:[],holdingAccounts:[],...data}});

function dialog(t,start,props={}){
 if(!t.dateMocked){t.mock.timers.enable({apis:['Date'],now});t.dateMocked=true;}
 globalThis.window={addEventListener(){},removeEventListener(){}};t.after(()=>{delete globalThis.window;});
 const r=createRenderer(),saves=[],fetches=[],debtPayments=[],navigations=[],state={};
 const {RecordDialog}=r.load('components/record-dialog.tsx',{
  ...Object.fromEntries([...stubs,...components,'lucide-react'].map(name=>[name,hostModule()])),
  'next/link':{__esModule:true,default:'Link'},
  '@/components/language-provider':language('en'),
 });
 const settings={currencies:['USD','EUR'],household:null,busy:false,rows:[],save:e=>{e.preventDefault?.();saves.push(state.editing);},editingCashFlow:false,recordKinds:finance.assets,demo:false,summary:[],availableBusinesses:[],expensePlans:{plans:[],month:'2026-09',loading:false,error:''},money:(amount,currency)=>formatMoney(amount,currency,'en'),fetchingPrice:false,fetchPrice:()=>fetches.push(true),priceMessage:'',error:'',planning:planning(),navigate:path=>navigations.push(path),...props};
 function Host(){
  const [editing,setEditing]=r.react.useState(start);
  state.editing=editing;
  // As in the workspace provider, a closed dialog is never a cash-flow one.
  return r.react.createElement(RecordDialog,{...settings,editingCashFlow:!!editing&&settings.editingCashFlow,editing,setEditing,field:(key,value)=>setEditing(current=>({...current,[key]:value}))});
 }
 r.render(r.react.createElement(Host));
 const labelled=(name,type)=>{const label=r.find(node=>node.type==='label'&&node.children[0]===name);return type?r.find(byType(type),label):label;};
 const select=(...values)=>r.find(node=>node.type==='NativeSelect'&&values.every(value=>node.children.some(option=>option.type==='option'&&option.props.value===value)));
 return {r,state,settings,saves,fetches,debtPayments,navigations,labelled,select,
  title:()=>text(r.find(byType('DialogTitle'))),description:()=>text(r.find(byType('DialogDescription'))),
  confirm:()=>r.find(node=>node.type==='ConfirmDialog')};
}

test('asset dialogs are titled and described by what they add',t=>{
 const cases=[
  [record('new-cash','Cash'),{},'Add account','Record an existing account balance. This adds to your assets; it does not record income or transfer money.'],
  [record('new-stock','Stock'),{},'Add holding','Record units you already own and their price. This adds a holding without withdrawing cash from an account.'],
  [record('new-home','Property'),{},'Add asset','Record the value of something you own. This adds to your assets; it does not record a purchase or withdraw cash.'],
  [record('home','Property'),{rows:[record('home','Property')]},'Edit record','Keep a current balance for this record.'],
  [record('planned','Property'),{planning:planning({records:[record('planned','Property')]})},'Edit record','Keep a current balance for this record.'],
 ];
 for(const [entry,props,title,description] of cases){
  const d=dialog(t,entry,props);
  assert.equal(d.title(),title);assert.equal(d.description(),description);
  assert.equal(d.r.find(byType('DialogContent')).props.className,'record-dialog');
 }
});

test('account mode titles, lending and debt records, and edited records use their own wording',t=>{
 const cases=[
  [record('dep','Deposit'),{accountMode:true,recordKinds:['Cash','Deposit']},'Add account'],
  [record('crypto','Crypto'),{accountMode:true},'Add holding'],
  [record('acc','Cash'),{accountMode:true,rows:[record('acc','Cash')]},'Edit record'],
 ];
 for(const [entry,props,title] of cases)assert.equal(dialog(t,entry,props).title(),title);
 const lent=dialog(t,record('lent','Money lent'));
 assert.equal(lent.title(),'Add money lent');assert.equal(lent.description(),'Keep track of who owes you, how much, and when.');
 const loan=dialog(t,record('loan','Loan'),{recordKinds:finance.liabilities});
 assert.equal(loan.title(),'Add a record');assert.equal(loan.description(),'Keep a current balance for this record.');
 const other=dialog(t,record('loan','Loan'),{recordKinds:['Loan','Salary'],rows:[record('loan','Loan')]});
 assert.equal(other.title(),'Edit record');
 const mixed=dialog(t,record('x','Valuables',{kind:'Valuables'}),{recordKinds:['Loan','Salary'],accountMode:false});
 assert.equal(mixed.title(),'Add asset');
 const plain=dialog(t,{...record('odd','Loan'),kind:'Unknown'},{recordKinds:['Unknown']});
 assert.equal(plain.description(),'Keep a current balance or record income and expenses.');
 // Account mode describes accounts and holdings.
 const account=dialog(t,record('l','Loan'),{accountMode:true});
 assert.equal(account.title(),'Add account');
 assert.equal(account.description(),'Cash and deposits hold a balance. Stocks and crypto are holdings within an account.');
 // Account type labels name holdings in account mode.
 assert.equal(dialog(t,record('s','Stock'),{accountMode:true}).labelled('Holding type').children[0],'Holding type');
 const deposit=dialog(t,record('d','Deposit'),{accountMode:true,recordKinds:['Cash','Deposit']});
 assert.deepEqual(deposit.labelled('Account type','NativeSelect').children.map(text),['Cash','Interest-bearing deposit']);
});

test('income records are handed to the income form, which can send the person to income sources',t=>{
 const d=dialog(t,record('pay','Salary'),{editingCashFlow:true,recordKinds:finance.income});
 assert.equal(d.title(),'Add income');
 assert.equal(d.description(),'Enter an amount and choose how often it repeats.');
 const form=()=>d.r.find(byType('IncomeRecordForm'));
 const clean=event();d.r.fire(form(),'onNavigateToSources',clean);
 assert.equal(d.state.editing,null,'a clean form closes before the link navigates');
 assert.equal(clean.defaultPrevented,false);
 const sources=dialog(t,record('pay','Salary'),{editingCashFlow:true,earningSources:{sources:[]}});
 assert.equal(sources.description(),'Choose an income source and record the amount received.');
 // A changed form asks first, then closes and navigates.
 sources.r.fire(sources.r.find(byType('IncomeRecordForm')),'setEditing',{...record('pay','Salary'),amount:250});
 const dirty=event();sources.r.fire(sources.r.find(byType('IncomeRecordForm')),'onNavigateToSources',dirty);
 assert.equal(dirty.defaultPrevented,true);
 assert.equal(sources.confirm().props.open,true);
 sources.r.fire(sources.confirm(),'onConfirm');
 assert.equal(sources.state.editing,null);assert.deepEqual(sources.navigations,['/income-expenses#income-sources']);
 // Closing a changed income form goes through the same guard.
 const closing=dialog(t,record('pay','Salary'),{editingCashFlow:true});
 closing.r.fire(closing.r.find(byType('IncomeRecordForm')),'setEditing',{...record('pay','Salary'),amount:5});
 closing.r.fire(closing.r.find(byType('IncomeRecordForm')),'setEditing',null);
 assert.equal(closing.confirm().props.open,true);
 closing.r.fire(closing.confirm(),'onClose');
 assert.equal(closing.confirm().props.open,false);assert.equal(closing.state.editing.amount,5,'keep editing keeps the draft');
});

test('closing asks before discarding a changed record and ignores close requests while saving',t=>{
 const d=dialog(t,record('cash','Cash'));
 const root=()=>d.r.find(byType('Dialog'));
 assert.equal(root().props.open,true);
 d.r.fire(root(),'onOpenChange',true);
 assert.ok(d.state.editing,'opening changes nothing');
 d.r.fire(d.labelled('Opening balance','FormattedNumberInput'),'onValueChange',250);
 assert.equal(d.state.editing.amount,250);
 d.r.fire(root(),'onOpenChange',false);
 assert.equal(d.confirm().props.open,true,'a changed record asks first');
 assert.equal(d.confirm().props.title,'Discard unsaved changes?');
 d.r.fire(d.confirm(),'onConfirm');
 assert.equal(d.state.editing,null);
 const clean=dialog(t,record('cash','Cash'));
 clean.r.fire(clean.r.find(byText('Button','Cancel')),'onClick');
 assert.equal(clean.state.editing,null,'an unchanged record closes at once');
 const busy=dialog(t,record('cash','Cash'),{busy:true});
 busy.r.fire(busy.r.find(byType('Dialog')),'onOpenChange',false);
 assert.ok(busy.state.editing,'a save in progress keeps the dialog open');
 assert.equal(busy.r.find(byType('DialogClose')).props.disabled,true);
 assert.equal(text(busy.r.find(node=>node.type==='Button'&&node.props.className==='primary')),'Saving…');
});

test('opening focuses the expense amount when there is one, and otherwise leaves focus to the dialog',t=>{
 const d=dialog(t,record('cash','Cash'));
 const content=d.r.find(byType('DialogContent'));
 let focused=0;const input={focus(){focused++;}};
 const withInput=event({currentTarget:{querySelector:selector=>{assert.equal(selector,'.expense-form .amount-value-field input:not([disabled])');return input;}}});
 content.props.onOpenAutoFocus(withInput);
 assert.equal(withInput.defaultPrevented,true);assert.equal(focused,1);
 const without=event({currentTarget:{querySelector:()=>null}});
 content.props.onOpenAutoFocus(without);
 assert.equal(without.defaultPrevented,false);
});

test('a new cash account offers the investment option, an investment account and an opening date',t=>{
 const holdingAccounts=[{id:'broker',name:'Broker',kind:'Stock'},{id:'wallet',name:'Exchange',kind:'Crypto'}];
 const d=dialog(t,record('cash','Cash'),{accountMode:true,planning:planning({holdingAccounts})});
 d.r.fire(d.r.find(byType('CashInvestmentOption')),'onChange',true);
 assert.equal(d.state.editing.is_investment,true);
 const account=d.labelled('Investment account (optional)','NativeSelect');
 assert.deepEqual(account.children.map(text),['No investment account','Broker · Stock account','Exchange · Crypto account']);
 d.r.fire(account,'onChange',{target:{value:'broker'}});
 assert.equal(d.state.editing.holding_account_id,'broker');
 d.r.fire(d.labelled('Investment account (optional)','NativeSelect'),'onChange',{target:{value:''}});
 assert.equal(d.state.editing.holding_account_id,null);
 assert.ok(d.r.find(node=>node.type==='p'&&text(node)==='For an interest-bearing balance, choose Deposit and enter its annual interest rate.'));
 const opened=d.labelled('Opening balance date','DatePicker');
 assert.equal(opened.props.value,'2026-09-30','the opening date defaults to today');
 d.r.fire(opened,'onChange','2026-09-01');
 assert.equal(d.state.editing.opened_on,'2026-09-01');
 // Changing the kind goes through the shared kind change.
 d.r.fire(d.labelled('Account type','NativeSelect'),'onChange',{target:{value:'Deposit'}});
 assert.equal(d.state.editing.kind,'Deposit');
 // Business accounts can be assigned to a business.
 const owned=dialog(t,record('cash','Cash',{business_id:null}),{availableBusinesses:[{id:'cafe',name:'Cafe'}]});
 const business=owned.labelled('Business (optional)','NativeSelect');
 assert.deepEqual(business.children.map(text),['Household','Cafe']);
 owned.r.fire(business,'onChange',{target:{value:'cafe'}});assert.equal(owned.state.editing.business_id,'cafe');
 owned.r.fire(owned.labelled('Business (optional)','NativeSelect'),'onChange',{target:{value:''}});assert.equal(owned.state.editing.business_id,null);
 // Saved records show their currency without a picker and skip the opening date.
 const saved=dialog(t,record('cash','Cash'),{rows:[record('cash','Cash')]});
 assert.equal(saved.r.all(byType('CashInvestmentOption')).length,0);
 assert.ok(saved.r.find(byType('CurrencyValue')));assert.equal(saved.r.all(byType('CurrencySelect')).length,0);
 assert.equal(saved.labelled('Current balance').children[0],'Current balance');
 assert.ok(saved.r.find(byType('RecordEditHistory')),'a saved record shows its edit history');
 assert.equal(dialog(t,record('cash','Cash'),{rows:[record('cash','Cash')],demo:true}).r.all(byType('RecordEditHistory')).length,0,'not in the sample workspace');
 const unloaded=dialog(t,record('cash','Cash'),{planning:{loading:false,error:'',data:{records:[],categories:[]}}});
 assert.deepEqual(unloaded.labelled('Investment account (optional)','NativeSelect').children.map(text),['No investment account']);
});

test('new records pick their currency; the currency change clears the account exchange rate',t=>{
 const d=dialog(t,record('cash','Cash',{account_exchange_rate:1.1,account_rate_date:'2026-09-01',account_currency:'EUR'}));
 const picker=d.r.find(byType('CurrencySelect'));
 assert.deepEqual(picker.props.currencies,['USD','EUR']);
 d.r.fire(picker,'onChange','EUR');
 assert.equal(d.state.editing.currency,'EUR');
 assert.equal(d.state.editing.account_exchange_rate,null);assert.equal(d.state.editing.account_rate_date,null);assert.equal(d.state.editing.account_currency,null);
});

test('stocks and crypto take an instrument, price, quantity and cost, and fetch a current price',t=>{
 const d=dialog(t,record('h','Stock',{name:'AAPL',amount:180,quantity:2,cost:150}),{priceMessage:'Price updated.'});
 const picker=()=>d.r.find(byType('InstrumentPicker'));
 assert.equal(picker().props.kind,'Stock');
 d.r.fire(picker(),'onChange','AAPL ');
 assert.equal(d.state.editing.amount,180,'the same instrument keeps its price');
 d.r.fire(picker(),'onChange','MSFT');
 assert.equal(d.state.editing.amount,0,'a different instrument clears the old price');
 assert.equal(d.labelled('Current price per unit').children[0],'Current price per unit');
 d.r.fire(d.labelled('Quantity','FormattedNumberInput'),'onValueChange',3);
 d.r.fire(d.labelled('Purchase price per unit','FormattedNumberInput'),'onValueChange',140);
 assert.equal(d.state.editing.quantity,3);assert.equal(d.state.editing.cost,140);
 const fetch=d.r.find(byText('Button','Fetch current price'));
 assert.equal(fetch.props.disabled,false);
 d.r.fire(fetch,'onClick');assert.equal(d.fetches.length,1);
 assert.equal(text(d.r.find(node=>node.props.role==='status')),'Price updated.');
 const unknown=dialog(t,record('h','Crypto',{name:'not a coin'}),{fetchingPrice:true});
 assert.equal(unknown.r.find(byText('Button','Fetching prices…')).props.disabled,true);
 assert.equal(unknown.r.find(node=>node.type==='Button'&&node.props.className==='primary').props.disabled,true,'an unknown instrument cannot be saved');
 assert.equal(unknown.r.all(node=>node.props.role==='status').length,0);
});

test('a business takes its value, profile, income estimate and ownership, with the share through the money formatter',t=>{
 const d=dialog(t,record('cafe','Business',{amount:200000,ownership_percentage:25}));
 assert.ok(d.r.find(node=>text(node).startsWith('Enter the full business value')&&node.type==='p'));
 d.r.fire(d.r.find(byType('BusinessProfileFields')),'onChange',{business_industry:'Food'});
 assert.equal(d.state.editing.business_industry,'Food');
 assert.equal(d.labelled('Full business value').children[0],'Full business value');
 assert.equal(text(d.r.find(node=>node.props.className==='ownership-summary')),'Your share: '+formatMoney(50000,'USD','en'));
 d.r.fire(d.labelled('Ownership (%)','FormattedNumberInput'),'onValueChange',50);
 assert.equal(text(d.r.find(node=>node.props.className==='ownership-summary')),'Your share: '+formatMoney(100000,'USD','en'));
 d.r.fire(d.labelled('Estimated monthly income (your share)','FormattedNumberInput'),'onValueChange',1200);
 assert.equal(d.state.editing.estimated_monthly_income,1200);
 assert.equal(dialog(t,record('cafe','Business')).labelled('Ownership (%)','FormattedNumberInput').props.value,100,'ownership defaults to 100%');
 const home=dialog(t,record('home','Property'));
 assert.equal(home.labelled('Estimated monthly income (your share)','FormattedNumberInput').props.value,0);
 assert.equal(home.labelled('Current value').children[0],'Current value');
});

test('deposits and Treasury bills take a rate, compounding and dates',t=>{
 const d=dialog(t,record('dep','Deposit',{rate:12}),{accountMode:true});
 d.r.fire(d.labelled('Annual interest rate (%)','FormattedNumberInput'),'onValueChange',14);
 assert.equal(d.state.editing.rate,14);
 const compounding=d.labelled('Interest compounding','NativeSelect');
 assert.equal(compounding.props.value,'monthly');
 d.r.fire(compounding,'onChange',{target:{value:'daily'}});
 assert.equal(d.state.editing.deposit_compounding,'daily');
 assert.ok(d.r.find(node=>node.type==='p'&&text(node).startsWith('To fund this deposit from cash')));
 assert.ok(d.r.find(node=>node.type==='p'&&text(node).startsWith('Use Deposit for an interest-bearing savings account.')));
 const due=d.labelled('Due / maturity date','DatePicker');
 d.r.fire(due,'onChange','2027-09-30');assert.equal(d.state.editing.date,'2027-09-30');
 const bill=dialog(t,record('bill','Treasury bill'));
 assert.ok(bill.labelled('Annual yield (%)'));assert.ok(bill.labelled('Maturity date'));assert.ok(bill.labelled('Purchase date'));
 assert.equal(bill.labelled('Amount invested').children[0],'Amount invested');
 assert.equal(dialog(t,record('bill','Treasury bill'),{rows:[record('bill','Treasury bill')]}).labelled('Current value').children[0],'Current value');
 assert.ok(bill.r.find(node=>node.type==='p'&&text(node).startsWith('Use Treasury bill for a government bill held to maturity.')));
});

test('money lent records the borrower, the date lent and an optional due date after it',t=>{
 const d=dialog(t,record('lent','Money lent',{lent_date:'2026-09-01'}));
 assert.equal(d.r.find(byType('RecordNameInput')).props.label,'Borrower name');
 assert.equal(d.r.find(byType('RecordNameInput')).props.placeholder,'e.g. Full name');
 assert.equal(d.labelled('Amount still owed').children[0],'Amount still owed');
 d.r.fire(d.labelled('Date lent','DatePicker'),'onChange','2026-09-05');
 assert.equal(d.state.editing.lent_date,'2026-09-05');
 const due=d.labelled('Due date (optional)','DatePicker');
 assert.equal(due.props.required,false);assert.equal(due.props.min,'2026-09-05');
 assert.equal(dialog(t,record('lent','Money lent',{lent_date:''})).labelled('Due date (optional)','DatePicker').props.min,undefined);
 d.r.fire(d.r.find(byType('RecordNameInput')),'onChange','Grace');
 assert.equal(d.state.editing.name,'Grace');
});

test('debts take a start date that is fixed once saved and written out as a date',t=>{
 const fresh=dialog(t,record('loan','Loan',{date:'2026-09-15'}),{recordKinds:finance.liabilities});
 const start=fresh.labelled('Start date','DatePicker');
 assert.equal(start.props.value,'2026-09-30');assert.equal(start.props.max,'2026-09-15','a debt cannot start after its due date');
 fresh.r.fire(start,'onChange','2026-01-10');assert.equal(fresh.state.editing.opened_on,'2026-01-10');
 assert.equal(fresh.labelled('Due / maturity date','DatePicker').props.min,'2026-01-10');
 assert.equal(fresh.labelled('Annual interest rate (%)').children[0],'Annual interest rate (%)');
 assert.equal(fresh.labelled('Amount / outstanding balance').children[0],'Amount / outstanding balance');
 assert.equal(fresh.r.find(byType('RecordNameInput')).props.placeholder,'e.g. Car loan or credit card');
 const future=dialog(t,record('loan','Loan',{date:'2027-01-01',opened_on:undefined}));
 assert.equal(future.labelled('Start date','DatePicker').props.max,'2026-09-30','or after today');
 assert.equal(future.labelled('Due / maturity date','DatePicker').props.min,'2026-09-30');
 const saved=record('loan','Loan',{opened_on:'2025-03-04'});
 const existing=dialog(t,saved,{rows:[saved]});
 const fixed=existing.r.find(node=>node.type==='div'&&node.children[0]?.type==='span'&&text(node.children[0])==='Start date');
 assert.equal(text(fixed.children[1]),'4 March 2025');
 assert.equal(existing.labelled('Due / maturity date','DatePicker').props.min,'2025-03-04');
 const undated=dialog(t,{...saved,opened_on:null},{rows:[saved]});
 assert.equal(text(undated.r.find(node=>node.type==='div'&&text(node.children[0]??'')==='Start date').children[1]),'—','a missing start date shows a dash');
 assert.equal(undated.labelled('Due / maturity date','DatePicker').props.min,undefined);
 const mortgage=dialog(t,record('home-loan','Mortgage'));
 mortgage.r.fire(mortgage.labelled('Estimated monthly mortgage payment','FormattedNumberInput'),'onValueChange',900);
 assert.equal(mortgage.state.editing.estimated_monthly_payment,900);
 assert.equal(mortgage.r.find(byType('RecordNameInput')).props.placeholder,'e.g. Apartment mortgage');
});

test('name placeholders follow the kind of record',t=>{
 for(const [kind,placeholder] of [['Business','e.g. Solar panels, café, or game club'],['Property','e.g. Apartment or land'],['Valuables','e.g. Watch, jewellery, art or car'],['Debt','e.g. Car loan or credit card'],['Cash','e.g. Savings account']]){
  assert.equal(dialog(t,record('x',kind)).r.find(byType('RecordNameInput')).props.placeholder,placeholder,kind);
 }
 const demo=dialog(t,record('x','Cash'),{demo:true,rows:[record('y','Cash')],summary:[record('z','Cash')]});
 assert.deepEqual(demo.r.find(byType('RecordNameInput')).props.rows.map(row=>row.id),['y'],'the sample workspace checks names against its own rows');
 assert.equal(text(demo.r.find(node=>node.type==='Button'&&node.props.className==='primary')),'Save in demo');
 const live=dialog(t,record('x','Cash'),{rows:[record('y','Cash')],summary:[record('z','Cash')]});
 assert.deepEqual(live.r.find(byType('RecordNameInput')).props.rows.map(row=>row.id),['z']);
 assert.equal(text(live.r.find(node=>node.type==='Button'&&node.props.className==='primary')),'Save record');
});

test('a scheduled record of another kind repeats, ends, links a business and an account, and notes and saves',t=>{
 const accounts=[record('acct','Cash',{business_id:'cafe'})];
 const d=dialog(t,record('plan','Valuables',{frequency:'Monthly',amount:1234.5,business_id:null}),{editingCashFlow:true,availableBusinesses:[{id:'cafe',name:'Cafe'}],planning:planning({records:accounts,categories:[{id:'c1',name:'Hobby',direction:'expense'}]})});
 assert.equal(d.title(),'Add asset');
 assert.equal(d.labelled('Amount per occurrence').children[0],'Amount per occurrence');
 assert.equal(d.labelled('Start date').children[0],'Start date');
 assert.equal(text(d.r.find(node=>node.props.className==='recurrence-help')),`${formatMoney(1234.5,'USD','en')} every month from 15 September 2026. This is a recurring plan; it does not automatically create transactions or change account balances.`);
 d.r.fire(d.labelled('End date (optional)','DatePicker'),'onChange','2027-01-31');
 assert.equal(d.state.editing.end_date,'2027-01-31');
 d.r.fire(d.labelled('End date (optional)','DatePicker'),'onChange','');
 assert.equal(d.state.editing.end_date,null);
 d.r.fire(d.labelled('Repeats','NativeSelect'),'onChange',{target:{value:'Yearly'}});
 assert.match(text(d.r.find(node=>node.props.className==='recurrence-help')),/every year from/);
 d.r.fire(d.labelled('Repeats','NativeSelect'),'onChange',{target:{value:'Once'}});
 assert.equal(d.state.editing.end_date,null);assert.equal(d.r.all(node=>node.props.className==='recurrence-help').length,0);
 assert.equal(d.labelled('Record date').children[0],'Record date');
 d.r.fire(d.labelled('Linked business (optional)','NativeSelect'),'onChange',{target:{value:'cafe'}});
 assert.equal(d.state.editing.business_id,'cafe');
 d.r.fire(d.labelled('Linked business (optional)','NativeSelect'),'onChange',{target:{value:''}});
 assert.equal(d.state.editing.business_id,null);
 d.r.fire(d.r.find(byType('CashAccountField')),'onChange','acct');
 assert.equal(d.state.editing.account_id,'acct');assert.equal(d.state.editing.business_id,'cafe','the record follows its account’s business');
 d.r.fire(d.select('','c1'),'onChange',{target:{value:'c1'}});
 assert.equal(d.state.editing.custom_category_id,'c1');
 d.r.fire(d.r.find(byText('NativeSelect','NoneHobby')),'onChange',{target:{value:''}});
 assert.equal(d.state.editing.custom_category_id,null);
 d.r.fire(d.labelled('Notes (optional)','textarea'),'onChange',{target:{value:'Gift'}});
 assert.equal(d.state.editing.notes,'Gift');
 d.r.fire(d.r.find(byType('form')),'onSubmit',event());
 assert.equal(d.saves.at(-1).notes,'Gift');
 // A plan-linked record hides the repeat and business choices.
 const linked=dialog(t,record('plan','Valuables',{expense_plan_id:'p1'}),{editingCashFlow:true});
 assert.equal(linked.r.all(node=>node.type==='label'&&node.children[0]==='Repeats').length,0);
 // Business income requires its business.
 const required=dialog(t,record('x','Valuables',{kind:'Valuables'}),{editingCashFlow:true});
 assert.equal(required.labelled('Linked business (optional)','NativeSelect').props.required,false);
 const income=dialog(t,record('inc','Salary'),{editingCashFlow:true});
 assert.equal(income.title(),'Add income');
});

test('cash-flow records in a household follow the owner of the account they move to',t=>{
 const household={me:'me',name:'Home',active:'me',role:'owner',people:[{id:'me'},{id:'partner'}]};
 const accounts=[record('mine','Cash',{shared:false,member_id:'me'}),record('theirs','Cash',{shared:false,member_id:'partner'})];
 const d=dialog(t,record('plan','Valuables',{account_id:'mine',shared:false,member_id:'me'}),{editingCashFlow:true,household,planning:planning({records:accounts})});
 d.r.fire(d.r.find(byType('CashAccountField')),'onChange','theirs');
 assert.equal(d.state.editing.account_id,'theirs');
 assert.equal(d.state.editing.member_id,'partner');assert.equal(d.state.editing.shared,false);
 const alone=dialog(t,record('plan','Valuables',{account_id:'mine'}),{editingCashFlow:true,household:{...household,people:[{id:'me'}]},planning:planning({records:accounts})});
 alone.r.fire(alone.r.find(byType('CashAccountField')),'onChange','theirs');
 assert.equal(alone.state.editing.member_id,undefined,'a single-person workspace has no owners to follow');
});

// The expense form.
const expense=(extra={})=>record('spend','Living expense',{amount:45.5,...extra});
const plans=[{id:'p1',name:'Groceries',category:'Groceries',currency:'USD',amount:400,start_date:'2026-01-01',end_date:null},{id:'p2',name:'Trips',category:'Travel',currency:'EUR',amount:300,start_date:'2026-01-01',end_date:'2026-12-31'}];
const plansState=(extra={})=>({plans,month:'2026-09',loading:false,error:'',...extra});

test('an expense opens on the expense tab with its category, amount, date and account',t=>{
 const categories=[{id:'c1',name:'Eating out',direction:'expense'},{id:'c2',name:'Bonus',direction:'income'}];
 const d=dialog(t,expense(),{editingCashFlow:true,planning:planning({categories,records:[record('acct','Cash')]})});
 assert.equal(d.title(),'Add expense');
 // A saved expense missing from an older planning list still opens as an edit.
 const saved=dialog(t,expense({revision:2}),{editingCashFlow:true,planning:planning({categories,records:[record('acct','Cash')]})});
 assert.equal(saved.title(),'Edit record');
 assert.equal(d.r.find(byType('DialogContent')).props.className,'record-dialog expense-dialog');
 assert.equal(d.r.find(byType('DialogDescription')).props.className,'sr-only');
 assert.equal(d.description(),'Choose a plan or enter an expense amount. Add notes if needed.');
 assert.equal(d.r.find(byType('Tabs')).props.value,'expense');
 assert.deepEqual(d.r.all(byType('TabsTrigger')).map(text),['Plan','Expense'],'no debt tab without a debt payment action');
 const category=d.labelled('Category','NativeSelect');
 assert.deepEqual(category.children.map(text),[...finance.expenses,'Eating out']);
 d.r.fire(category,'onChange',{target:{value:'c1'}});
 assert.equal(d.state.editing.custom_category_id,'c1');assert.equal(d.state.editing.kind,'Other expense');
 assert.equal(d.r.find(byType('Link')).props.href,'/settings#categories');
 const amount=d.r.find(byType('AmountCurrencyFields'));
 assert.equal(amount.props.currencyLocked,false);assert.equal(amount.props.savedCurrency,undefined);
 d.r.fire(amount,'onAmountChange',12.75);assert.equal(d.state.editing.amount,12.75);
 d.r.fire(d.r.find(byType('AmountCurrencyFields')),'onCurrencyChange','EUR');
 assert.equal(d.state.editing.currency,'EUR');assert.equal(d.state.editing.account_exchange_rate,null);
 const date=d.labelled('Record date','DatePicker');
 assert.equal(date.props.max,'2026-09-30','a one-time expense cannot be dated after today');
 d.r.fire(date,'onChange','2026-09-20');assert.equal(d.state.editing.date,'2026-09-20');
 d.r.fire(d.r.find(byType('CashAccountField')),'onChange','acct');assert.equal(d.state.editing.account_id,'acct');
 d.r.fire(d.labelled('Linked business (optional)','NativeSelect'),'onChange',{target:{value:''}});assert.equal(d.state.editing.business_id,null);
 d.r.fire(d.labelled('Notes (optional)','textarea'),'onChange',{target:{value:'Lunch'}});assert.equal(d.state.editing.notes,'Lunch');
 assert.equal(text(d.r.find(node=>node.type==='Button'&&node.props.className==='primary')),'Save expense');
 d.r.fire(d.r.find(byType('form')),'onSubmit',event());
 assert.equal(d.saves.at(-1).notes,'Lunch');
 // Cancelling a changed expense asks first.
 d.r.fire(d.r.find(byType('FormFooter')),'onCancel');
 assert.equal(d.confirm().props.open,true);
});

test('a recurring expense shows its schedule, end date and plan summary through the shared formatters',t=>{
 const d=dialog(t,expense({frequency:'Monthly',amount:1234.5}),{editingCashFlow:true});
 assert.equal(d.labelled('Start date','DatePicker').props.max,undefined);
 const summary=d.r.all(node=>node.type==='p'&&node.props.className==='muted').map(text).find(line=>line.includes('This is a recurring plan'));
 assert.equal(summary,`${formatMoney(1234.5,'USD','en')} Every month from 15 September 2026. This is a recurring plan; it does not automatically create transactions or change account balances.`);
 const end=d.labelled('End date (optional)','DatePicker');
 assert.equal(end.props.min,'2026-09-15');
 d.r.fire(end,'onChange','2026-12-31');assert.equal(d.state.editing.end_date,'2026-12-31');
 d.r.fire(d.labelled('End date (optional)','DatePicker'),'onChange','');assert.equal(d.state.editing.end_date,null);
 const schedule=d.r.find(byType('ScheduleFields'));
 d.r.fire(schedule,'onChange','Custom',10);
 assert.equal(d.state.editing.frequency,'Custom');assert.equal(d.state.editing.recurrence_days,10);
 d.r.fire(d.labelled('End date (optional)','DatePicker'),'onChange','2027-01-01');
 d.r.fire(d.r.find(byType('ScheduleFields')),'onChange','Once',null);
 assert.equal(d.state.editing.end_date,null,'a one-time expense has no end date');
 d.r.fire(d.r.find(byType('ScheduleFields')),'onChange','Weekly',null);
 d.r.fire(d.labelled('End date (optional)','DatePicker'),'onChange','2027-02-01');
 d.r.fire(d.r.find(byType('ScheduleFields')),'onChange','Monthly',null);
 assert.equal(d.state.editing.end_date,'2027-02-01','changing between schedules keeps the end date');
});

test('the plan tab links a monthly plan, which supplies the name, kind and currency',t=>{
 const d=dialog(t,expense({currency:'USD',account_id:'acct'}),{editingCashFlow:true,expensePlans:plansState()});
 d.r.fire(d.r.find(byType('Tabs')),'onValueChange','plan');
 assert.equal(d.r.find(byType('Tabs')).props.value,'plan');
 assert.equal(d.state.editing.frequency,'Once');
 const plan=()=>d.labelled('Monthly expense plan','NativeSelect');
 assert.deepEqual(plan().children.map(text),['Choose a plan',`Groceries · Planned: ${formatMoney(400,'USD','en')}`,`Trips · Planned: ${formatMoney(300,'EUR','en')}`]);
 assert.equal(d.r.find(byType('AmountCurrencyFields')).props.currencyLocked,true);
 assert.equal(d.r.find(node=>node.type==='Button'&&node.props.className==='primary').props.disabled,true,'a plan must be chosen first');
 d.r.fire(plan(),'onChange',{target:{value:'p1'}});
 assert.equal(d.state.editing.expense_plan_id,'p1');assert.equal(d.state.editing.name,'Groceries');assert.equal(d.state.editing.kind,'Living expense');assert.equal(d.state.editing.account_id,'acct','the same currency keeps the account');
 d.r.fire(plan(),'onChange',{target:{value:'p2'}});
 assert.equal(d.state.editing.kind,'Other expense');assert.equal(d.state.editing.currency,'EUR');assert.equal(d.state.editing.account_id,null,'another currency clears the account');
 d.r.fire(plan(),'onChange',{target:{value:''}});
 assert.equal(d.state.editing.expense_plan_id,null);
 // Returning to the expense tab unlinks the plan and drops its name.
 d.r.fire(plan(),'onChange',{target:{value:'p1'}});
 d.r.fire(d.r.find(byType('Tabs')),'onValueChange','expense');
 assert.equal(d.state.editing.expense_plan_id,null);assert.equal(d.state.editing.name,'Groceries','without a linked plan prop the name is kept');
});

test('an expense linked to a plan opens on the plan tab; switching away clears the plan name it supplied',t=>{
 const linkedExpensePlan=plans[0];
 const d=dialog(t,expense({expense_plan_id:'p1',name:'Groceries'}),{editingCashFlow:true,expensePlans:plansState(),linkedExpensePlan});
 assert.equal(d.r.find(byType('Tabs')).props.value,'plan');
 assert.ok(d.r.find(node=>node.props.className==='muted expense-plan-hint'));
 assert.equal(d.r.find(node=>node.type==='Button'&&node.props.className==='primary').props.disabled,false);
 const date=d.labelled('Record date','DatePicker');
 assert.equal(date.props.min,'2026-01-01');
 d.r.fire(d.r.find(byType('Tabs')),'onValueChange','expense');
 assert.equal(d.state.editing.name,'');assert.equal(d.state.editing.expense_plan_id,null);
 const ended=dialog(t,expense({expense_plan_id:'p2'}),{editingCashFlow:true,expensePlans:plansState(),linkedExpensePlan:plans[1]});
 assert.equal(ended.labelled('Record date','DatePicker').props.max,'2026-09-30','today comes before the plan’s end');
 const old=dialog(t,expense({expense_plan_id:'p2'}),{editingCashFlow:true,expensePlans:plansState(),linkedExpensePlan:{...plans[1],end_date:'2026-06-30'}});
 assert.equal(old.labelled('Record date','DatePicker').props.max,'2026-06-30','a plan that ended earlier caps the date');
 const kept=dialog(t,expense({expense_plan_id:'p1',name:'Weekly shop'}),{editingCashFlow:true,expensePlans:plansState(),linkedExpensePlan});
 kept.r.fire(kept.r.find(byType('Tabs')),'onValueChange','expense');
 assert.equal(kept.state.editing.name,'Weekly shop','a name the person typed is kept');
});

test('plans that are loading or failed disable the plan choice and explain why',t=>{
 const loading=dialog(t,expense({expense_plan_id:'p1'}),{editingCashFlow:true,expensePlans:plansState({loading:true,plans:[]})});
 const select=loading.labelled('Monthly expense plan','NativeSelect');
 assert.equal(select.props.disabled,true);assert.equal(text(select.children[0]),'Loading plans…');
 const failed=dialog(t,expense({expense_plan_id:'p1'}),{editingCashFlow:true,expensePlans:plansState({error:'Plans are unavailable.'})});
 assert.equal(text(failed.r.find(node=>node.props.role==='alert')),'Plans are unavailable.');
 const planningFailed=dialog(t,expense(),{editingCashFlow:true,planning:planning({},{error:'Records are unavailable.'})});
 assert.equal(planningFailed.labelled('Category','NativeSelect').props.disabled,true);
 assert.ok(planningFailed.r.all(node=>node.props.role==='alert').map(text).every(message=>message==='Records are unavailable.'));
});

test('the debt tab lists outstanding debts and records a payment through the tracker or the mortgage form',async t=>{
 const debts=[record('loan','Loan',{amount:2500}),record('home','Mortgage',{amount:150000}),record('paid','Debt',{amount:0}),record('cash','Cash')];
 const payments=[],done=[],saved=[];
 const props={editingCashFlow:true,planning:planning({records:debts}),onDebtPayment:debt=>payments.push(debt.id),onMortgageSave:async payment=>saved.push(payment),onMortgageDone:()=>done.push(true),onDebtSaved:()=>done.push('saved')};
 const d=dialog(t,expense(),props);
 assert.deepEqual(d.r.all(byType('TabsTrigger')).map(text),['Plan','Expense','Debt / mortgage']);
 d.r.fire(d.r.find(byType('Tabs')),'onValueChange','debt');
 const choice=()=>d.labelled('Loans & debts','NativeSelect');
 assert.deepEqual(choice().children.map(text),['Choose a debt',`loan · Loan · ${formatMoney(2500,'USD','en')}`,`home · Mortgage · ${formatMoney(150000,'USD','en')}`],'paid-off debts and other records are not offered');
 assert.equal(d.r.find(byText('Button','Record payment')).props.disabled,true);
 assert.equal(d.r.all(node=>node.type==='Button'&&node.props.className==='primary').length,0,'the debt tab has no expense save');
 const submit=event();d.r.fire(d.r.find(byType('form')),'onSubmit',submit);
 assert.equal(submit.defaultPrevented,true);assert.equal(d.saves.length,0,'submitting on the debt tab saves no expense');
 d.r.fire(choice(),'onChange',{target:{value:'loan'}});
 const tracker=d.r.find(byType('InvestmentTracker'));
 assert.equal(tracker.props.initialType,'withdrawal');assert.equal(tracker.props.record.id,'loan');assert.equal(tracker.props.accountsReady,true);
 assert.equal(d.r.all(byType('FormFooter')).length,0,'the tracker brings its own actions');
 tracker.props.onSaved();tracker.props.onPayment();d.r.fire(tracker,'onClose');
 assert.deepEqual(done,['saved']);
 assert.equal(d.state.editing,null,'closing the tracker closes the dialog');
 // A mortgage uses the inline mortgage form.
 const m=dialog(t,expense(),props);
 m.r.fire(m.r.find(byType('Tabs')),'onValueChange','debt');
 m.r.fire(m.labelled('Loans & debts','NativeSelect'),'onChange',{target:{value:'home'}});
 const form=m.r.find(byType('MortgagePaymentDialog'));
 assert.equal(form.props.mortgage.id,'home');assert.equal(form.props.inline,true);
 await form.props.onSave({amount:900});assert.deepEqual(saved,[{amount:900}]);
 // A payment draft in progress makes the dialog ask before switching debts, tabs or closing.
 m.r.fire(form,'onDraftState',true,false);
 m.r.fire(m.r.find(byType('MortgagePaymentDialog')),'onDraftState',true,false);
 m.r.fire(m.labelled('Loans & debts','NativeSelect'),'onChange',{target:{value:'loan'}});
 assert.equal(m.confirm().props.open,true);
 m.r.fire(m.confirm(),'onClose');
 assert.equal(m.r.find(byType('MortgagePaymentDialog')).props.mortgage.id,'home','keeping the draft keeps the mortgage');
 m.r.fire(m.r.find(byType('Tabs')),'onValueChange','expense');
 m.r.fire(m.confirm(),'onConfirm');
 assert.equal(m.r.find(byType('Tabs')).props.value,'expense','discarding the draft switches tabs');
 m.r.fire(m.r.find(byType('Tabs')),'onValueChange','debt');
 m.r.fire(m.labelled('Loans & debts','NativeSelect'),'onChange',{target:{value:'home'}});
 m.r.fire(m.r.find(byType('MortgagePaymentDialog')),'onClose');
 assert.equal(m.state.editing,null);
 // A busy payment keeps the dialog busy.
 const busy=dialog(t,expense(),props);
 busy.r.fire(busy.r.find(byType('Tabs')),'onValueChange','debt');
 busy.r.fire(busy.labelled('Loans & debts','NativeSelect'),'onChange',{target:{value:'loan'}});
 busy.r.fire(busy.r.find(byType('InvestmentTracker')),'onDraftState',false,true);
 assert.equal(busy.labelled('Loans & debts','NativeSelect').props.disabled,true);
 assert.equal(busy.r.find(byType('DialogClose')).props.disabled,false,'the close button follows the page busy state');
 busy.r.fire(busy.r.find(byType('Dialog')),'onOpenChange',false);
 assert.ok(busy.state.editing,'a payment being saved keeps the dialog open');
});

test('the sample workspace records only mortgage payments; other debts hand off to the debt shortcut',t=>{
 const debts=[record('loan','Loan',{amount:2500}),record('home','Mortgage',{amount:150000})];
 const payments=[];
 const d=dialog(t,expense(),{editingCashFlow:true,demo:true,planning:planning({records:debts}),onDebtPayment:debt=>payments.push(debt.id)});
 d.r.fire(d.r.find(byType('Tabs')),'onValueChange','debt');
 d.r.fire(d.labelled('Loans & debts','NativeSelect'),'onChange',{target:{value:'loan'}});
 assert.ok(d.r.find(node=>node.type==='p'&&text(node)==='Debt repayments are available in your signed-in workspace.'));
 assert.equal(d.r.find(byText('Button','Record payment')).props.disabled,true);
 assert.ok(d.r.find(byType('FormFooter')),'the footer stays so the dialog can be closed');
 // Without an inline mortgage form, a mortgage hands off to the shortcut.
 d.r.fire(d.labelled('Loans & debts','NativeSelect'),'onChange',{target:{value:'home'}});
 const button=d.r.find(byText('Button','Record payment'));
 assert.equal(button.props.disabled,false);
 d.r.fire(button,'onClick');
 assert.deepEqual(payments,['home']);
 const nothing=dialog(t,expense(),{editingCashFlow:true,onDebtPayment:()=>{}});
 nothing.r.fire(nothing.r.find(byType('Tabs')),'onValueChange','debt');
 assert.ok(nothing.r.find(node=>node.type==='p'&&text(node)==='No outstanding debts. Add one in Loans & debts first.'));
 const loading=dialog(t,expense(),{editingCashFlow:true,onDebtPayment:()=>{},planning:planning({},{loading:true})});
 assert.equal(loading.r.find(byType('LoadingPlaceholder')).props.label,'Loading records…');
 const failed=dialog(t,expense(),{editingCashFlow:true,onDebtPayment:()=>{},planning:planning({},{error:'Records are unavailable.'})});
 assert.ok(failed.r.all(node=>node.props.role==='alert').length>=1);
 // A record-payment click before any debt is chosen does nothing.
 const none=dialog(t,expense(),{editingCashFlow:true,demo:true,planning:planning({records:debts}),onDebtPayment:debt=>payments.push(debt.id)});
 none.r.fire(none.r.find(byText('Button','Record payment')),'onClick');
 assert.deepEqual(payments,['home']);
});

test('a debt payment from a changed expense asks before leaving the expense',t=>{
 const debts=[record('home','Mortgage',{amount:150000})];
 const payments=[];
 const d=dialog(t,expense(),{editingCashFlow:true,demo:true,planning:planning({records:debts}),onDebtPayment:debt=>payments.push(debt.id)});
 d.r.fire(d.r.find(byType('AmountCurrencyFields')),'onAmountChange',99);
 d.r.fire(d.r.find(byType('Tabs')),'onValueChange','debt');
 d.r.fire(d.labelled('Loans & debts','NativeSelect'),'onChange',{target:{value:'home'}});
 d.r.fire(d.r.find(byText('Button','Record payment')),'onClick');
 assert.deepEqual(payments,[]);assert.equal(d.confirm().props.open,true);
 d.r.fire(d.confirm(),'onConfirm');
 assert.deepEqual(payments,['home']);
});
