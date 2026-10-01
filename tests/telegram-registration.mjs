import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTS} from './helpers/load-ts.mjs';
import {botDb,ownerId,subscription} from './helpers/bot-db.mjs';
const {handleTelegramUpdate}=loadTS('lib/telegram-bot.ts');
const {advanceOnboarding,startOnboarding,onboardPrompt}=loadTS('lib/telegram-onboarding.ts');
const {derivedPassword,consumeLoginToken}=loadTS('lib/telegram-account.ts');
const {translate,languageCatalogue}=loadTS('lib/i18n.ts');
const {suggestedCurrencies}=loadTS('lib/onboarding.ts');
const now=new Date('2026-10-01T09:00:00Z');
const clock={now,today:'2026-10-01',newId:()=>'99999999-9999-4999-8999-999999999999'};
const t=(language,key,params)=>translate(language,key,params);
const buttons=reply=>reply.keyboard.inline.flat();
const callbacks=reply=>buttons(reply).map(button=>button.callback_data);

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
 const first=buttons(started.reply);
 assert.equal(first[0].callback_data,'o:lang:ru');assert.equal(first[0].text,'✓ Русский','the language in use comes first and is marked');
 assert.equal(callbacks(started.reply).filter(data=>data.startsWith('o:lang:')).length,8);
 assert.ok(callbacks(started.reply).includes('o:page:1'));assert.ok(!callbacks(started.reply).includes('o:page:-1'));
 // Every language is reachable through the pages, once.
 const seen=new Set();let draft=started.draft,page=0;
 for(;;){const reply=onboardPrompt(draft,'ru',777,page);for(const data of callbacks(reply))if(data.startsWith('o:lang:'))seen.add(data.slice(7));if(!callbacks(reply).includes('o:page:'+(page+1)))break;page++;}
 assert.deepEqual([...seen].sort(),languageCatalogue.map(item=>item.code).sort());
 assert.deepEqual(callbacks(advanceOnboarding(started.draft,{callback:'o:page:1'},{language:'ru'},777).reply).filter(data=>data.startsWith('o:page:')),['o:page:0'].concat(callbacks(onboardPrompt(started.draft,'ru',777,1)).includes('o:page:2')?['o:page:2']:[]));
 // Picking a language answers the next question in that language.
 const picked=advanceOnboarding(started.draft,{callback:'o:lang:ja'},{language:'ru'},777);
 assert.deepEqual(picked.effects,{language:'ja'});assert.equal(picked.draft.step,'currency');
 assert.equal(picked.reply.text,t('ja','Which currency do you use most?'));
 // Unknown choices and typing keep the question.
 for(const input of [{callback:'o:lang:xx'},{text:'hello'},{callback:'f:save'}])assert.equal(advanceOnboarding(started.draft,input,{language:'ru'},777).draft.step,'language');
 assert.deepEqual(callbacks(picked.reply).slice(0,suggestedCurrencies.length),suggestedCurrencies.map(code=>'o:cur:'+code));
 assert.ok(callbacks(picked.reply).includes('o:cur:other'));
 const euro=advanceOnboarding(picked.draft,{callback:'o:cur:EUR'},{language:'ja'},777);
 assert.deepEqual(euro.effects,{currency:'EUR'});assert.equal(euro.draft.step,'account');assert.deepEqual(euro.draft.data,{currency:'EUR'});
 assert.equal(advanceOnboarding(picked.draft,{callback:'o:cur:ZZZ'},{language:'ja'},777).draft.step,'currency');
 const other=advanceOnboarding(picked.draft,{callback:'o:cur:other'},{language:'ja'},777);
 assert.equal(other.draft.step,'currency_other');
 for(const bad of ['dollars','US','12','XXX','usd1'])assert.equal(advanceOnboarding(other.draft,{text:bad},{language:'en'},777).draft.step,'currency_other',bad);
 assert.deepEqual(advanceOnboarding(other.draft,{text:' chf '},{language:'en'},777).effects,{currency:'CHF'});
 const named=advanceOnboarding(euro.draft,{text:'  Savings jar '},{language:'en'},777);
 assert.equal(named.draft.step,'balance');assert.equal(named.draft.data.account_name,'Savings jar');
 assert.equal(advanceOnboarding(euro.draft,{callback:'o:name:cash'},{language:'ru'},777).draft.data.account_name,t('ru','Cash'));
 assert.equal(advanceOnboarding(euro.draft,{text:'x'.repeat(121)},{language:'en'},777).draft.step,'account');
 assert.equal(advanceOnboarding(euro.draft,{text:'   '},{language:'en'},777).draft.step,'account');
 for(const bad of ['abc','-5','','1e99'])assert.equal(advanceOnboarding(named.draft,{text:bad},{language:'en'},777).draft.step,'balance',bad);
 const finished=advanceOnboarding(named.draft,{text:'1 500,50'},{language:'ru'},777);
 assert.equal(finished.draft,null);assert.deepEqual(finished.effects,{account:{name:'Savings jar',amount:1500.5,currency:'EUR'},finished:true});
 assert.deepEqual(finished.reply.keyboard.reply.flat(),[t('ru','Expense'),t('ru','Income'),t('ru','Transfer'),t('ru','Pay loan or debt'),t('ru','Mortgage payment'),t('ru','Upcoming payments'),t('ru','Add cash account'),t('ru','Add loan or debt'),t('ru','Sign out')]);
 assert.equal(advanceOnboarding(named.draft,{text:'0'},{language:'en'},777).effects.account.amount,0,'an empty account is allowed');
});

