import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadTS} from './helpers/load-ts.mjs';
const language={useLanguage:()=>({locale:'en-US',t:(text,values={})=>text.replace(/\{(\w+)\}/g,(_,key)=>values[key]??key)})};
const {MonthlyReview}=loadTS('components/financial-review.tsx',{'@/components/language-provider':language,'@/lib/deposit-interest':{depositToday:()=> '2026-09-18'}});
const props={data:{records:[],categories:[],goals:[],occurrences:[],activity:[]},tools:{data:{splits:[]},loading:false,error:'',retry(){}},snapshots:[],historyError:'',currency:'USD'};
const render=overrides=>renderToStaticMarkup(React.createElement(MonthlyReview,{...props,...overrides}));
const record=(id,amount,extra={})=>({id,name:id,amount,currency:'USD',kind:'Living expense',frequency:'Once',date:'2026-09-10',...extra});
test('monthly review retains totals without the spending category section',()=>{
 const html=render({data:{...props.data,records:[record('salary',9150,{kind:'Salary'}),record('expense',100.25),record('planned',500,{frequency:'Monthly'})]}});
 assert.match(html,/\$9,150/);assert.match(html,/\$100/);
 assert.match(html,/Actual spending/);assert.match(html,/Net-worth change/);
 assert.doesNotMatch(html,/Spending by category|No recorded spending|monthly-category|Add expense/);
 assert.match(html,/aria-label="How this review is calculated"[^>]*[\s\S]*?aria-haspopup="dialog"/);
});
test('net-worth history failures remain visible',()=>{
 const html=render({historyError:'Offline'});
 assert.match(html,/Net-worth history could not be loaded/);assert.doesNotMatch(html,/Two recorded balances are needed/);
});
test('monthly review copy is translated in EN, RU and UZ and uses shared controls and formatting',()=>{
 const source=fs.readFileSync('components/financial-review.tsx','utf8');
 assert.doesNotMatch(source,/toFixed|toLocaleString|new Intl\.|type="(?:number|date)"/);
 for(const lang of ['en','ru','uz']){const labels=JSON.parse(fs.readFileSync(`lib/locales/${lang}.json`));for(const [,key] of source.matchAll(/\bt\('([^']+)'/g))assert.ok(labels[key],`${lang}: ${key}`);}
});
test('monthly review selects a month without showing a day',()=>{
 const html=render({});
 assert.match(html,/class="date-picker-trigger"[^>]*aria-label="Month"[^>]*><span>September 2026<\/span>/);
 assert.doesNotMatch(html,/18 September 2026/);
});
test('review receives rates and repayment activity and flags incomplete conversion',()=>{
 const data={...props.data,records:[record('cash',100,{kind:'Cash'}),record('loan',1000,{kind:'Loan'}),record('groceries',125000,{currency:'UZS'})],activity:[{id:'paid',action:'repayment',target_id:'loan',account_id:'cash',amount:50,fee:0,occurred_on:'2026-09-10'}]};
 const html=render({data,market:{rates:{USD:1,UZS:12500}}});
 assert.match(html,/\$60/);assert.doesNotMatch(html,/totals are incomplete/);
 assert.match(render({data}),/Current or previous month totals are incomplete/);
});
test('monthly review passes tracker car payments into actual spending',()=>{
 const data={...props.data,records:[record('cash',1000,{kind:'Cash'}),record('car',5000,{kind:'Loan'})],investmentLinks:[{id:'paid',account_id:'cash',amount:-250,investment_history:{record_id:'car',event_type:'withdrawal',occurred_on:'2026-09-10'}}]};
 assert.match(render({data}),/\$250/);
});

test('remote monthly review normalizes undated lending and never presents failed reads as zero totals',()=>{
 const calls=[];let failure='',loading=false;
 const RemoteReview=loadTS('components/financial-review.tsx',{
  '@/components/language-provider':language,
  '@/lib/deposit-interest':{depositToday:()=> '2026-09-18'},
  '@/hooks/use-owner-resource':{useOwnerResource:(...args)=>{calls.push(args);return {data:{...props.data,records:[{id:'lent',kind:'Money lent',date:null,amount:12,frequency:'Once'},record('salary',75,{kind:'Salary'})]},error:failure,loading,retry(){}};}},
 }).MonthlyReview;
 const remote=()=>renderToStaticMarkup(React.createElement(RemoteReview,{...props,owner:'one',revision:4}));
 assert.match(remote(),/\$75/);assert.equal(calls[0][0],'/api/planning?scope=review&month=2026-09');assert.equal(calls[0][1],'one');assert.equal(calls[0][3],4);
 loading=true;assert.match(remote(),/Loading records/);assert.doesNotMatch(remote(),/\$0|\$75/);
 loading=false;failure='Could not load planning data.';assert.match(remote(),/role="alert"/);assert.doesNotMatch(remote(),/\$0|\$75/);
});
