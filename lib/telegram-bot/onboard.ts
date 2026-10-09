// The setup questions after an account is created in Telegram: language, currency and a first cash account.
import type {Language} from '../i18n';
import {recordSchema} from '../record-schema';
import {t} from '../telegram-kit';
import type {TelegramSubscription} from '../telegram-link';
import {advanceOnboarding,type OnboardDraft,type OnboardEffects} from '../telegram-onboarding';
import type {TelegramMessage} from '../telegram';
import {storeDraft} from './drafts';
import {openAppReply} from './replies';
import type {FlowInput,Turn} from './types';

/** Saves the first cash account under the id kept in the draft. Telegram redelivers an update whose handling failed
 * after the save (the preferences or the draft could not be written), so the same answer arrives again: it saves the
 * same id, which the database accepts as the same record, never a second account. A draft from before ids were kept
 * gets one now, stored before the save for the same reason. */
async function saveFirstAccount({db,clock}:Turn,owner:string,draft:OnboardDraft,account:NonNullable<OnboardEffects['account']>){
 let id=account.id;
 if(!id){id=clock.newId();await storeDraft(db,owner,{...draft,data:{...draft.data,account_id:id}},clock.now);}
 const parsed=recordSchema.safeParse({id,name:account.name,kind:'Cash',currency:account.currency,amount:account.amount,quantity:1,cost:0,rate:0,date:clock.today,frequency:'Once',notes:'',business_id:null,ownership_percentage:100,estimated_monthly_income:0,estimated_monthly_payment:0});
 if(!parsed.success)return false;
 const saved=await db.write('/rest/v1/rpc/telegram_save_finance_record',{method:'POST',body:JSON.stringify({p_owner:owner,p_record:parsed.data})});
 if(saved.ok)return true;
 // A retry on a later day differs in its date, which the database refuses as a changed record; the account is there all the same.
 return (await db.read<unknown[]>(`/rest/v1/finance_records?select=id&id=eq.${id}&user_id=eq.${owner}`)).length>0;
}
/** One answer to the setup questions: save what it produced, store the next step and reply. */
export async function onboard(turn:Turn,subscription:TelegramSubscription,draft:OnboardDraft,input:FlowInput,language:Language):Promise<TelegramMessage[]>{
 const {db,chatId,clock}=turn,owner=subscription.user_id;
 const result=advanceOnboarding(draft,input,{language},chatId);
 // The first account's id is chosen once, when its balance is asked for, and travels in the draft from then on.
 if(result.draft?.step==='balance'&&!result.draft.data.account_id)result.draft={...result.draft,data:{...result.draft.data,account_id:clock.newId()}};
 const {effects}=result,replyLanguage=effects.language??language;
 // A refused account keeps the conversation where it is, so the answer can be corrected.
 if(effects.account&&!await saveFirstAccount(turn,owner,draft,effects.account))return [{chat_id:chatId,text:t(language,'Could not save. {reason}',{reason:t(language,'Check the record fields.')})}];
 const patch:Record<string,unknown>={};
 if(effects.language)patch.language=effects.language;
 if(effects.currency)patch.currencies=[effects.currency];
 if(effects.finished)patch.onboarded_at=clock.now.toISOString();
 if(Object.keys(patch).length){const response=await db.write('/rest/v1/user_preferences?user_id=eq.'+owner,{method:'PATCH',body:JSON.stringify(patch)});if(!response.ok)throw Error('Database request failed.');}
 await storeDraft(db,owner,result.draft,clock.now);
 const replies=result.reply?[result.reply]:[];
 if(effects.finished){const open=await openAppReply(turn,subscription,replyLanguage);if(open)replies.push(open);}
 return replies;
}
