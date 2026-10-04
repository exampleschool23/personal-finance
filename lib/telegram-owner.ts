// What the background Telegram messages need to know about an owner: language,
// the name to greet them by, and the currency to show amounts in.
import {isLanguage,type Language} from './i18n';
import type {PortfolioSnapshot} from './portfolio-snapshots';
import type {ServiceDatabase} from './service-role';
export type OwnerProfile={language:Language;name:string;currency:string};
/** The name is the one saved in the app's Settings. An empty name means "greet without one"; the Telegram profile name is deliberately not used. */
export async function ownerProfile(db:ServiceDatabase,owner:string):Promise<OwnerProfile>{
 const [row]=await db.read<Array<{language?:string;display_name?:string;currencies?:string[]}>>('/rest/v1/user_preferences?select=language,display_name,currencies&user_id=eq.'+owner);
 return {language:isLanguage(row?.language)?row.language:'en',name:(row?.display_name??'').trim(),currency:row?.currencies?.[0]||'USD'};
}
/** The owner's newest daily snapshots, oldest first. */
export async function recentSnapshots(db:ServiceDatabase,owner:string,limit:number){
 const rows=await db.read<PortfolioSnapshot[]>(`/rest/v1/portfolio_snapshots?select=occurred_on,assets,debt,rates,updated_at&user_id=eq.${owner}&order=occurred_on.desc&limit=${limit}`);
 return rows.reverse();
}
/** An owner whose linked chat takes the digest and the weekly recap. */
export type DigestSubscriber={user_id:string;chat_id:number};
/** Owners with a linked private chat and the digest switch on. Private chat ids are positive; a group's are negative and never receive anything. */
export const digestSubscribersPath='/rest/v1/telegram_subscriptions?select=user_id,chat_id&chat_id=not.is.null&digest_enabled=is.true&chat_id=gt.0';
/** Runs `deliver` for each digest subscriber in turn and counts the messages Telegram accepted. One owner's failure never blocks the others;
 * only reading the subscribers can throw. `deliver` sends to the subscriber's own linked chat and resolves to whether it arrived. */
export async function deliverToSubscribers(db:ServiceDatabase,deliver:(subscriber:DigestSubscriber)=>Promise<boolean>):Promise<{sent:number;failed:number}>{
 let sent=0,failed=0;
 for(const subscriber of await db.read<DigestSubscriber[]>(digestSubscribersPath)){
  try{if(await deliver(subscriber))sent++;else failed++;}catch{failed++;}
 }
 return {sent,failed};
}
