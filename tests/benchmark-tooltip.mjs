import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadTS} from './helpers/load-ts.mjs';
const {BenchmarkTooltip}=loadTS('components/benchmark-tooltip.tsx',{'@/components/language-provider':{useLanguage:()=>({locale:'en',t:s=>s})}});
const props={active:true,currency:'USD',series:[{key:'BTC',label:'Bitcoin',color:'orange'}],payload:[{payload:{date:'2026-09-25',BTC:1500,actual:999,contributed:1234}}],receipts:[{id:'one',date:'2026-09-25',amount:123.45,currency:'USD',name:'Salary received'},{id:'two',date:'2026-09-24',amount:50,currency:'USD',name:'Earlier receipt'}]};
test('benchmark tooltip shows selected values, cumulative funding and only receipts invested on the hovered date',()=>{
 const html=renderToStaticMarkup(BenchmarkTooltip(props));
 for(const text of ['Bitcoin','$1,500','$1,234','Salary received','$123','Income received and invested'])assert.ok(html.includes(text),text);
 assert.ok(!html.includes('Earlier receipt'));assert.ok(!html.includes('$999'));
 assert.ok(html.includes('tabindex="0"'));
});
test('days without receipts are explicit and inactive tooltips render nothing',()=>{
 assert.equal(BenchmarkTooltip({...props,active:false}),null);
 assert.ok(renderToStaticMarkup(BenchmarkTooltip({...props,receipts:[]})).includes('No new income invested on this date.'));
});

test('BTC unit price uses the selected historical day, preserves quote decimals and rejects future or stale prices',()=>{
 const marketHistory={prices:{BTC:[{date:'2026-09-24',close:43210.12345678},{date:'2026-09-26',close:99999}]},fx:[]};
 const html=renderToStaticMarkup(BenchmarkTooltip({...props,marketHistory}));
 assert.ok(html.includes('BTC price (USD)'));assert.ok(html.includes('$43,210.12345678'));assert.ok(!html.includes('$99,999'));
 const stale=renderToStaticMarkup(BenchmarkTooltip({...props,marketHistory:{...marketHistory,prices:{BTC:[{date:'2026-09-01',close:1}]}}}));
 assert.ok(stale.includes('BTC price (USD): —'));
});
