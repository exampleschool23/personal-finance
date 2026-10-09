import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadTS} from './helpers/load-ts.mjs';

const {formatMoney,formatDate,formatMonthYear}=loadTS('lib/format.ts');
const realDeposit=loadTS('lib/deposit-interest.ts');
const today='2026-10-20',month='2026-10';
const t=(message,values={})=>message.replace(/\{(\w+)\}/g,(_,key)=>String(values[key]));
const resources=[];let remote={data:null,loading:false};let budget={state:{mode:'category',applyForward:false,categories:[],amounts:[]},loading:false};
const completion=new Map();
const cards=loadTS('components/dashboard-cards.tsx',{
 '@/components/language-provider':{useLanguage:()=>({locale:'en-US',t})},
 '@/lib/deposit-interest':{...realDeposit,depositToday:()=>today},
 '@/lib/expense-plans':{expensePlanMonth:()=>month},
 '@/hooks/use-owner-resource':{useOwnerResource:(url,owner,enabled,revision,empty)=>{resources.push({url,owner,enabled,revision});return {data:remote.data??empty,loading:remote.loading};}},
 '@/components/budget/budget-rows':{BudgetProgress:({row})=>React.createElement('meter',{'data-progress':row.progress.toFixed?String(Math.round(row.progress*100)):'','data-remaining':String(row.remaining)})},
 '@/lib/investment-goals':{investmentGoalCompletion:goal=>completion.get(goal.id)??null},
 'next/link':{__esModule:true,default:({children,href,...props})=>React.createElement('a',{href,...props},children)},
});
const render=(Component,props)=>renderToStaticMarkup(React.createElement(Component,props));
const plain=html=>html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
const entry=(id,kind,amount,date,extra={})=>({id,name:id,kind,amount,quantity:1,cost:0,rate:0,currency:'USD',frequency:'Once',date,notes:'',...extra});
const planning=(records=[],extra={})=>({records,categories:[],goals:[],occurrences:[],activity:[],...extra});

test('Transactions shows the newest income and spending with formatted dates and amounts',()=>{
 resources.length=0;
 const records=[entry('Groceries','Living expense',42.6,'2026-10-18'),entry('Salary','Salary',3000,'2026-10-19'),entry('Later','Living expense',9,'2026-10-25')];
 const html=render(cards.RecentTransactionsCard,{data:planning(records)});
 assert.ok(html.indexOf('Salary')<html.indexOf('Groceries'),'newest first');
 assert.doesNotMatch(html,/Later/,'future records wait');
 assert.match(plain(html),new RegExp(`Salary Salary · ${formatDate('2026-10-19','en-US')}`));
 assert.match(html,/<strong class="positive">\+\$3,000<\/strong>/);
 assert.ok(html.includes(`<strong>${formatMoney(42.6,'USD','en-US')}</strong>`),'spending in ink without a sign');
 assert.match(html,/href="\/transactions"/);
 assert.deepEqual(resources[0],{url:'/api/planning?scope=review&month=2026-10',owner:null,enabled:false,revision:0});
 assert.match(plain(render(cards.RecentTransactionsCard,{data:planning()})),/No transactions recorded this month or last\./);
 // Same-day records keep a stable order, by id.
 assert.deepEqual(cards.recentTransactions([entry('a','Living expense',1,'2026-10-01'),entry('c','Salary',1,'2026-10-01'),entry('b','Charity',1,'2026-10-01')],today).map(row=>row.id),['c','b','a']);
});

