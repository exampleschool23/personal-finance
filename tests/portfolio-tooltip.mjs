import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';
const {PortfolioTooltip}=loadTS('components/portfolio-tooltip.tsx',{'@/components/language-provider':{useLanguage:()=>({locale:'en',t:text=>text})}});
const point={date:'2026-09-18',net:100,assets:100,debt:0};
const props={active:true,payload:[{payload:point}],details:new Map(),currency:'USD'};
test('interacting with tooltip does not move the chart hover target or intercept native scrolling',()=>{
 const card=PortfolioTooltip(props);
 for(const name of ['onMouseMove','onTouchMove','onWheel']){
  let stopped=false;
  card.props[name]({stopPropagation(){stopped=true;},preventDefault(){assert.fail('Native scrolling must stay enabled');}});
  assert.equal(stopped,true);
 }
});
test('activity is keyboard focusable and scrolling keys do not navigate chart points; Escape still dismisses',()=>{
 const body=PortfolioTooltip(props).props.children.find(child=>child.props.className==='portfolio-tooltip-body');
 assert.equal(body.props.tabIndex,0);assert.equal(body.props.role,'region');
 for(const key of ['ArrowDown','ArrowUp','PageDown','PageUp','Home','End']){
  let stopped=false;body.props.onKeyDown({key,stopPropagation(){stopped=true;}});assert.equal(stopped,true);
 }
 body.props.onKeyDown({key:'Escape',stopPropagation(){assert.fail('Escape must reach dismissal handler');}});
});
test('activity tap opens the original record and does not select another chart point',()=>{
 const activity={id:'event-1',name:'Debt',kind:'Loan',label:'Repayment made',amount:50,tracker:true,record:{id:'loan-1',currency:'UZS',amount:600000}};
 let opened,stopped=false;
 const card=PortfolioTooltip({...props,details:new Map([[point.date,{activity:[activity]}]]),onOpenActivity:value=>{opened=value;}});
 const body=card.props.children.find(child=>child.props.className==='portfolio-tooltip-body');
 const button=body.props.children[0].props.children[1][0];
 assert.equal(button.type,'button');assert.equal(button.props.disabled,false);
 button.props.onClick({stopPropagation(){stopped=true;}});
 assert.equal(opened,activity);assert.equal(opened.record.currency,'UZS');assert.equal(stopped,true);
});

const tooltipValue=options=>PortfolioTooltip(options).props.children[0].props.children[2].props.children;
test('overview tooltip displays the investment chart actual value after comparisons load',()=>{
 assert.equal(tooltipValue({...props,valueKey:'actual',payload:[{payload:{date:point.date,actual:403110.42}}]}),'$403,110');
});
test('overview tooltip uses the plotted actual value before comparisons load, preserving zero and missing values',()=>{
 for(const actual of [403110.42,0,null,undefined]){
  assert.equal(tooltipValue({...props,valueKey:'actual',payload:[{payload:{...point,actual}}]}),actual===403110.42?'$403,110':actual===0?'$0':'—');
 }
 assert.equal(tooltipValue(props),'$100');
 assert.equal(PortfolioTooltip({...props,active:false}),null);
 assert.equal(PortfolioTooltip({...props,payload:[]}),null);
});
