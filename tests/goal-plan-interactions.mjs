import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {loadTS} from './helpers/load-ts.mjs';

test('goal card opens on its content and leaves nested controls independent',()=>{
 const {GoalCard}=loadTS('components/planning/goal-card.tsx');
 let opens=0;
 const card=GoalCard({onOpen:()=>opens++,children:'Goal'});
 card.props.onClick({target:{closest:()=>null}});
 assert.equal(opens,1);
 for(const tag of ['button','a','input','select','textarea','label','details','[role="button"]']){
  card.props.onClick({target:{closest:selector=>{assert.ok(selector.includes(tag));return {};}}});
 }
 assert.equal(opens,1);
});
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

test('goal card opens with Enter or Space without intercepting nested controls',()=>{
 const {GoalCard}=loadTS('components/planning/goal-card.tsx');let opened=0,prevented=0;const card=GoalCard({onOpen:()=>opened++});const target={};
 assert.equal(card.props.tabIndex,0);
 for(const key of ['Enter',' '])card.props.onKeyDown({key,target,currentTarget:target,preventDefault(){prevented++;}});
 card.props.onKeyDown({key:'Enter',target:{},currentTarget:target,preventDefault(){throw Error('Nested control intercepted');}});
 assert.equal(opened,2);assert.equal(prevented,2);
});
test('grab handle drops only real drags, supports cancel, and does not open the card',()=>{
 const previousDocument=globalThis.document,previousWindow=globalThis.window;let dropped=[],targets=[],moves=[],stopped=0;
 globalThis.document={elementFromPoint:()=>({closest:()=>({dataset:{goalId:'target'}})})};globalThis.window={innerHeight:900,scrollBy(){}};
 try{
  const {GoalDragHandle}=loadTS('components/planning/goal-drag-handle.tsx',{react:{...React,useRef:value=>({current:value}),useState:value=>[value,()=>{}]},'@/components/language-provider':{useLanguage:()=>({t:key=>key})}});
  const handle=GoalDragHandle({name:'Goal',disabled:false,onDrop:id=>dropped.push(id),onTarget:id=>targets.push(id),onMove:direction=>moves.push(direction)});
  const event={button:0,pointerId:1,clientX:100,clientY:200,stopPropagation(){stopped++;},currentTarget:{setPointerCapture(){},hasPointerCapture:()=>true,releasePointerCapture(){}}};
  handle.props.onPointerDown(event);handle.props.onPointerUp(event);assert.deepEqual(dropped,[]);
  handle.props.onPointerDown(event);handle.props.onPointerMove({...event,clientX:300});handle.props.onPointerCancel();handle.props.onPointerUp(event);assert.deepEqual(dropped,[]);
  handle.props.onPointerDown(event);handle.props.onPointerMove({...event,clientX:300});handle.props.onPointerUp(event);assert.deepEqual(dropped,['target']);assert.ok(targets.includes('target'));
  handle.props.onKeyDown({key:'ArrowUp',preventDefault(){},stopPropagation(){}});assert.deepEqual(moves,[-1]);handle.props.onClick(event);assert.ok(stopped>0);
 }finally{globalThis.document=previousDocument;globalThis.window=previousWindow;}
});
