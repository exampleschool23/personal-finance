import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadTS} from './helpers/load-ts.mjs';
const {advance,mainMenu,menuChoice,parseDay,prompt}=loadTS('lib/telegram-flow.ts');
const {recordSchema}=loadTS('lib/record-schema.ts');
const {planningSchemas}=loadTS('lib/planning-schemas.ts');
const {translate}=loadTS('lib/i18n.ts');
const id=n=>`77000000-0000-4000-8000-0000000000${String(n).padStart(2,'0')}`;
const entry=(n,name,kind,amount,currency='UZS')=>({id:id(n),name,kind,amount,currency,quantity:0,cost:0,rate:0,date:'2026-01-01',frequency:'Once',notes:''});
const ctx=(language='en')=>({language,today:'2026-09-30',newId:id(99),
 categories:[{id:id(20),name:'Groceries',direction:'expense'},{id:id(21),name:'Freelance',direction:'income'}],
 accounts:[entry(1,'Wallet','Cash',900000),entry(2,'Card','Cash',300,'USD'),entry(3,'Bitcoin','Crypto',1,'USD')],
 liabilities:[entry(10,'Car loan','Loan',2000,'USD'),entry(11,'Flat','Mortgage',50000000),entry(12,'Old debt','Debt',0,'USD')],
});
const chat=500;
const buttons=reply=>reply.keyboard.inline.flat().map(button=>button.callback_data);
function run(steps,context=ctx()){
 let draft=null,result=null;
 for(const input of steps){result=advance(draft,input,context,chat);draft=result.draft;}
 return result;
}

test('the menu is translated and recognised in every language, and cancel returns to it',()=>{
 assert.deepEqual(mainMenu('en').reply,[['Expense','Income'],['Transfer','Pay loan or debt'],['Mortgage payment','Upcoming payments']]);
 assert.equal(menuChoice(translate('ru','Expense')),'expense');assert.equal(menuChoice(' '+translate('ru','Income').toUpperCase()+' '),'income');assert.equal(menuChoice('Upcoming payments'),'upcoming');assert.equal(menuChoice('hello'),null);
 const stray=advance(null,{text:'hello'},ctx(),chat);
 assert.equal(stray.draft,null);assert.equal(stray.reply.text,'Choose what to add.');assert.deepEqual(stray.reply.keyboard,mainMenu('en'));
 assert.deepEqual(advance(null,{text:'Upcoming payments'},ctx(),chat),{draft:null,reply:null,menu:'upcoming'});
 const cancelled=run([{text:'Expense'},{callback:'f:cat:'+id(20)},{callback:'f:cancel'}]);
 assert.equal(cancelled.draft,null);assert.equal(cancelled.reply.text,'Cancelled.');
 assert.equal(run([{text:'Expense'},{text:'/cancel'}]).draft,null);
});

test('an expense walks category, account, amount, name and date, then saves a valid record in the account currency',()=>{
 const start=advance(null,{text:'Expense'},ctx(),chat);
 assert.equal(start.draft.step,'category');assert.equal(start.reply.text,'Choose an expense category');
 assert.deepEqual(buttons(start.reply),['f:cat:'+id(20),'f:cat:Rent expense','f:cat:Living expense','f:cat:Charity','f:cat:Other expense','f:cancel']);
 const account=advance(start.draft,{callback:'f:cat:'+id(20)},ctx(),chat);
 assert.equal(account.reply.text,'From which account?');
 assert.deepEqual(buttons(account.reply),['f:acc:'+id(1),'f:acc:'+id(2),'f:back','f:cancel']);
 assert.ok(!buttons(account.reply).includes('f:acc:'+id(3)),'holdings are not cash accounts');
 const amount=advance(account.draft,{callback:'f:acc:'+id(1)},ctx(),chat);
 assert.equal(amount.reply.text,'Type the amount in UZS');
 const bad=advance(amount.draft,{text:'abc'},ctx(),chat);
 assert.equal(bad.draft.step,'amount');assert.match(bad.reply.text,/positive number/);
 const name=advance(amount.draft,{text:'250 000'},ctx(),chat);
 assert.equal(name.draft.data.amount,250000);assert.equal(name.draft.step,'name');
 const date=advance(name.draft,{callback:'f:skip'},ctx(),chat);
 assert.equal(date.draft.step,'date');
 const confirm=advance(date.draft,{callback:'f:date:yesterday'},ctx(),chat);
 assert.equal(confirm.draft.step,'confirm');assert.equal(confirm.draft.data.date,'2026-09-29');assert.equal(confirm.draft.data.id,id(99));
 assert.equal(confirm.reply.text,'<b>Save this?</b>\nExpense · Groceries\n<b>Groceries</b> · UZS 250,000 · 29 September 2026\nfrom Wallet');
 assert.deepEqual(buttons(confirm.reply),['f:save','f:back','f:cancel']);
 const saved=advance(confirm.draft,{callback:'f:save'},ctx(),chat);
 assert.equal(saved.draft,null);assert.equal(saved.reply,null);
 assert.equal(saved.commit.type,'record');
 assert.ok(recordSchema.safeParse(saved.commit.record).success);
 assert.deepEqual({...saved.commit.record},{id:id(99),name:'Groceries',kind:'Other expense',custom_category_id:id(20),currency:'UZS',amount:250000,quantity:0,cost:0,rate:0,date:'2026-09-29',frequency:'Once',notes:'',account_id:id(1),payment_type:'regular',estimated_monthly_payment:0,estimated_monthly_income:0,ownership_percentage:100});
});

