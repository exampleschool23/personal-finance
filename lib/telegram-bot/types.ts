// What the bot is handed for each update: the update itself, its clock, and the environment it may use.
import {accountOrigin} from '../account-access';
import {loadDatedExchangeRate} from '../dated-exchange-rate';
import type {ServiceDatabase} from '../service-role';
import {adminAccounts,loginSecrets,type AdminAccounts} from '../telegram-account';
import type {TelegramMessage} from '../telegram';

export type TelegramFrom={id?:number;first_name?:string;language_code?:string};
/** `type` is private, group, supergroup or channel. The bot only ever works in a private chat with one person. */
export type TelegramChat={id:number;type?:string};
export type TelegramUpdate={update_id?:number;message?:{message_id?:number;chat:TelegramChat;text?:string;from?:TelegramFrom;contact?:{phone_number?:string;user_id?:number;first_name?:string}};callback_query?:{id:string;data?:string;message?:{chat:TelegramChat};from?:TelegramFrom}};
/** What the bot needs beyond the database to create accounts and sign people in, and the app's dated exchange rates
 * (ECB, with the Central Bank of Uzbekistan as fallback) for entries in another currency than their account. Missing pieces switch those features off. */
export type RateLookup=(from:string,to:string,date:string)=>Promise<{rate:number;effective_date:string}>;
export type BotEnv={appOrigin:string|null;loginSecret:string|null;admin:AdminAccounts|null;rates?:RateLookup};
export const botEnvFromProcess=():BotEnv=>({appOrigin:accountOrigin(),loginSecret:loginSecrets()?.current??null,admin:adminAccounts(),rates:loadDatedExchangeRate});
export type BotOutcome={replies:TelegramMessage[];callbackId?:string};
export type BotClock={now:Date;today:string;newId:()=>string};
/** One update's handling: the database, the chat it came from, the clock and the environment. */
export type Turn={db:ServiceDatabase;chatId:number;clock:BotClock;env:BotEnv};
export type FlowInput={text?:string;callback?:string};
