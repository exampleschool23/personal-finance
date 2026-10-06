import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadTS} from './helpers/load-ts.mjs';

const {formatMoney,formatDate,formatPercent}=loadTS('lib/format.ts');
const {depositToday}=loadTS('lib/deposit-interest.ts');
const {shiftDay}=loadTS('lib/calendar-days.ts');
const today=depositToday();
const t=(message,values={})=>message.replace(/\{(\w+)\}/g,(_,key)=>String(values[key]));
const {useOverviewCards,OverviewHeading}=loadTS('components/overview-page.tsx',{
 '@/components/language-provider':{useLanguage:()=>({locale:'en-US',t,language:'en'})},
 '@/components/presentation-foundation/top-bar-slot':{useTopBarSlot:()=>null},
 'next/link':{__esModule:true,default:({children,href,...props})=>React.createElement('a',{href,...props},children)},
});
const entry=(id,kind,amount,extra={})=>({id,name:id,kind,amount,quantity:1,cost:0,rate:0,currency:'USD',frequency:'Once',date:'2026-09-01',notes:'',...extra});
const money=amount=>formatMoney(amount,'USD','en-US');
const forecast={forecast:1234.6,estimatedIncome:300,otherIncome:2500.4,plannedIncome:2800.4,monthlyExpenses:1565.8,mortgagePayments:0,loanPayments:0};
function cards(props){
 let result;
 function Probe(){result=useOverviewCards({entries:[],currency:'USD',excludedCurrencies:[],forecast,forecastReady:true,planning:null,...props});return null;}
 renderToStaticMarkup(React.createElement(Probe));
 const html=key=>renderToStaticMarkup(result[key]);
 return {commitments:html('commitments'),allocation:html('allocation'),upcoming:html('upcoming')};
}
const plain=html=>html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');

test('monthly commitments show whole amounts, the left-over figure and its sign',()=>{
 const ready=cards({});
 assert.match(plain(ready.commitments),new RegExp(`Monthly commitments \\${money(1234.6)} left`));
 assert.equal(money(1234.6),'$1,235');
 assert.match(ready.commitments,/<strong class="positive">\$2,800<\/strong>/,'income is green');
 assert.match(plain(ready.commitments),/Expenses \$1,566/);
 assert.match(plain(ready.commitments),/Estimated mortgage payments \$0/);
 assert.doesNotMatch(ready.commitments,/Estimated loan payments/,'no loan row without loan payments');
 assert.match(ready.commitments,/Left after expenses<\/span><strong>\$1,235<\/strong><\/div>/,'a surplus is not coloured');
 const loans=cards({forecast:{...forecast,forecast:-420,loanPayments:510.2}});
 assert.match(plain(loans.commitments),/Estimated loan payments \$510/);
 assert.ok(loans.commitments.includes(`class="negative">${formatMoney(-420,'USD','en-US')}</strong>`),'a shortfall is red');
 const waiting=cards({forecastReady:false});
 assert.doesNotMatch(plain(waiting.commitments),/ left/,'no headline figure before the forecast is ready');
 assert.match(plain(waiting.commitments),/Expenses — /);
 assert.match(plain(waiting.commitments),/Left after expenses —/);
});

test('the commitments hint explains asset and other income with shared formatting',()=>{
 let result;
 function Probe(){result=useOverviewCards({entries:[],currency:'EUR',excludedCurrencies:[],forecast,forecastReady:true,planning:null});return null;}
 renderToStaticMarkup(React.createElement(Probe));
 const hint=result.commitments.props.children[0].props.hint;
 const text=plain(renderToStaticMarkup(hint));
 assert.match(text,new RegExp(`Estimated asset income: ${formatMoney(300,'EUR','en-US').replace(/[$€]/,'.')}`));
 assert.match(text,new RegExp(`Other recurring income: ${formatMoney(2500.4,'EUR','en-US').replace(/[$€]/,'.')}`));
 assert.match(text,/Yearly records are divided by 12\./);
});

