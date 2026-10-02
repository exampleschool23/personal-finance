import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';
import {botDb,ownerId,subscription} from './helpers/bot-db.mjs';
const {handleTelegramUpdate,deletionNotice}=loadTS('lib/telegram-bot.ts');
const {advanceOnboarding,startOnboarding,onboardPrompt}=loadTS('lib/telegram-onboarding.ts');
const {derivedPassword,consumeLoginToken}=loadTS('lib/telegram-account.ts');
const {translate,languageCatalogue}=loadTS('lib/i18n.ts');
const {suggestedCurrencies}=loadTS('lib/onboarding.ts');
const {fiatCurrencies}=loadTS('lib/currencies.ts');
const now=new Date('2026-10-01T09:00:00Z');
const clock={now,today:'2026-10-01',newId:()=>'99999999-9999-4999-8999-999999999999'};
const t=(language,key,params)=>translate(language,key,params);
const buttons=reply=>reply.keyboard.inline.flat();
const callbacks=reply=>buttons(reply).filter(button=>button.callback_data).map(button=>button.callback_data);

function setup({admin=true,secret='server-secret',seed={}}={}){
 const db=botDb(seed),created=[],phones=[];
 const env={appOrigin:'https://app.example',loginSecret:secret,admin:admin?{createPhoneUser:async input=>{created.push(input);return {id:ownerId};},setUserPhone:async(id,phone)=>{phones.push([id,phone]);return !phones.taken;},deleteUser:async()=>{}}:null};
 return {db,env,created,phones};
}
const from=(over={})=>({id:777,first_name:'Aziz',language_code:'ru',...over});
const chat=(id=777)=>({id});
const text=(value,over={})=>({message:{chat:chat(),text:value,from:from(over)}});
const press=(data,over={})=>({callback_query:{id:'cb-'+data,data,message:{chat:chat()},from:from(over)}});
const contact=(over={},phone='998901234567',user_id=777)=>({message:{chat:chat(),from:from(over),contact:{phone_number:phone,user_id,first_name:'Aziz'}}});
const run=(update,context)=>handleTelegramUpdate(update,context.db,clock,context.env);

test('the onboarding walks language, currency and a first cash account, saving as it goes',()=>{
 const started=startOnboarding('ru',777);
 assert.equal(started.draft.step,'language');assert.equal(started.reply.text,t('ru','Choose your language'));
 // Every language sits in one scrollable reply keyboard, three to a row, with no paging.
 const keys=started.reply.keyboard.reply;
 assert.equal(keys[0][0],'✓ Русский','the language in use comes first and is marked');
 assert.ok(keys.every(row=>row.length<=3));
 assert.deepEqual(keys.flat().map(name=>name.replace('✓ ','')).sort(),languageCatalogue.map(item=>item.native).sort());
 // A tap arrives as the native name, with or without the mark.
 assert.deepEqual(advanceOnboarding(started.draft,{text:'Deutsch'},{language:'ru'},777).effects,{language:'de'});
 assert.deepEqual(advanceOnboarding(started.draft,{text:'✓ Русский'},{language:'ru'},777).effects,{language:'ru'});
 // Picking a language answers the next question in that language.
 const picked=advanceOnboarding(started.draft,{callback:'o:lang:ja'},{language:'ru'},777);
 assert.deepEqual(picked.effects,{language:'ja'});assert.equal(picked.draft.step,'currency');
 assert.equal(picked.reply.text,t('ja','Which currency do you use most?'));
 // Unknown choices and typing keep the question.
 for(const input of [{callback:'o:lang:xx'},{text:'hello'},{callback:'f:save'}])assert.equal(advanceOnboarding(started.draft,input,{language:'ru'},777).draft.step,'language');
 // The keyboard moves on with the questions.
 assert.deepEqual(picked.reply.keyboard.reply.flat(),[...suggestedCurrencies,t('ja','Other currency'),'‹ '+t('ja','Back')]);
 assert.deepEqual(advanceOnboarding(picked.draft,{text:'EUR'},{language:'ja'},777).effects,{currency:'EUR'});
 assert.equal(advanceOnboarding(picked.draft,{text:t('ja','Other currency')},{language:'ja'},777).draft.step,'currency_other');
 const euro=advanceOnboarding(picked.draft,{callback:'o:cur:EUR'},{language:'ja'},777);
 assert.deepEqual(euro.effects,{currency:'EUR'});assert.equal(euro.draft.step,'account');assert.deepEqual(euro.draft.data,{currency:'EUR'});
 assert.equal(advanceOnboarding(picked.draft,{callback:'o:cur:ZZZ'},{language:'ja'},777).draft.step,'currency');
 const other=advanceOnboarding(picked.draft,{callback:'o:cur:other'},{language:'ja'},777);
 assert.equal(other.draft.step,'currency_other');assert.equal(other.reply.keyboard.reply.flat().length,fiatCurrencies.length+1,'every currency, then Back');
 for(const bad of ['dollars','US','12','XXX','usd1'])assert.equal(advanceOnboarding(other.draft,{text:bad},{language:'en'},777).draft.step,'currency_other',bad);
 assert.deepEqual(advanceOnboarding(other.draft,{text:' chf '},{language:'en'},777).effects,{currency:'CHF'});
 const named=advanceOnboarding(euro.draft,{text:'  Savings jar '},{language:'en'},777);
 assert.equal(named.draft.step,'balance');assert.deepEqual(named.reply.keyboard,{reply:[['0'],['‹ '+t('en','Back')]]});
 assert.deepEqual(euro.reply.keyboard,{reply:[[t('ja','Cash')],['‹ '+t('ja','Back')]]});
 assert.equal(advanceOnboarding(euro.draft,{text:t('ru','Cash')},{language:'ru'},777).draft.data.account_name,t('ru','Cash'));assert.equal(named.draft.data.account_name,'Savings jar');
 assert.equal(advanceOnboarding(euro.draft,{callback:'o:name:cash'},{language:'ru'},777).draft.data.account_name,t('ru','Cash'));
 assert.equal(advanceOnboarding(euro.draft,{text:'x'.repeat(121)},{language:'en'},777).draft.step,'account');
 assert.equal(advanceOnboarding(euro.draft,{text:'   '},{language:'en'},777).draft.step,'account');
 for(const bad of ['abc','-5','','1e99'])assert.equal(advanceOnboarding(named.draft,{text:bad},{language:'en'},777).draft.step,'balance',bad);
 const finished=advanceOnboarding(named.draft,{text:'1 500,50'},{language:'ru'},777);
 assert.equal(finished.draft,null);assert.deepEqual(finished.effects,{account:{name:'Savings jar',amount:1500.5,currency:'EUR'},finished:true});
 assert.deepEqual(finished.reply.keyboard.reply.flat(),[t('ru','Expense'),t('ru','Income'),t('ru','More actions')]);
 assert.equal(advanceOnboarding(named.draft,{text:'0'},{language:'en'},777).effects.account.amount,0,'an empty account is allowed');
});

