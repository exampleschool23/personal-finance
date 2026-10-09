import test from 'node:test';
import assert from 'node:assert/strict';
import {createRenderer,hostModule,language,text,byType} from './helpers/component-tree.mjs';
import {loadTS} from './helpers/load-ts.mjs';

const benchmarks=loadTS('lib/investment-benchmarks.ts');
const entry=(id,kind,amount,extra={})=>({id,name:id,kind,amount,quantity:1,cost:0,rate:0,currency:'USD',frequency:'Once',date:'2026-09-01',...extra});
const btc=entry('btc','Crypto',6000,{quantity:.1,date:'2026-03-01'});
const points=[{date:'2026-08-01',actual:50,contributed:50},{date:'2026-09-10',actual:100,contributed:90,BTC:120},{date:'2026-09-20',actual:110,contributed:90,BTC:130}];
const profile=(preferences={},owner='owner-1')=>({owner_id:owner,activity:{started_at:'2026-01-01',source:'first_visit'},preferences:{benchmarks:['BTC','SPY','depositUSD'],custom_symbol:'',...preferences},baseline:null,tracking_start:null});

function storage({broken=false,values={}}={}){
 const map=new Map(Object.entries(values)),writes=[];
 return {writes,map,getItem:key=>{if(broken)throw Error('blocked');return map.has(key)?map.get(key):null;},setItem:(key,value)=>{if(broken)throw Error('blocked');writes.push([key,value]);map.set(key,value);}};
}
function comparison(t,props={},{store=storage(),decide,respond}={}){
 const requests=[],errors=[],starts=[],decisions=[];
 globalThis.localStorage=store;t.after(()=>{delete globalThis.localStorage;});
 const r=createRenderer();
 const reply=respond??(()=>({ok:true,body:{errors:{}}}));
 const {InvestmentComparison}=r.load('components/investment-comparison.tsx',{
  '@/components/language-provider':language('en'),
  '@/components/ui/native-select':hostModule(),'@/components/ui/dialog':hostModule(),'@/components/ui/button':hostModule(),'lucide-react':hostModule(),
  '@/components/presentation-foundation/date-picker':hostModule(),'@/components/presentation-foundation/loading-placeholder':hostModule(),'@/components/presentation-foundation/inline-error':hostModule(),'@/components/presentation-foundation/empty-state':hostModule(),
  '@/components/benchmark-tooltip':hostModule(),'@/components/investment-value-chart':hostModule(),'@/components/charts-lazy':hostModule(),'next/link':{__esModule:true,default:'Link'},
  '@/lib/feedback':{showError:message=>errors.push(message)},
  '@/lib/refresh-read':{refreshRead:async(url,{signal})=>{requests.push({url,signal});const answer=await reply(url,requests.length);return {ok:answer.ok,json:async()=>answer.body};}},
  '@/lib/investment-benchmarks':{...benchmarks,investmentDecisionComparison:(input,data,portfolio)=>{decisions.push({input,data,portfolio});return decide?decide(input,data,portfolio):{result:{points,unavailable:[]},details:{}};}},
 });
 const base={history:{records:[btc],events:[]},today:'2026-09-30',currency:'USD',market:null,demo:false,windowStart:'2026-09-01',points:[{date:'2026-09-30',net:100}],profile:profile(),profileError:'',trackingStart:null,onTrackingStartChange:async date=>{starts.push(date);},summary:r.react.createElement('p',{className:'summary'},'Summary')};
 const view=(next={})=>r.render(r.react.createElement(InvestmentComparison,Object.assign(base,next)));
 view(props);
 const legend=()=>r.find(node=>node.props.className==='comparison-legend').children;
 const notes=()=>r.all(node=>node.props.className==='comparison-note').map(text);
 return {r,view,requests,errors,starts,decisions,store,legend,notes,base};
}
const params=url=>Object.fromEntries(new URL(url,'https://app.test').searchParams);