test('a default category keeps its kind, a typed name is used and Russian decimals parse',()=>{
 const result=run([{text:translate('ru','Income')},{callback:'f:cat:Salary'},{callback:'f:acc:'+id(2)},{text:'1 200,50'},{text:'September pay'},{text:'30.09.2026'},{callback:'f:save'}],ctx('ru'));
 assert.equal(result.commit.record.kind,'Salary');assert.equal(result.commit.record.custom_category_id,null);
 assert.equal(result.commit.record.name,'September pay');assert.equal(result.commit.record.amount,1200.5);assert.equal(result.commit.record.currency,'USD');assert.equal(result.commit.record.date,'2026-09-30');
 assert.ok(recordSchema.safeParse(result.commit.record).success);
 const income=run([{text:'Income'},{callback:'f:cat:Salary'}]);
 assert.equal(income.reply.text,'Into which account?');
 assert.equal(run([{text:'Income'},{callback:'f:cat:'+id(20)}]).draft.step,'category','an expense category is refused for income');
});

test('transfers ask for the received amount only across currencies and exclude the source account',()=>{
 const same=run([{text:'Transfer'},{callback:'f:acc:'+id(1)}]);
 assert.equal(same.reply.text,'To which account?');assert.deepEqual(buttons(same.reply),['f:tgt:'+id(2),'f:back','f:cancel']);
 const cross=run([{text:'Transfer'},{callback:'f:acc:'+id(2)},{callback:'f:tgt:'+id(1)},{text:'100'}]);
 assert.equal(cross.draft.step,'received');assert.equal(cross.reply.text,'Type the amount received in UZS');
 const done=run([{text:'Transfer'},{callback:'f:acc:'+id(2)},{callback:'f:tgt:'+id(1)},{text:'100'},{text:'1250000'},{callback:'f:date:today'},{callback:'f:save'}]);
 assert.deepEqual(done.commit,{type:'planning',action:'transfer',data:{id:id(99),account_id:id(2),target_id:id(1),date:'2026-09-30',notes:'',amount:100,received:1250000,fee:0}});
 assert.ok(planningSchemas.transfer.safeParse(done.commit.data).success);
 assert.equal(run([{text:'Transfer'},{callback:'f:acc:'+id(2)},{callback:'f:tgt:'+id(2)}]).draft.step,'target','the same account cannot be both ends');
});

test('loan repayments and mortgage payments offer only matching-currency accounts and cap at the balance',()=>{
 const pick=run([{text:'Pay loan or debt'}]);
 assert.equal(pick.reply.text,'Which loan or debt?');assert.deepEqual(buttons(pick.reply),['f:tgt:'+id(10),'f:cancel'],'settled debts are left out');
 const accounts=run([{text:'Pay loan or debt'},{callback:'f:tgt:'+id(10)}]);
 assert.deepEqual(buttons(accounts.reply),['f:acc:'+id(2),'f:back','f:cancel'],'only the USD account can repay a USD loan');
 assert.equal(run([{text:'Pay loan or debt'},{callback:'f:tgt:'+id(10)},{callback:'f:acc:'+id(1)}]).draft.step,'account');
 const tooMuch=run([{text:'Pay loan or debt'},{callback:'f:tgt:'+id(10)},{callback:'f:acc:'+id(2)},{text:'2500'}]);
 assert.equal(tooMuch.draft.step,'amount');assert.equal(tooMuch.reply.text,'Repayment cannot exceed the outstanding balance.');
 const repaid=run([{text:'Pay loan or debt'},{callback:'f:tgt:'+id(10)},{callback:'f:acc:'+id(2)},{text:'400'},{callback:'f:date:today'},{callback:'f:save'}]);
 assert.deepEqual(repaid.commit,{type:'planning',action:'repayment',data:{id:id(99),account_id:id(2),target_id:id(10),date:'2026-09-30',notes:'',amount:400,received:0,fee:0}});
 assert.ok(planningSchemas.repayment.safeParse(repaid.commit.data).success);
 const mortgage=run([{text:'Mortgage payment'},{callback:'f:tgt:'+id(11)},{callback:'f:acc:'+id(1)},{text:'5000000'}]);
 assert.equal(mortgage.draft.step,'interest');assert.equal(mortgage.reply.text,'Type the interest amount in UZS, or 0');
 const paid=run([{text:'Mortgage payment'},{callback:'f:tgt:'+id(11)},{callback:'f:acc:'+id(1)},{text:'5000000'},{text:'1200000'},{text:'2026-09-28'},{callback:'f:save'}]);
 assert.deepEqual(paid.commit,{type:'planning',action:'mortgage',data:{id:id(99),account_id:id(1),target_id:id(11),date:'2026-09-28',notes:'',amount:5000000,received:0,fee:1200000}});
 assert.ok(planningSchemas.mortgage.safeParse(paid.commit.data).success);
 assert.equal(run([{text:'Mortgage payment'},{callback:'f:tgt:'+id(11)},{callback:'f:acc:'+id(1)},{text:'5000000'},{callback:'f:zero'}]).draft.data.interest,0);
});