test('a new chat is greeted in its Telegram language, any leftover number button is cleared, then it chooses a new or an existing account',async()=>{
 const context=setup();
 const [greeting,choice]=(await run(text('/start'),context)).replies;
 assert.equal(greeting.text,t('ru','Welcome to Hoggish. Track your money here in Telegram and in the app.'));assert.deepEqual(greeting.keyboard,{remove:true});
 assert.equal(choice.text,t('ru','By creating an account you agree to the terms of use and privacy policy of Hoggish.'));
 // One clear choice first; the terms and privacy policy open in the browser before anyone creates an account.
 assert.deepEqual(choice.keyboard.inline,[[{text:t('ru','Create an account'),callback_data:'o:agree'}],[{text:t('ru','I already have an account'),callback_data:'o:signin'}],[{text:t('ru','Terms of use'),url:'https://app.example/terms'},{text:t('ru','Privacy policy'),url:'https://app.example/privacy'}]]);
 const offline=setup();offline.env.appOrigin=null;
 assert.deepEqual((await run(text('/start'),offline)).replies[1].keyboard.inline,[[{text:t('ru','Create an account'),callback_data:'o:agree'}],[{text:t('ru','I already have an account'),callback_data:'o:signin'}]],'without an address the links are left out rather than broken');
 for(const update of [text('hello'),text('Expense'),press('f:save')])assert.deepEqual(callbacks((await run(update,context)).replies[1]),['o:agree','o:signin']);
 const agreed=await run(press('o:agree'),context);
 assert.equal(agreed.callbackId,'cb-o:agree');
 assert.deepEqual(agreed.replies[0].keyboard,{contact:t('ru','Share my number')});
 assert.equal(agreed.replies[0].text,t('ru','Share your phone number to create your account. It is also how you sign in on the web.'));
 assert.equal(context.db.writes.length,0);assert.equal(context.created.length,0);
});

