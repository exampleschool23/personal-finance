// Telegram Bot API transport. Sending never throws: a failed message must not
// fail the save or cron that triggered it. Configuration is server-only.
export type TelegramButton={text:string;callback_data:string};
/** A button that opens an address, or a Mini App inside Telegram, instead of sending a callback. */
export type TelegramLinkButton={text:string;url:string}|{text:string;web_app:{url:string}};
/** `contact` is one button that asks the person to share their own phone number; `cancel` adds a plain button under it that sends its label. */
export type TelegramKeyboard={inline:Array<Array<TelegramButton|TelegramLinkButton>>}|{reply:string[][];once?:boolean}|{contact:string;cancel?:string}|{remove:true};
export type TelegramMessage={chat_id:number;text:string;keyboard?:TelegramKeyboard};
export type TelegramConfig={token:string;webhookSecret:string;botUsername:string};
export function telegramConfig(env:Record<string,string|undefined>=process.env):TelegramConfig|null{
 const token=env.TELEGRAM_BOT_TOKEN,webhookSecret=env.TELEGRAM_WEBHOOK_SECRET,botUsername=env.TELEGRAM_BOT_USERNAME;
 return token&&webhookSecret&&botUsername?{token,webhookSecret,botUsername:botUsername.replace(/^@/,'')}:null;
}
/** The request body Telegram expects for sendMessage; HTML is the only formatting used. */
export function sendMessageBody(message:TelegramMessage){
 const reply_markup=message.keyboard&&('inline' in message.keyboard?{inline_keyboard:message.keyboard.inline}:'reply' in message.keyboard?{keyboard:message.keyboard.reply.map(row=>row.map(text=>({text}))),resize_keyboard:true,one_time_keyboard:message.keyboard.once??false}:'contact' in message.keyboard?{keyboard:[[{text:message.keyboard.contact,request_contact:true}],...(message.keyboard.cancel?[[{text:message.keyboard.cancel}]]:[])],resize_keyboard:true,one_time_keyboard:true}:{remove_keyboard:true});
 return {chat_id:message.chat_id,text:message.text,parse_mode:'HTML',disable_web_page_preview:true,...(reply_markup?{reply_markup}:{})};
}
/** Escape text that goes inside an HTML-mode message, such as record names. */
export const escapeHtml=(text:string)=>text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
/** How a send ended: accepted, refused for good (the person blocked the bot or deleted their Telegram account, or the
 * chat no longer exists), or failed in a way a later try may fix. */
export type SendOutcome='sent'|'blocked'|'failed';
/** Telegram's 403s are all permanent (blocked, deactivated, kicked, never started); of its 400s only a missing chat is. */
const goneChat=/chat not found/i;
/** Send one message and say how it ended. */
export async function deliverTelegramMessage(message:TelegramMessage,config:TelegramConfig|null=telegramConfig(),fetcher:typeof fetch=fetch):Promise<SendOutcome>{
 if(!config)return 'failed';
 try{
  const response=await fetcher(`https://api.telegram.org/bot${config.token}/sendMessage`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(sendMessageBody(message)),cache:'no-store',signal:AbortSignal.timeout(10000)});
  if(response.ok)return 'sent';
  if(response.status===403)return 'blocked';
  if(response.status!==400)return 'failed';
  const body=await response.json().catch(()=>null) as {description?:unknown}|null;
  return goneChat.test(String(body?.description??''))?'blocked':'failed';
 }catch{return 'failed';}
}
/** Send one message. Resolves to true when Telegram accepted it, false otherwise. */
export async function sendTelegramMessage(message:TelegramMessage,config:TelegramConfig|null=telegramConfig(),fetcher:typeof fetch=fetch){
 return await deliverTelegramMessage(message,config,fetcher)==='sent';
}
/** Acknowledge a button press so Telegram stops showing the loading state. */
export async function answerCallback(callbackId:string,config:TelegramConfig|null=telegramConfig(),fetcher:typeof fetch=fetch){
 if(!config)return false;
 try{const response=await fetcher(`https://api.telegram.org/bot${config.token}/answerCallbackQuery`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({callback_query_id:callbackId}),cache:'no-store',signal:AbortSignal.timeout(10000)});return response.ok;}catch{return false;}
}
