import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTS } from './helpers/load-ts.mjs';
const { monthlyIncomeCards } = loadTS('lib/monthly-income-cards.ts');
const entry = (id, kind, extra = {}) => ({ id, kind, name: 'Snoonu', currency: 'USD', amount: 5700, date: '2026-09-01', frequency: 'Monthly', ...extra });
test('legacy salary receipts annotate the existing card without adding their amounts', () => {
 const rows = [entry('schedule', 'Salary'), entry('receipt', 'Salary', { frequency: 'Once' }), entry('receipt2', 'Salary', { frequency: 'Once' })];
 const before = structuredClone(rows);
 const cards = monthlyIncomeCards(rows, '2026-09');
 assert.equal(cards.length, 1); assert.equal(cards[0].amount, 5700); assert.equal(cards[0].excluded, false); assert.equal(cards[0].notes.length, 1);
 assert.deepEqual(rows, before);
});
test('linked asset schedules annotate their existing estimate even with different names', () => {
 const cards = monthlyIncomeCards([entry('business', 'Business', { estimated_monthly_income: 1500 }), entry('plan', 'Business income', { name: 'Payout', business_id: 'business' })], '2026-09');
 assert.equal(cards.length, 1); assert.equal(cards[0].amount, 1500); assert.deepEqual(cards[0].notes, ['Already included in the business estimate.']);
});
test('distinct explicit sources and unmatched inactive schedules are preserved', () => {
 const cards = monthlyIncomeCards([entry('s1', 'Salary', { earning_source_id: 'one' }), entry('s2', 'Salary', { earning_source_id: 'two', frequency: 'Once' }), entry('later', 'Other income', { name: 'Later', date: '2027-01-01' })], '2026-09');
 assert.equal(cards.length, 3); assert.equal(cards.filter(card => card.excluded).length, 2);
});
test('explicit source receipts match schedule IDs even after a rename', () => {
 const cards = monthlyIncomeCards([entry('schedule', 'Salary'), entry('receipt', 'Salary', { name: 'Old name', frequency: 'Once', earning_source_id: 'source' })], '2026-09', [{ id: 'source', schedule_id: 'schedule' }]);
 assert.equal(cards.length, 1); assert.equal(cards[0].amount, 5700); assert.equal(cards[0].notes.length, 1);
});
test('rental source receipts resolve through the source to each existing property card', () => {
 const rows = [], sources = [];
 for (const [id,amount] of [['beruniy',450],['qushbegi',400]]) {
  rows.push(entry(id,'Property',{name:id,estimated_monthly_income:amount}),entry(id+'-plan','Rent income',{name:id,amount,income_source_id:id}),entry(id+'-paid','Rent income',{name:id,amount,frequency:'Once',earning_source_id:id+'-source'}));
  sources.push({id:id+'-source',schedule_id:id+'-plan',linked_record_id:id});
 }
 const cards=monthlyIncomeCards(rows,'2026-09',sources);
 assert.equal(cards.length,2);
 assert.deepEqual(cards.map(card=>card.amount),[450,400]);
 assert.ok(cards.every(card=>card.asset&&!card.excluded&&card.notes.includes('One-time payments are not added to the monthly estimate.')));
});
test('legacy unlinked rent matches a unique property but never overrides an explicit link', () => {
 const property=entry('home','Property',{estimated_monthly_income:450});
 const receipt=entry('paid','Rent income',{frequency:'Once'});
 assert.equal(monthlyIncomeCards([property,receipt],'2026-09').length,1);
 assert.equal(monthlyIncomeCards([property,{...receipt,income_source_id:'other-home'}],'2026-09').length,2);
 assert.equal(monthlyIncomeCards([property,{...property,id:'second-home'},receipt],'2026-09').length,3);
});
test('reusable business receipts also resolve to their existing asset', () => {
 const cards=monthlyIncomeCards([entry('business','Business',{estimated_monthly_income:100}),entry('paid','Business income',{frequency:'Once',earning_source_id:'source'})],'2026-09',[{id:'source',schedule_id:'plan',linked_record_id:'business'}]);
 assert.equal(cards.length,1);assert.equal(cards[0].amount,100);
});
test('receipt indicators require a positive actual receipt in the selected month through today', () => {
 const plan=entry('salary','Salary');
 for(const [extra,expected] of [[{},true],[{date:'2026-08-31'},false],[{date:'2026-09-19'},false],[{amount:0},false],[{frequency:'Monthly'},false]]) {
  const cards=monthlyIncomeCards([plan,entry('paid','Salary',{frequency:'Once',...extra})],'2026-09',[],'2026-09-18');
  assert.equal(cards[0].received,expected);
 }
 assert.equal(monthlyIncomeCards([plan],'2026-09',[],'2026-09-18')[0].received,false);
});
test('rental receipt marks only its own property and leaves estimates unchanged', () => {
 const rows=[entry('home','Property',{estimated_monthly_income:450}),entry('other','Property',{estimated_monthly_income:400}),entry('paid','Rent income',{amount:100,frequency:'Once',earning_source_id:'source'})];
 const cards=monthlyIncomeCards(rows,'2026-09',[{id:'source',linked_record_id:'home',schedule_id:'plan'}],'2026-09-18');
 assert.deepEqual(cards.map(card=>[card.entry.id,card.received,card.amount]),[['home',true,450],['other',false,400]]);
});

