import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadTS} from './helpers/load-ts.mjs';

const passthrough=({children})=>React.createElement('div',null,children);
function component(file,name){
 const states=[];let cursor=0;
 const loaded=loadTS(file,{
  react:{...React,useState(initial){const index=cursor++;if(!(index in states))states[index]=typeof initial==='function'?initial():initial;return [states[index],value=>{states[index]=value;}];}},
  'next/link':{__esModule:true,default:passthrough},
  '@/components/language-provider':{useLanguage:()=>({t:key=>key,locale:'en-US'})},
  '@/components/ui/button':{Button:passthrough},
  '@/components/discard-changes':{useDraftDialog:()=>({close(){},confirmation:null}),useDiscardChanges:()=>({close(){},confirmation:null}),useUnsavedNavigation:()=>null},
  '@/components/stop-schedule-dialog':{StopScheduleDialog:()=>null},
  '@/components/loading-placeholder':{LoadingPlaceholder:()=>null},
  '@/components/ui/checkbox':{Checkbox:()=>null},
  '@/components/ui/input':{Input:props=>React.createElement('input',props)},
  '@/components/formatted-number-input':{FormattedNumberInput:({value})=>React.createElement('input',{value,readOnly:true})},
  '@/components/ui/dialog':Object.fromEntries(['DialogHeader','Dialog','DialogTrigger','DialogContent','DialogTitle','DialogDescription','DialogClose'].map(name=>[name,passthrough])),
  '@/components/ui/alert-dialog':Object.fromEntries(['AlertDialog','AlertDialogContent','AlertDialogTitle','AlertDialogDescription','AlertDialogFooter','AlertDialogCancel','AlertDialogAction'].map(name=>[name,passthrough])),
  '@/components/ui/native-select':{NativeSelect:passthrough},
  '@/components/date-picker':{DatePicker:()=>React.createElement('button',null,'Month picker')},
  '@/components/category-badge':{CategoryBadge:({label})=>React.createElement('span',null,label)},
  '@/lib/deposit-interest':{depositToday:()=> '2026-09-18'},
 });
 const tree=props=>{cursor=0;return loaded[name](props);};
 return Object.assign(props=>renderToStaticMarkup(tree(props)),{tree});
}
test('monthly review follows header currency on rerender without changing stored records',()=>{
 const render=component('components/financial-review.tsx','MonthlyReview');
 const records=[
  {id:'usd',kind:'Salary',currency:'USD',amount:1234.125,date:'2026-09-05',frequency:'Once'},
  {id:'eur',kind:'Salary',currency:'EUR',amount:5678.375,date:'2026-09-05',frequency:'Once'},
 ];
 const before=JSON.stringify(records);
 const props={data:{records,categories:[]},tools:{data:{splits:[]}},snapshots:[],historyError:''};
 const usd=render({...props,currency:'USD'});
 assert.ok(usd.includes('$1,234'));assert.ok(!usd.includes('€5,678'));
 const eur=render({...props,currency:'EUR'});
 assert.ok(eur.includes('€5,678'));assert.ok(!eur.includes('$1,234'));
 assert.ok(!eur.includes('<select'));assert.ok(!eur.includes('>Currency<'));
 const empty=render({...props,currency:'UZS'});
 assert.ok(!empty.includes('5,678'));assert.ok(!empty.includes('1,234'));
 assert.equal(JSON.stringify(records),before);
 const failed=render({...props,currency:'EUR',historyError:'History unavailable',tools:{...props.tools,error:'Could not load',retry(){}}});
 assert.ok(failed.includes('Could not load'));assert.ok(failed.includes('€5,678'));
});

