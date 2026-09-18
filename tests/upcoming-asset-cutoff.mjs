import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';
const {upcomingPayments}=loadTS('lib/planning.ts');
test('stale business and rental schedules never show payments before their asset record date',()=>{
 for(const [kind,incomeKind,link] of [['Business','Business income','business_id'],['Property','Rent income','income_source_id']]){
  const asset={id:'asset',name:'Algorithm',kind,date:'2026-10-01',frequency:'Once',amount:1000};
  const plan={id:'plan',name:'Income',kind:incomeKind,[link]:'asset',date:'2025-12-11',frequency:'Monthly',amount:1500};
  const rows=[asset,plan],before=structuredClone(rows);
  const result=upcomingPayments(rows,[],'2026-09-19','2026-10-19');
  assert.deepEqual(result.map(row=>row.date),['2026-10-11']);assert.equal(result[0].overdue,false);
  assert.equal(upcomingPayments(rows,[],'2026-09-19','2026-09-30').length,0);
  assert.equal(upcomingPayments(rows,[{record_id:'plan',due_on:'2026-10-11',status:'paid'}],'2026-10-12','2026-10-19').length,0);
  assert.deepEqual(rows,before);
 }
});
test('asset cutoff does not move later plan starts or hide unrelated overdue income',()=>{
 const asset={id:'asset',name:'Property',kind:'Property',date:'2026-10-01',frequency:'Once',amount:1000};
 const plan={id:'plan',name:'Rent',kind:'Rent income',income_source_id:'asset',date:'2026-11-05',frequency:'Monthly',amount:400};
 const salary={id:'salary',name:'Salary',kind:'Salary',date:'2026-09-01',frequency:'Monthly',amount:100};
 const result=upcomingPayments([asset,plan,salary],[],'2026-09-19','2026-11-10');
 assert.deepEqual(result.filter(row=>row.record.id==='plan').map(row=>row.date),['2026-11-05']);
 assert.equal(result.find(row=>row.record.id==='salary').overdue,true);
});
