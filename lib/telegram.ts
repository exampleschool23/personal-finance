// Telegram Bot API transport. Sending never throws: a failed message must not
// fail the save or cron that triggered it. Configuration is server-only.
export type TelegramButton={text:string;callback_data:string};
export type TelegramKeyboard={inline:TelegramButton[][]}|{reply:string[][];once?:boolean}|{remove:true};
export type TelegramMessage={chat_id:number;text:string;keyboard?:TelegramKeyboard};
export type TelegramConfig={token:string;webhookSecret:string;botUsername:string};
export function telegramConfig(env:Record<string,string|undefined>=process.env):TelegramConfig|null{
 const token=env.TELEGRAM_BOT_TOKEN,webhookSecret=env.TELEGRAM_WEBHOOK_SECRET,botUsername=env.TELEGRAM_BOT_USERNAME;
 return token&&webhookSecret&&botUsername?{token,webhookSecret,botUsername:botUsername.replace(/^@/,'')}:null;
}
/** The request body Telegram expects for sendMessage; HTML is the only formatting used. */
export function sendMessageBody(message:TelegramMessage){
 const reply_markup=message.keyboard&&('inline' in message.keyboard?{inline_keyboard:message.keyboard.inline}:'reply' in message.keyboard?{keyboard:message.keyboard.reply.map(row=>row.map(text=>({text}))),resize_keyboard:true,one_time_keyboard:message.keyboard.once??false}:{remove_keyboard:true});
 return {chat_id:message.chat_id,text:message.text,parse_mode:'HTML',disable_web_page_preview:true,...(reply_markup?{reply_markup}:{})};
}
/** Escape text that goes inside an HTML-mode message, such as record names. */
export const escapeHtml=(text:string)=>text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
/** Send one message. Resolves to true when Telegram accepted it, false otherwise. */
export async function sendTelegramMessage(message:TelegramMessage,config:TelegramConfig|null=telegramConfig(),fetcher:typeof fetch=fetch){
 if(!config)return false;
 try{
  const response=await fetcher(`https://api.telegram.org/bot${config.token}/sendMessage`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(sendMessageBody(message)),cache:'no-store',signal:AbortSignal.timeout(10000)});
  return response.ok;
 }catch{return false;}
}
/** Acknowledge a button press so Telegram stops showing the loading state. */
export async function answerCallback(callbackId:string,config:TelegramConfig|null=telegramConfig(),fetcher:typeof fetch=fetch){
 if(!config)return false;
 try{const response=await fetcher(`https://api.telegram.org/bot${config.token}/answerCallbackQuery`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({callback_query_id:callbackId}),cache:'no-store',signal:AbortSignal.timeout(10000)});return response.ok;}catch{return false;}
}
