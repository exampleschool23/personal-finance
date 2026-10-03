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
