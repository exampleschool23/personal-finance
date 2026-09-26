import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';
const {accountActivityPage}=loadTS('lib/account-activity-page.ts');
const data={activity:[{id:'op',occurred_on:'2026-09-25'}],movements:[{id:'move',occurred_on:'2026-09-24'}],records:Array.from({length:19},(_,i)=>({id:String(i).padStart(2,'0'),account_id:'cash',date:'2026-09-23',amount:123.456})),investmentLinks:[{id:'link',investment_history:{occurred_on:'2026-09-22'}}]};
const ids=page=>[...page.activity,...page.movements,...page.records,...page.investmentLinks].map(row=>row.id);
test('ten rows per page covers all activity sources without omissions or overlapping pages',()=>{
 const before=structuredClone(data);
 const pages=[1,2,3].map(page=>accountActivityPage(data,page));
 assert.deepEqual(pages.map(page=>ids(page).length),[10,10,2]);
 assert.equal(new Set(pages.flatMap(ids)).size,22);
 assert.equal(pages[0].activity[0].id,'op');assert.equal(pages[2].investmentLinks[0].id,'link');
 assert.equal(pages[0].records[0].amount,123.456);assert.deepEqual(data,before);
});
test('empty and shrinking datasets clamp pages and unrelated owners cannot retain previous rows',()=>{
 assert.equal(accountActivityPage(data,99).page,3);
 const empty=accountActivityPage({activity:[],records:[]},3);
 assert.equal(empty.page,1);assert.equal(empty.pages,1);assert.equal(empty.total,0);assert.deepEqual(ids(empty),[]);
 const other=accountActivityPage({activity:[{id:'other',occurred_on:'2026-09-26'}],records:[{id:'unlinked'}]},3);
 assert.deepEqual(ids(other),['other']);assert.equal(other.page,1);
});