function find(node,predicate){
 if(!node||typeof node!=='object')return;
 if(['CurrencySelect','IncomeRecordForm','AmountCurrencyFields'].includes(node.type?.name))return find(node.type(node.props),predicate);
 if(predicate(node))return node;
 for(const child of React.Children.toArray(node.props?.children)){
  const result=find(child,predicate);if(result)return result;
 }
}
test('new expense plans inherit current header currency while editing preserves saved currency and precision',()=>{
 const render=component('components/expense-plans.tsx','ExpensePlans');
 const plan={id:'existing',name:'Groceries',category:'Groceries',currency:'USD',amount:12.125,start_date:'2026-09-01',end_date:null};
 const props={plans:[plan],month:'2026-09',currency:'EUR',loading:false,error:'',save:async()=>{},remove:async()=>{},onSpend(){},onRetry(){}};
 let tree=render.tree({...props,currency:'USD'});
 tree=render.tree(props);
 find(tree,node=>node.props?.onClick&&React.Children.toArray(node.props.children).includes('Add monthly plan')).props.onClick();
 tree=render.tree(props);
 assert.equal(find(tree,node=>node.type?.name==='CurrencyValue').props.currency,'EUR');
 find(tree,node=>node.props?.['aria-label']==='Edit {name}').props.onClick();
 tree=render.tree(props);
 assert.equal(find(tree,node=>node.type?.name==='CurrencyValue').props.currency,'USD');
 assert.equal(find(tree,node=>node.props?.value===12.125).props.value,12.125);
 assert.equal(plan.currency,'USD');assert.equal(plan.amount,12.125);
});

function expenseForm(props){
 const render=component('components/record-dialog.tsx','RecordDialog');
 const tree=render.tree(props);
 const form=find(tree,node=>node.type?.name==='ExpenseRecordForm');
 return form.type(form.props);
}
test('expense currency selector uses preferences, retains saved currency, and preserves amount and account',()=>{
 const editing={id:'expense',kind:'Other expense',currency:'EUR',amount:12.125,frequency:'Once',date:'2026-09-18',notes:'',account_id:'cash',account_exchange_rate:123,account_currency:'USD'};
 let updated;
 const props={editing,setEditing:value=>{updated=value;},rows:[editing],currencies:['USD','UZS'],recordKinds:[],expensePlans:{plans:[]},planning:{data:{records:[],categories:[]}}};
 const tree=expenseForm(props);
 const select=find(tree,node=>node.props?.value==='EUR'&&node.props?.onChange);
 assert.deepEqual(React.Children.toArray(select.props.children).map(node=>node.props.value),['USD','UZS','EUR']);
 select.props.onChange({target:{value:'UZS'}});
 assert.equal(updated.currency,'UZS');
 assert.equal(updated.amount,12.125);
 assert.equal(updated.account_id,'cash');
 assert.equal(updated.account_exchange_rate,null);
 assert.equal(updated.account_currency,null);
 assert.equal(editing.currency,'EUR');
 const fresh=expenseForm({...props,rows:[],editing:{...editing,currency:'USD'}});
 const freshSelect=find(fresh,node=>node.props?.value==='USD'&&node.props?.onChange);
 assert.deepEqual(React.Children.toArray(freshSelect.props.children).map(node=>node.props.value),['USD','UZS']);
 const busy=expenseForm({...props,busy:true});
 assert.equal(find(busy,node=>node.props?.value==='EUR'&&node.props?.onChange).props.disabled,true);
 const linked=expenseForm({...props,editing:{...editing,expense_plan_id:'plan'}});
 assert.equal(find(linked,node=>node.props?.value==='EUR'&&node.props?.onChange),undefined);
});