test('the sample workspace loads sample benchmarks, draws the chart from the window start and notes the sample data',async t=>{
 const s=comparison(t,{demo:true,profile:null});
 assert.equal(s.r.find(node=>node.props.className==='comparison-legend').props['aria-busy'],true,'comparisons load first');
 assert.equal(s.r.find(byType('ChartSkeleton')).props.label,'Loading comparisons…');
 await s.r.flush();
 assert.deepEqual(s.requests.map(request=>request.url),['/api/benchmarks?demo=1']);
 assert.deepEqual(s.legend().map(text),['Investments','Bitcoin · BTC','S&P 500 · SPY','US Treasury bills · BIL','USD deposit · 8%']);
 assert.ok(s.legend().every(button=>button.props['aria-pressed']===true&&!button.props.disabled));
 const chart=s.r.find(byType('InvestmentValueChart'));
 assert.deepEqual(chart.props.points.map(point=>point.date),['2026-09-10','2026-09-20'],'points before the window are cut');
 assert.equal(chart.props.series.find(series=>series.key==='actual').primary,true);
 assert.equal(chart.props.label,'Investments');
 assert.ok(s.notes().includes('Sample portfolio compared with real BTC and SPY price history. SPY tracks the S&P 500; deposits use assumed annual rates.'));
 assert.equal(text(s.r.find(node=>node.props.className==='summary')),'Summary');
 // Hiding a line keeps the request and only changes what is drawn; the choice is remembered per owner.
 s.r.fire(s.legend()[1],'onClick');
 assert.equal(s.legend()[1].props['aria-pressed'],false);
 assert.deepEqual(s.store.writes.at(-1),['finance:overview-benchmarks:demo',JSON.stringify(['BTC','SPY','depositUSD','BIL'].filter(key=>key!=='BTC'))]);
 s.r.fire(s.legend()[0],'onClick');
 assert.equal(s.legend()[0].props['aria-pressed'],false,'the investments line can be hidden too');
 assert.ok(!s.r.find(byType('InvestmentValueChart')).props.series.some(series=>series.key==='actual'));
 assert.equal(s.requests.length,1);
});

test('a saved legend and funding scope are restored, and the scope can be changed',async t=>{
 const store=storage({values:{'finance:overview-benchmarks:owner-1':JSON.stringify(['SPY']),'finance:benchmark-method:owner-1':JSON.stringify({scope:'expenses'})}});
 const s=comparison(t,{},{store});
 await s.r.flush();
 assert.deepEqual(s.legend().map(button=>[text(button),button.props['aria-pressed']]),[['Investments',true],['Bitcoin · BTC',false],['S&P 500 · SPY',true],['USD deposit · 8%',false]]);
 const scope=()=>s.r.find(node=>node.type==='NativeSelect');
 assert.equal(scope().props.value,'expenses');
 assert.ok(s.notes().some(note=>note.startsWith('Investment purchases, principal repayments and every recorded expense fund benchmarks.')));
 s.r.fire(scope(),'onChange',{target:{value:'investments'}});
 assert.equal(scope().props.value,'investments');
 assert.deepEqual(s.store.writes.at(-1),['finance:benchmark-method:owner-1',JSON.stringify({scope:'investments'})]);
 assert.ok(s.notes().some(note=>note.startsWith('Investment purchases and principal repayments fund benchmarks.')));
 const query=params(s.requests[0].url);
 assert.deepEqual(query,{start:query.start,end:'2026-09-30',benchmarks:'BTC,SPY,depositUSD'});
});

test('blocked browser storage still shows the headline benchmarks and accepts changes for this visit',async t=>{
 const s=comparison(t,{},{store:storage({broken:true})});
 await s.r.flush();
 assert.ok(s.legend().every(button=>button.props['aria-pressed']));
 s.r.fire(s.legend()[2],'onClick');
 assert.equal(s.legend()[2].props['aria-pressed'],false);
 s.r.fire(s.r.find(node=>node.type==='NativeSelect'),'onChange',{target:{value:'expenses'}});
 assert.equal(s.r.find(node=>node.type==='NativeSelect').props.value,'expenses');
});