test('someone who signed out of an account made in the bot chooses their number or the web, all in the account language, never sign-up',async()=>{
 const context=setup({seed:{telegram_subscriptions:[subscription({chat_id:null,telegram_user_id:777,phone:'+998901234567',consented_at:'x',linked_at:null})],user_preferences:[{user_id:ownerId,language:'en',currencies:['USD']}]}});
 for(const update of [text('/start'),press('f:save')]){
  const [greeting,choice]=(await run(update,context)).replies;
  assert.deepEqual(greeting,{chat_id:777,text:t('en','Welcome back.'),keyboard:{remove:true}});
  assert.equal(choice.text,t('en','Sign in with your number, or with an account you use on the web.'));
  assert.deepEqual(choice.keyboard.inline,[[{text:t('en','Sign in with my number'),callback_data:'o:agree'}],[{text:t('en','Sign in on the web'),callback_data:'o:signin'}]]);
 }
 // The Telegram language here is Russian; the answers stay in the account language, and an old Create button never offers sign-up.
 assert.deepEqual((await run(press('o:agree'),context)).replies,[{chat_id:777,text:t('en','Share your phone number to sign in again.'),keyboard:{contact:t('en','Share my number')}}]);
 assert.equal(context.db.writes.length,0);
 assert.equal((await run(press('o:signin'),context)).replies[0].text,t('en','Sign in on the web to connect this chat to your account. The link works for {minutes} minutes.',{minutes:15}));
});

test('sharing your own number creates a confirmed phone account, links the chat and starts the setup',async()=>{
 const context=setup();
 const outcome=await run(contact(),context);
 assert.equal(context.created.length,1);
 assert.deepEqual(context.created[0],{phone:'+998901234567',password:derivedPassword('server-secret',777),metadata:{telegram_user_id:777,first_name:'Aziz'}});
 const [row]=context.db.tables.telegram_subscriptions;
 assert.equal(row.chat_id,777);assert.equal(row.telegram_user_id,777);assert.equal(row.phone,'+998901234567');assert.equal(row.consented_at,now.toISOString());
 assert.deepEqual(context.db.tables.user_preferences,[{user_id:ownerId,language:'ru',currencies:['USD'],display_name:'Aziz'}]);
 assert.deepEqual(context.db.tables.telegram_drafts.map(draft=>draft.step),['onboard:language']);
 assert.equal(outcome.replies.length,2);
 assert.equal(outcome.replies[0].text,t('ru','Account created. Let us set up a few things.'));assert.deepEqual(outcome.replies[0].keyboard,{remove:true});
 assert.equal(outcome.replies[1].text,t('ru','Choose your language'));
 // The chat is the owner's from now on, so /start resumes the questions instead of the menu.
 const resumed=await run(text('/start'),context);
 assert.equal(resumed.replies[0].text,t('ru','Choose your language'));
 // The record flow is closed until the setup is done.
 assert.equal((await run(text('Expense'),context)).replies[0].text,t('ru','Choose your language'));
});

test('the whole setup in the chat saves language, currency and the first account, then offers the web app',async()=>{
 const context=setup();
 await run(contact(),context);
 const language=await run(text('English'),context);
 assert.equal(language.replies[0].text,t('en','Which currency do you use most?'));
 assert.equal(context.db.tables.user_preferences[0].language,'en');
 await run(press('o:cur:EUR'),context);
 assert.deepEqual(context.db.tables.user_preferences[0].currencies,['EUR']);
 assert.equal((await run(text('Wallet'),context)).replies[0].text,t('en','How much is in it? Type 0 if it is empty.'));
 assert.equal(context.db.rpcs.length,0,'nothing is saved before the balance is known');
 const done=await run(text('1,500.50'),context);
 const [saved]=context.db.rpcs;
 assert.equal(saved.name,'telegram_save_finance_record');assert.equal(saved.body.p_owner,ownerId);
 assert.deepEqual({kind:saved.body.p_record.kind,name:saved.body.p_record.name,currency:saved.body.p_record.currency,amount:saved.body.p_record.amount,date:saved.body.p_record.date,id:saved.body.p_record.id},{kind:'Cash',name:'Wallet',currency:'EUR',amount:1500.5,date:'2026-10-01',id:clock.newId()});
 assert.equal(context.db.tables.user_preferences[0].onboarded_at,now.toISOString());
 assert.equal(context.db.tables.telegram_drafts.length,0);
 assert.equal(done.replies[0].text,t('en','You are all set. Use the buttons below to add your first expense.'));assert.ok(done.replies[0].keyboard.reply);
 const open=done.replies[1];
 assert.equal(open.text,t('en','Your account also works on the web.'));
 const [app,browser]=buttons(open);
 assert.deepEqual(app,{text:t('en','Open app'),web_app:{url:'https://app.example/auth/telegram'}});
 assert.equal(browser.text,t('en','Open in browser'));
 const token=/^https:\/\/app\.example\/auth\/telegram\?t=([0-9a-f]{64})$/.exec(browser.url)?.[1];assert.ok(token);
 assert.equal(await consumeLoginToken(context.db,token,now),ownerId,'the link works once');
 assert.equal(await consumeLoginToken(context.db,token,now),null);
 // Afterwards the chat behaves like any linked chat.
 assert.equal((await run(text('Expense'),context)).replies[0].text,t('en','Choose an expense category'));
});

