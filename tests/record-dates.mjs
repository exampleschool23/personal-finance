import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeEntry} from '../lib/finance.ts';
import {compareRecordDates,matchesRecordDate} from '../lib/record-dates.ts';

test('raw planning records with null due dates sort safely in both directions',()=>{
 const records=[{id:'undated',date:null},{id:'new',date:'2026-09-17'},{id:'empty',date:''},{id:'old',date:'2026-09-01'},{id:'missing'}];
 const original=structuredClone(records);
 for(const [order,dated] of [['newest',['new','old']],['oldest',['old','new']]]){
  const sorted=[...records].sort((a,b)=>compareRecordDates(a.date,b.date,order));
  assert.deepEqual(sorted.map(r=>r.id),[...dated,'undated','empty','missing']);
 }
 assert.deepEqual(records,original);
 assert.equal(compareRecordDates(null,null),0);
});
test('date filters retain undated records only when no date bounds are selected',()=>{
 for(const date of [null,undefined,'']){
  assert.equal(matchesRecordDate(date,'',''),true);
  assert.equal(matchesRecordDate(date,'2026-09-01',''),false);
  assert.equal(matchesRecordDate(date,'','2026-09-30'),false);
 }
 assert.equal(matchesRecordDate('2026-09-01','2026-09-01','2026-09-30'),true);
 assert.equal(matchesRecordDate('2026-09-30','2026-09-01','2026-09-30'),true);
 assert.equal(matchesRecordDate('2026-10-01','2026-09-01','2026-09-30'),false);
});
test('planning and paginated record normalization preserves an optional lending due date without inventing one',()=>{
 const record={id:'loan',kind:'Money lent',date:null,lent_date:'2026-09-05',amount:'1234.56',quantity:'1',cost:'0.00000012',rate:'0'};
 const normalized=normalizeEntry(record);
 assert.equal(normalized.date,'');assert.equal(normalized.lent_date,'2026-09-05');
 assert.equal(normalized.amount,1234.56);assert.equal(normalized.cost,0.00000012);assert.equal(record.date,null);
 assert.deepEqual(normalizeEntry(normalized),normalized);
 assert.equal(normalizeEntry({...record,date:'2026-09-17',lent_date:null}).date,'2026-09-17');
});