test('custom, stock and portfolio benchmarks are requested with their parameters and labelled',async t=>{
 const assets=[{id:'a1',kind:'stock',name:'Apple',weight:60,symbol:'AAPL',currency:'USD',rate:0},{id:'a2',kind:'crypto',name:'Ether',weight:40,symbol:'ETH',currency:'USD',rate:0}];
 const s=comparison(t,{profile:profile({benchmarks:['STOCK:AAPL','CUSTOM','PORTFOLIO'],custom_symbol:'MSFT',portfolio:{assets}})});
 await s.r.flush();
 const query=params(s.requests[0].url);
 assert.equal(query.benchmarks,'STOCK:AAPL,CUSTOM,PORTFOLIO');assert.equal(query.symbol,'MSFT');
 assert.deepEqual(JSON.parse(query.portfolio),{assets});
 assert.equal(query.portfolioCrypto,undefined);
 assert.deepEqual(s.legend().map(text),['Investments','AAPL','MSFT','Diversified portfolio']);
 assert.deepEqual(s.decisions.at(-1).portfolio,{assets});
 // A legacy portfolio asks for its crypto and stock symbols instead.
 const legacy=comparison(t,{profile:profile({benchmarks:['PORTFOLIO'],portfolio:{crypto:50,stock:50,deposit:0,business:0,cash:0,cryptoSymbol:'BTC',stockSymbol:'QQQ',businessRate:0}})});
 await legacy.r.flush();
 const legacyQuery=params(legacy.requests[0].url);
 assert.equal(legacyQuery.portfolioCrypto,'BTC');assert.equal(legacyQuery.portfolioStock,'QQQ');assert.equal(legacyQuery.portfolio,undefined);
});

test('a missing profile waits; a profile error loads the default benchmarks with the legend locked',async t=>{
 const s=comparison(t,{profile:null});
 await s.r.flush();
 assert.deepEqual(s.requests,[]);
 assert.ok(s.r.find(byType('ChartSkeleton')));
 assert.ok(s.legend().every(button=>button.props.disabled),'there is no owner to remember a choice for');
 s.r.fire(s.legend()[1],'onClick');
 s.r.fire(s.r.find(node=>node.type==='NativeSelect'),'onChange',{target:{value:'expenses'}});
 assert.equal(s.r.find(node=>node.type==='NativeSelect').props.value,'investments','without an owner nothing changes');
 assert.deepEqual(s.store.writes,[]);
 s.view({profileError:'Could not load your comparison profile.'});
 await s.r.flush();
 assert.equal(params(s.requests[0].url).benchmarks,'BTC,SPY,depositUSD');
 assert.deepEqual(s.legend().map(button=>button.props['aria-pressed']),[true,false,false,false],'no benchmark is shown until chosen');
});

test('nothing is requested without portfolio points',async t=>{
 const s=comparison(t,{points:[]});
 await s.r.flush();
 assert.deepEqual(s.requests,[]);
 assert.equal(s.r.find(node=>node.props.className==='comparison-legend').props['aria-busy'],false);
});

test('a failed request shows the error with a retry that asks again',async t=>{
 let fail=true;
 const s=comparison(t,{},{respond:()=>fail?{ok:false,body:{error:'Benchmark prices are unavailable.'}}:{ok:true,body:{errors:{}}}});
 await s.r.flush();
 const error=s.r.find(byType('InlineError'));
 assert.equal(error.props.message,'Benchmark prices are unavailable.');
 assert.equal(s.r.all(byType('InvestmentValueChart')).length,0);
 fail=false;
 s.r.fire(error,'onRetry');
 assert.ok(s.r.find(byType('ChartSkeleton')),'retrying shows the loading state');
 await s.r.flush();
 assert.equal(s.requests.length,2);
 assert.equal(s.r.all(byType('InlineError')).length,0);
 assert.ok(s.r.find(byType('InvestmentValueChart')));
});

