import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';
import fs from 'node:fs';
import path from 'node:path';
// The Overview charts live in their own modules (loaded through components/charts-lazy.tsx); recharts is stubbed by name.
const names=['Area','CartesianGrid','ComposedChart','Line','ReferenceLine','ResponsiveContainer','Tooltip','XAxis','YAxis'];
const stubs={recharts:Object.fromEntries(names.map(name=>[name,name])),'@/components/language-provider':{useLanguage:()=>({locale:'en',t:(text,values={})=>text.replace(/\{(\w+)\}/g,(_,key)=>values[key])})}};
const {ForecastChart}=loadTS('components/cash-forecast-chart.tsx',stubs);
const {SpendingPaceChart}=loadTS('components/spending-pace-chart.tsx',{...stubs,'@/components/presentation-foundation/category-icon':{CategoryIcon:()=>null}});
const {spendingPace}=loadTS('lib/spending-pace.ts');
const children=element=>[element.props.children].flat(Infinity).filter(Boolean);
const find=(element,type)=>{if(!element||typeof element!=='object')return null;if(element.type===type)return element;for(const child of children(element)){const found=find(child,type);if(found)return found;}return null;};
const text=element=>typeof element==='string'||typeof element==='number'?String(element):!element||typeof element!=='object'?'':typeof element.type==='function'?text(element.type(element.props)):children(element).map(text).join(' ');

test('the forecast chart marks zero only when a balance goes below it',()=>{
 const series=(balances)=>({id:'total',currency:'USD',points:balances.map((balance,index)=>({date:`2026-10-${String(index+1).padStart(2,'0')}`,balance}))});
 assert.ok(find(ForecastChart({series:series([100,-50])}),'ReferenceLine'));
 assert.equal(find(ForecastChart({series:series([100,50])}),'ReferenceLine'),null);
});

test('the spending chart\'s tooltip lists the day\'s Tracker expense beside its records',()=>{
 const record=(id,kind,amount,date,extra={})=>({id,name:id,kind,amount,quantity:1,cost:0,rate:0,currency:'USD',frequency:'Once',date,notes:'',...extra});
 const records=[record('Market','Living expense',60,'2026-10-02'),record('stock','Stock',5000,'2026-01-01',{name:'Apple',frequency:'Monthly'})];
 const investmentLinks=[{id:'fee',account_id:'cash',account_currency:'USD',amount:-12,investment_history:{occurred_on:'2026-10-02',record_id:'stock',event_type:'expense'}}];
 const pace=spendingPace({records,splits:[],snapshots:[],investmentLinks},'2026-10-02','USD',{USD:1});
 const tooltip=find(SpendingPaceChart({pace,data:{records,investmentLinks},currency:'USD',rates:{USD:1}}),'Tooltip');
 const shown=text(tooltip.props.content({active:true,payload:[{payload:pace.points[1]}]}));
 assert.match(shown,/Market/);assert.match(shown,/Apple/);assert.match(shown,/\$72/);
 assert.equal(tooltip.props.content({active:false,payload:[]}),null);
});

// next/dynamic is compiled by the build, which refuses options that are not written out as an object literal.
test('every next/dynamic call spells out its options as an object literal', () => {
 const files = fs.readdirSync('components', { recursive: true }).filter(name => /\.tsx?$/.test(name)).map(name => path.join('components', name));
 const calls = files.flatMap(file => [...fs.readFileSync(file, 'utf8').matchAll(/\bdynamic\(\(\) => import\([^)]*\)(?:\.then\([^)]*\))?,\s*(\S)/g)].map(match => [file, match[1]]));
 assert.ok(calls.length >= 5, 'the lazy charts and the tracker are found');
 for (const [file, start] of calls) assert.equal(start, '{', `${file} passes a literal`);
});