test('a new chat is welcomed in its Telegram language, asked to agree, then asked for its own number',async()=>{
 const context=setup();
 const welcome=(await run(text('/start'),context)).replies[0];
 assert.equal(welcome.text,`${t('ru','Welcome to Hoggish. Track your money here in Telegram and in the app.')}\n\n${t('ru','By continuing you agree to the terms of use and privacy policy of Hoggish.')}`);
 assert.deepEqual(callbacks(welcome),['o:agree']);assert.equal(buttons(welcome)[0].text,t('ru','I agree'));
 for(const update of [text('hello'),text('Expense'),press('f:save')])assert.deepEqual(callbacks((await run(update,context)).replies[0]),['o:agree']);
 const agreed=await run(press('o:agree'),context);
 assert.equal(agreed.callbackId,'cb-o:agree');
 assert.deepEqual(agreed.replies[0].keyboard,{contact:t('ru','Share my number')});
 assert.equal(agreed.replies[0].text,t('ru','Share your phone number to create your account. It is also how you sign in on the web.'));
 assert.equal(context.db.writes.length,0);assert.equal(context.created.length,0);
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
 const language=await run(press('o:lang:en'),context);
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
 assert.equal(outcome.replies[0].text,'Welcome, Jasurbek! You are connected.\n\n'+connected);
 const unnamed=setup({seed:{...structuredClone(seed),user_preferences:[{user_id:ownerId,language:'en',currencies:['USD'],display_name:''}]}});
 assert.equal((await run(contact(),unnamed)).replies[0].text,connected);
 const stranger=setup({seed:structuredClone(seed)});
 assert.equal((await run(contact({},'998900000000'),stranger)).replies[0].text,t('ru','This number is already used with another Telegram account.'));
 assert.equal(stranger.db.tables.telegram_subscriptions[0].chat_id,null);
 // The same number from the linked chat is simply welcomed back.
 const linked=setup({seed:{telegram_subscriptions:[subscription({chat_id:777,telegram_user_id:777,phone:'+998901234567',consented_at:'x'})],user_preferences:[{user_id:ownerId,language:'en',currencies:['USD'],display_name:'Aziz'}]}});
 assert.match((await run(contact(),linked)).replies[0].text,/^Welcome, Aziz! You are connected\.\n\nConnected/);
});

test('a linked email account can add its number from the chat, once and only if it is free',async()=>{
 const seed=()=>({telegram_subscriptions:[subscription({chat_id:777})],user_preferences:[{user_id:ownerId,language:'en',currencies:['USD']}]});
 const context=setup({seed:seed()});
 assert.deepEqual((await run(text('/phone'),context)).replies[0].keyboard,{contact:t('en','Share my number')});
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
 assert.equal(callbacks((await run(text('hello'),context)).replies[0])[0],'o:agree');
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
