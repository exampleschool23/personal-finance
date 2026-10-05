// The conversation a chat is in the middle of, kept between messages.
import type {ServiceDatabase} from '../service-role';
import type {Draft,FlowKind,Step} from '../telegram-flow';
import type {OnboardDraft} from '../telegram-onboarding';

const draftMinutes=30;
export type AnyDraft=Draft|OnboardDraft;
/** The stored draft, or null when there is none or a record entry has waited too long. */
export async function loadDraft(db:ServiceDatabase,owner:string,now:Date):Promise<AnyDraft|null>{
 const rows=await db.read<Array<{step:string;data:Draft['data'];updated_at:string}>>('/rest/v1/telegram_drafts?select=step,data,updated_at&user_id=eq.'+owner);
 const row=rows[0];
 if(!row)return null;
 const [kind,step]=row.step.split(':');
 // The setup questions never expire: an account that stops halfway must be able to finish later. Record entries do.
 if(kind!=='onboard'&&now.getTime()-Date.parse(row.updated_at)>draftMinutes*60000)return null;
 return kind==='onboard'?{kind:'onboard',step:step as OnboardDraft['step'],data:row.data as OnboardDraft['data']}:{kind:kind as FlowKind,step:step as Step,data:row.data as Draft['data']};
}
/** Keeps the draft, or forgets it with null. */
export async function storeDraft(db:ServiceDatabase,owner:string,draft:AnyDraft|null,now:Date){
 const response=draft
  ?await db.write('/rest/v1/telegram_drafts?on_conflict=user_id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates'},body:JSON.stringify({user_id:owner,step:`${draft.kind}:${draft.step}`,data:draft.data,updated_at:now.toISOString()})})
  :await db.write('/rest/v1/telegram_drafts?user_id=eq.'+owner,{method:'DELETE'});
 if(!response.ok)throw Error('Database request failed.');
}