test('a refused first account keeps the question and does not finish the setup',async()=>{
 const context=setup();
 await run(contact(),context);await run(press('o:lang:ru'),context);await run(press('o:cur:USD'),context);await run(text('Wallet'),context);
 context.db.fail('rpc');
 const failed=await run(text('100'),context);
 assert.equal(failed.replies.length,1);assert.equal(failed.replies[0].text,t('ru','Could not save. {reason}',{reason:t('ru','Check the record fields.')}));
 assert.equal(context.db.tables.telegram_drafts[0].step,'onboard:balance');
 assert.equal(context.db.tables.user_preferences[0].onboarded_at,undefined);
});

test('only your own number counts, and a number can belong to one account',async()=>{
 const context=setup();
 // Someone else's contact card, a malformed number or no sender are all refused with a new request.
 // Without a sender there is no Telegram language to follow, so the reply is English.
 for(const [update,language] of [[contact({},'998901234567',999),'ru'],[contact({},'not a number'),'ru'],[{message:{chat:chat(),contact:{phone_number:'998901234567',user_id:777}}},'en']]){
  const outcome=await run(update,context);
  assert.deepEqual(outcome.replies[0].keyboard,{contact:t(language,'Share my number')});
  assert.equal(outcome.replies[0].text,t(language,'Please share your own number with the button.'));
 }
 assert.equal(context.created.length,0);assert.equal(context.db.writes.length,0);
 // A number already registered by another Telegram user is refused.
 const taken=setup({seed:{telegram_subscriptions:[subscription({chat_id:123,telegram_user_id:123,phone:'+998901234567',consented_at:'x'})]}});
 assert.equal((await run(contact(),taken)).replies[0].text,t('ru','This number is already used with another Telegram account.'));
 assert.equal(taken.created.length,0);
 // Supabase may also report the number as taken.
 const exists=setup();exists.env.admin.createPhoneUser=async()=>({exists:true});
 assert.equal((await run(contact(),exists)).replies[0].text,t('ru','This number is already used with another Telegram account.'));
 assert.equal(exists.db.tables.telegram_subscriptions.length,0);
 // Without the server key or secret the bot says so instead of failing.
 for(const missing of [{admin:false},{secret:null}]){
  const unavailable=setup(missing);
  assert.equal((await run(contact(),unavailable)).replies[0].text,t('ru','Registration is not available yet. Please try again later.'));
  assert.equal(unavailable.db.writes.length,0);
 }
});

test('someone who pressed stop signs back in with the same number, and with no other',async()=>{
 const seed={telegram_subscriptions:[subscription({chat_id:null,telegram_user_id:777,phone:'+998901234567',consented_at:'x',linked_at:null})],user_preferences:[{user_id:ownerId,language:'en',currencies:['USD'],display_name:'Jasurbek'}]};
 const back=setup({seed:structuredClone(seed)});
 const outcome=await run(contact(),back);
 assert.equal(back.created.length,0);assert.equal(back.db.tables.telegram_subscriptions[0].chat_id,777);
 const connected=t('en','Connected. You will get a morning digest of upcoming payments and a message after every saved action.');
 // The greeting uses the name saved in the app, never Telegram's profile name (the sender here is "Aziz"); with no saved name there is no greeting.
 // One message: the greeting and what the chat will receive, without saying "connected" twice.
 assert.equal(outcome.replies[0].text,'Welcome, Jasurbek! You are connected and will get a morning digest of upcoming payments and a message after every saved action.');
 const unnamed=setup({seed:{...structuredClone(seed),user_preferences:[{user_id:ownerId,language:'en',currencies:['USD'],display_name:''}]}});
 assert.equal((await run(contact(),unnamed)).replies[0].text,connected);
 const stranger=setup({seed:structuredClone(seed)});
 assert.equal((await run(contact({},'998900000000'),stranger)).replies[0].text,t('ru','This number is already used with another Telegram account.'));
 assert.equal(stranger.db.tables.telegram_subscriptions[0].chat_id,null);
 // The same number from the linked chat is simply welcomed back.
 const linked=setup({seed:{telegram_subscriptions:[subscription({chat_id:777,telegram_user_id:777,phone:'+998901234567',consented_at:'x'})],user_preferences:[{user_id:ownerId,language:'en',currencies:['USD'],display_name:'Aziz'}]}});
 assert.match((await run(contact(),linked)).replies[0].text,/^Welcome, Aziz! You are connected and will get a morning digest/);
});

