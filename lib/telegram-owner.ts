// What the background Telegram messages need to know about an owner: language,
// the name to greet them by, the currency to show amounts in, and the time zone
// the digest and recap follow.
import {isLanguage,type Language} from './i18n';
import {ownerTimezone} from './timezones';
import type {PortfolioSnapshot} from './portfolio-snapshots';
import type {ServiceDatabase} from './service-role';
export type OwnerProfile={language:Language;name:string;currency:string;timezone:string};
/** The name is the one saved in the app's Settings. An empty name means "greet without one"; the Telegram profile name is deliberately not used.
 * Every column is read so this keeps working before migration 095 adds the time zone. */
export async function ownerProfile(db:ServiceDatabase,owner:string):Promise<OwnerProfile>{
 const [row]=await db.read<Array<{language?:string;display_name?:string;currencies?:string[];timezone?:string|null;country?:string|null}>>('/rest/v1/user_preferences?select=*&user_id=eq.'+owner);
 const language=isLanguage(row?.language)?row.language:'en';
 return {language,name:(row?.display_name??'').trim(),currency:row?.currencies?.[0]||'USD',timezone:ownerTimezone(row?.timezone,row?.country,language)};
}
/** The owner's newest daily snapshots, oldest first. */
export async function recentSnapshots(db:ServiceDatabase,owner:string,limit:number){
 const rows=await db.read<PortfolioSnapshot[]>(`/rest/v1/portfolio_snapshots?select=occurred_on,assets,debt,rates,updated_at&user_id=eq.${owner}&order=occurred_on.desc&limit=${limit}`);
 return rows.reverse();
}
/** The scheduled messages an owner gets once per local day, and the subscription column that remembers the day. */
export type ScheduledMessage='digest_sent_on'|'recap_sent_on';
/** Claim the day for a scheduled message before sending it. Only one claim per day succeeds, so an hourly cron, a retry or
 * two overlapping runs never send twice. Returns false when the day was already claimed. */
export async function claimDay(db:ServiceDatabase,owner:string,column:ScheduledMessage,day:string):Promise<boolean>{
 const response=await db.write(`/rest/v1/telegram_subscriptions?user_id=eq.${owner}&or=(${column}.is.null,${column}.lt.${day})`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({[column]:day})});
 if(!response.ok)throw Error('Database request failed.');
 return (await response.json() as unknown[]).length>0;
}
/** Give the day back after a send failed, so the next hourly run tries again. */
export async function releaseDay(db:ServiceDatabase,owner:string,column:ScheduledMessage,day:string,previous:string|null){
 await db.write(`/rest/v1/telegram_subscriptions?user_id=eq.${owner}&${column}=eq.${day}`,{method:'PATCH',body:JSON.stringify({[column]:previous})}).catch(()=>undefined);
}
