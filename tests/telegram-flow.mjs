import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadTS} from './helpers/load-ts.mjs';
const {advance,mainMenu,moreMenu,menuChoice,parseDay,prompt}=loadTS('lib/telegram-flow.ts');
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
 // Two everyday entries; everything else sits behind More actions as buttons in the chat.
 assert.deepEqual(mainMenu('en').reply,[['Expense','Income'],['More actions']]);
 assert.deepEqual(mainMenu('ru').reply,[[translate('ru','Expense'),translate('ru','Income')],[translate('ru','More actions')]]);
 const more=advance(null,{text:translate('ru','More actions')},ctx(),chat);
 assert.equal(more.draft,null);assert.deepEqual(more.reply,moreMenu('en',chat));
 assert.equal(more.reply.text,'What else would you like to do?');
 assert.deepEqual(more.reply.keyboard.inline.flat().map(button=>[button.text,button.callback_data]),[['Transfer','m:transfer'],['Pay loan or debt','m:repayment'],['Mortgage payment','m:mortgage'],['Upcoming payments','m:upcoming'],['Add cash account','m:account'],['Add loan or debt','m:liability'],['Sign out','m:signout']]);
 assert.ok(more.reply.keyboard.inline.every(row=>row.length<=2));
 // Each button works like typing its label, also in the middle of another entry; unknown buttons do nothing.
 assert.equal(advance(null,{callback:'m:transfer'},ctx(),chat).draft.kind,'transfer');
 assert.equal(advance({kind:'expense',step:'amount',data:{}},{callback:'m:account'},ctx(),chat).draft.kind,'account');
 assert.deepEqual(advance(null,{callback:'m:upcoming'},ctx(),chat),{draft:null,reply:null,menu:'upcoming'});
 assert.equal(advance(null,{callback:'m:signout'},ctx(),chat).draft,null);assert.equal(menuChoice('m:expensex'),null);
 assert.equal(menuChoice('More actions'),'more');
 assert.equal(menuChoice(translate('ru','Sign out')),'signout');assert.equal(advance(null,{text:'Sign out'},ctx(),chat).draft,null,'signing out never starts an entry');
 assert.equal(menuChoice(translate('ru','Expense')),'expense');assert.equal(menuChoice(' '+translate('ru','Income').toUpperCase()+' '),'income');assert.equal(menuChoice('Upcoming payments'),'upcoming');assert.equal(menuChoice('hello'),null);
 const stray=advance(null,{text:'hello'},ctx(),chat);
 assert.equal(stray.draft,null);assert.equal(stray.reply.text,'Choose what to add, or type it, like coffee 4.5 or +1,500 salary.');assert.deepEqual(stray.reply.keyboard,mainMenu('en'));
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