test('a linked email account can add its number from the chat, once and only if it is free',async()=>{
 const seed=()=>({telegram_subscriptions:[subscription({chat_id:777})],user_preferences:[{user_id:ownerId,language:'en',currencies:['USD']}]});
 const context=setup({seed:seed()});
 const asked=(await run(text('/phone'),context)).replies[0];
 assert.deepEqual(asked,{chat_id:777,text:t('en','Share your phone number so you can also sign in on the web with it.'),keyboard:{contact:t('en','Share my number'),cancel:t('en','Cancel')}});
 // Cancel under the number button brings the main menu back.
 const cancelled=(await run(text('Cancel'),context)).replies[0];
 assert.equal(cancelled.text,t('en','Cancelled.'));assert.deepEqual(cancelled.keyboard.reply,[['Expense','Income'],['More actions']]);
 const saved=await run(contact(),context);
 assert.deepEqual(context.phones,[[ownerId,'+998901234567']]);
 assert.equal(context.db.tables.telegram_subscriptions[0].phone,'+998901234567');assert.equal(context.db.tables.telegram_subscriptions[0].telegram_user_id,777);
 assert.equal(saved.replies[0].text,t('en','Your number is saved. You can now sign in on the web with it.'));assert.ok(saved.replies[0].keyboard.reply);
 assert.equal(context.created.length,0);
 assert.equal((await run(contact({},'998900000000'),context)).replies[0].text,t('en','This chat is already linked to a different number.'));
 assert.equal(context.phones.length,1);
 const taken=setup({seed:seed()});taken.phones.taken=true;
 assert.equal((await run(contact(),taken)).replies[0].text,t('en','This number is already used with another Telegram account.'));
 assert.equal(taken.db.tables.telegram_subscriptions[0].phone,null);
 const other=setup({seed:{...seed(),telegram_subscriptions:[...seed().telegram_subscriptions,subscription({user_id:'33333333-3333-4333-8333-333333333333',chat_id:1,phone:'+998901234567'})]}});
 assert.equal((await run(contact(),other)).replies[0].text,t('en','This number is already used with another Telegram account.'));
 assert.equal(other.phones.length,0);
 const noAdmin=setup({seed:seed(),admin:false});
 assert.equal((await run(contact(),noAdmin)).replies[0].text,t('en','Registration is not available yet. Please try again later.'));
});

test('the app command gives one-tap buttons to accounts made here and a plain link to the rest',async()=>{
 const here=setup({seed:{telegram_subscriptions:[subscription({chat_id:777,telegram_user_id:777,phone:'+998901234567',consented_at:'x'})],user_preferences:[{user_id:ownerId,language:'en',currencies:['USD']}]}});
 const [message]=(await run(text('/app'),here)).replies;
 assert.equal(buttons(message).length,2);assert.equal(buttons(message)[0].web_app.url,'https://app.example/auth/telegram');
 assert.equal(here.db.tables.telegram_login_tokens.length,1);
 const email=setup({seed:{telegram_subscriptions:[subscription({chat_id:777})],user_preferences:[{user_id:ownerId,language:'en',currencies:['USD']}]}});
 const plain=(await run(text('/app'),email)).replies[0];
 assert.deepEqual(buttons(plain),[{text:t('en','Open in browser'),url:'https://app.example'}]);assert.equal(email.db.tables.telegram_login_tokens.length,0);
 const noOrigin=setup({seed:{telegram_subscriptions:[subscription({chat_id:777})],user_preferences:[{user_id:ownerId,language:'en',currencies:['USD']}]}});
 noOrigin.env.appOrigin=null;
 assert.deepEqual((await run(text('/app'),noOrigin)).replies,[]);
 // Without the login secret even a Telegram account only gets the plain link.
 const noSecret=setup({secret:null,seed:{telegram_subscriptions:[subscription({chat_id:777,telegram_user_id:777,phone:'+998901234567',consented_at:'x'})],user_preferences:[{user_id:ownerId,language:'en',currencies:['USD']}]}});
 assert.equal(buttons((await run(text('/app'),noSecret)).replies[0]).length,1);
});

