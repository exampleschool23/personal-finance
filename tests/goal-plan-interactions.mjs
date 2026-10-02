import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {loadTS} from './helpers/load-ts.mjs';

test('investment projection is visible without opening a disclosure; only explanation is collapsed',()=>{
 const {InvestmentGoalPlan}=loadTS('components/planning/investment-goal-plan.tsx',{
  react:{...React,useId:()=> 'plan',useState:initial=>[typeof initial==='function'?initial():initial,()=>{}]},
  '@/components/language-provider':{useLanguage:()=>({t:key=>key,locale:'en-US'})},
 });
 const tree=InvestmentGoalPlan({
  goal:{id:'goal',name:'BTC goal',kind:'investment',holding_account_id:'wallet',asset_kind:'Crypto',asset_symbol:'BTC',target:4,target_date:'2030-12-01',monthly_contribution:.08},
  data:{records:[],holdingAccounts:[{id:'wallet',name:'Wallet',kind:'Crypto',currency:'USD'}]},
  today:'2026-09-18',currency:'USD',market:null,save:async()=>{},onEdit(){},
 });
 let charts=0,methods=0;
 function visit(node,collapsed=false){
  if(!node||typeof node!=='object')return;
  const hidden=collapsed||(node.type==='details'&&!node.props.open);
  if(node.props?.className==='goal-projection-chart'){charts++;assert.equal(hidden,false);}
  if(node.props?.className==='investment-plan-method'){methods++;assert.equal(hidden,true);}
  React.Children.forEach(node.props?.children,child=>visit(child,hidden));
 }
 visit(tree);assert.equal(charts,1);assert.equal(methods,1);
});

