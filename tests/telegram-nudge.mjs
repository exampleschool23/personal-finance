import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadTS} from './helpers/load-ts.mjs';
const language={useLanguage:()=>({locale:'en-US',t:(text,values={})=>text.replace(/\{(\w+)\}/g,(_,key)=>values[key]??key)})};
function nudgeWith(status,dismissed=false){
 const hook={useTelegramLink:()=>({status,loadError:'',error:'',busy:false,waiting:false,connect:()=>{},retry:()=>{},stopWaiting:()=>{},setToggles:async()=>{},unlink:async()=>{}})};
 const react={...React,useSyncExternalStore:()=>dismissed,useState:initial=>[initial,()=>{}]};
 const {TelegramNudge}=loadTS('components/telegram-nudge.tsx',{'@/components/language-provider':language,'@/hooks/use-telegram-link':hook,react});
 return renderToStaticMarkup(React.createElement(TelegramNudge,{demo:false}));
}
const unlinked={configured:true,linked:false,digest_enabled:true,actions_enabled:true,bot_username:'hoggish_bot'};

test('the Overview nudge appears only for a configured, unlinked, undismissed owner',()=>{
 const shown=nudgeWith(unlinked);
 assert.match(shown,/^<section class="panel telegram-nudge"/);
 assert.match(shown,/Get reminders in Telegram/);assert.match(shown,/Connect to Telegram/);assert.match(shown,/Not now/);
 assert.equal(nudgeWith({...unlinked,linked:true}),'');
 assert.equal(nudgeWith({...unlinked,configured:false}),'');
 assert.equal(nudgeWith(null),'');
 assert.equal(nudgeWith(unlinked,true),'');
});

test('the Settings panel and the nudge share one link hook and Overview mounts the nudge after its notices',()=>{
 for(const file of ['components/telegram-panel.tsx','components/telegram-nudge.tsx'])assert.ok(fs.readFileSync(file,'utf8').includes("from '@/hooks/use-telegram-link'"),file);
 assert.ok(!fs.readFileSync('components/telegram-panel.tsx','utf8').includes("fetch('/api/telegram'"),'the panel no longer talks to the API itself');
 const overview=fs.readFileSync('components/workspace/screens/overview-screen.tsx','utf8');
 assert.ok(overview.indexOf('<ScreenNotices/>')<overview.indexOf('<TelegramNudge demo={demo}/>'));
 const css=fs.readFileSync('app/globals.css','utf8');
 assert.equal(css.split('\n').filter(line=>line.startsWith('.telegram-nudge{')).length,1);
});