test('linking an existing account with a code records the Telegram user once, never on two accounts',async()=>{
 const other='33333333-3333-4333-8333-333333333333';
 const code='ABCDEFGH',future=new Date(now.getTime()+60000).toISOString();
 const pending=subscription({chat_id:null,linked_at:null,link_code:code,link_code_expires_at:future});
 const free=setup({seed:{telegram_subscriptions:[pending],user_preferences:[{user_id:ownerId,language:'en',currencies:['USD']}]}});
 await run({message:{chat:chat(),text:'/start '+code,from:from()}},free);
 assert.equal(free.db.tables.telegram_subscriptions[0].chat_id,777);assert.equal(free.db.tables.telegram_subscriptions[0].telegram_user_id,777);assert.equal(free.db.tables.telegram_subscriptions[0].first_name,'Aziz');
 const held=setup({seed:{telegram_subscriptions:[{...pending},subscription({user_id:other,chat_id:null,telegram_user_id:777,phone:'+998900000001',linked_at:null})],user_preferences:[{user_id:ownerId,language:'en',currencies:['USD']}]}});
 await run({message:{chat:chat(),text:'/start '+code,from:from()}},held);
 const mine=held.db.tables.telegram_subscriptions.find(row=>row.user_id===ownerId);
 assert.equal(mine.chat_id,777);assert.equal(mine.telegram_user_id??null,null,'the Telegram user stays with its first account');
});

test('signing out releases an account linked from the app, so the same person can start a new one or return to it by code',async()=>{
 // Linked from the app: an identity but no number.
 const seed={telegram_subscriptions:[subscription({chat_id:777,telegram_user_id:777,phone:null,consented_at:null,first_name:'Aziz'})],user_preferences:[{user_id:ownerId,language:'en',currencies:['USD'],display_name:'Anti'}]};
 const context=setup({seed:structuredClone(seed)});
 const out=await run(text('Sign out'),context);
 assert.match(out.replies[0].text,/^You are signed out\./);assert.deepEqual(out.replies[0].keyboard,{remove:true});
 const row=context.db.tables.telegram_subscriptions[0];
 assert.equal(row.chat_id,null);assert.equal(row.telegram_user_id,null,'the Telegram identity is released');
 // The chat is a stranger again: it is invited, and sharing a number starts a new account instead of being refused.
 assert.equal(callbacks((await run(text('hello'),context)).replies[1])[0],'o:agree');
 const signup=await run(contact(),context);
 assert.equal(context.created.length,1);assert.equal(signup.replies[0].text,t('ru','Account created. Let us set up a few things.'));
 // An identity left behind by the app's own Disconnect is released the same way when the person shares a number.
 const stale=setup({seed:{...structuredClone(seed),telegram_subscriptions:[subscription({chat_id:null,telegram_user_id:777,phone:null,consented_at:null,linked_at:null})]}});
 await run(contact(),stale);
 assert.equal(stale.created.length,1);
});

test('signing out keeps the identity of an account that signs in with its number, in every language of the button',async()=>{
 const seed={telegram_subscriptions:[subscription({chat_id:777,telegram_user_id:777,phone:'+998901234567',consented_at:'x'})],user_preferences:[{user_id:ownerId,language:'ru',currencies:['USD'],display_name:'Aziz'}]};
 for(const word of [t('ru','Sign out'),'/signout','/stop']){
  const context=setup({seed:structuredClone(seed)});
  const out=await run(text(word),context);
  assert.equal(out.replies[0].text,t('ru','You are signed out. Sad to see you go! 👋 Come back any time: send /start to sign in again. To connect an account you use on the web, open its Settings and press Connect to Telegram.'),word);
  const row=context.db.tables.telegram_subscriptions[0];
  assert.equal(row.chat_id,null);assert.equal(row.telegram_user_id,777);assert.equal(row.phone,'+998901234567');
  // Sharing the same number signs back in without creating anything.
  const back=await run(contact(),context);
  assert.equal(context.created.length,0);assert.equal(context.db.tables.telegram_subscriptions[0].chat_id,777);assert.match(back.replies[0].text,/Aziz/);
 }
});

