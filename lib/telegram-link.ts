// The owner's Telegram link as stored and as Settings sees it. A chat is tied to
// an account only by sharing a phone number in the bot or by signing in on the
// web from the bot (telegram-connect.ts); no code ever travels in a message.
export type TelegramSubscription={user_id:string;chat_id:number|null;digest_enabled:boolean;actions_enabled:boolean;linked_at:string|null;telegram_user_id?:number|null;phone?:string|null;first_name?:string|null;consented_at?:string|null};
/** Whether the bot created this account: it has the person's confirmed number, their consent and their Telegram identity.
 * Only such an account signs in with its number or with the derived password; an account linked from the web never gains either. */
export const createdInTelegram=(subscription:Pick<TelegramSubscription,'phone'|'consented_at'|'telegram_user_id'>|null|undefined):subscription is TelegramSubscription&{phone:string;telegram_user_id:number;consented_at:string}=>!!subscription?.phone&&!!subscription.consented_at&&!!subscription.telegram_user_id;
/** The change that unlinks a chat. `release` also gives up the Telegram identity, as an account without a number does on sign-out,
 * so the same person can use another account; an account that signs in with its number keeps it to return to. */
export const unlinkedChat=(at:string,release:boolean)=>({chat_id:null,linked_at:null,updated_at:at,...(release?{telegram_user_id:null,first_name:null}:{})});
/** What the Settings panel shows. */
export type TelegramStatus={configured:boolean;linked:boolean;digest_enabled:boolean;actions_enabled:boolean;bot_username:string|null};
/** The bot's plain address: it carries nothing that identifies an account. */
export const telegramBotUrl=(botUsername:string)=>`https://t.me/${botUsername}`;
export function subscriptionStatus(subscription:TelegramSubscription|undefined,botUsername:string|null):TelegramStatus{
 return {configured:!!botUsername,linked:!!subscription?.chat_id,digest_enabled:subscription?.digest_enabled??true,actions_enabled:subscription?.actions_enabled??true,bot_username:botUsername};
}
