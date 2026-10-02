// Sends the Telegram message for an action an owner just saved. Runs after the
// response so a slow or failed message never delays or fails the save. Reads
// use the owner's own token, so row security scopes every lookup.
import {after} from 'next/server';
import {actionMessage,referencedIds,type ActionEvent,type ActionLookup,type NamedGoal,type NamedRecord} from './action-messages';
import {isLanguage,translate,type Language} from './i18n';
import {mainMenu} from './telegram-flow';
import {sendActionMilestone} from './telegram-milestones';
import {supa} from './supabase';
import {sendTelegramMessage,telegramConfig,type TelegramConfig} from './telegram';
export type ActionAuth={token:string;user?:{id:string}};
type Deps={config?:TelegramConfig|null;read?:typeof supa;send?:typeof sendTelegramMessage};
async function rows<T>(read:typeof supa,path:string,token:string){const response=await read(path,{},token);if(!response.ok)throw Error('Notification lookup failed.');return await response.json() as T[];}
/** Look up, write and send. Resolves to true only when Telegram accepted the message. */
export async function sendActionNotification(auth:ActionAuth,event:ActionEvent,{config=telegramConfig(),read=supa,send=sendTelegramMessage}:Deps={}){
 if(!config)return false;
 const [subscription]=await rows<{chat_id:number|null;actions_enabled:boolean}>(read,'/rest/v1/telegram_subscriptions?select=chat_id,actions_enabled',auth.token);
 if(!subscription?.chat_id||!subscription.actions_enabled)return false;
 const [preference]=await rows<{language?:string}>(read,'/rest/v1/user_preferences?select=language',auth.token);
 const language:Language=isLanguage(preference?.language)?preference.language:'en';
 const ids=referencedIds(event);
 const lookup:ActionLookup={records:{},goals:{},deleted:{}};
 if(ids.records.length)for(const row of await rows<NamedRecord&{id:string}>(read,`/rest/v1/finance_records?select=id,name,kind,currency&id=in.(${[...new Set(ids.records)].join(',')})`,auth.token))lookup.records[row.id]=row;
 if(ids.goals.length)for(const row of await rows<NamedGoal&{id:string}>(read,`/rest/v1/savings_goals?select=id,name,currency&id=in.(${[...new Set(ids.goals)].join(',')})`,auth.token))lookup.goals[row.id]=row;
 if(event.type==='record'&&event.category_id){const [category]=await rows<{id:string;name:string}>(read,`/rest/v1/transaction_categories?select=id,name&id=eq.${event.category_id}`,auth.token);if(category)lookup.categories={[category.id]:category.name};}
 for(const id of ids.deleted){const [item]=await rows<{data:NamedRecord&{amount:number}}>(read,`/rest/v1/deleted_items?select=data&source=eq.finance_records&data->>id=eq.${id}&order=deleted_at.desc&limit=1`,auth.token);if(item)lookup.deleted[id]=item.data;}
 return send({chat_id:subscription.chat_id,text:actionMessage(event,lookup,language)},config);
}
/** Call after a successful save. Never throws and never delays the response. */
export function queueActionNotification(auth:ActionAuth,event:ActionEvent){
 // The celebration follows the confirmation, and neither can fail the other.
 const run=async()=>{await sendActionNotification(auth,event).catch(()=>false);await sendActionMilestone(auth,event).catch(()=>false);};
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