test('setup questions survive late taps, offer Back, never expire, and Start begins them again',async()=>{
 const en=(step,data={})=>({kind:'onboard',step,data});
 const back='‹ '+t('en','Back');
 // A second tap on the currency keyboard after the bot moved on changes the currency instead of naming the account.
 const late=advanceOnboarding(en('account',{currency:'USD'}),{text:t('en','Other currency')},{language:'en'},777);
 assert.equal(late.draft.step,'currency_other');assert.equal(late.effects.account,undefined);
 const code=advanceOnboarding(en('balance',{currency:'USD',account_name:'Wallet'}),{text:'EUR'},{language:'en'},777);
 assert.equal(code.draft.step,'account');assert.equal(code.draft.data.currency,'EUR');assert.equal(code.effects.currency,'EUR');assert.equal(code.effects.account,undefined);
 // A late language tap switches the language and asks the same question again in it.
 const russian=languageCatalogue.find(item=>item.code==='ru').native;
 const switched=advanceOnboarding(en('currency'),{text:russian},{language:'en'},777);
 assert.equal(switched.draft.step,'currency');assert.equal(switched.effects.language,'ru');assert.equal(switched.reply.text,t('ru','Which currency do you use most?'));
 // Back on every question after the first, forgetting later answers; the balance offers a 0 button.
 assert.deepEqual(advanceOnboarding(en('balance',{currency:'USD',account_name:'Wallet'}),{text:back},{language:'en'},777).draft,en('account',{currency:'USD'}));
 assert.deepEqual(advanceOnboarding(en('account',{currency:'USD'}),{text:back},{language:'en'},777).draft,en('currency',{}));
 assert.equal(advanceOnboarding(en('currency'),{text:back},{language:'en'},777).draft.step,'language');
 assert.deepEqual(onboardPrompt(en('balance'),'en',777).keyboard,{reply:[['0'],[back]]});
 assert.ok(!onboardPrompt(en('language'),'en',777).keyboard.reply.flat().includes(back),'no Back on the first question');
 const zero=advanceOnboarding(en('balance',{currency:'USD',account_name:'Wallet'}),{text:'0'},{language:'en'},777);
 assert.equal(zero.effects.account.amount,0);assert.equal(zero.effects.finished,true);
 // In the chat: a setup left for hours still continues, and /start starts it over from the language.
 const stale={user_id:ownerId,step:'onboard:balance',data:{currency:'USD',account_name:'Other currency'},updated_at:'2026-09-30T09:00:00Z'};
 const context=setup({seed:{telegram_subscriptions:[subscription({chat_id:777,telegram_user_id:777,phone:'+998901234567',consented_at:'x'})],user_preferences:[{user_id:ownerId,language:'en',currencies:['USD']}],telegram_drafts:[stale]}});
 assert.equal((await run(text('abc'),context)).replies[0].text,t('en','Type an amount, such as 250000, or 0 if it is empty.'));
 const restarted=await run(text('/start'),context);
 assert.equal(restarted.replies[0].text,t('en','Choose your language'));
 assert.equal(context.db.tables.telegram_drafts[0].step,'onboard:language');assert.deepEqual(context.db.tables.telegram_drafts[0].data,{});
});

test('the other-currency question lists every currency like the languages, and typing searches it',()=>{
 const step=(data={})=>({kind:'onboard',step:'currency_other',data});
 const back='‹ '+t('en','Back');
 const all=onboardPrompt(step(),'en',777);
 assert.equal(all.text,t('en','Choose your currency, or type part of its name or code to search, such as peso or EUR.'));
 const labels=all.keyboard.reply.flat();
 assert.equal(labels.length,fiatCurrencies.length+1);assert.equal(labels.at(-1),back);
 assert.ok(labels.includes('EUR · Euro'),'labels name the currency in the chat language');
 assert.ok(all.keyboard.reply.slice(0,-1).every(row=>row.length<=2));
 // Tapping a label, or typing a code in any case, chooses it.
 assert.deepEqual(advanceOnboarding(step(),{text:'EUR · Euro'},{language:'en'},777).effects,{currency:'EUR'});
 assert.deepEqual(advanceOnboarding(step(),{text:' uzs '},{language:'en'},777).effects,{currency:'UZS'});
 // Anything else searches by code or name, in the chat language or English, ignoring accents and case.
 const peso=advanceOnboarding(step(),{text:'peso'},{language:'en'},777);
 assert.equal(peso.draft.step,'currency_other');assert.equal(peso.draft.data.search,'peso');assert.deepEqual(peso.effects,{});
 assert.equal(peso.reply.text,t('en','Currencies matching “{query}”',{query:'peso'}));
 const found=peso.reply.keyboard.reply.flat();
 assert.ok(found.includes('ARS · Argentine Peso')&&found.includes('MXN · Mexican Peso'));assert.ok(!found.some(label=>label.startsWith('EUR')));assert.equal(found.at(-1),back);
 assert.deepEqual(advanceOnboarding(peso.draft,{text:'MXN · Mexican Peso'},{language:'en'},777).draft.data,{currency:'MXN'},'choosing clears the search');
 const russian=advanceOnboarding(step(),{text:'евро'},{language:'ru'},777).reply.keyboard.reply.flat();
 assert.ok(russian.some(label=>label.startsWith('EUR ·')),'searches the localized name');
 assert.ok(advanceOnboarding(step(),{text:'Złoty'},{language:'en'},777).reply.keyboard.reply.flat().some(label=>label.startsWith('PLN')),'accents are ignored');
 assert.ok(advanceOnboarding(step(),{text:'cordoba'},{language:'en'},777).reply.keyboard.reply.flat().some(label=>label.startsWith('NIO')),'typed without accents');
 const none=advanceOnboarding(step(),{text:'zzzz'},{language:'en'},777);
 assert.equal(none.reply.text,t('en','No currency matches “{query}”. Try another word or a code such as USD.',{query:'zzzz'}));assert.deepEqual(none.reply.keyboard.reply,[[back]]);
 // Back from a search returns to the main currency question and forgets it.
 assert.deepEqual(advanceOnboarding(peso.draft,{text:back},{language:'en'},777).draft,{kind:'onboard',step:'currency',data:{}});
 // A late tap on a full-list label after moving on changes the currency instead of naming the account.
 const late=advanceOnboarding({kind:'onboard',step:'account',data:{currency:'USD'}},{text:'ARS · Argentine Peso'},{language:'en'},777);
 assert.equal(late.draft.data.currency,'ARS');assert.equal(late.draft.step,'account');
});

