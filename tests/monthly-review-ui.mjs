import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadTS} from './helpers/load-ts.mjs';
const language={useLanguage:()=>({locale:'en-US',t:(text,values={})=>text.replace(/\{(\w+)\}/g,(_,key)=>values[key]??key)})};
const {MonthlyReview}=loadTS('components/financial-review.tsx',{'@/components/language-provider':language,'@/lib/deposit-interest':{depositToday:()=> '2026-09-18'}});
const props={data:{records:[],categories:[],goals:[],occurrences:[],activity:[]},tools:{data:{splits:[]},loading:false,error:'',retry(){}},snapshots:[],historyError:'',currency:'USD',onAddExpense(){}};
const render=overrides=>renderToStaticMarkup(React.createElement(MonthlyReview,{...props,...overrides}));
const record=(id,amount,extra={})=>({id,name:id,amount,currency:'USD',kind:'Living expense',frequency:'Once',date:'2026-09-10',...extra});
test('empty spending explains the selected period and currency and offers adding an expense',()=>{
 const html=render({data:{...props.data,records:[record('salary',9150,{kind:'Salary'}),record('planned',500,{frequency:'Monthly'})]}});
 assert.match(html,/\$9,150/);assert.match(html,/No recorded spending this month/);
 assert.match(html,/No expense transactions were recorded in USD for September 2026/);
 assert.match(html,/Recurring plans appear here only after a payment is recorded/);
 assert.match(html,/Add expense/);assert.doesNotMatch(html,/<ul/);
 assert.match(html,/<details class="monthly-review-method"><summary>/);
});
test('category breakdown reconciles splits while excluding recurring, future and other-currency expenses',()=>{
 const html=render({data:{...props.data,categories:[{id:'food',name:'Food'},{id:'travel',name:'Travel'}],records:[record('split',100.25),record('rent',200,{kind:'Rent expense'}),record('planned',9000,{frequency:'Monthly'}),record('future',8000,{date:'2026-09-20'}),record('eur',7000,{currency:'EUR'})]},tools:{...props.tools,data:{splits:[{record_id:'split',category_id:'food',amount:60},{record_id:'split',category_id:'travel',amount:40.25}]}}});
 assert.match(html,/\$300/);assert.match(html,/Food/);assert.match(html,/Travel/);assert.match(html,/\$60/);assert.match(html,/\$40/);assert.match(html,/\$200/);
 assert.match(html,/monthly-category-track/);assert.doesNotMatch(html,/No recorded spending|\$9,000|\$8,000|€7,000/);
});
test('loading and failed category requests do not appear as an empty breakdown',()=>{
 const loading=render({tools:{...props.tools,loading:true}});assert.match(loading,/Loading spending categories/);assert.doesNotMatch(loading,/No recorded spending|monthly-category-list/);
 const failure=render({tools:{...props.tools,error:'Offline'}});assert.match(failure,/role="alert"/);assert.match(failure,/Retry/);assert.doesNotMatch(failure,/No recorded spending|monthly-category-list/);
 const history=render({historyError:'Offline'});assert.match(history,/Net-worth history could not be loaded/);assert.doesNotMatch(history,/Two recorded balances are needed/);
});
test('zero-interest principal payments do not create misleading spending categories',()=>{
 const html=render({data:{...props.data,records:[record('mortgage',500,{mortgage_payment_id:'payment',payment_interest:0})]}});
 assert.match(html,/No recorded spending/);assert.doesNotMatch(html,/monthly-category-list/);
});
test('monthly review copy is translated in EN, RU and UZ and uses shared controls and formatting',()=>{
 const source=fs.readFileSync('components/financial-review.tsx','utf8');
 assert.doesNotMatch(source,/toFixed|toLocaleString|new Intl\.|type="(?:number|date)"/);
 for(const lang of ['en','ru','uz']){const labels=JSON.parse(fs.readFileSync(`lib/locales/${lang}.json`));for(const [,key] of source.matchAll(/\bt\('([^']+)'/g))assert.ok(labels[key],`${lang}: ${key}`);}
});
