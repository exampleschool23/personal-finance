// Saving what the button flow produced through the owner-scoped wrappers from migration 077, and saying what
// happened in the app's own words.
import {actionMessage,type ActionEvent,type ActionLookup} from '../action-messages';
import {expenses,type Entry} from '../finance';
import type {Language} from '../i18n';
import {planningSchemas} from '../planning-schemas';
import {recordSchema} from '../record-schema';
import type {ServiceDatabase} from '../service-role';
import type {Commit,FlowContext} from '../telegram-flow';
import {moneyIn,t} from '../telegram-kit';
import {escapeHtml} from '../telegram';

function commitEvent(commit:Commit):ActionEvent{
 if(commit.type==='record')return {type:'record',created:true,kind:commit.record.kind,name:commit.record.name,amount:commit.record.amount,currency:commit.record.currency,date:commit.record.date||null,frequency:commit.record.frequency,category_id:commit.record.custom_category_id??null};
 const d=commit.data;
 if(commit.action==='transfer')return {type:'transfer',account_id:d.account_id,target_id:d.target_id,amount:d.amount,received:d.received,date:d.date};
 if(commit.action==='repayment')return {type:'repayment',account_id:d.account_id,target_id:d.target_id,amount:d.amount,date:d.date};
 return {type:'mortgage',account_id:d.account_id,target_id:d.target_id,principal:d.amount,interest:d.fee,date:d.date};
}
/** The cash account a save would overdraw, when the amount it takes (in the account's currency) is more than the account holds. */
function overdrawn(commit:Commit,accounts:Entry[]):Entry|undefined{
 const [accountId,debit]=commit.type==='record'?[commit.record.account_id,expenses.includes(commit.record.kind)?commit.record.amount/(commit.record.account_exchange_rate??1):0]:[commit.data.account_id,(commit.action==='mortgage'?commit.data.amount+commit.data.fee:commit.data.amount)/(commit.type==='fxpayment'?commit.rate:1)];
 const account=accounts.find(item=>item.id===accountId);
 return account&&debit>Number(account.amount)?account:undefined;
}
/** The request a commit becomes, or null when its fields do not pass the app's own schemas. */
function saveRequest(owner:string,commit:Commit):{path:string;body:unknown}|null{
 if(commit.type==='record'){
  const parsed=recordSchema.safeParse(commit.record);
  // A converted record carries the rate's day and the account currency beside the rate, as the app's records route adds them.
  return parsed.success?{path:'telegram_save_finance_record',body:{p_owner:owner,p_record:{...parsed.data,...commit.fx}}}:null;
 }
 const parsed=planningSchemas[commit.action].safeParse(commit.data);
 if(!parsed.success)return null;
 if(commit.type==='planning')return {path:'telegram_planning_action',body:{p_owner:owner,p_action:commit.action,p_data:parsed.data}};
 return commit.rate>0?{path:'telegram_payment_with_fx',body:{p_owner:owner,p_action:commit.action,p_data:parsed.data,p_rate:commit.rate,p_rate_date:commit.rate_date,p_account_currency:commit.account_currency,p_record_currency:commit.record_currency}}:null;
}
/** Why the database refused a save, in the same wording the app gives: named refusals are relayed, an overdrawn
 * balance and a duplicate are explained. */
function refusalReason(failure:{code?:string;message?:string},commit:Commit,accounts:Entry[],language:Language){
 const short=overdrawn(commit,accounts);
 const insufficient=failure.code==='23514'||(failure.code==='P0001'&&/insufficient balance/i.test(failure.message??''));
 if(insufficient&&short)return t(language,'Insufficient balance: {account} has {amount}.',{account:escapeHtml(short.name),amount:moneyIn(short.amount,short.currency,language)});
 if(failure.code==='P0001'&&failure.message)return t(language,failure.message);
 if(failure.code==='23514')return t(language,'Insufficient balance or invalid amount.');
 return failure.code==='23505'?t(language,'This name or payment already exists.'):t(language,'Please try again.');
}
type Failure={code?:string;message?:string;details?:string};
/** Whether a duplicate refusal is about the commit's own id (its primary key), not a name or payment that clashes. */
const duplicateId=(failure:Failure,id:string)=>failure.code==='23505'&&[failure.message,failure.details].some(text=>text?.includes(id)||/_pkey"/.test(text??''));
/** The row a commit becomes, by the id the draft chose: a record in finance_records, a payment in account_activity. */
const committedRow=(commit:Commit)=>commit.type==='record'?{table:'finance_records',id:commit.record.id}:{table:'account_activity',id:commit.data.id};
/** Whether the commit is already in the database under its own id. Telegram redelivers an update whose handling
 * failed after the write reached the database (a timeout, a lost connection), so the same Save arrives again with
 * the same id; the database refuses it as a duplicate, which here means it was saved. */
async function alreadySaved(db:ServiceDatabase,owner:string,commit:Commit,failure:Failure){
 const {table,id}=committedRow(commit);
 if(!duplicateId(failure,id))return false;
 return (await db.read<unknown[]>(`/rest/v1/${table}?select=id&id=eq.${id}&user_id=eq.${owner}`)).length>0;
}
/** Save what the flow produced. Returns the reply text and whether it was saved. */
export async function commitDraft(db:ServiceDatabase,owner:string,commit:Commit,ctx:FlowContext&{records:Entry[]}):Promise<{text:string;saved:boolean}>{
 const language=ctx.language;
 const request=saveRequest(owner,commit);
 if(!request)return {text:t(language,'Could not save. {reason}',{reason:t(language,'Check the record fields.')}),saved:false};
 const response=await db.write('/rest/v1/rpc/'+request.path,{method:'POST',body:JSON.stringify(request.body)});
 if(!response.ok){
  const failure=await response.json().catch(()=>({})) as Failure;
  if(!await alreadySaved(db,owner,commit,failure))return {text:t(language,'Could not save. {reason}',{reason:refusalReason(failure,commit,ctx.accounts,language)}),saved:false};
 }
 const lookup:ActionLookup={records:Object.fromEntries(ctx.records.map(record=>[record.id,{name:record.name,kind:record.kind,currency:record.currency}])),goals:{},deleted:{},categories:Object.fromEntries(ctx.categories.map(category=>[category.id,category.name]))};
 return {text:`${t(language,'Saved.')}\n${actionMessage(commitEvent(commit),lookup,language)}`,saved:true};
}