test('I already have an account sends a single-use sign-in link for this chat, and only one stays open',async()=>{
 const context=setup();
 const first=await run(press('o:signin'),context);
 assert.equal(first.callbackId,'cb-o:signin');
 const reply=first.replies[0];
 assert.equal(reply.text,t('ru','Sign in on the web to connect this chat to your account. The link works for {minutes} minutes.',{minutes:15}));
 const [button]=reply.keyboard.inline.flat();
 assert.equal(button.text,t('ru','Sign in'));
 const token=/^https:\/\/app\.example\/api\/telegram\/connect\?c=([0-9a-f]{64})$/.exec(button.url)?.[1];
 assert.ok(token,button.url);
 const [request]=context.db.tables.telegram_connect_requests;
 assert.equal(request.chat_id,777);assert.equal(request.telegram_user_id,777);assert.equal(request.first_name,'Aziz');
 assert.notEqual(request.token_hash,token,'only the hash is stored');
 assert.equal(request.expires_at,new Date(now.getTime()+15*60000).toISOString());
 // Asking again replaces the earlier link, and nothing about any account changes.
 await run(press('o:signin'),context);
 assert.equal(context.db.tables.telegram_connect_requests.length,1);assert.notEqual(context.db.tables.telegram_connect_requests[0].token_hash,request.token_hash);
 assert.equal(context.db.tables.telegram_subscriptions.length,0);assert.equal(context.created.length,0);
 // Without the web address there is nowhere to sign in.
 const offline=setup();offline.env.appOrigin=null;
 assert.equal((await run(press('o:signin'),offline)).replies[0].text,t('ru','Registration is not available yet. Please try again later.'));
 assert.equal(offline.db.tables.telegram_connect_requests.length,0);
 // A linked chat ignores the old button instead of handing out links.
 const linked=setup({seed:{telegram_subscriptions:[subscription({chat_id:777})],user_preferences:[{user_id:ownerId,language:'en',currencies:['USD']}]}});
 await run(press('o:signin'),linked);
 assert.equal(linked.db.tables.telegram_connect_requests.length,0);
});

test('deleting an account on the web tells its linked chat in the account language and removes the menu',async()=>{
 const linked=setup({seed:{telegram_subscriptions:[subscription({chat_id:777,telegram_user_id:777,phone:'+998901234567',consented_at:'x'})],user_preferences:[{user_id:ownerId,language:'ru',currencies:['USD']}]}});
 assert.deepEqual(await deletionNotice(linked.db,ownerId),{chat_id:777,text:t('ru','Your Hoggish account was deleted. Send /start to create a new one.'),keyboard:{remove:true}});
 const signedOut=setup({seed:{telegram_subscriptions:[subscription({chat_id:null,telegram_user_id:777,phone:'+998901234567',consented_at:'x',linked_at:null})]}});
 assert.equal(await deletionNotice(signedOut.db,ownerId),null,'a signed-out chat is left alone');
 assert.equal(await deletionNotice(setup().db,ownerId),null);
});

test('the More actions buttons reach every action from a linked chat, including signing out',async()=>{
 const seed={telegram_subscriptions:[subscription({chat_id:777,telegram_user_id:777,phone:'+998901234567',consented_at:'x'})],user_preferences:[{user_id:ownerId,language:'en',currencies:['USD']}]};
 const context=setup({seed:structuredClone(seed)});
 const [more]=(await run(text('More actions'),context)).replies;
 assert.equal(more.text,t('en','What else would you like to do?'));assert.ok(callbacks(more).includes('m:signout'));
 const upcoming=await run(press('m:upcoming'),context);
 assert.equal(upcoming.callbackId,'cb-m:upcoming');assert.equal(upcoming.replies[0].text,t('en','No payments due in the next 31 days.'));
 const out=await run(press('m:signout'),context);
 assert.match(out.replies[0].text,/^You are signed out\./);assert.equal(context.db.tables.telegram_subscriptions[0].chat_id,null);
});
