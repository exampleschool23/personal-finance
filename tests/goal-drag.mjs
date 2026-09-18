import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {loadTS} from './helpers/load-ts.mjs';
const {goalDropTarget}=loadTS('lib/goal-drag.ts');
test('drop targeting covers card content and gaps, and rejects outside releases',()=>{
 const cards=[{id:'a',left:0,right:100,top:0,bottom:100},{id:'b',left:120,right:220,top:0,bottom:120}];
 assert.equal(goalDropTarget(cards,160,60),'b');
 assert.equal(goalDropTarget(cards,115,60),'b');
 assert.equal(goalDropTarget(cards,50,50),'a');
 assert.equal(goalDropTarget(cards,240,60),null);
 assert.equal(goalDropTarget([],10,10),null);
 assert.equal(goalDropTarget([{id:'a',left:0,right:100,top:0,bottom:100},{id:'b',left:0,right:100,top:120,bottom:240}],50,180),'b');
});
test('reordered cards animate from previous positions and honor reduced motion',()=>{
 const oldWindow=globalThis.window;let reduced=false;
 globalThis.window={matchMedia:()=>({matches:reduced})};
 try{
  const refs=[],effects=[];let cursor=0,cancelled=0;
  const {useGoalLayoutAnimation}=loadTS('hooks/use-goal-layout-animation.ts',{react:{...React,useRef:value=>refs[cursor++]??(refs[cursor-1]={current:value}),useLayoutEffect:fn=>effects.push(fn)}});
  const calls=[];let positions=[0,120];
  const cards=['a','b'].map((id,index)=>({dataset:{goalId:id},getBoundingClientRect:()=>({left:positions[index],top:0}),animate:(frames,options)=>{calls.push({id,frames,options});return {cancel(){cancelled++;}};}}));
  function useTestRender(order){cursor=0;effects.length=0;const ref=useGoalLayoutAnimation(order);ref.current={querySelectorAll:()=>cards};effects[0]();}
  useTestRender('a,b');assert.equal(calls.length,0);
  positions=[120,0];useTestRender('b,a');assert.equal(calls.length,2);assert.equal(calls[0].frames[0].transform,'translate(-120px, 0px)');assert.equal(calls[1].frames[0].transform,'translate(120px, 0px)');
  reduced=true;positions=[0,120];useTestRender('a,b');assert.equal(calls.length,2);assert.equal(cancelled,2);
 }finally{globalThis.window=oldWindow;}
});