test('expense uses one category above amount, including user categories and safe fallback changes',()=>{
 const category={id:'category-food',name:'Eating out',direction:'expense'};
 const editing={id:'expense',kind:'Living expense',custom_category_id:category.id,currency:'USD',amount:12.125,frequency:'Once',date:'2026-09-18',notes:''};
 let updated;
 const props={editing,setEditing:value=>{updated=value;},rows:[editing],currencies:['USD'],recordKinds:[],expensePlans:{plans:[]},planning:{data:{records:[],categories:[category]}}};
 const tree=expenseForm(props);
 const selector=find(tree,node=>node.props?.value===category.id&&node.props?.onChange);
 assert.ok(selector);
 assert.ok(React.Children.toArray(selector.props.children).some(node=>node.props.children===category.name));
 const labels=[];
 const visit=node=>{if(!node||typeof node!=='object')return;if(node.type?.name==='AmountCurrencyFields')return visit(node.type(node.props));if(node.type==='label')labels.push(React.Children.toArray(node.props.children)[0]);for(const child of React.Children.toArray(node.props?.children))visit(child);};
 visit(tree);
 assert.equal(labels.filter(label=>label==='Category').length,1);
 assert.ok(labels.indexOf('Category')<labels.indexOf('Amount'));
 assert.ok(!labels.includes('Custom category'));
 selector.props.onChange({target:{value:'Other expense'}});
 assert.equal(updated.custom_category_id,null);assert.equal(updated.kind,'Other expense');assert.equal(updated.amount,12.125);
 selector.props.onChange({target:{value:category.id}});
 assert.equal(updated.custom_category_id,category.id);assert.equal(updated.kind,'Other expense');
 selector.props.onChange({target:{value:'unknown-category'}});assert.deepEqual(updated,props.editing);
 assert.equal(find(tree,node=>node.props?.href==='/settings#categories').props.children,'Manage categories in Settings');
 for(const state of [{loading:true},{error:'Unable to load'}]){
  const unavailable=expenseForm({...props,planning:{...props.planning,...state}});
  assert.equal(find(unavailable,node=>node.props?.value===category.id&&node.props?.onChange).props.disabled,true);
 }
});
test('Settings exposes added categories beside the category creation form',()=>{
 const render=component('components/transaction-tools-panel.tsx','TransactionToolsPanel');
 const html=render({tools:{data:{rules:[]},loading:false,error:'',retry(){},save:async()=>{}},categories:[{id:'food',name:'Eating out',direction:'expense'}],saveCategory:async()=>{}});
 assert.ok(html.includes('id="categories"'));
 assert.ok(html.includes('Eating out'));
 assert.ok(html.includes('Add expense category'));assert.ok(html.includes('Add income category'));
 assert.ok(!html.includes('Categorization rules'));assert.ok(!html.includes('Custom categories'));
});

test('income source selectors match category, supply the name, and keep Name for Other income',()=>{
 const records=[{id:'rental',name:'Apartment',kind:'Property'},{id:'cafe',name:'Cafe',kind:'Business'},{id:'plan',name:'Employer salary',kind:'Salary',frequency:'Monthly',date:'2026-01-18'}];
 for(const [kind,sourceId] of [['Rent income','rental'],['Business income','cafe'],['Salary','plan']]){
  let updated;
  const props={currencies:['USD'],rows:[],recordKinds:[],editingCashFlow:true,summary:[],expensePlans:{plans:[]},availableBusinesses:[],planning:{data:{records,categories:[]}},setEditing:value=>{updated=value;},editing:{id:'new',kind,currency:'USD',amount:12.125,frequency:'Once',notes:'',date:'2026-09-18'}};
  const render=component('components/record-dialog.tsx','RecordDialog');
  const tree=render.tree(props);
  const select=find(tree,node=>node.props?.onChange&&React.Children.toArray(node.props?.children).some(child=>child.props?.value===sourceId));
  assert.ok(select);assert.equal(select.props.required,true);
  assert.deepEqual(React.Children.toArray(select.props.children).map(node=>node.props.value),['',sourceId]);
  select.props.onChange({target:{value:sourceId}});
  assert.equal(updated.name,records.find(row=>row.id===sourceId).name);assert.equal(updated.amount,12.125);
  assert.equal(find(tree,node=>node.type?.name==='RecordNameInput'),undefined);
  const other=component('components/record-dialog.tsx','RecordDialog').tree({...props,editing:{...props.editing,kind:'Other income'}});
  assert.equal(find(other,node=>node.type?.name==='RecordNameInput').props.label,'Name');
 }
});

