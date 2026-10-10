import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTS } from './helpers/load-ts.mjs';
const { monthlyIncomeCards } = loadTS('lib/monthly-income-cards.ts');
const entry = (id, kind, extra = {}) => ({ id, kind, name: 'Snoonu', currency: 'USD', amount: 5700, date: '2026-09-01', frequency: 'Monthly', ...extra });
test('salary receipts that name their schedule annotate its card without adding their amounts', () => {
 const rows = [entry('schedule', 'Salary'), entry('receipt', 'Salary', { frequency: 'Once', occurrence_record_id: 'schedule' }), entry('receipt2', 'Salary', { frequency: 'Once', occurrence_record_id: 'schedule' })];
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
test('source receipts match their schedule by the one link (occurrence_record_id, migration 140) even after a rename', () => {
 const cards = monthlyIncomeCards([entry('schedule', 'Salary'), entry('receipt', 'Salary', { name: 'Old name', frequency: 'Once', earning_source_id: 'source', occurrence_record_id: 'schedule' })], '2026-09', [{ id: 'source', schedule_id: 'schedule' }]);
 assert.equal(cards.length, 1); assert.equal(cards[0].amount, 5700); assert.equal(cards[0].notes.length, 1);
 assert.equal(monthlyIncomeCards([entry('schedule', 'Salary'), entry('receipt', 'Salary', { frequency: 'Once', earning_source_id: 'source' })], '2026-09', [{ id: 'source', schedule_id: 'schedule' }]).length, 2, 'a source id alone is not the link');
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
test('rent joins a property only by its id, never by a matching name', () => {
 const property=entry('home','Property',{estimated_monthly_income:450});
 const receipt=entry('paid','Rent income',{frequency:'Once'});
 assert.equal(monthlyIncomeCards([property,receipt],'2026-09').length,2,'an unlinked receipt with the same name stays apart');
 assert.equal(monthlyIncomeCards([property,{...receipt,income_source_id:'home'}],'2026-09').length,1);
 assert.equal(monthlyIncomeCards([property,{...receipt,income_source_id:'other-home'}],'2026-09').length,2);
});
test('a same-name receipt that names no schedule never marks the schedule received', () => {
 const cards=monthlyIncomeCards([entry('schedule','Salary'),entry('receipt','Salary',{frequency:'Once',amount:5700})],'2026-09',[],'2026-09-25');
 assert.equal(cards.length,2);
 const schedule=cards.find(card=>card.entry.id==='schedule');
 assert.deepEqual([schedule.received,schedule.receivedAmount],[false,0]);
 assert.equal(cards.find(card=>card.entry.id==='receipt').excluded,true,'it becomes its own one-time card');
 // Two unlinked receipts with one name are two cards, not a group made up by name.
 assert.equal(monthlyIncomeCards([entry('a','Other income',{frequency:'Once'}),entry('b','Other income',{frequency:'Once'})],'2026-09').length,2);
});
test('reusable business receipts also resolve to their existing asset', () => {
 const cards=monthlyIncomeCards([entry('business','Business',{estimated_monthly_income:100}),entry('paid','Business income',{frequency:'Once',earning_source_id:'source'})],'2026-09',[{id:'source',schedule_id:'plan',linked_record_id:'business'}]);
 assert.equal(cards.length,1);assert.equal(cards[0].amount,100);
});
test('receipt indicators require an actual receipt (a recorded 0 counts) in the selected month through today', () => {
 const plan=entry('salary','Salary');
 for(const [extra,expected] of [[{},true],[{date:'2026-08-31'},false],[{date:'2026-09-19'},false],[{amount:0},true],[{frequency:'Monthly'},false]]) {
  const cards=monthlyIncomeCards([plan,entry('paid','Salary',{frequency:'Once',occurrence_record_id:'salary',...extra})],'2026-09',[],'2026-09-18');
  assert.equal(cards[0].received,expected);
 }
 assert.equal(monthlyIncomeCards([plan],'2026-09',[],'2026-09-18')[0].received,false);
 const zero=monthlyIncomeCards([plan,entry('nothing','Salary',{frequency:'Once',occurrence_record_id:'salary',amount:0,date:'2026-09-01'})],'2026-09',[],'2026-09-18')[0];
 assert.deepEqual([zero.received,zero.receivedAmount,zero.amount],[true,0,5700],'a recorded 0 shows as received $0 beside the estimate');
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

test('a payment in another currency joins its schedule by id; without a rate its amount is missing, never added raw', () => {
 const cards=monthlyIncomeCards([entry('schedule','Salary'),entry('receipt','Salary',{frequency:'Once',currency:'UZS',amount:12500000,occurrence_record_id:'schedule'})],'2026-09',[],'2026-09-25');
 assert.equal(cards.length,1);
 assert.deepEqual([cards[0].received,cards[0].receivedAmount,cards[0].missing],[true,0,1]);
 const { incomeCardTotals } = loadTS('lib/monthly-income-cards.ts');
 assert.equal(incomeCardTotals(cards).missing,1,'the received total is unknown');
});

test('a EUR payment linked to a USD schedule counts converted into the schedule currency', () => {
 const rows=[entry('schedule','Salary'),entry('receipt','Salary',{frequency:'Once',currency:'EUR',amount:100,occurrence_record_id:'schedule'})];
 const cards=monthlyIncomeCards(rows,'2026-09',[],'2026-09-25',{USD:1,EUR:0.8});
 assert.equal(cards.length,1);
 assert.deepEqual([cards[0].received,cards[0].receivedAmount,cards[0].missing,cards[0].amount],[true,125,0,5700]);
 assert.ok(Math.abs(monthlyIncomeCards(rows,'2026-09',[],'2026-09-25',(from,to)=>from==='EUR'&&to==='USD'?1.1:null)[0].receivedAmount-110)<1e-9,'a dated pair rate works too');
});

test('receipt totals retain precision separately from estimates and exclude future and other-month payments',()=>{
 const rows=[entry('schedule','Salary'),entry('a','Salary',{frequency:'Once',occurrence_record_id:'schedule',amount:12.345,date:'2026-09-01'}),entry('b','Salary',{frequency:'Once',occurrence_record_id:'schedule',amount:7.125,date:'2026-09-02'}),entry('future','Salary',{frequency:'Once',occurrence_record_id:'schedule',amount:100,date:'2026-09-30'}),entry('prior','Salary',{frequency:'Once',occurrence_record_id:'schedule',amount:200,date:'2026-08-01'})];
 const cards=monthlyIncomeCards(rows,'2026-09',[],'2026-09-25');
 assert.equal(cards.length,1);assert.equal(cards[0].amount,5700);assert.equal(cards[0].receivedAmount,19.47);
});

test('a variable source shows its approximate monthly income as the estimate, and its receipts join that card', () => {
 const { sourcesIn } = loadTS('lib/monthly-income-cards.ts');
 const source = { id: 'freelance', name: 'QA Freelance', kind: 'Other income', currency: 'USD', mode: 'variable', archived: false, amount: null, frequency: null, start_date: null, end_date: null, linked_record_id: null, approx_monthly: 1200 };
 const receipt = entry('r1', 'Other income', { name: 'QA Freelance', frequency: 'Once', amount: 450.5, date: '2026-09-03', earning_source_id: 'freelance' });
 const cards = monthlyIncomeCards([receipt], '2026-09', [source], '2026-09-20');
 assert.equal(cards.length, 1);
 assert.equal(cards[0].excluded, false); assert.equal(cards[0].amount, 1200);
 assert.equal(cards[0].received, true); assert.equal(cards[0].receivedAmount, 450.5);
 const pending = monthlyIncomeCards([], '2026-09', [source], '2026-09-20');
 assert.equal(pending[0].amount, 1200); assert.equal(pending[0].received, false);
 assert.equal(monthlyIncomeCards([], '2026-09', [{ ...source, archived: true }]).length, 0);
 assert.equal(monthlyIncomeCards([], '2026-09', [{ ...source, approx_monthly: null }]).length, 0);
 // Approximate amounts follow the display currency of the converted entries; no rate means no estimate.
 assert.deepEqual(sourcesIn([{ ...source, currency: 'UZS', approx_monthly: 12500000 }], 'USD', { UZS: 12500 }).map(item => [item.currency, item.approx_monthly]), [['USD', 1000]]);
 assert.equal(sourcesIn([{ ...source, currency: 'EUR' }], 'USD', {})[0].approx_monthly, null);
});
test('income totals add every card received and only included estimates', () => {
 const { incomeCardTotals } = loadTS('lib/monthly-income-cards.ts');
 assert.deepEqual(incomeCardTotals([{ amount: 5700, excluded: false, receivedAmount: 5700 }, { amount: 1000, excluded: false, receivedAmount: 424 }, { amount: 200, excluded: true, receivedAmount: 200 }]), { estimate: 6700, received: 6324, missing: 0 });
});

test('CF-048: the monthly estimate counts the variable sources\' approximate income, as the income cards do', () => {
 const { estimatedCashFlow } = loadTS('lib/finance.ts');
 const { approximateIncome, incomeCardTotals } = loadTS('lib/monthly-income-cards.ts');
 const salary = entry('salary', 'Salary', { amount: 2000 });
 const sources = [
  { id: 'v1', name: 'QA Freelance', kind: 'Other income', currency: 'USD', mode: 'variable', archived: false, approx_monthly: 1200 },
  { id: 'v2', name: 'QA Clients', kind: 'Other income', currency: 'USD', mode: 'variable', archived: false, approx_monthly: 600 },
  { id: 'v3', name: 'QA Old', kind: 'Other income', currency: 'USD', mode: 'variable', archived: true, approx_monthly: 900 },
  { id: 'v4', name: 'QA EUR', kind: 'Other income', currency: 'EUR', mode: 'variable', archived: false, approx_monthly: 100 },
 ];
 const rates = { EUR: 0.8 };
 const variable = approximateIncome(sources, 'USD', rates);
 assert.deepEqual(variable, { amount: 1800 + 125, missing: 0 }, 'archived sources drop out; EUR 100 at 0.8 EUR per USD is $125');
 const cards = monthlyIncomeCards([salary], '2026-09', sources.map(source => source.currency === 'EUR' ? { ...source, currency: 'USD', approx_monthly: 125 } : source));
 const estimate = estimatedCashFlow([salary], '2026-09', undefined, variable.amount);
 assert.equal(estimate.plannedIncome, incomeCardTotals(cards).estimate);
 assert.equal(estimate.forecast, 2000 + 1925);
 assert.deepEqual(approximateIncome([{ ...sources[3] }], 'USD', {}), { amount: 0, missing: 1 }, 'MONEY-008: no rate: left out and counted missing, so the estimate reads —, never too low');
 assert.deepEqual(approximateIncome([sources[0], sources[3], sources[2], { ...sources[3], mode: 'fixed' }], 'USD', {}), { amount: 1200, missing: 1 }, 'an archived or fixed source is neither counted nor missing');
});

test('each income card stays in its source\'s own currency, a payment shows as entered, and only the headline converts', () => {
 const { incomeCardTotals } = loadTS('lib/monthly-income-cards.ts');
 const rates = { USD: 1, UZS: 12000 };
 const rows = [
  entry('epam', 'Salary', { amount: 3450 }),
  entry('rent', 'Rent income', { currency: 'UZS', amount: 6000000 }),
  entry('paid', 'Salary', { frequency: 'Once', currency: 'UZS', amount: 30000000, date: '2026-09-05', occurrence_record_id: 'epam' }),
 ];
 const cards = monthlyIncomeCards(rows, '2026-09', [], '2026-09-25', rates);
 const epam = cards.find(card => card.entry.id === 'epam'), rent = cards.find(card => card.entry.id === 'rent');
 assert.deepEqual([epam.entry.currency, epam.amount, epam.receivedAmount, epam.entered], ['USD', 3450, 2500, { amount: 30000000, currency: 'UZS' }], 'the UZS payment is shown as entered and counted in dollars against the plan');
 assert.deepEqual([rent.entry.currency, rent.amount], ['UZS', 6000000]);
 assert.deepEqual(cards.map(card => card.entry.id), ['epam', 'rent'], 'salary first, then by size in one currency (UZS 6,000,000 is $500)');
 const usd = (amount, currency) => currency === 'USD' ? amount : currency === 'UZS' ? amount / 12000 : null;
 assert.deepEqual(incomeCardTotals(cards, usd), { estimate: 3950, received: 2500, missing: 0 });
 assert.equal(incomeCardTotals(cards, (amount, currency) => currency === 'USD' ? amount : null).missing, 2, 'a card no rate converts leaves the headline unknown');
});
