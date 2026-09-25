import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';

test('summary opens only one popup and ignores delayed closes from the previous popup',()=>{
 let active=null;
 const {InvestmentPeriodSummary}=loadTS('components/investment-period-summary.tsx',{
  react:{useState:()=>[active,update=>{active=update(active);}]},
  '@/components/language-provider':{useLanguage:()=>({t:value=>value,locale:'en'})},
  '@/components/ui/popover':{},
  '@/lib/investment-period':{investmentPeriodTotals:()=>({invested:100,expenses:20,income:30,missing:[]})},
 });
 const render=()=>InvestmentPeriodSummary({input:{currency:'USD'},start:'2026-09-01'}).props.children[0].props.children.flat().filter(Boolean);
 const initial=render();
 assert.deepEqual(initial.map(item=>item.props.open),[false,false,false]);
 initial[1].props.onOpenChange(true);
 assert.deepEqual(render().map(item=>item.props.open),[false,true,false]);
 initial[2].props.onOpenChange(true);
 assert.deepEqual(render().map(item=>item.props.open),[false,false,true]);
 initial[1].props.onOpenChange(false);
 assert.deepEqual(render().map(item=>item.props.open),[false,false,true]);
 initial[2].props.onOpenChange(false);
 assert.deepEqual(render().map(item=>item.props.open),[false,false,false]);
});
