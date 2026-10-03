// Telegram messages that follow something the owner did in the app: a milestone
// a save reached, and the bot keyboard after a language change. Runs after the
// response so a slow or failed message never delays or fails the save. Reads
// use the owner's own token, so row security scopes every lookup.
import {after} from 'next/server';
import type {ActionEvent} from './action-messages';
import {translate,type Language} from './i18n';
import {mainMenu} from './telegram-flow';
import {sendActionMilestone} from './telegram-milestones';
import {supa} from './supabase';
import {sendTelegramMessage,telegramConfig,type TelegramConfig} from './telegram';
export type ActionAuth={token:string;user?:{id:string}};
type Deps={config?:TelegramConfig|null;read?:typeof supa;send?:typeof sendTelegramMessage};
async function rows<T>(read:typeof supa,path:string,token:string){const response=await read(path,{},token);if(!response.ok)throw Error('Notification lookup failed.');return await response.json() as T[];}
/** Call after a successful save. Saves are never announced one by one, which reads as spam; only a milestone they reach
 * (a first record, a goal reached and the like) is celebrated. Never throws and never delays the response. */
export function queueMilestoneCheck(auth:ActionAuth,event:ActionEvent){
 const run=()=>sendActionMilestone(auth,event).catch(()=>false);
 try{after(run);}catch{void run();}
}

/** After the owner saves a new language, replace the bot's keyboard so the buttons match it without pressing Start. Resolves to true only when Telegram accepted the message. */
export async function sendLanguageMenu(auth:ActionAuth,language:Language,{config=telegramConfig(),read=supa,send=sendTelegramMessage}:Deps={}){
 if(!config)return false;
 const [subscription]=await rows<{chat_id:number|null}>(read,'/rest/v1/telegram_subscriptions?select=chat_id',auth.token);
 if(!subscription?.chat_id)return false;
 return send({chat_id:subscription.chat_id,text:translate(language,'Choose what to add.'),keyboard:mainMenu(language)},config);
}
/** Call after a language change is saved. Never throws and never delays the response. */
export function queueLanguageMenu(auth:ActionAuth,language:Language){
 const run=()=>sendLanguageMenu(auth,language).catch(()=>false);
 try{after(run);}catch{void run();}
}