test('asset allocation lists holdings by size with their share and mentions outstanding debt',()=>{
 const entries=[entry('cash','Cash',750),entry('stock','Stock',250),entry('loan','Loan',400)];
 const {allocation}=cards({entries,excludedCurrencies:['GBP']});
 assert.match(plain(allocation),new RegExp(`Asset allocation \\${money(1000)}`));
 assert.ok(allocation.indexOf('Cash')<allocation.indexOf('Stock'),'largest first');
 assert.match(plain(allocation),new RegExp(`Cash \\$750 ${formatPercent(75,'en-US',1,1)}`));
 assert.match(plain(allocation),/Stock \$250 25\.0%/);
 assert.match(allocation,/role="img" aria-label="Asset allocation"/);
 assert.match(allocation,/style="width:75%;background:/);
 assert.match(allocation,/href="\/assets"/);
 assert.match(allocation,/GBP/,'currencies left out of the total are named');
 const {allocation:empty}=cards({});
 assert.match(plain(empty),/Add your first asset to see its allocation\./);
 assert.doesNotMatch(empty,/allocation-bar/);
});

test('the outstanding debt hint appears only with debt',()=>{
 let result;
 function Probe({entries}){result=useOverviewCards({entries,currency:'USD',excludedCurrencies:[],forecast,forecastReady:true,planning:null});return null;}
 renderToStaticMarkup(React.createElement(Probe,{entries:[entry('loan','Loan',400.4)]}));
 assert.equal(plain(renderToStaticMarkup(result.allocation.props.children[0].props.hint)).trim(),'Outstanding debt: $400');
 renderToStaticMarkup(React.createElement(Probe,{entries:[entry('cash','Cash',5)]}));
 assert.equal(result.allocation.props.children[0].props.hint,undefined);
});

test('upcoming payments put overdue ones first, show formatted dates and colour income',()=>{
 const soon=shiftDay(today,5),late=shiftDay(today,-3);
 const records=[
  entry('Car loan','Loan',320.7,{date:soon}),
  entry('Old debt','Debt',99,{date:late}),
  entry('Salary','Salary',3000,{date:shiftDay(today,2),frequency:'Monthly'}),
 ];
 const {upcoming}=cards({planning:{records,occurrences:[],categories:[],goals:[],activity:[],debtPayments:[]}});
 const text=plain(upcoming);
 assert.match(text,/Upcoming payments 1 overdue/,'an overdue item is counted as overdue, never as due soon');
 // Live QA, 6 October 2026: "5 due soon" with 101 overdue items; the pill counted only the five rows shown.
 const backlog=Array.from({length:7},(_,i)=>entry('Debt '+i,'Debt',10,{date:shiftDay(today,-(i+1))}));
 assert.match(plain(cards({planning:{records:backlog,occurrences:[],categories:[],goals:[],activity:[],debtPayments:[]}}).upcoming),/Upcoming payments 7 overdue/);
 const ahead=cards({planning:{records:[records[0],records[2]],occurrences:[],categories:[],goals:[],activity:[],debtPayments:[]}});
 assert.match(plain(ahead.upcoming),/Upcoming payments \d+ due soon/);
 assert.ok(upcoming.indexOf('Old debt')<upcoming.indexOf('Car loan'),'overdue first');
 assert.match(upcoming,new RegExp(`<small class="negative">Overdue · ${formatDate(late,'en-US')}</small>`));
 assert.match(upcoming,new RegExp(`<small>${formatDate(soon,'en-US')}</small><\\/span><strong>\\$321</strong>`));
 assert.match(upcoming,/<strong class="positive">\+\$3,000<\/strong>/,'income is green with a plus');
 assert.match(upcoming,/href="\/upcoming"/);
 const none=cards({planning:{records:[],occurrences:[],categories:[],goals:[],activity:[]}});
 assert.match(plain(none.upcoming),/Nothing is due in the next 31 days\./);
 assert.doesNotMatch(plain(none.upcoming),/due soon/);
 assert.match(plain(cards({}).upcoming),/Loading records…/,'planning still loading');
});

test('the heading greets first visits and returning visitors, with or without a name',()=>{
 const heading=props=>plain(renderToStaticMarkup(React.createElement(OverviewHeading,props)));
 assert.match(heading({name:'Ana',firstVisit:true}),/Welcome, Ana!/);
 assert.match(heading({firstVisit:true}),/Welcome!/);
 assert.match(heading({name:'Ana'}),/Welcome back, Ana!/);
 assert.match(heading({children:React.createElement('button',null,'Add')}),/Welcome back! .*Add/);
});
