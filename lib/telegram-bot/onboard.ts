// The setup questions after an account is created in Telegram: language, currency and a first cash account.
import type {Language} from '../i18n';
import {recordSchema} from '../record-schema';
import {t} from '../telegram-kit';
import type {TelegramSubscription} from '../telegram-link';
import {advanceOnboarding,type OnboardDraft} from '../telegram-onboarding';
import type {TelegramMessage} from '../telegram';
import {storeDraft} from './drafts';
import {openAppReply} from './replies';
import type {FlowInput,Turn} from './types';

/** One answer to the setup questions: save what it produced, store the next step and reply. */
export async function onboard(turn:Turn,subscription:TelegramSubscription,draft:OnboardDraft,input:FlowInput,language:Language):Promise<TelegramMessage[]>{
 const {db,chatId,clock}=turn,owner=subscription.user_id;
 const result=advanceOnboarding(draft,input,{language},chatId);
 const {effects}=result,replyLanguage=effects.language??language;
 if(effects.account){
  const parsed=recordSchema.safeParse({id:clock.newId(),name:effects.account.name,kind:'Cash',currency:effects.account.currency,amount:effects.account.amount,quantity:1,cost:0,rate:0,date:clock.today,frequency:'Once',notes:'',business_id:null,ownership_percentage:100,estimated_monthly_income:0,estimated_monthly_payment:0});
  const saved=parsed.success?await db.write('/rest/v1/rpc/telegram_save_finance_record',{method:'POST',body:JSON.stringify({p_owner:owner,p_record:parsed.data})}):null;
  // A refused account keeps the conversation where it is, so the answer can be corrected.
  if(!saved?.ok)return [{chat_id:chatId,text:t(language,'Could not save. {reason}',{reason:t(language,'Check the record fields.')})}];
 }
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
