import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';
const {advance}=loadTS('lib/telegram-flow.ts');
const {recordSchema}=loadTS('lib/record-schema.ts');
const id=n=>`78000000-0000-4000-8000-0000000000${String(n).padStart(2,'0')}`;
const entry=(n,name,kind,amount,extra={})=>({id:id(n),name,kind,amount,currency:'USD',quantity:0,cost:0,rate:0,date:'2026-01-05',frequency:'Once',notes:'',...extra});
const wallet=entry(1,'Wallet','Cash',900);
// Two salaries, a flat let out and a bill, each paid on a schedule; the archived one is no longer offered.
const records=[wallet,entry(2,'Beruniy flat','Property',90000),
 entry(10,'EPAM Systems','Salary',3450,{frequency:'Monthly'}),entry(11,'Snoonu','Salary',5700,{frequency:'Monthly'}),
 entry(12,'Beruniy rent','Rent income',450,{frequency:'Monthly',income_source_id:id(2)}),
 entry(13,'Old job','Salary',100,{frequency:'Monthly',archived:true}),entry(14,'Internet','Living expense',20,{frequency:'Monthly'})];
const ctx={language:'en',today:'2026-10-07',newId:id(99),categories:[],accounts:[wallet],liabilities:[],records,currencies:['USD']};
const chat=500;
const buttons=reply=>reply.keyboard.inline.flat().map(button=>button.callback_data);
function run(steps,context=ctx){let draft=null,result=null;for(const input of steps){result=advance(draft,input,context,chat);draft=result.draft;}return result;}
const finish=[{callback:'f:acc:'+id(1)},{text:'3450'},{callback:'f:skip'},{callback:'f:date:today'},{callback:'f:save'}];

test('the bot asks which scheduled payment an income is and saves the schedule id',()=>{
 const asked=run([{text:'Income'},{callback:'f:cat:Salary'}]);
 assert.equal(asked.draft.step,'schedule');assert.equal(asked.reply.text,'Which scheduled payment is this?');
 assert.deepEqual(buttons(asked.reply),['f:sch:'+id(10),'f:sch:'+id(11),'f:sch:none','f:back','f:cancel']);
 assert.equal(advance(asked.draft,{callback:'f:sch:'+id(13)},ctx,chat).draft.step,'schedule','an archived schedule is refused');
 const account=advance(asked.draft,{callback:'f:sch:'+id(10)},ctx,chat);
 assert.equal(account.draft.step,'account');
 assert.equal(advance(account.draft,{callback:'f:back'},ctx,chat).draft.step,'schedule','Back returns to the schedule');
 const saved=run([{text:'Income'},{callback:'f:cat:Salary'},{callback:'f:sch:'+id(10)},...finish]);
 // Skipping the name keeps the schedule's own name; the id travels through the app's schema.
 assert.equal(saved.commit.record.occurrence_record_id,id(10));assert.equal(saved.commit.record.name,'EPAM Systems');
 assert.equal(recordSchema.parse(saved.commit.record).occurrence_record_id,id(10));
});

test('rent income carries its property, and "Not a scheduled payment" names no schedule',()=>{
 const rent=run([{text:'Income'},{callback:'f:cat:Rent income'},{callback:'f:sch:'+id(12)},...finish]);
 assert.equal(rent.commit.record.occurrence_record_id,id(12));assert.equal(rent.commit.record.income_source_id,id(2));
 const loose=run([{text:'Income'},{callback:'f:cat:Salary'},{callback:'f:sch:none'},...finish]);
 assert.equal(loose.commit.record.occurrence_record_id,undefined);assert.equal(loose.commit.record.name,'Salary');
 const bill=run([{text:'Expense'},{callback:'f:cat:Living expense'}]);
 assert.deepEqual(buttons(bill.reply),['f:sch:'+id(14),'f:sch:none','f:back','f:cancel']);
 // A category without schedules goes straight to the account.
 assert.equal(run([{text:'Income'},{callback:'f:cat:Other income'}]).draft.step,'account');
});

test('a typed entry shows its only schedule on the card, where it can be changed',()=>{
 const one={...ctx,records:records.filter(record=>record.id!==id(11))};
 const card=run([{text:'+3450 salary'}],one);
 assert.equal(card.draft.step,'confirm');assert.equal(card.draft.data.schedule_id,id(10));
 assert.match(card.reply.text,/Scheduled payment: EPAM Systems/);assert.ok(buttons(card.reply).includes('f:chsch'));
 const change=advance(card.draft,{callback:'f:chsch'},one,chat);
 assert.equal(change.draft.step,'schedule');
 const none=advance(change.draft,{callback:'f:sch:none'},one,chat);
 assert.equal(none.draft.step,'confirm');assert.equal(none.draft.data.schedule_id,null);
 // With two salaries nothing is chosen for the owner.
 const two=run([{text:'+3450 salary'}]);
 assert.equal(two.draft.data.schedule_id,null);assert.doesNotMatch(two.reply.text,/Scheduled payment/);
});
