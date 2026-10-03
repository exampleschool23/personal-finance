// The owner's Telegram link as stored and as Settings sees it. A chat is tied to
// an account only by sharing a phone number in the bot or by signing in on the
// web from the bot (telegram-connect.ts); no code ever travels in a message.
export type TelegramSubscription={user_id:string;chat_id:number|null;digest_enabled:boolean;actions_enabled:boolean;linked_at:string|null;telegram_user_id?:number|null;phone?:string|null;first_name?:string|null;consented_at?:string|null};
/** What the Settings panel shows. */
export type TelegramStatus={configured:boolean;linked:boolean;digest_enabled:boolean;actions_enabled:boolean;bot_username:string|null};
/** The bot's plain address: it carries nothing that identifies an account. */
export const telegramBotUrl=(botUsername:string)=>`https://t.me/${botUsername}`;
export function subscriptionStatus(subscription:TelegramSubscription|undefined,botUsername:string|null):TelegramStatus{
 return {configured:!!botUsername,linked:!!subscription?.chat_id,digest_enabled:subscription?.digest_enabled??true,actions_enabled:subscription?.actions_enabled??true,bot_username:botUsername};
}
