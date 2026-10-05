// The order of a conversation's questions, going back through them, and what each one depends on.
import type {Entry} from '../finance';
import {formatDate,formatNumber} from '../format';
import {locales,type Language} from '../i18n';
import type {TelegramButton} from '../telegram';
import {backButton as back,t} from '../telegram-kit';
import type {Draft,DraftData,FlowContext,FlowKind,LiabilityKind,Step} from './types';

export const cancelButton=(language:Language):TelegramButton=>({text:t(language,'Cancel'),callback_data:'f:cancel'});
export const newAccountButton=(language:Language):TelegramButton=>({text:'+ '+t(language,'Add cash account'),callback_data:'f:newacc'});
export const newLiabilityButton=(language:Language):TelegramButton=>({text:'+ '+t(language,'Add loan or debt'),callback_data:'f:newliab'});
const backButton=(language:Language):TelegramButton=>back(language,'f:back');
/** The bottom row of every prompt: Back to the previous question when there is one, and Cancel. */
export const controls=(language:Language,canGoBack:boolean):TelegramButton[]=>canGoBack?[backButton(language),cancelButton(language)]:[cancelButton(language)];
// The questions each conversation asks, in order. Currency-dependent steps are skipped when they do not apply.
const stepOrder:Record<FlowKind,Step[]>={
 expense:['category','business','account','amount','name','date','confirm'],
 income:['category','business','account','amount','name','date','confirm'],
 transfer:['account','target','amount','received','date','confirm'],
 repayment:['target','account','amount','date','confirm'],
 mortgage:['target','account','amount','interest','date','confirm'],
 account:['accname','currency','balance'],
 liability:['lkind','lname','currency','amount','duedate','rate','payment','confirm'],
};
// What each question stores, so going back can forget it and everything asked after it.
const stepFields:Record<Step,Array<keyof DraftData>>={category:['category','custom_category_id','category_name'],account:['account_id'],target:['target_id'],amount:['amount'],received:['received'],interest:['interest'],name:['name'],date:['date'],confirm:['fx_rate','fx_rate_date'],fxamount:[],fxrate:[],accname:['account_name'],currency:['currency'],balance:[],lkind:['lkind'],lname:['name'],duedate:['date'],rate:['rate'],payment:['payment'],business:['business_id']};
export const find=(list:Entry[],id?:string)=>list.find(item=>item.id===id);
export const isCash=(entry:Entry)=>entry.kind==='Cash';
export const currencyList=(ctx:FlowContext)=>ctx.currencies?.length?ctx.currencies:['USD'];
/** Expenses and income may name a business when the owner has one; business income must, as in the app. */
export const asksBusiness=(draft:Draft,ctx:Pick<FlowContext,'businesses'>)=>(draft.kind==='expense'||draft.kind==='income')&&!!ctx.businesses?.length;
export const needsBusiness=(draft:Draft)=>draft.kind==='income'&&draft.data.category==='Business income';
/** The questions of a typed entry that return to its confirmation card. */
const cardSteps:Step[]=['category','business','account'];
/** Questions answered with buttons only, where typed text would otherwise be ignored. */
export const buttonSteps:Step[]=['category','business','account','target','lkind','currency','confirm'];
export const backToCard=(draft:Draft)=>!!draft.data.typed&&cardSteps.includes(draft.step)&&!!draft.data.account_id;
/** A new account started from a loan or mortgage payment must use that loan's currency, so the question is not asked. */
export const presetCurrency=(draft:Draft,ctx:Pick<FlowContext,'liabilities'>)=>{const from=draft.data.resume;return draft.kind==='account'&&from&&(from.kind==='repayment'||from.kind==='mortgage')?find(ctx.liabilities,from.data.target_id)?.currency:undefined;};
/** A new liability started from the mortgage payment dead end is a mortgage, so its kind is not asked. */
export const presetLiabilityKind=(draft:Draft):LiabilityKind|undefined=>draft.kind==='liability'&&draft.data.resume?.kind==='mortgage'?'Mortgage':undefined;
/** Whether Back has somewhere to go: an earlier question, or the conversation a dead end interrupted. */
export const canGoBack=(draft:Draft,ctx:Pick<FlowContext,'accounts'|'liabilities'|'businesses'>)=>backToCard(draft)||backStep(draft,ctx)!==null||!!draft.data.resume;
/** A transfer between accounts in different currencies asks what arrived as well. */
const crossCurrencyTransfer=(draft:Draft,ctx:Pick<FlowContext,'accounts'>)=>{const from=find(ctx.accounts,draft.data.account_id),to=find(ctx.accounts,draft.data.target_id);return !!from&&!!to&&from.currency!==to.currency;};
/** Whether a question of the conversation is asked at all for this draft. */
function asked(step:Step,draft:Draft,ctx:Pick<FlowContext,'accounts'|'liabilities'|'businesses'>){
 if(step==='business')return asksBusiness(draft,ctx);
 if(step==='currency')return !presetCurrency(draft,ctx);
 if(step==='lkind')return !presetLiabilityKind(draft);
 return step!=='received'||crossCurrencyTransfer(draft,ctx);
}
/** The question asked before the current one, or null at the first question. */
export function backStep(draft:Draft,ctx:Pick<FlowContext,'accounts'|'liabilities'|'businesses'>):Step|null{
 if(draft.data.typed)return null;
 // A missing exchange rate is asked after the date, so Back returns to the date.
 if(draft.step==='fxamount'||draft.step==='fxrate')return 'date';
 const order=stepOrder[draft.kind].filter(step=>asked(step,draft,ctx));
 const index=order.indexOf(draft.step);
 return index>0?order[index-1]:null;
}
/** Return to an earlier question, forgetting its answer and every answer given after it. The record id stays fixed. */
export function rewind(draft:Draft,step:Step):Draft{
 const order=stepOrder[draft.kind],data={...draft.data};
 for(const later of order.slice(order.indexOf(step)))for(const field of stepFields[later])delete data[field];
 return {...draft,step,data};
}
export const next=(draft:Draft,step:Step,data:Partial<DraftData>={}):Draft=>({...draft,step,data:{...draft.data,...data}});
export function firstStep(kind:FlowKind):Step{return kind==='liability'?'lkind':kind==='account'?'accname':kind==='expense'||kind==='income'?'category':kind==='transfer'?'account':'target';}
/** The currency a payment or record is entered in, and the account it moves money in: they differ when the bot converts. */
export function currencies(draft:Draft,ctx:FlowContext){
 const account=find(ctx.accounts,draft.data.account_id),target=find(ctx.liabilities,draft.data.target_id);
 const record=draft.kind==='repayment'||draft.kind==='mortgage'?target?.currency:draft.kind==='expense'||draft.kind==='income'?draft.data.currency??account?.currency:undefined;
 return {account,record};
}
/** The rate the draft still needs before it can be confirmed: from the account's currency to the record's, on the record's day. */
export function needsRate(draft:Draft,ctx:FlowContext):{from:string;to:string;date:string}|null{
 if(draft.step!=='confirm'||draft.data.fx_rate)return null;
 const {account,record}=currencies(draft,ctx);
 return account&&record&&record!==account.currency?{from:account.currency,to:record,date:draft.data.date??ctx.today}:null;
}
/** The draft with the dated rate found for it, or asking the owner for the converted amount when no rate is available. Never guessed. */
export function withRate(draft:Draft,quote:{rate:number;effective_date:string}|null):Draft{
 return quote&&Number.isFinite(quote.rate)&&quote.rate>0?{...draft,data:{...draft.data,fx_rate:quote.rate,fx_rate_date:quote.effective_date}}:{...draft,step:'fxamount'};
}
/** Example dates in the prompts, shown the way the app shows dates (30 September 2026) and accepted when typed back. */
export const pastExample=(ctx:FlowContext)=>formatDate(ctx.today,locales[ctx.language]);
export const futureExample=(ctx:FlowContext)=>formatDate(`${Number(ctx.today.slice(0,4))+1}-12-31`,locales[ctx.language]);
/** Example amounts in the same way: grouped and with the language's decimal mark (250,000 or 12.5; 250 000 or 12,5). */
export const numberExamples=(language:Language)=>({large:formatNumber(250000,locales[language]),small:formatNumber(12.5,locales[language])});
