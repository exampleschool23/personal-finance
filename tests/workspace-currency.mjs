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
  'next/link':{default:passthrough},
  '@/components/language-provider':{useLanguage:()=>({t:key=>key,locale:'en-US'})},
  '@/components/ui/button':{Button:passthrough},
  '@/components/discard-changes':{useDraftDialog:()=>({close(){},confirmation:null})},
  '@/components/stop-schedule-dialog':{StopScheduleDialog:()=>null},
  '@/components/loading-placeholder':{LoadingPlaceholder:()=>null},
  '@/components/ui/checkbox':{Checkbox:()=>null},
  '@/components/ui/input':{Input:props=>React.createElement('input',props)},
  '@/components/formatted-number-input':{FormattedNumberInput:({value})=>React.createElement('input',{value,readOnly:true})},
  '@/components/ui/dialog':Object.fromEntries(['Dialog','DialogContent','DialogTitle','DialogDescription'].map(name=>[name,passthrough])),
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