test('a signed-in owner reads the month from the server, with a loading state, and the sample workspace does not',()=>{
 resources.length=0;
 remote={data:planning([{...entry('Rent','Rent expense','800','2026-10-02'),quantity:'1',cost:'0',rate:'0'}]),loading:true};
 assert.match(plain(render(cards.RecentTransactionsCard,{owner:'me',revision:3,data:planning()})),/Loading records…/);
 assert.deepEqual(resources.at(-1),{url:'/api/planning?scope=review&month=2026-10',owner:'me',enabled:true,revision:3});
 remote.loading=false;
 const html=render(cards.RecentTransactionsCard,{owner:'me',data:planning()});
 assert.match(html,/<strong>\$800<\/strong>/,'server amounts are normalised to numbers');
 const demo=render(cards.RecentTransactionsCard,{owner:'me',demo:true,data:planning([entry('Coffee','Living expense',4,'2026-10-10')])});
 assert.match(demo,/Coffee/);assert.doesNotMatch(demo,/Rent/);
 assert.equal(resources.at(-1).enabled,false);
 remote={data:null,loading:false};
});

test('Goals shows savings, net-worth and investment goals with progress and targets',()=>{
 completion.set('shares',62.5);
 const goals=[
  {id:'trip',name:'Trip',kind:'savings',account_id:'cash',target:2000,allocated:500,target_date:'2027-06-01',archived:false},
  {id:'shares',name:'Shares',kind:'investment',target:0,allocated:0,target_date:null,archived:false},
  {id:'later',name:'Later',kind:'savings',target:10,allocated:0,target_date:null,archived:false},
 ];
 const html=render(cards.GoalsCard,{goals,order:['trip','shares'],data:{records:[{id:'cash',currency:'EUR'}]},currency:'USD',netWorth:()=>null});
 assert.match(plain(html),new RegExp(`Trip ${formatMoney(500,'EUR','en-US')}`));
 assert.match(plain(html),/€2,000 target · 1 June 2027/);
 assert.match(html,/width:25%/);
 assert.match(plain(html),/Shares 62\.5%|Shares 63%/);
 assert.match(html,/width:62\.5%/);
 assert.doesNotMatch(html,/Later/,'two goals at most');
 completion.clear();
 const unknown=render(cards.GoalsCard,{goals:[{...goals[1]},{id:'worth',name:'Worth',kind:'net_worth',currency:'USD',target:0,allocated:0,target_date:null,archived:false}],order:[],data:{records:[]},currency:'USD',netWorth:()=>null});
 assert.match(plain(unknown),/Shares — No target date/,'an investment goal without progress');
 assert.match(plain(unknown),/Worth — \$0 target/,'a net worth that cannot be converted');
 assert.equal((unknown.match(/width:0%/g)||[]).length,2);
 const capped=render(cards.GoalsCard,{goals:[{id:'worth',name:'Worth',kind:'net_worth',currency:'USD',target:100,allocated:0,target_date:null,archived:false}],order:[],data:{records:[]},currency:'USD',netWorth:()=>250});
 assert.match(capped,/width:100%/,'progress is capped');
 const zero=render(cards.GoalsCard,{goals:[{id:'z',name:'Zero',kind:'savings',target:0,allocated:5,target_date:null,archived:false}],order:[],data:{records:[]},currency:'USD',netWorth:()=>0});
 assert.match(zero,/width:0%/,'no target gives no progress');
 const empty=render(cards.GoalsCard,{goals:[],order:[],data:{records:[]},currency:'USD',netWorth:()=>0});
 assert.match(plain(empty),/Set a goal to watch your savings grow\. Add goal/);
});