test('all income forms select preferred currencies and retain saved currency and precise amounts',()=>{
 for(const kind of ['Salary','Rent income','Business income','Other income']){
  let updated;
  const editing={id:'income',kind,currency:'EUR',amount:12.125,frequency:'Once',date:'2026-09-18',notes:'',business_id:'cafe',account_id:'cash',account_exchange_rate:2,account_rate_date:'2026-09-18',account_currency:'USD'};
  const props={editing,currencies:['USD','UZS'],rows:[editing],recordKinds:[kind],editingCashFlow:true,summary:[],expensePlans:{plans:[]},availableBusinesses:[{id:'cafe',name:'Cafe'}],planning:{data:{records:[],categories:[]}},setEditing:value=>{updated=value;}};
  const render=component('components/record-dialog.tsx','RecordDialog');
  const select=find(render.tree(props),node=>node.props?.value==='EUR'&&node.props?.onChange);
  assert.deepEqual(React.Children.toArray(select.props.children).map(node=>node.props.value),['USD','UZS','EUR']);
  select.props.onChange({target:{value:'UZS'}});
  assert.equal(updated.currency,'UZS');assert.equal(updated.amount,12.125);assert.equal(updated.account_id,'cash');assert.equal(updated.business_id,'cafe');
  assert.equal(updated.account_exchange_rate,null);assert.equal(updated.account_rate_date,null);assert.equal(updated.account_currency,null);
  const busy=find(render.tree({...props,busy:true}),node=>node.props?.value==='EUR'&&node.props?.onChange);
  assert.equal(busy.props.disabled,true);
 }
});

test('missing salary sources block receipts but allow creating the first salary plan',()=>{
 let editing={id:'new',kind:'Salary',name:'',currency:'USD',amount:0,frequency:'Once',date:'2026-09-18',notes:''};
 const render=component('components/income-record-form.tsx','IncomeRecordForm');
 const props={currencies:['USD'],rows:[],planning:{data:{records:[],categories:[]}},setEditing:value=>{editing=value;}};
 let tree=render.tree({...props,editing});
 assert.equal(find(tree,node=>node.props?.children==='Save income').props.disabled,true);
 const add=find(tree,node=>node.props?.children==='Add salary plan');add.props.onClick();
 tree=render.tree({...props,editing});
 assert.equal(editing.frequency,'Monthly');assert.equal(editing.income_source_id,null);assert.equal(editing.account_id,null);
 assert.equal(find(tree,node=>node.type?.name==='RecordNameInput').props.label,'Salary plan name');
 assert.ok(find(tree,node=>node.props?.children==='Save salary plan'));
 assert.equal(find(tree,node=>node.type?.name==='CashAccountField'),undefined);
});

test('reusable sources expose variable receipts and bonuses without scheduled dates',()=>{
 const variable={id:'freelance',name:'Freelance interviews',kind:'Other income',currency:'USD',mode:'variable',amount:null,frequency:null,start_date:null,end_date:null,archived:false};
 const fixed={...variable,id:'epam',name:'EPAM',kind:'Salary',mode:'fixed',amount:1000,frequency:'Monthly',start_date:'2026-01-18'};
 let editing={id:'receipt',name:variable.name,kind:'Other income',currency:'USD',amount:400,date:'2026-09-18',frequency:'Once',notes:'',earning_source_id:variable.id,payment_type:'regular'};
 const render=component('components/income-record-form.tsx','IncomeRecordForm');
 const props={currencies:['USD'],rows:[],planning:{data:{records:[],categories:[]}},earningSources:{sources:[variable,fixed],loading:false,error:'',save:async()=>{}},setEditing:value=>{editing=value;}};
 let tree=render.tree({...props,editing});
 assert.equal(find(tree,node=>node.type?.name==='RecordNameInput'),undefined);
 assert.equal(find(tree,node=>node.props?.min===fixed.start_date),undefined);
 const selector=find(tree,node=>node.props?.value==='freelance'&&node.props?.onChange);selector.props.onChange({target:{value:'epam'}});
 tree=render.tree({...props,editing});assert.equal(editing.earning_due_on,'2026-09-18');assert.equal(editing.amount,400);
 const type=find(tree,node=>node.props?.value==='regular'&&node.props?.onChange);type.props.onChange({target:{value:'bonus'}});
 tree=render.tree({...props,editing});assert.equal(editing.payment_type,'bonus');assert.equal(editing.earning_source_id,'epam');assert.equal(editing.kind,'Other income');assert.equal(editing.earning_due_on,null);
 assert.equal(find(tree,node=>node.props?.min===fixed.start_date),undefined);
});
test('variable source editor omits amount and date requirements',()=>{
 const initial={id:'new',name:'Interviews',kind:'Other income',currency:'USD',mode:'variable',amount:null,frequency:null,start_date:null,end_date:null,archived:false,linked_record_id:null};
 const render=component('components/income-sources-panel.tsx','IncomeSourceEditor');
 const tree=render.tree({initial,currencies:['USD'],records:[],save:async()=>{},close(){}});
 assert.equal(find(tree,node=>node.type?.name==='FormattedNumberInput'),undefined);
 assert.equal(find(tree,node=>node.type?.name==='DatePicker'),undefined);
 assert.equal(find(tree,node=>node.props?.children==='Save income source').props.disabled,false);
});

