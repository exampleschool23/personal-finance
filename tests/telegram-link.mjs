import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadTS} from './helpers/load-ts.mjs';
const link=loadTS('lib/telegram-link.ts');
const telegram=loadTS('lib/telegram.ts');

test('link codes avoid look-alike characters, validate strictly and expire after ten minutes',()=>{
 const code=link.generateLinkCode(max=>max-1);
 assert.equal(code.length,8);assert.ok(link.isLinkCode(code));
 assert.ok(!/[01IO]/.test(link.generateLinkCode(max=>Math.floor(max/2))));
 for(const bad of ['ABCDEFG','abcdefgh','ABCD0123','',null,12345678])assert.ok(!link.isLinkCode(bad),String(bad));
 const now=new Date('2026-09-30T09:00:00Z');
 assert.equal(link.linkExpiry(now),'2026-09-30T09:10:00.000Z');
 assert.ok(!link.linkExpired({link_code:'ABCDEFGH',link_code_expires_at:'2026-09-30T09:10:00.000Z'},now));
 assert.ok(link.linkExpired({link_code:'ABCDEFGH',link_code_expires_at:'2026-09-30T09:00:00.000Z'},now));
 assert.ok(link.linkExpired({link_code:null,link_code_expires_at:'2026-09-30T09:10:00.000Z'},now));
 assert.equal(link.telegramLinkUrl('hoggish_bot','ABCDEFGH'),'https://t.me/hoggish_bot?start=ABCDEFGH');
});

test('the start command yields its code and nothing else does',()=>{
 assert.equal(link.startCode('/start ABCDEFGH'),'ABCDEFGH');
 assert.equal(link.startCode('/start@hoggish_bot abcdefgh '),'ABCDEFGH');
 for(const text of ['/start','/start ABC','/stop ABCDEFGH','ABCDEFGH','/start ABCDEFGH extra',undefined])assert.equal(link.startCode(text),null,String(text));
});

test('status hides the code and reports configuration, link state and toggles',()=>{
 assert.deepEqual(link.subscriptionStatus(undefined,null),{configured:false,linked:false,digest_enabled:true,actions_enabled:true,bot_username:null});
 const status=link.subscriptionStatus({user_id:'u',chat_id:42,digest_enabled:false,actions_enabled:true,link_code:'ABCDEFGH',link_code_expires_at:null,linked_at:'2026-09-30'},'hoggish_bot');
 assert.deepEqual(status,{configured:true,linked:true,digest_enabled:false,actions_enabled:true,bot_username:'hoggish_bot'});
 assert.ok(!JSON.stringify(status).includes('ABCDEFGH'));
});

test('telegram configuration needs all three variables and strips the handle prefix',()=>{
 assert.equal(telegram.telegramConfig({}),null);
 assert.equal(telegram.telegramConfig({TELEGRAM_BOT_TOKEN:'t',TELEGRAM_WEBHOOK_SECRET:'s'}),null);
 assert.deepEqual(telegram.telegramConfig({TELEGRAM_BOT_TOKEN:'t',TELEGRAM_WEBHOOK_SECRET:'s',TELEGRAM_BOT_USERNAME:'@hoggish_bot'}),{token:t(),webhookSecret:'s',botUsername:'hoggish_bot'});
 function t(){return 't';}
});

test('messages use HTML mode, escape names and describe keyboards the way Telegram expects',async()=>{
 assert.equal(telegram.escapeHtml('A & B <c>'),'A &amp; B &lt;c&gt;');
 assert.deepEqual(telegram.sendMessageBody({chat_id:7,text:'hi'}),{chat_id:7,text:'hi',parse_mode:'HTML',disable_web_page_preview:true});
 assert.deepEqual(telegram.sendMessageBody({chat_id:7,text:'hi',keyboard:{inline:[[{text:'Save',callback_data:'save'}]]}}).reply_markup,{inline_keyboard:[[{text:'Save',callback_data:'save'}]]});
 assert.deepEqual(telegram.sendMessageBody({chat_id:7,text:'hi',keyboard:{reply:[['Expense','Income']],once:true}}).reply_markup,{keyboard:[[{text:'Expense'},{text:'Income'}]],resize_keyboard:true,one_time_keyboard:true});
 // The number request can carry a Cancel button under the contact button.
 assert.deepEqual(telegram.sendMessageBody({chat_id:7,text:'hi',keyboard:{contact:'Share my number',cancel:'Cancel'}}).reply_markup,{keyboard:[[{text:'Share my number',request_contact:true}],[{text:'Cancel'}]],resize_keyboard:true,one_time_keyboard:true});
 assert.deepEqual(telegram.sendMessageBody({chat_id:7,text:'hi',keyboard:{remove:true}}).reply_markup,{remove_keyboard:true});
 const calls=[];
 const config={token:'TOKEN',webhookSecret:'s',botUsername:'b'};
 const ok=await telegram.sendTelegramMessage({chat_id:7,text:'hi'},config,async(url,init)=>{calls.push({url,body:JSON.parse(init.body)});return new Response('{}',{status:200});});
 assert.equal(ok,true);assert.equal(calls[0].url,'https://api.telegram.org/botTOKEN/sendMessage');assert.equal(calls[0].body.chat_id,7);
 assert.equal(await telegram.sendTelegramMessage({chat_id:7,text:'hi'},config,async()=>new Response('',{status:429})),false);
 assert.equal(await telegram.sendTelegramMessage({chat_id:7,text:'hi'},config,async()=>{throw Error('offline');}),false);
 assert.equal(await telegram.sendTelegramMessage({chat_id:7,text:'hi'},null,async()=>{throw Error('must not be called');}),false);
});

test('migration 075 creates the owner-scoped table and setup.sql includes it',()=>{
 const migration=fs.readFileSync('migrations/075_telegram_subscriptions.sql','utf8');
 assert.ok(migration.includes('CREATE TABLE IF NOT EXISTS public.telegram_subscriptions'));
 assert.ok(migration.includes('chat_id bigint UNIQUE'));
 assert.ok(migration.includes('ENABLE ROW LEVEL SECURITY'));
 assert.ok(migration.includes("USING ((SELECT auth.uid())=user_id) WITH CHECK ((SELECT auth.uid())=user_id)"));
 assert.ok(migration.includes('REVOKE ALL ON public.telegram_subscriptions FROM anon'));
 assert.ok(fs.readFileSync('database/setup.sql','utf8').includes(migration));
 // Chat links are personal to a device and stay out of backups.
 assert.ok(!fs.readFileSync('database/setup.sql','utf8').match(/finance_backup_tables[\s\S]*?'telegram_subscriptions'/));
});