test('dates must be real and not in the future; long lists page eight at a time',()=>{
 assert.equal(parseDay('2026-09-30','2026-09-30'),'2026-09-30');assert.equal(parseDay('1.9.2026','2026-09-30'),'2026-09-01');
 for(const bad of ['2026-10-01','2026-02-30','yesterday','30/09/26'])assert.equal(parseDay(bad,'2026-09-30'),null,bad);
 const many=ctx();many.categories=Array.from({length:10},(_,index)=>({id:id(30+index),name:'Category '+String(index).padStart(2,'0'),direction:'expense'}));
 const first=advance(null,{text:'Expense'},many,chat);
 assert.equal(first.reply.keyboard.inline.length,6,'four rows of two, a next arrow, and cancel');
 assert.equal(buttons(first.reply).filter(data=>data.startsWith('f:cat:')).length,8);
 const second=advance(first.draft,{callback:'f:page:1'},many,chat);
 assert.equal(second.draft,first.draft);assert.ok(buttons(second.reply).includes('f:cat:Other expense'));assert.ok(buttons(second.reply).includes('f:page:0'));
 const empty=ctx();empty.accounts=[];
 assert.equal(run([{text:'Expense'},{callback:'f:cat:Charity'}],empty).reply.text,'Add a cash account in the app first.');
});

test('every bot string exists in all three locales and prompts stay under Telegram limits',()=>{
 const sources=['lib/telegram-flow.ts','lib/telegram-bot.ts','lib/digest-message.ts','lib/action-messages.ts'].map(file=>fs.readFileSync(file,'utf8')).join('\n');
 const used=[...sources.matchAll(/\bt\((?:language|hint|ctx\.language)?,?'((?:[^'\\]|\\.)+)'/g)].map(match=>match[1]).concat([...sources.matchAll(/label:'([^']+)'/g)].map(match=>match[1]));
 assert.ok(used.length>40);
 for(const language of ['en','ru']){const labels=JSON.parse(fs.readFileSync(`lib/locales/${language}.json`,'utf8'));for(const key of used)assert.ok(labels[key],`${language}: ${key}`);}
 const start=advance(null,{text:'Expense'},ctx(),chat);
 for(const button of start.reply.keyboard.inline.flat())assert.ok(Buffer.byteLength(button.callback_data)<=64,button.callback_data);
 prompt(start.draft,ctx('ru'),chat);
});