test('sample history displays September salary, never the all-time total', () => {
 const rows=Array.from({length:81},(_,index)=>entry('receipt-'+index,'Salary',{
  frequency:'Once',earning_source_id:'salary',name:'Sample salary USD',
  date:new Date(Date.UTC(2020,index,25)).toISOString().slice(0,10),
  amount:Math.round(5700*(.65+.35*(index+1)/81)),
 }));
 assert.equal(rows.reduce((sum,row)=>sum+row.amount,0),381900);
 const before=structuredClone(rows);
 const cards=monthlyIncomeCards(rows,'2026-09',[{id:'salary',mode:'variable'}],'2026-09-25');
 assert.equal(cards.length,1);
 assert.equal(cards[0].amount,5700);
 assert.equal(cards[0].received,true);
 assert.equal(cards[0].excluded,true);
 assert.deepEqual(rows,before);
 assert.deepEqual(monthlyIncomeCards([entry('summary','Salary',{frequency:'Once',date:'',amount:381900})],'2026-09'),[]);
});

test('monthly variable payments retain precision and distinct source identities', () => {
 const rows=[
  entry('first','Salary',{frequency:'Once',earning_source_id:'one',amount:100.125}),
  entry('second','Salary',{frequency:'Once',earning_source_id:'one',amount:200.25,name:'Renamed'}),
  entry('other','Salary',{frequency:'Once',earning_source_id:'two',amount:40}),
  entry('bonus','Other income',{frequency:'Once',earning_source_id:'one',payment_type:'bonus',amount:15}),
  entry('old','Salary',{frequency:'Once',earning_source_id:'one',amount:900000,date:'2026-08-31'}),
  entry('next','Salary',{frequency:'Once',earning_source_id:'one',amount:900000,date:'2026-10-01'}),
 ];
 const cards=monthlyIncomeCards(rows,'2026-09',[],'2026-09-25');
 assert.deepEqual(cards.map(card=>card.amount),[300.375,40,15]);
 assert.ok(cards.every(card=>card.received));
});

test('linked payments without an asset estimate group within the month', () => {
 const rows=[entry('one','Rent income',{frequency:'Once',income_source_id:'home',amount:100}),entry('two','Rent income',{frequency:'Once',income_source_id:'home',amount:200})];
 assert.deepEqual(monthlyIncomeCards(rows,'2026-09').map(card=>card.amount),[300]);
});

test('receipts from another currency never mark an unconverted estimate as received', () => {
 const cards=monthlyIncomeCards([entry('schedule','Salary'),entry('receipt','Salary',{frequency:'Once',currency:'UZS',earning_source_id:'source'})],'2026-09',[{id:'source',schedule_id:'schedule'}],'2026-09-25');
 assert.equal(cards.length,2);
 assert.equal(cards.find(card=>card.entry.id==='schedule').received,false);
});

test('receipt totals retain precision separately from estimates and exclude future and other-month payments',()=>{
 const rows=[entry('schedule','Salary',{earning_source_id:'source'}),entry('a','Salary',{frequency:'Once',earning_source_id:'source',amount:12.345,date:'2026-09-01'}),entry('b','Salary',{frequency:'Once',earning_source_id:'source',amount:7.125,date:'2026-09-02'}),entry('future','Salary',{frequency:'Once',earning_source_id:'source',amount:100,date:'2026-09-30'}),entry('prior','Salary',{frequency:'Once',earning_source_id:'source',amount:200,date:'2026-08-01'})];
 const cards=monthlyIncomeCards(rows,'2026-09',[{id:'source',schedule_id:'schedule'}],'2026-09-25');
 assert.equal(cards.length,1);assert.equal(cards[0].amount,5700);assert.equal(cards[0].receivedAmount,19.47);
});