test('a superseded request is aborted and its late answer ignored',async t=>{
 const releases=[];
 const s=comparison(t,{},{respond:(url,count)=>new Promise(resolve=>releases.push(()=>resolve(count===1?{ok:false,body:{error:'stale'}}:{ok:true,body:{errors:{}}})))});
 await s.r.flush();
 assert.equal(s.requests.length,1);
 s.view({today:'2026-10-01'});
 await s.r.flush();
 assert.equal(s.requests.length,2);assert.equal(s.requests[0].signal.aborted,true);
 releases[0]();await s.r.flush();
 assert.equal(s.r.all(byType('InlineError')).length,0,'the stale failure is not shown');
 releases[1]();await s.r.flush();
 assert.ok(s.r.find(byType('InvestmentValueChart')));
 // Unmounting aborts the request in flight, so its success is ignored too.
 const late=comparison(t,{},{respond:()=>new Promise(resolve=>releases.push(()=>resolve({ok:true,body:{errors:{}}})))});
 await late.r.flush();
 late.r.unmount();assert.equal(late.requests[0].signal.aborted,true);
 releases.at(-1)();await late.r.flush();
});

test('benchmark gaps are explained per line, and an incomplete history is noted',async t=>{
 const store=storage({values:{'finance:overview-benchmarks:owner-1':JSON.stringify(['BTC','HYG','depositUZS'])}});
 const s=comparison(t,{profile:profile({benchmarks:['BTC','SPY','HYG','depositUZS']})},{store,respond:()=>({ok:true,body:{errors:{BTC:'Bitcoin prices are unavailable.'}}}),decide:()=>({result:{points,unavailable:['HYG']},details:{}})});
 await s.r.flush();
 const gaps=s.r.all(node=>node.props.className==='comparison-note'&&node.type==='p'&&/·/.test(text(node))).map(text);
 assert.deepEqual(gaps,['Bitcoin · BTC: Bitcoin prices are unavailable.','High-yield bonds · HYG: Price data, exchange rates or funds needed for a matching withdrawal are unavailable.']);
 assert.ok(s.legend().some(button=>text(button)==='UZS deposit · 21%'));
 const fx=comparison(t,{},{respond:()=>({ok:true,body:{errors:{fx:'Exchange rates are unavailable.'}}})});
 await fx.r.flush();
 assert.ok(fx.notes().includes('S&P 500 · SPY: Exchange rates are unavailable.'));
 const incomplete=comparison(t,{},{decide:()=>null});
 await incomplete.r.flush();
 assert.equal(text(incomplete.r.find(node=>node.props.className==='comparison-notice')),'Investment history or exchange rates are incomplete for this comparison.');
 assert.equal(incomplete.r.all(byType('InvestmentValueChart')).length,0);
});

test('choosing a chart point opens its details with the formatted date, and closing clears it',async t=>{
 const s=comparison(t);
 await s.r.flush();
 const dialog=()=>s.r.find(byType('Dialog'));
 assert.equal(dialog().props.open,false);
 s.r.fire(s.r.find(byType('InvestmentValueChart')),'onPointSelect','2026-09-20');
 assert.equal(dialog().props.open,true);
 assert.equal(text(s.r.find(byType('DialogDescription'))),'20 September 2026');
 const tooltip=s.r.all(byType('BenchmarkTooltip')).find(node=>node.props.active);
 assert.deepEqual(tooltip.props.payload,[{payload:points[2]}]);
 s.r.fire(dialog(),'onOpenChange',true);assert.equal(dialog().props.open,true);
 s.r.fire(dialog(),'onOpenChange',false);
 assert.equal(dialog().props.open,false);assert.equal(text(s.r.find(byType('DialogDescription'))),'');
});

