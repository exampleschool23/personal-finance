import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';
const {spendingPace,previousMonthOf}=loadTS('lib/spending-pace.ts');
const {monthlyReview}=loadTS('lib/transaction-tools.ts');
const record=(id,kind,amount,date,extra={})=>({id,name:id,kind,amount,quantity:1,cost:0,rate:0,currency:'USD',frequency:'Once',date,notes:'',...extra});
const records=[
 record('a','Living expense',100,'2026-10-01'),record('b','Rent expense',900,'2026-10-02'),record('salary','Salary',3000,'2026-10-02'),
 record('c','Living expense',40,'2026-09-01'),record('d','Living expense',60,'2026-09-15'),record('e','Charity',10,'2026-09-30'),
 record('later','Living expense',500,'2026-10-20'),record('plan','Living expense',70,'2026-09-03',{frequency:'Monthly'}),
];
const input={records,splits:[],snapshots:[]};

test('spending pace is the Monthly review total with each day as the cut-off, for this month and last',()=>{
 const pace=spendingPace(input,'2026-10-02','USD',{USD:1});
 assert.equal(pace.month,'2026-10');assert.equal(pace.previousMonth,'2026-09');
 assert.equal(pace.points.length,31);
 assert.deepEqual(pace.points.slice(0,3),[{day:1,current:100,previous:40},{day:2,current:1000,previous:40},{day:3,current:null,previous:40}]);
 assert.equal(pace.points[14].previous,100);assert.equal(pace.points[29].previous,110);
 assert.equal(pace.points[30].previous,110,'September has 30 days; day 31 keeps its total');
 // Income, planned (recurring) records and future-dated spending are not counted.
 assert.equal(pace.spent,1000);assert.equal(pace.previousToDate,40);
 assert.equal(pace.spent,monthlyReview(records,[],[],'2026-10','USD','2026-10-02').spent);
 assert.equal(pace.missing,false);
});

test('spending pace handles year boundaries, February and missing exchange rates',()=>{
 assert.equal(previousMonthOf('2026-01'),'2025-12');assert.equal(previousMonthOf('2028-03'),'2028-02');
 const march=spendingPace({records:[record('x','Living expense',5,'2028-02-29')],splits:[],snapshots:[]},'2028-03-31','USD',{USD:1});
 assert.equal(march.points.length,31);assert.equal(march.points[28].previous,5);assert.equal(march.points[30].previous,5);
 const foreign=spendingPace({records:[record('y','Living expense',50000,'2026-10-01',{currency:'UZS'})],splits:[],snapshots:[]},'2026-10-01','USD',{USD:1});
 assert.equal(foreign.missing,true,'no rate is inferred');
});

test('a month and previous month without spending is empty, so the card shows an empty state instead of a $0–$1 axis',()=>{
 const empty=spendingPace({records:[record('salary','Salary',3000,'2026-10-02')],splits:[],snapshots:[]},'2026-10-02','USD',{USD:1});
 assert.equal(empty.empty,true);assert.equal(empty.spent,0);
 assert.equal(spendingPace(input,'2026-10-02','USD',{USD:1}).empty,false);
 assert.equal(spendingPace({records:[record('x','Living expense',5,'2026-09-03',{currency:'EUR'})],splits:[],snapshots:[]},'2026-10-02','USD',{USD:1}).empty,false,'missing rates are not an empty month');
});