test('income receipt has one source choice, hides category and linked selectors, and retries loading',()=>{
 let retries=0;
 const fixed={id:'epam',name:'EPAM',kind:'Salary',currency:'USD',mode:'fixed',amount:1000,frequency:'Monthly',start_date:'2026-01-18',end_date:null,archived:false};
 let editing={id:'new',name:'',kind:'Other income',currency:'USD',amount:400.125,date:'2026-09-18',frequency:'Once',notes:''};
 const render=component('components/income-record-form.tsx','IncomeRecordForm');
 const props={currencies:['USD'],rows:[],planning:{data:{records:[],categories:[]}},earningSources:{sources:[fixed],loading:false,error:'',retry(){retries++;},save:async()=>{}},setEditing:value=>{editing=value;}};
 const label=(tree,text)=>find(tree,node=>node.type==='label'&&React.Children.toArray(node.props.children).includes(text));
 let tree=render.tree({...props,editing});
 assert.ok(label(tree,'Income source'));assert.equal(label(tree,'Category'),undefined);assert.equal(label(tree,'Repeats'),undefined);
 const sourceSelect=find(label(tree,'Income source'),node=>!!node.props?.onChange);
 sourceSelect.props.onChange({target:{value:'epam'}});
 tree=render.tree({...props,editing});
 assert.equal(editing.kind,'Salary');assert.equal(editing.amount,400.125);
 assert.equal(label(tree,'Category'),undefined);assert.equal(label(tree,'Linked salary'),undefined);assert.equal(find(tree,node=>node.type?.name==='RecordNameInput'),undefined);
 tree=render.tree({...props,editing,earningSources:{...props.earningSources,sources:[],error:'Could not load income sources.'}});
 assert.equal(label(tree,'Category'),undefined);assert.equal(label(tree,'Linked salary'),undefined);
 assert.ok(find(tree,node=>node.props?.children==='Save income').props.disabled);
 find(tree,node=>node.props?.children==='Retry').props.onClick();assert.equal(retries,1);
 find(label(tree,'Income source'),node=>!!node.props?.onChange).props.onChange({target:{value:''}});
 tree=render.tree({...props,editing,earningSources:{...props.earningSources,sources:[],error:'Could not load income sources.'}});
 assert.equal(editing.kind,'Other income');assert.equal(editing.earning_source_id,null);assert.equal(editing.earning_due_on,null);assert.equal(editing.frequency,'Once');assert.equal(editing.amount,400.125);
 assert.ok(find(tree,node=>node.type?.name==='RecordNameInput'));
 assert.ok(!find(tree,node=>node.props?.children==='Save income').props.disabled);
});