test('loan repayments and mortgage payments offer every cash account and cap at the balance',()=>{
 const pick=run([{text:'Pay loan or debt'}]);
 assert.equal(pick.reply.text,'Which loan or debt?');assert.deepEqual(buttons(pick.reply),['f:tgt:'+id(10),'f:cancel'],'settled debts are left out');
 const accounts=run([{text:'Pay loan or debt'},{callback:'f:tgt:'+id(10)}]);
 // An account in another currency converts at the day's rate, so every cash account is offered.
 assert.deepEqual(buttons(accounts.reply),['f:acc:'+id(1),'f:acc:'+id(2),'f:back','f:cancel']);
 const other=run([{text:'Pay loan or debt'},{callback:'f:tgt:'+id(10)},{callback:'f:acc:'+id(1)}]);
 assert.equal(other.draft.step,'amount');assert.equal(other.reply.text,'Type the amount in USD','a loan is repaid in its own currency');
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
 // The prompts show dates the way the app does, and the same text typed back is read in the owner's language or English.
 assert.equal(parseDay('30 September 2026','2026-09-30'),'2026-09-30');assert.equal(parseDay(' 1  september 2026 ','2026-09-30'),'2026-09-01');
 assert.equal(parseDay('30 сентября 2026','2026-09-30',false,'ru'),'2026-09-30');assert.equal(parseDay('30 sentabr 2026','2026-09-30',false,'uz'),'2026-09-30');
 assert.equal(parseDay('30 September 2026','2026-09-30',false,'de'),'2026-09-30','English is read in every language');
 assert.equal(parseDay('31 December 2027','2026-09-30',true,'en'),'2027-12-31');
 for(const bad of ['1 October 2026','31 September 2026','September 2026'])assert.equal(parseDay(bad,'2026-09-30'),null,bad);
 const day=(step,language='en')=>prompt({kind:step==='duedate'?'liability':'expense',step,data:{}},ctx(language),chat).text;
 assert.equal(day('date'),'Which day? Choose, or type a date like 30 September 2026');
 assert.equal(day('duedate'),'When is it due? Type a date like 31 December 2027');
 assert.match(day('date','ru'),/30 сентября 2026/);
 // Example amounts follow the language's grouping and decimal mark, so the hint reads like the app's own figures.
 const amount=advance(null,{text:'Expense'},ctx('ru'),chat).draft;
 assert.match(advance({...amount,step:'amount'},{text:'abc'},ctx('ru'),chat).reply.text,/250\u00a0000 или 12,5/);
 const many=ctx();many.categories=Array.from({length:10},(_,index)=>({id:id(30+index),name:'Category '+String(index).padStart(2,'0'),direction:'expense'}));
 const first=advance(null,{text:'Expense'},many,chat);
 assert.equal(first.reply.keyboard.inline.length,6,'four rows of two, a next arrow, and cancel');
 assert.equal(buttons(first.reply).filter(data=>data.startsWith('f:cat:')).length,8);
 const second=advance(first.draft,{callback:'f:page:1'},many,chat);
 assert.equal(second.draft,first.draft);assert.ok(buttons(second.reply).includes('f:cat:Other expense'));assert.ok(buttons(second.reply).includes('f:page:0'));
 const empty=ctx();empty.accounts=[];
 assert.equal(run([{text:'Expense'},{callback:'f:cat:Charity'}],empty).reply.text,'Add a cash account to continue.');
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

test('the bot creates a cash account itself, from the menu or from a dead end, and returns to the interrupted question',()=>{
 const withCurrencies=(context=ctx())=>({...context,currencies:['UZS','USD']});
 // From the menu: name, currency, balance, then a valid Cash record.
 // A name already used by a cash account, in any case, is refused and the question is asked again.
 const taken=run([{text:'Add cash account'},{text:' wallet '}],withCurrencies());
 assert.equal(taken.draft.step,'accname');assert.equal(taken.reply.text,'You already have a cash account named wallet. Type another name.');
 assert.deepEqual(buttons(taken.reply),['f:accname:cash','f:cancel']);
 const named=run([{text:'Add cash account'},{text:'Savings'}],withCurrencies());
 assert.equal(named.draft.step,'currency');assert.deepEqual(buttons(named.reply),['f:cur:UZS','f:cur:USD','f:back','f:cancel']);
 const wrong=advance(named.draft,{callback:'f:cur:EUR'},withCurrencies(),chat);assert.equal(wrong.draft.step,'currency');
 const balance=advance(named.draft,{callback:'f:cur:USD'},withCurrencies(),chat);assert.equal(balance.draft.step,'balance');
 const bad=advance(balance.draft,{text:'lots'},withCurrencies(),chat);assert.equal(bad.draft.step,'balance');assert.equal(bad.commit,undefined);
 const saved=advance(balance.draft,{text:'1250.5'},withCurrencies(),chat);
 assert.equal(saved.draft,null);assert.equal(saved.commit.resume,undefined);
 assert.equal(recordSchema.safeParse(saved.commit.record).success,true);
 assert.deepEqual({name:saved.commit.record.name,kind:saved.commit.record.kind,currency:saved.commit.record.currency,amount:saved.commit.record.amount},{name:'Savings',kind:'Cash',currency:'USD',amount:1250.5});
 // A refused balance says what to type and keeps the 0 button.
 const badBalance=advance(balance.draft,{text:'lots'},withCurrencies(),chat);
 assert.equal(badBalance.reply.text,'Type a number such as 250,000 or 12.5, or 0.');assert.deepEqual(buttons(badBalance.reply),['f:zero','f:back','f:cancel']);
 // An empty account is allowed through the 0 button, and the record id survives a redelivered update.
 const zero=advance(balance.draft,{callback:'f:zero'},withCurrencies(),chat);assert.equal(zero.commit.record.amount,0);assert.equal(zero.commit.record.id,id(99));
 // A user with no account at all is offered the button instead of being sent to the app.
 const empty=withCurrencies();empty.accounts=[];
 const stuck=run([{text:'Expense'},{callback:'f:cat:Charity'}],empty);
 assert.equal(stuck.reply.text,'Add a cash account to continue.');assert.ok(buttons(stuck.reply).includes('f:newacc'));
 const inside=advance(stuck.draft,{callback:'f:newacc'},empty,chat);
 assert.equal(inside.draft.kind,'account');assert.equal(inside.draft.data.resume.step,'account');assert.equal(inside.reply.text,'Name the cash account, for example Wallet.');
 // Started from a dead end, the name question offers Back to the interrupted conversation.
 assert.deepEqual(buttons(inside.reply),['f:accname:cash','f:back','f:cancel']);
 const returned=advance(inside.draft,{callback:'f:back'},empty,chat);
 assert.equal(returned.draft.kind,'expense');assert.equal(returned.draft.step,'account');assert.equal(returned.reply.text,'Add a cash account to continue.');
 assert.deepEqual(buttons(advance(null,{text:'Add cash account'},empty,chat).reply),['f:accname:cash','f:cancel'],'a standalone account has no Back at its first question');
 const cash=advance(inside.draft,{callback:'f:accname:cash'},empty,chat);
 const done=advance(advance(cash.draft,{callback:'f:cur:UZS'},empty,chat).draft,{text:'500000'},empty,chat);
 assert.equal(done.commit.record.name,'Cash');assert.equal(done.commit.resume.kind,'expense');assert.equal(done.commit.resume.data.category,'Charity');
});

test('an account added while paying a loan uses the loan currency without asking, and a missing second account can be added',()=>{
 const usdOnly=ctx();usdOnly.accounts=[];usdOnly.currencies=['UZS','USD'];
 const stuck=run([{text:'Pay loan or debt'},{callback:'f:tgt:'+id(10)}],usdOnly);
 assert.equal(stuck.reply.text,'Add a cash account to continue.');
 const named=advance(advance(stuck.draft,{callback:'f:newacc'},usdOnly,chat).draft,{text:'Dollars'},usdOnly,chat);
 assert.equal(named.draft.step,'balance');assert.equal(named.draft.data.currency,'USD');
 // Back from the balance skips the currency question that was never asked.
 assert.equal(advance(named.draft,{callback:'f:back'},usdOnly,chat).draft.step,'accname');
 const saved=advance(named.draft,{text:'100'},usdOnly,chat);
 assert.equal(saved.commit.record.currency,'USD');assert.equal(saved.commit.resume.step,'account');
 const one=ctx();one.accounts=[entry(1,'Wallet','Cash',900000)];
 const second=run([{text:'Transfer'},{callback:'f:acc:'+id(1)}],one);
 assert.equal(second.reply.text,'Add a second cash account to continue.');assert.ok(buttons(second.reply).includes('f:newacc'));
});

test('the bot creates loans, debts and mortgages itself, and a loan payment with no open loan offers to add one',()=>{
 const context={...ctx(),currencies:['UZS','USD']};
 const kind=advance(null,{text:'Add loan or debt'},context,chat);
 assert.equal(kind.reply.text,'Is it a loan, a debt or a mortgage?');assert.deepEqual(buttons(kind.reply),['f:lkind:Loan','f:lkind:Debt','f:lkind:Mortgage','f:cancel']);
 const name=advance(kind.draft,{callback:'f:lkind:Loan'},context,chat);assert.equal(name.reply.text,'Name it, for example Car loan.');
 const currency=advance(name.draft,{text:'QA Car loan'},context,chat);assert.equal(currency.reply.text,'Which currency is it in?');
 const amount=advance(currency.draft,{callback:'f:cur:USD'},context,chat);assert.equal(amount.reply.text,'Type the outstanding amount in USD');
 const due=advance(amount.draft,{text:'5000'},context,chat);assert.equal(due.draft.step,'duedate');
 assert.equal(advance(due.draft,{text:'yesterday'},context,chat).draft.step,'duedate');
 // A new loan cannot already be due; today is allowed.
 const past=advance(due.draft,{text:'2020-01-01'},context,chat);
 assert.equal(past.draft.step,'duedate');assert.equal(past.reply.text,'The due date cannot be in the past. Type today or a later date.');
 assert.equal(advance(due.draft,{text:'2026-09-30'},context,chat).draft.step,'rate');
 // Due dates may be in the future, unlike record dates.
 const rate=advance(due.draft,{text:'31.03.2027'},context,chat);assert.equal(rate.draft.data.date,'2027-03-31');assert.equal(rate.reply.text,'Type the yearly interest rate in percent, or 0');
 const payment=advance(rate.draft,{text:'12.5'},context,chat);assert.equal(payment.reply.text,'Type the monthly payment in USD, or 0');
 // Rates may carry a percent sign, spaces or a decimal comma; a refusal says why and keeps the 0 button.
 for(const typed of ['7.5%','7.5 %',' 7,5% ','7,5'])assert.equal(advance(rate.draft,{text:typed},context,chat).draft.data.rate,7.5,typed);
 const badRate=advance(rate.draft,{text:'seven'},context,chat);
 assert.equal(badRate.draft.step,'rate');assert.equal(badRate.reply.text,'Type the rate as a number like 7.5 or 7.5%, or 0.');assert.deepEqual(buttons(badRate.reply),['f:zero','f:back','f:cancel']);
 assert.equal(advance(rate.draft,{text:'2000%'},context,chat).reply.text,'The rate must be 1,000% or less.');
 const badPayment=advance(payment.draft,{text:'a lot'},context,chat);
 assert.equal(badPayment.reply.text,'Type a number such as 250,000 or 12.5, or 0.');assert.deepEqual(buttons(badPayment.reply),['f:zero','f:back','f:cancel']);
 const confirm=advance(payment.draft,{text:'250'},context,chat);
 assert.equal(confirm.draft.step,'confirm');assert.match(confirm.reply.text,/Loan · <b>QA Car loan<\/b>\n\$5,000 · Due: 31 March 2027\nInterest rate 12.5% · Monthly payment \$250/);
 const saved=advance(confirm.draft,{callback:'f:save'},context,chat);
 assert.equal(recordSchema.safeParse(saved.commit.record).success,true);
 const r=saved.commit.record;
 assert.deepEqual({kind:r.kind,name:r.name,currency:r.currency,amount:r.amount,date:r.date,rate:r.rate,payment:r.estimated_monthly_payment,opened_on:r.opened_on},{kind:'Loan',name:'QA Car loan',currency:'USD',amount:5000,date:'2027-03-31',rate:12.5,payment:250,opened_on:'2026-09-30'});
 // Back walks the questions in order, and the 0 buttons skip rate and payment.
 assert.equal(advance(payment.draft,{callback:'f:back'},context,chat).draft.step,'rate');
 const zero=advance(advance(rate.draft,{callback:'f:zero'},context,chat).draft,{callback:'f:zero'},context,chat);
 assert.equal(zero.draft.step,'confirm');assert.equal(zero.draft.data.rate,0);assert.equal(zero.draft.data.payment,0);
 // No open loan: the dead end offers the button, and the saved loan returns to the loan choice.
 const none={...context,liabilities:[]};
 const stuck=advance(null,{text:'Pay loan or debt'},none,chat);
 assert.equal(stuck.reply.text,'No open loan or debt found.');assert.ok(buttons(stuck.reply).includes('f:newliab'));
 const inside=advance(stuck.draft,{callback:'f:newliab'},none,chat);
 assert.equal(inside.draft.kind,'liability');assert.equal(inside.draft.step,'lkind');assert.equal(inside.draft.data.resume.kind,'repayment');
 // From a mortgage payment the kind is already known.
 const mortgage=advance(advance(null,{text:'Mortgage payment'},none,chat).draft,{callback:'f:newliab'},none,chat);
 assert.equal(mortgage.draft.step,'lname');assert.equal(mortgage.draft.data.lkind,'Mortgage');
 assert.equal(mortgage.reply.text,'Name it, for example Home mortgage.');
 // The kind question was never asked, so Back returns to the mortgage payment that needed the mortgage.
 const back=advance(mortgage.draft,{callback:'f:back'},none,chat);
 assert.equal(back.draft.kind,'mortgage');assert.equal(back.draft.step,'target');assert.equal(back.reply.text,'No open mortgage found.');
});

test('business income asks which business, and is offered only when one exists',()=>{
 const none=advance(null,{text:'Income'},ctx(),chat);
 assert.deepEqual(buttons(none.reply),['f:cat:'+id(21),'f:cat:Salary','f:cat:Rent income','f:cat:Other income','f:cancel']);
 // A stale button cannot pick it either.
 assert.equal(advance(none.draft,{callback:'f:cat:Business income'},ctx(),chat).draft.step,'category');
 const withBusiness={...ctx(),businesses:[entry(40,'Cafe','Business',1000,'USD')]};
 const start=advance(null,{text:'Income'},withBusiness,chat);
 assert.ok(buttons(start.reply).includes('f:cat:Business income'));
 const business=advance(start.draft,{callback:'f:cat:Business income'},withBusiness,chat);
 assert.equal(business.draft.step,'business');assert.equal(business.reply.text,'Choose a business');assert.deepEqual(buttons(business.reply),['f:biz:'+id(40),'f:back','f:cancel']);
 assert.equal(advance(business.draft,{callback:'f:biz:'+id(41)},withBusiness,chat).draft.step,'business','an unknown business is refused');
 const account=advance(business.draft,{callback:'f:biz:'+id(40)},withBusiness,chat);
 assert.equal(account.draft.step,'account');
 assert.equal(advance(account.draft,{callback:'f:back'},withBusiness,chat).draft.step,'business');
 const saved=run([{callback:'f:acc:'+id(2)},{text:'120'},{callback:'f:skip'},{callback:'f:date:today'},{callback:'f:save'}].reduce((steps,step)=>[...steps,step],[{text:'Income'},{callback:'f:cat:Business income'},{callback:'f:biz:'+id(40)}]),withBusiness);
 assert.equal(saved.commit.record.kind,'Business income');assert.equal(saved.commit.record.business_id,id(40));
 assert.equal(recordSchema.safeParse(saved.commit.record).success,true);
 // Other income may name a business too, or stay personal; Back from the business returns to the category.
 const salary=advance(start.draft,{callback:'f:cat:Salary'},withBusiness,chat);
 assert.equal(salary.draft.step,'business');assert.deepEqual(buttons(salary.reply),['f:biz:'+id(40),'f:biz:none','f:back','f:cancel']);
 assert.equal(advance(salary.draft,{callback:'f:back'},withBusiness,chat).draft.step,'category');
 const personal=advance(salary.draft,{callback:'f:biz:none'},withBusiness,chat);
 assert.equal(personal.draft.step,'account');assert.equal(personal.draft.data.business_id,null);
 // Business income cannot stay personal.
 assert.equal(advance(business.draft,{callback:'f:biz:none'},withBusiness,chat).draft.step,'business');
});

test('typed amounts follow the typed-entry rules: 12,75 is never 1275, and a refused amount asks again',()=>{
 // Live QA 2026-10-03: "12,75" in an English chat was read as 1,275.
 const amount=(text,language='en')=>{const result=run([{text:'Expense'},{callback:'f:cat:Living expense'},{callback:'f:acc:'+id(2)},{text}],ctx(language));return result.draft.step==='name'?result.draft.data.amount:null;};
 assert.equal(amount('12,75'),12.75);assert.equal(amount('12,75','ru'),12.75);
 assert.equal(amount('1,250.50'),1250.5);assert.equal(amount('1 500'),1500);
 assert.equal(amount('1.500'),1.5);assert.equal(amount('1.500','ru'),1500);assert.equal(amount('1,500'),1500);
 for(const text of ['0','abc','-50','1000000000000001'])assert.equal(amount(text),null,text);
});

test('the name question gives an example that fits a loan, a debt and a mortgage',()=>{
 const name=kind=>run([{text:'Add loan or debt'},{callback:'f:lkind:'+kind}]).reply.text;
 assert.equal(name('Loan'),'Name it, for example Car loan.');
 assert.equal(name('Debt'),'Name it, for example Credit card.');
 assert.equal(name('Mortgage'),'Name it, for example Home mortgage.');
});
