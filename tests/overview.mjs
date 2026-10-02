import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadTS} from './helpers/load-ts.mjs';
const {assetAllocation,overviewIndicators,changePercent,nextPayments}=loadTS('lib/overview.ts');
const entry=(id,kind,amount,extra={})=>({id,name:id,kind,amount,quantity:1,cost:0,rate:0,currency:'USD',frequency:'Once',date:'2026-09-01',...extra});

test('allocation lists only owned asset kinds, largest first, with precise shares',()=>{
 const result=assetAllocation([entry('cash','Cash',2500),entry('btc','Crypto',50,{quantity:10,cost:40}),entry('home','Property',7000),entry('loan','Loan',4000),entry('salary','Salary',900),entry('empty','Deposit',0)]);
 assert.deepEqual(result.map(item=>item.kind),['Property','Cash','Crypto']);
 assert.deepEqual(result.map(item=>item.total),[7000,2500,500]);
 assert.equal(result.reduce((sum,item)=>sum+item.share,0),100);
 assert.equal(result[1].share,25);
 assert.deepEqual(assetAllocation([entry('loan','Loan',4000)]),[]);
});

test('indicators use a dash-ready null when a ratio has no base',()=>{
 assert.deepEqual(overviewIndicators([entry('loan','Loan',4000)]),{cash:0,cashShare:null,debtToAssets:null,investmentGain:null,investmentReturn:null});
 const result=overviewIndicators([entry('cash','Cash',2000),entry('stock','Stock',150,{quantity:20,cost:100}),entry('gift','Crypto',5000,{cost:0}),entry('loan','Debt',2500)]);
 assert.equal(result.cash,2000);
 assert.equal(result.cashShare,20);
 assert.equal(result.debtToAssets,25);
 // Holdings without a purchase price cannot produce a gain.
 assert.equal(result.investmentGain,1000);
 assert.equal(result.investmentReturn,50);
 assert.equal(overviewIndicators([entry('stock','Stock',80,{quantity:10,cost:100})]).investmentGain,-200);
});

test('period change compares against the opening value',()=>{
 assert.equal(changePercent(1100,100),10);
 assert.equal(changePercent(900,-100),-10);
 assert.equal(changePercent(100,null),null);
 assert.equal(changePercent(100,100),null);
 assert.equal(changePercent(-50,100),null);
});

test('next payments show overdue items first and keep the limit',()=>{
 const due=(name,date,overdue)=>({key:name+date,record:entry(name,'Other expense',10),date,overdue,type:'scheduled'});
 const items=[due('rent','2026-10-01',false),due('gym','2026-09-29',false),due('tax','2026-09-10',true),due('net','2026-09-29',false),due('old','2026-08-01',true)];
 assert.deepEqual(nextPayments(items,4).map(item=>item.record.name),['old','tax','gym','net']);
 assert.equal(items[0].record.name,'rent');
});

