import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadTS} from './helpers/load-ts.mjs';
const {BenchmarkTooltip}=loadTS('components/benchmark-tooltip.tsx',{'@/components/language-provider':{useLanguage:()=>({locale:'en',t:(s,values={})=>s.replace(/\{(\w+)\}/g,(match,key)=>values[key]??match)})}});
const props={active:true,currency:'USD',series:[{key:'BTC',label:'Bitcoin',color:'orange',quotes:[{key:'BTC',symbol:'BTC'}]}],payload:[{payload:{date:'2026-09-25',BTC:1500,actual:999,contributed:1234}}],receipts:[{id:'one',date:'2026-09-25',amount:123.45,currency:'USD',name:'Salary received'},{id:'two',date:'2026-09-24',amount:50,currency:'USD',name:'Earlier receipt'}]};
test('benchmark tooltip shows selected values, cumulative funding and only receipts invested on the hovered date',()=>{
 const html=renderToStaticMarkup(BenchmarkTooltip(props));
 for(const text of ['Bitcoin','$1,500','$1,234','Salary received','$123','Income received and invested'])assert.ok(html.includes(text),text);
 assert.ok(!html.includes('Earlier receipt'));assert.ok(!html.includes('$999'));
 assert.ok(html.includes('tabindex="0"'));
});
test('interacting with the tooltip does not move the chart hover target or intercept native scrolling',()=>{
 const card=BenchmarkTooltip(props);
 for(const name of ['onMouseMove','onTouchMove','onWheel']){
  let stopped=false;
  card.props[name]({stopPropagation(){stopped=true;},preventDefault(){assert.fail('Native scrolling must stay enabled');}});
  assert.equal(stopped,true);
 }
});
test('activity is keyboard focusable and scrolling keys do not navigate chart points; Escape still dismisses',()=>{
 const body=BenchmarkTooltip(props).props.children.find(child=>child.props.className==='portfolio-tooltip-body');
 assert.equal(body.props.tabIndex,0);assert.equal(body.props.role,'region');
 for(const key of ['ArrowDown','ArrowUp','PageDown','PageUp','Home','End']){
  let stopped=false;body.props.onKeyDown({key,stopPropagation(){stopped=true;}});assert.equal(stopped,true);
 }
 body.props.onKeyDown({key:'Escape',stopPropagation(){assert.fail('Escape must reach the dismissal handler');}});
});
test('days without receipts are explicit and inactive tooltips render nothing',()=>{
 assert.equal(BenchmarkTooltip({...props,active:false}),null);
 assert.equal(BenchmarkTooltip({...props,payload:[]}),null);
 assert.ok(renderToStaticMarkup(BenchmarkTooltip({...props,receipts:[]})).includes('No new income invested on this date.'));
});

test('BTC unit price uses the selected historical day, preserves quote decimals and rejects future or stale prices',()=>{
 const marketHistory={prices:{BTC:[{date:'2026-09-24',close:43210.12345678},{date:'2026-09-26',close:99999}]},fx:[]};
 const html=renderToStaticMarkup(BenchmarkTooltip({...props,marketHistory}));
 assert.ok(html.includes('BTC price (USD)'));assert.ok(html.includes('$43,210.12345678'));assert.ok(!html.includes('$99,999'));
 const stale=renderToStaticMarkup(BenchmarkTooltip({...props,marketHistory:{...marketHistory,prices:{BTC:[{date:'2026-09-01',close:1}]}}}));
 assert.ok(stale.includes('BTC price (USD): —'));
});
test('expense funding rows are labeled by category, with no explanatory note at the bottom',()=>{
 const fundingDetails=[{id:'expense:watch',date:'2026-09-25',name:'Watch',amount:800,currency:'USD',reused:0,source:'expense',kind:'Other expense'},{id:'buy',date:'2026-09-25',name:'SPY shares',amount:500,currency:'USD',reused:0}];
 const including=renderToStaticMarkup(BenchmarkTooltip({...props,fundingDetails}));
 for(const text of ['Watch','Expense funding · Other expense','$800','SPY shares','Fresh investment funding'])assert.ok(including.includes(text),text);
 for(const text of ['every recorded expense','Interest, fees and living expenses are excluded.','Opening net worth funds each benchmark first'])assert.ok(!including.includes(text),text);
 const excluding=renderToStaticMarkup(BenchmarkTooltip({...props,fundingDetails:fundingDetails.slice(1)}));
 assert.ok(!excluding.includes('Expense funding'));
});

test('every priced benchmark shows its own unit price; deposits and the user portfolio show none',()=>{
 const series=[{key:'actual',label:'My investments',color:'green'},{key:'SPY',label:'S&P 500',color:'blue',quotes:[{key:'SPY',symbol:'SPY'}]},{key:'depositUSD',label:'USD deposit',color:'teal'},{key:'PORTFOLIO',label:'Diversified portfolio',color:'gray',quotes:[{key:'portfolio_a',symbol:'ETH'},{key:'portfolio_b',symbol:'QQQ'}]}];
 const marketHistory={prices:{SPY:[{date:'2026-09-25',close:612.5}],portfolio_a:[{date:'2026-09-24',close:0.00001234}]},fx:[]};
 const html=renderToStaticMarkup(BenchmarkTooltip({...props,series,marketHistory}));
 for(const text of ['SPY price (USD): $612.5','ETH price (USD): $0.00001234','QQQ price (USD): —'])assert.ok(html.includes(text),text);
 assert.equal(html.split('price (USD)').length-1,3);
});
test('diversified portfolio quotes list only market-priced assets with a weight',()=>{
 const {portfolioQuotes,defaultDiversifiedPortfolio}=loadTS('lib/diversified-portfolio.ts');
 assert.deepEqual(portfolioQuotes(defaultDiversifiedPortfolio),[{key:'portfolioCrypto',symbol:'BTC'},{key:'portfolioStock',symbol:'SPY'}]);
 const assets=[{id:'a',kind:'crypto',name:'',weight:40,symbol:'ETH',currency:'USD',rate:0},{id:'b',kind:'deposit',name:'',weight:60,symbol:'',currency:'UZS',rate:21},{id:'c',kind:'stock',name:'',weight:0,symbol:'QQQ',currency:'USD',rate:0}];
 assert.deepEqual(portfolioQuotes({...defaultDiversifiedPortfolio,assets}),[{key:'portfolio_a',symbol:'ETH'}]);
});