const amount=(category_key,value,extra={})=>({category_key,month,amount:value,currency:'USD',applies_forward:false,...extra});
test('Budget compares this month’s spending with the plan and lists the categories closest to their limit',()=>{
 resources.length=0;
 budget={state:{mode:'category',applyForward:false,categories:[],amounts:[amount('Living expense',500),amount('Rent expense',1000),amount('Charity',50),amount('pets',40),amount('Salary',4000)]},loading:false};
 const records=[entry('Food','Living expense',620,'2026-10-05'),entry('Rent','Rent expense',1000,'2026-10-01'),entry('Gift','Charity',10,'2026-10-03'),entry('Vet','Other expense',55,'2026-10-04',{custom_category_id:'pets'}),entry('Pay','Salary',4000,'2026-10-01')];
 const html=render(cards.BudgetCard,{budget,data:planning(records,{categories:[{id:'pets',name:'Pets',direction:'expense'}]}),currency:'USD',market:null,splits:[]});
 const text=plain(html);
 assert.match(html,/aria-label="Budget"/);
 assert.match(text,new RegExp(`Budget ${formatMonthYear(month,'en-US')}`));
 assert.equal(formatMonthYear(month,'en-US'),'October 2026');
 assert.match(text,/\$1,685 of \$1,590/,'income budgets are left out');
 assert.ok(html.includes(`data-tone="negative">${formatMoney(95,'USD','en-US')} over`));
 // Three categories, the most used first: Pets (138%), Living expense (124%), Rent (100%); Charity is left out.
 const list=html.slice(html.indexOf('dashboard-budget-list'));
 assert.ok(list.indexOf('Pets')<list.indexOf('Living expense')&&list.indexOf('Living expense')<list.indexOf('Rent expense'));
 assert.doesNotMatch(list,/Charity/,'three at most');
 assert.ok(list.includes(`data-tone="negative">${formatMoney(-120,'USD','en-US')}</strong>`),'an overspent category');
 assert.ok(list.includes(`<strong data-tone="neutral">${formatMoney(0,'USD','en-US')}</strong>`),'a category spent exactly to its limit');
 // Six months of history are read for the averages.
 assert.equal(resources[0].url,'/api/planning?scope=budget&month=2026-10&from=2026-04');
});

test('Budget in flex mode shares one bucket among flexible categories and lists fixed ones only',()=>{
 budget={state:{mode:'flex',applyForward:false,categories:[],amounts:[amount('flex:flexible',100),amount('Rent expense',300)]},loading:false};
 const data=planning([entry('Rent','Rent expense',300,'2026-10-01'),entry('Food','Living expense',150,'2026-10-02')]);
 const html=render(cards.BudgetCard,{budget,data,currency:'USD',market:{rates:{USD:1}},splits:[]});
 assert.match(plain(html),/\$450 of \$400 \$50 over/);
 const list=html.slice(html.indexOf('dashboard-budget-list'));
 assert.match(list,/Rent expense/);
 assert.doesNotMatch(list,/Living expense/,'flexible categories share the bucket in flex mode');
 budget={state:{mode:'flex',applyForward:false,categories:[],amounts:[amount('Rent expense',300)]},loading:false};
 assert.match(plain(render(cards.BudgetCard,{budget,data,currency:'USD',market:null,splits:[]})),/\$450 of \$300/,'no flexible bucket counts as zero');
});

test('Budget waits for loading, falls back to the market rate and invites a plan when empty',()=>{
 budget={state:{mode:'category',applyForward:false,categories:[],amounts:[]},loading:true};
 assert.match(plain(render(cards.BudgetCard,{budget,data:planning(),currency:'USD',market:null,splits:[]})),/Loading records…/);
 budget={...budget,loading:false};
 remote={data:planning(),loading:true};
 assert.match(plain(render(cards.BudgetCard,{budget,owner:'me',data:planning(),currency:'USD',market:null,splits:[]})),/Loading records…/);
 remote={data:planning([{...entry('Food','Living expense','30','2026-10-02'),quantity:'1',cost:'0',rate:'0'}]),loading:false};
 budget={state:{mode:'category',applyForward:false,categories:[],amounts:[amount('Living expense',100)]},loading:false};
 const html=render(cards.BudgetCard,{budget,owner:'me',data:planning(),currency:'USD',market:{fx:{rate:{USD:1}}},splits:[]});
 assert.match(plain(html),/\$30 of \$100/,'a signed-in owner reads spending from the server');
 remote={data:null,loading:false};
 budget={state:{mode:'category',applyForward:false,categories:[],amounts:[]},loading:false};
 const empty=plain(render(cards.BudgetCard,{budget,data:planning(),currency:'USD',market:null,splits:[]}));
 assert.match(empty,/Plan this month’s spending to track it here\. Set up a budget/);
});
