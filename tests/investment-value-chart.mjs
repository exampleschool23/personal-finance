import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';
const names=['Area','CartesianGrid','ComposedChart','ResponsiveContainer','Tooltip','XAxis','YAxis'];
const {InvestmentValueChart}=loadTS('components/investment-value-chart.tsx',{react:{useId:()=> 'chart-id'},recharts:Object.fromEntries(names.map(name=>[name,name])),'@/components/language-provider':{useLanguage:()=>({locale:'en',t:s=>s})}});
const chart=points=>InvestmentValueChart({points,currency:'USD',series:[{key:'actual',label:'Investments',color:'green',primary:true}]}).props.children.props.children;
test('date axis starts at the first displayed complete balance, not an earlier hidden repayment',()=>{
 const result=chart([{date:'2026-09-17',actual:396269},{date:'2026-09-20',actual:403026}]);
 const axis=result.props.children.find(child=>child.type==='XAxis');
 assert.deepEqual(axis.props.domain,[Date.parse('2026-09-17T00:00:00Z'),Date.parse('2026-09-20T00:00:00Z')]);
 assert.equal(result.props.data.length,2);
});
test('single point has a bounded axis without fabricating another balance',()=>{
 const result=chart([{date:'2026-09-17',actual:100}]);
 const axis=result.props.children.find(child=>child.type==='XAxis');
 assert.equal(axis.props.domain[1]-axis.props.domain[0],86400000);
 assert.equal(axis.props.ticks.length,1);assert.equal(result.props.data.length,1);
});

test('chart scales only displayed series and preserves gaps in observations',()=>{
 const result=chart([{date:'2026-09-17',actual:100,hidden:999999},{date:'2026-09-18',actual:null},{date:'2026-09-19',actual:120}]);
 const axis=result.props.children.find(child=>child.type==='YAxis');
 assert.deepEqual(axis.props.domain,[97,123]);
 const series=result.props.children.flat().find(child=>child.type==='Area');
 assert.equal(series.props.connectNulls,false);assert.equal(series.props.dataKey,'actual');
 assert.deepEqual(result.props.data.map(point=>point.actual),[100,null,120]);
});