test('the tracking start saves through the callback, clears to null and reports a failure',async t=>{
 const s=comparison(t);
 await s.r.flush();
 const picker=()=>s.r.find(byType('DatePicker'));
 assert.equal(picker().props.value,'');assert.equal(picker().props.max,'2026-09-30');assert.equal(picker().props.required,false);
 assert.ok(s.notes().includes('Tracking starts with your first investment activity. Choose a tracking start date to begin later, for example after you finished entering existing holdings.'));
 s.r.fire(s.r.find(byType('InvestmentValueChart')),'onPointSelect','2026-09-20');
 await s.r.fireAsync(picker(),'onChange','2026-09-15');
 assert.deepEqual(s.starts,['2026-09-15']);
 assert.equal(s.r.find(byType('Dialog')).props.open,false,'a new start closes the point details');
 await s.r.fireAsync(picker(),'onChange','');
 assert.deepEqual(s.starts,['2026-09-15',null]);
 // While a save runs, another pick is ignored.
 let release;s.view({onTrackingStartChange:date=>{s.starts.push(date);return new Promise(resolve=>{release=resolve;});}});
 s.r.fire(picker(),'onChange','2026-09-01');
 assert.equal(s.r.find(node=>node.props.className==='tracking-start').props['aria-busy'],true);
 s.r.fire(picker(),'onChange','2026-09-02');
 release();await s.r.flush();
 assert.deepEqual(s.starts.slice(2),['2026-09-01']);
 s.view({onTrackingStartChange:async()=>{throw Error('Could not save the tracking start.');}});
 await s.r.fireAsync(picker(),'onChange','2026-09-03');
 assert.deepEqual(s.errors,['Could not save the tracking start.']);
 assert.equal(s.r.find(node=>node.props.className==='tracking-start').props['aria-busy'],false);
});

test('the settings explain a chosen start, a start before the first investment and history before the market data',async t=>{
 const {formatDate}=loadTS('lib/format.ts');
 const purchase=[{id:'e1',record_id:'btc',event_type:'contribution',occurred_on:'2026-05-01',created_at:'2026-05-01T00:00:00Z',balance:6000,amount:6000,currency:'USD'}];
 const later=comparison(t,{history:{records:[btc],events:purchase},trackingStart:'2026-06-01'});
 assert.equal(later.r.find(byType('DatePicker')).props.value,'2026-06-01');
 assert.ok(later.notes().includes('Tracking starts on 1 June 2026. Benchmarks start from your investment value that day, and nothing earlier is shown. Clear the date to track from your first investment.'));
 assert.ok(!later.notes().some(note=>note.startsWith('Some investments have no recorded purchase')),'a recorded purchase leaves nothing missing');
 const earlier=comparison(t,{history:{records:[btc],events:purchase},trackingStart:'2026-01-01'});
 const plan=benchmarks.comparisonMethod('2026-01-01',benchmarks.purchaseComparisonStart({records:[btc],events:purchase,today:'2026-09-30'},'investments'),'2026-09-30','investments');
 assert.equal(plan.chosenEarlier,true);
 assert.ok(earlier.notes().includes(`Comparisons start on ${formatDate(plan.method.date,'en')}, the day of your first investment, because nothing was invested before the tracking start you chose.`));
 const old=[{...purchase[0],occurred_on:'2014-05-01',created_at:'2014-05-01T00:00:00Z'}];
 const history=comparison(t,{history:{records:[{...btc,date:'2014-05-01'}],events:old}});
 assert.ok(history.notes().includes('Market history starts on 1 January 2016. Earlier purchases are compared from their recorded values on that day.'));
 const unrecorded=comparison(t);
 assert.ok(unrecorded.notes().includes('Some investments have no recorded purchase. Their first recorded value counts as invested on the day it was recorded, so it is never shown as a gain.'));
});

test('investments worth nothing and never funded show the invitation instead of a flat line, unless expenses fund the comparison',async t=>{
 const flat=[{date:'2026-09-10',actual:0,contributed:0},{date:'2026-09-20',actual:0,contributed:0}];
 const s=comparison(t,{},{decide:()=>({result:{points:flat,unavailable:[]},details:{}})});
 await s.r.flush();
 const empty=s.r.find(byType('EmptyState'));
 assert.equal(empty.props.title,'No investments yet');
 assert.equal(s.r.find(byType('Link')).props.href,'/assets');
 assert.equal(text(s.r.find(byType('Link'))),'Add asset');
 const store=storage({values:{'finance:benchmark-method:owner-1':JSON.stringify({scope:'expenses'})}});
 const expenses=comparison(t,{},{store,decide:()=>({result:{points:flat,unavailable:[]},details:{}})});
 await expenses.r.flush();
 assert.equal(expenses.r.all(byType('EmptyState')).length,0,'spending alone can still be compared');
 assert.ok(expenses.r.find(byType('InvestmentValueChart')));
});
