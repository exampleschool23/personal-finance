// The confirmation card: what the owner is about to save, in their language.
import {formatDate,formatNumber,formatPercent} from '../format';
import {locales} from '../i18n';
import {escapeHtml} from '../telegram';
import {moneyIn as money,t} from '../telegram-kit';
import {currencies,find,recordName} from './steps';
import type {Entry} from '../finance';
import type {Draft,FlowContext,FlowKind} from './types';

/** What every card line knows: the draft's answers, its accounts and the formatted day. */
type Card={draft:Draft;ctx:FlowContext;language:FlowContext['language'];d:Draft['data'];account?:Entry;target?:Entry;to?:Entry;day:string;
 /** An account, loan or person's name in bold. */
 name:(value?:string)=>string;
 /** In another currency than the account: what the account moves, and the rate used, as 1 unit of the entered currency. */
 converted:(amount:number)=>string};
/** The business a record will carry: the one chosen here, else the account's own. */
function businessLine({d,account,ctx,language}:Card):string[]{
 const businessId=d.business_id!==undefined?d.business_id:account?.business_id,business=businessId?find(ctx.businesses??[],businessId):undefined;
 return business?[t(language,'Business: {name}',{name:escapeHtml(business.name)})]:[];
}
/** The schedule the payment will be recorded against, named by its id. */
function scheduleLine({d,ctx,language}:Card):string[]{
 const schedule=d.schedule_id?find(ctx.records??[],d.schedule_id):undefined;
 return schedule?[t(language,'Scheduled payment: {name}',{name:escapeHtml(schedule.name)})]:[];
}
const cashFlowLines=(card:Card)=>{
 const {draft,language,d,account,day,name,converted}=card;
 return [`${t(language,draft.kind==='expense'?'Expense':'Income')} · ${escapeHtml(d.category_name??'')}`,`${name(recordName(draft,card.ctx))} · ${money(d.amount??0,d.currency??account?.currency??'',language)} · ${day}`,t(language,draft.kind==='income'?'into {account}':'from {account}',{account:escapeHtml(account?.name??'')})+converted(d.amount??0),...businessLine(card),...scheduleLine(card)];
};
const cardLines:Record<FlowKind,(card:Card)=>string[]>={
 expense:cashFlowLines,
 income:cashFlowLines,
 transfer:({language,d,account,to,day,name})=>[`${t(language,'Transfer')} · ${name(account?.name)} → ${name(to?.name)}`,`${money(d.amount??0,account?.currency??'',language)}${to&&account&&to.currency!==account.currency?' → '+money(d.received??0,to.currency,language):''} · ${day}`],
 repayment:({language,d,account,target,day,name,converted})=>[`${t(language,'Repayment')} · ${name(target?.name)}`,`${money(d.amount??0,target?.currency??'',language)} · ${day}`,t(language,'from {account}',{account:escapeHtml(account?.name??'')})+converted(d.amount??0)],
 liability:({language,d,day,name})=>[`${t(language,d.lkind??'Loan')} · ${name(d.name)}`,`${money(d.amount??0,d.currency??'',language)} · ${t(language,'Due: {date}',{date:day})}`,`${t(language,'Interest rate')} ${formatPercent(d.rate??0,locales[language])} · ${t(language,'Monthly payment')} ${money(d.payment??0,d.currency??'',language)}`],
 mortgage:({language,d,account,target,day,name,converted})=>{
  const currency=target?.currency??'';
  return [`${t(language,'Mortgage payment')} · ${name(target?.name)}`,`${t(language,'principal {amount}',{amount:money(d.amount??0,currency,language)})} · ${t(language,'interest {amount}',{amount:money(d.interest??0,currency,language)})} · ${day}`,t(language,'from {account}',{account:escapeHtml(account?.name??'')})+converted((d.amount??0)+(d.interest??0))];
 },
 account:()=>[],
};
/** What the owner is about to save, in their language. */
export function summary(draft:Draft,ctx:FlowContext):string{
 const language=ctx.language,d=draft.data,account=find(ctx.accounts,d.account_id);
 const {record}=currencies(draft,ctx);
 const converted=(amount:number)=>d.fx_rate&&account&&record?` · ≈ ${money(amount/d.fx_rate,account.currency,language)}\n1 ${record} = ${formatNumber(1/d.fx_rate,locales[language],6)} ${account.currency}`:'';
 const card:Card={draft,ctx,language,d,account,target:find(ctx.liabilities,d.target_id),to:find(ctx.accounts,d.target_id),day:formatDate(d.date??ctx.today,locales[language]),name:value=>`<b>${escapeHtml(value??'')}</b>`,converted};
 return [`<b>${t(language,'Save this?')}</b>`,...cardLines[draft.kind](card)].join('\n');
}