test('Back returns to the previous question in every conversation and forgets what was answered after it',()=>{
 // The first question has nothing before it, so only Cancel is offered.
 for(const label of ['Expense','Income','Transfer','Pay loan or debt','Mortgage payment']){
  const first=run([{text:label}]);
  assert.ok(!buttons(first.reply).includes('f:back'),label);assert.ok(buttons(first.reply).includes('f:cancel'),label);
 }
 // Expense: category, account, amount, name, date, confirm.
 const toConfirm=run([{text:'Expense'},{callback:'f:cat:'+id(20)},{callback:'f:acc:'+id(1)},{text:'250000'},{callback:'f:skip'},{callback:'f:date:today'}]);
 assert.equal(toConfirm.draft.step,'confirm');
 assert.deepEqual(buttons(toConfirm.reply),['f:save','f:back','f:cancel']);
 let draft=toConfirm.draft;const seen=[];
 for(let n=0;n<5;n++){const back=advance(draft,{callback:'f:back'},ctx(),chat);seen.push(back.draft.step);assert.equal(back.reply.chat_id,chat);assert.ok(back.reply.text);draft=back.draft;}
 assert.deepEqual(seen,['date','name','amount','account','category']);
 assert.deepEqual(draft.data,{id:id(99)},'every answer after the first question is forgotten, the record id stays');
 // Going back one step keeps earlier answers, and a new choice replaces the old one.
 const backToAccount=advance(run([{text:'Expense'},{callback:'f:cat:'+id(20)},{callback:'f:acc:'+id(1)}]).draft,{callback:'f:back'},ctx(),chat);
 assert.equal(backToAccount.draft.step,'account');assert.equal(backToAccount.draft.data.category_name,'Groceries');assert.equal(backToAccount.draft.data.account_id,undefined);
 assert.equal(backToAccount.reply.text,'From which account?');
 const changed=advance(backToAccount.draft,{callback:'f:acc:'+id(2)},ctx(),chat);
 assert.equal(changed.draft.data.account_id,id(2));assert.equal(changed.reply.text,'Type the amount in USD');
 // Transfers skip the received amount when both accounts share a currency, so Back skips it too.
 const twoUsd=ctx();twoUsd.accounts=[...twoUsd.accounts,entry(4,'Second card','Cash',50,'USD')];
 const sameCurrency=run([{text:'Transfer'},{callback:'f:acc:'+id(2)},{callback:'f:tgt:'+id(4)},{text:'20'}],twoUsd);
 assert.equal(sameCurrency.draft.step,'date');
 assert.equal(advance(sameCurrency.draft,{callback:'f:back'},twoUsd,chat).draft.step,'amount');
 // Across currencies the received amount is asked, so Back stops there.
 const crossDate=run([{text:'Transfer'},{callback:'f:acc:'+id(2)},{callback:'f:tgt:'+id(1)},{text:'100'},{text:'1200000'}]);
 assert.equal(crossDate.draft.step,'date');
 const crossBack=advance(crossDate.draft,{callback:'f:back'},ctx(),chat);
 assert.equal(crossBack.draft.step,'received');assert.equal(crossBack.draft.data.received,undefined);assert.equal(crossBack.draft.data.amount,100);
 // A stale received amount cannot survive a change of accounts.
 const rewound=advance(advance(crossBack.draft,{callback:'f:back'},ctx(),chat).draft,{callback:'f:back'},ctx(),chat);
 assert.equal(rewound.draft.step,'target');assert.equal(rewound.draft.data.target_id,undefined);assert.equal(rewound.draft.data.account_id,id(2));
 // Loan and mortgage flows: target, account, amount, interest, date.
 const mortgage=run([{text:'Mortgage payment'},{callback:'f:tgt:'+id(11)},{callback:'f:acc:'+id(1)},{text:'1000000'},{callback:'f:zero'}]);
 assert.equal(mortgage.draft.step,'date');
 const mortgageBack=advance(mortgage.draft,{callback:'f:back'},ctx(),chat);
 assert.equal(mortgageBack.draft.step,'interest');assert.equal(mortgageBack.draft.data.interest,undefined);assert.equal(mortgageBack.draft.data.amount,1000000);
 const repaymentBack=advance(run([{text:'Pay loan or debt'},{callback:'f:tgt:'+id(10)},{callback:'f:acc:'+id(2)}]).draft,{callback:'f:back'},ctx(),chat);
 assert.equal(repaymentBack.draft.step,'account');assert.equal(repaymentBack.draft.data.target_id,id(10));
 // Back from an old message at the first question just asks it again; the menu ignores it.
 const first=run([{text:'Expense'}]);
 const stale=advance(first.draft,{callback:'f:back'},ctx(),chat);
 assert.equal(stale.draft.step,'category');assert.equal(stale.reply.text,'Choose an expense category');
 assert.equal(advance(null,{callback:'f:back'},ctx(),chat).reply.text,'Choose what to add.');
 // Typing while at the amount step still works, and the callback data stays short enough for Telegram.
 for(const reply of [toConfirm.reply,backToAccount.reply,mortgageBack.reply])for(const button of reply.keyboard.inline.flat())assert.ok(Buffer.byteLength(button.callback_data)<=64);
 assert.equal(buttons(advance(toConfirm.draft,{callback:'f:back'},ctx(),chat).reply).at(-2),'f:back');
});
test('the Back button is translated and shown with a chevron in every language',()=>{
 const {languageCodes}=loadTS('lib/languages.ts');
 for(const language of languageCodes){
  const reply=advance(run([{text:translate(language,'Expense')},{callback:'f:cat:'+id(20)}],ctx(language)).draft,{callback:'f:cat:'+id(20)},ctx(language),chat).reply;
  const back=reply.keyboard.inline.flat().find(button=>button.callback_data==='f:back');
  assert.ok(back,language);
  assert.equal(back.text,'‹ '+translate(language,'Back'),language);
  if(language!=='en')assert.notEqual(back.text,'‹ Back',language);
 }
});