test('editing an existing linked receipt preserves its source without duplicate selectors',()=>{
 const rental={id:'rental',name:'Apartment',kind:'Property',currency:'USD',date:'2026-01-01',frequency:'Once'};
 let editing={id:'receipt',name:'Apartment',kind:'Rent income',income_source_id:'rental',currency:'USD',amount:500,date:'2026-09-18',frequency:'Once',notes:''};
 const original={...editing};
 const render=component('components/income-record-form.tsx','IncomeRecordForm');
 const props={currencies:['USD'],rows:[original],planning:{data:{records:[rental],categories:[]}},earningSources:{sources:[],loading:false,error:'',retry(){},save:async()=>{}},setEditing:value=>{editing=value;}};
 const tree=render.tree({...props,editing});
 assert.deepEqual(editing,original);
 assert.equal(find(tree,node=>node.type==='label'&&React.Children.toArray(node.props.children).includes('Linked rental')),undefined);
 const select=find(tree,node=>node.props?.value==='saved'&&node.props?.onChange);
 assert.ok(select);select.props.onChange({target:{value:''}});
 assert.equal(editing.income_source_id,null);assert.equal(editing.kind,'Other income');
 select.props.onChange({target:{value:'saved'}});
 assert.equal(editing.income_source_id,'rental');assert.equal(editing.kind,'Rent income');assert.equal(editing.name,'Apartment');
});

test('manage income sources is a prominent navigation button that closes the dialog and respects busy state',()=>{
 const render=component('components/income-record-form.tsx','IncomeRecordForm');
 let closed=0,prevented=0;
 const props={editing:{id:'new',kind:'Other income',frequency:'Once',currency:'USD',amount:0,name:'',notes:''},currencies:['USD'],rows:[],planning:{data:{records:[],categories:[]}},earningSources:{sources:[],loading:false,error:''},onNavigateToSources(){closed++;},setEditing(){throw Error('Navigation should close directly, not invoke the cancel guard');}};
 const tree=render.tree(props);
 const button=find(tree,node=>node.props?.asChild&&node.props?.variant==='outline');
 assert.ok(button.props.className.includes('min-h-11'));
 const link=find(button,node=>node.props?.href==='/income-expenses#income-sources');
 link.props.onNavigate({preventDefault(){prevented++;}});
 assert.equal(closed,1);assert.equal(prevented,0);
 const busyTree=render.tree({...props,busy:true});
 const busyLink=find(busyTree,node=>node.props?.href==='/income-expenses#income-sources');
 busyLink.props.onNavigate({preventDefault(){prevented++;}});
 assert.equal(closed,1);assert.equal(prevented,1);
});




test('new income categories appear in the receipt picker and save as income without losing precision',()=>{
 const render=component('components/income-record-form.tsx','IncomeRecordForm');
 const categories=[{id:'freelance',name:'Freelance',direction:'income'},{id:'leisure',name:'Leisure',direction:'expense'}];
 const editing={id:'receipt',name:'Work',kind:'Other income',amount:12.12345678,currency:'USD',frequency:'Once',date:'2026-09-18',notes:''};
 let updated;
 const props={editing,setEditing:value=>{updated=value;},rows:[],currencies:['USD'],planning:{data:{records:[],categories},loading:false,error:''},earningSources:{sources:[],loading:false,error:''}};
 const tree=render.tree(props),picker=find(tree,node=>node.type?.name==='IncomeSourcePicker');
 assert.ok(picker.props.options.some(option=>option.id==='freelance'&&option.categoryLabel==='Freelance'));
 assert.ok(!picker.props.options.some(option=>option.id==='leisure'));
 picker.props.onChange('freelance');assert.equal(updated.kind,'Other income');assert.equal(updated.custom_category_id,'freelance');assert.equal(updated.amount,editing.amount);
 const saved=render.tree({...props,editing:updated});assert.equal(find(saved,node=>node.type?.name==='IncomeSourcePicker').props.value,'freelance');
 picker.props.onChange('');assert.equal(updated.custom_category_id,null);
 const failed=render.tree({...props,planning:{...props.planning,error:'Unavailable'}});assert.equal(find(failed,node=>node.type?.name==='IncomeSourcePicker').props.disabled,true);
});