test('overview text is translated and uses shared formatters',()=>{
 const sources=['components/overview-page.tsx','components/portfolio-overview.tsx','components/income-history-chart.tsx','components/investment-comparison.tsx'].map(file=>fs.readFileSync(file,'utf8'));
 for(const language of ['en','ru','uz']){
  const labels=JSON.parse(fs.readFileSync(`lib/locales/${language}.json`,'utf8'));
  for(const source of sources)for(const [,,message] of source.matchAll(/\bt\((["'])((?:(?!\1).)+)\1/g))assert.ok(labels[message],`${language}: ${message}`);
 }
 for(const source of sources.slice(0,3)){
  assert.ok(!/new Intl\.|toLocaleString|toFixed\(/.test(source));
  assert.ok(!source.includes('type="date"'));
 }
});

test('income over time opens on the 12-month range',()=>{
 const source=fs.readFileSync('components/income-history-chart.tsx','utf8');
 assert.match(source,/const \[months,setMonths\]=useState\(12\)/);
 assert.match(source,/\[3,6,12\]\.map/);
});

test('income over time invites the first income instead of drawing an empty chart',async()=>{
 const React=(await import('react')).default,{renderToStaticMarkup}=await import('react-dom/server');
 const language={useLanguage:()=>({locale:'en-US',t:(text,values={})=>text.replace(/\{(\w+)\}/g,(_,key)=>values[key]??key)})};
 const {IncomeHistoryChart}=loadTS('components/income-history-chart.tsx',{'@/components/language-provider':language,'next/link':{__esModule:true,default:({children})=>React.createElement('a',null,children)}});
 const render=props=>renderToStaticMarkup(React.createElement(IncomeHistoryChart,{events:[],currency:'USD',rates:{USD:1},today:'2026-10-01',onAddIncome:()=>{},...props}));
 const empty=render({records:[entry('cash','Cash',500)],incomeRecords:[]});
 assert.match(empty,/No income yet/);assert.match(empty,/Add income<\/button>/);
 assert.doesNotMatch(empty,/Monthly estimate|Recorded income in this period|recharts/);
 // Any recorded or planned income brings the chart back.
 const salary=entry('salary','Salary',1200,{frequency:'Monthly'});
 const filled=render({records:[salary],incomeRecords:[salary]});
 assert.doesNotMatch(filled,/No income yet/);assert.match(filled,/Recorded income in this period/);
 assert.doesNotMatch(render({records:[],incomeRecords:[],onAddIncome:undefined}),/<button/,'without an add action the guidance stands alone');
});

test('portfolio over time invites the first investment instead of a flat line at zero',async()=>{
 const React=(await import('react')).default,{renderToStaticMarkup}=await import('react-dom/server');
 const language={useLanguage:()=>({locale:'en-US',t:(text,values={})=>text.replace(/\{(\w+)\}/g,(_,key)=>values[key]??key)})};
 const {InvestmentComparison}=loadTS('components/investment-comparison.tsx',{'@/components/language-provider':language,'next/link':{__esModule:true,default:({children,href})=>React.createElement('a',{href},children)}});
 const render=records=>renderToStaticMarkup(React.createElement(InvestmentComparison,{history:{records,events:[]},today:'2026-10-01',currency:'UZS',market:null,demo:false,windowStart:'2026-09-01',points:[],profile:null,profileError:'',trackingStart:null,onTrackingStartChange:()=>{},summary:React.createElement('p',null,'summary')}));
 const empty=render([entry('wallet','Cash',1165000,{currency:'UZS'})]);
 assert.match(empty,/No investments yet/);assert.match(empty,/href="\/assets"/);assert.match(empty,/summary/);
 assert.doesNotMatch(empty,/Tracking since|comparison-legend/);
 assert.doesNotMatch(render([entry('btc','Crypto',60000,{quantity:.1})]),/No investments yet/);
 assert.doesNotMatch(render([entry('cash','Cash',500,{is_investment:true})]),/No investments yet/,'an investment cash account counts');
 // QA: "Start of this year" was saved but the chart said "Tracking since" the first investment day.
 const chosen=renderToStaticMarkup(React.createElement(InvestmentComparison,{history:{records:[entry('btc','Crypto',60000,{quantity:.1,date:'2026-09-20'})],events:[]},today:'2026-10-01',currency:'USD',market:null,demo:false,windowStart:'2026-01-01',points:[],profile:null,profileError:'',trackingStart:'2026-01-01',onTrackingStartChange:()=>{}}));
 assert.match(chosen,/Tracking since.*1 January 2026/,'the chosen start is shown, not moved to the first investment');
 assert.match(fs.readFileSync(new URL('../components/investment-comparison.tsx',import.meta.url),'utf8'),/min=\{benchmarkHistoryStart\} max=\{today\} presets=\{pastDatePresets\}/,'any past day can be chosen, with past presets');
});

test('the dashboard lists the newest real transactions and the top open goals',()=>{
 const {recentTransactions,topGoals}=loadTS('components/dashboard-cards.tsx',{'@/components/language-provider':{useLanguage:()=>({locale:'en-US',t:text=>text})}});
 const rows=[entry('a','Living expense',10,{date:'2026-10-01'}),entry('b','Salary',900,{date:'2026-10-02'}),entry('c','Charity',5,{date:'2026-09-30'}),
  entry('future','Living expense',7,{date:'2026-10-09'}),entry('plan','Rent expense',500,{date:'2026-09-01',frequency:'Monthly'}),entry('cash','Cash',100,{date:'2026-10-02'})];
 assert.deepEqual(recentTransactions(rows,'2026-10-02').map(row=>row.id),['b','a','c'],'newest first; no future, planned or balance records');
 assert.equal(recentTransactions(rows,'2026-10-02',1).length,1);
 const goal=(id,extra={})=>({id,name:id,account_id:null,target:100,allocated:10,target_date:null,archived:false,...extra});
 const goals=[goal('low',{funding_priority:3}),goal('done',{completed_on:'2026-09-01'}),goal('old',{archived:true}),goal('top',{funding_priority:1}),goal('mid',{funding_priority:2})];
 assert.deepEqual(topGoals(goals,['mid','done','low','top']).map(item=>item.id),['mid','low'],'the person\'s own goal order, not funding priority');
 assert.deepEqual(topGoals(goals).map(item=>item.id),['low','top'],'without a saved order, the list order');
});

test('the dashboard Goals card follows the goal order and shows a net-worth goal at the current net worth',async()=>{
 const React=(await import('react')).default,{renderToStaticMarkup}=await import('react-dom/server');
 // QA: "Net worth target $0" while net worth was -$123,054, and the first goal (no target date) was left out.
 const {GoalsCard}=loadTS('components/dashboard-cards.tsx',{'@/components/language-provider':{useLanguage:()=>({locale:'en-US',t:(text,values={})=>text.replace(/\{(\w+)\}/g,(_,key)=>values[key])})},'next/link':{__esModule:true,default:({children,href})=>React.createElement('a',{href},children)}});
 const goals=[{id:'worth',name:'Net worth target',kind:'net_worth',currency:'USD',account_id:null,target:500000,allocated:0,target_date:'2030-01-01',archived:false},
  {id:'fund',name:'QA Emergency fund',kind:'savings',currency:'USD',account_id:'cash',target:10000,allocated:2500,target_date:null,archived:false}];
 const html=renderToStaticMarkup(React.createElement(GoalsCard,{goals,order:['fund','worth'],data:{records:[{id:'cash',currency:'USD'}]},currency:'USD',netWorth:code=>code==='USD'?-123054.4:null}));
 assert.ok(html.indexOf('QA Emergency fund')<html.indexOf('Net worth target'),'user order');
 assert.match(html,/-\$123,054/);assert.doesNotMatch(html,/\$0</);
 assert.match(html,/\$2,500/);assert.match(html,/\$10,000 target</);
 assert.match(html,/width:0%/,'a negative net worth shows no progress');
});
