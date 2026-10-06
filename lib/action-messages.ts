// The Telegram message that follows a saved action. Pure: routes describe what
// happened with ids, the caller resolves the names, and this turns both into
// text in the owner's language with the shared formatters.
import type {Kind} from './finance';
import {formatDate,formatNumber} from './format';
import type {Language} from './i18n';
import {escapeHtml} from './telegram';
import {messageKit} from './telegram-kit';
import { unitPricedKinds } from './finance';
export type ActionEvent=
 |{type:'record';created:boolean;kind:Kind;name:string;amount:number;currency:string;date:string|null;frequency:string;category_id?:string|null}
 |{type:'record_deleted';id:string}
 |{type:'occurrence';account_id:string;target_id:string;amount:number;date:string}
 |{type:'repayment';account_id:string;target_id:string;amount:number;date:string}
 |{type:'mortgage';account_id:string;target_id:string;principal:number;interest:number;date:string}
 |{type:'transfer';account_id:string;target_id:string;amount:number;received:number;date:string}
 |{type:'reconcile';account_id:string;amount:number;date:string}
 |{type:'exception';target_id:string;date:string;skip:boolean}
 |{type:'dismiss';target_id:string;date:string}
 |{type:'goal';name:string;target:number;currency:string}
 |{type:'goal_deleted'}
 |{type:'goal_activity';goal_id:string;activity:'contribution'|'withdrawal'|'transfer';amount:number;date:string}
 |{type:'goal_funding';goal_id:string;monthly:number|null;enabled:boolean}
 |{type:'movement';kind:'transfer'|'buy'|'sell'|'interest';source_id:string;target_id:string;sent:number;received:number;date:string}
 |{type:'import';added:number;skipped:number};
export type NamedRecord={name:string;kind:string;currency:string};
export type NamedGoal={name:string;currency:string};
/** Names the caller must look up before the message can be written. `categories` maps a custom category id to its name. */
export type ActionLookup={records:Record<string,NamedRecord>;goals:Record<string,NamedGoal>;deleted:Record<string,NamedRecord&{amount:number}>;categories?:Record<string,string>};
const unitKinds=unitPricedKinds;
export function actionMessage(event:ActionEvent,lookup:ActionLookup,language:Language):string{
 const kit=messageKit(language),{locale,t}=kit;
 // A record the lookup could not find has no currency; the amount still shows as a plain number.
 const money=(value:number,currency:string)=>currency?kit.money(value,currency):formatNumber(value,locale),day=(value:string|null)=>formatDate(value??'',locale);
 const record=(id:string)=>lookup.records[id]??{name:t('Unknown record'),kind:'',currency:''},goal=(id:string)=>lookup.goals[id]??{name:t('Unknown goal'),currency:''};
 const name=(value:string)=>`<b>${escapeHtml(value)}</b>`;
 const line=(title:string,...parts:Array<string|null|undefined>)=>`${title}\n${parts.filter(Boolean).join(' · ')}`;
 switch(event.type){
  // A record in a custom category is named by that category, as the app shows it, not by its stored Other income/expense kind.
  case 'record':return line(t(event.created?'Added {kind}':'Updated {kind}',{kind:(event.category_id&&lookup.categories?.[event.category_id])?escapeHtml(lookup.categories[event.category_id]):t(event.kind)}),name(event.name),money(event.amount,event.currency),event.date?day(event.date):null,event.frequency!=='Once'?t(event.frequency):null);
  case 'record_deleted':{const deleted=lookup.deleted[event.id];return deleted?line(t('Deleted {kind}',{kind:t(deleted.kind)}),name(deleted.name),money(deleted.amount,deleted.currency)):t('Deleted a record');}
  case 'occurrence':{const target=record(event.target_id),account=record(event.account_id);return line(t('Payment recorded'),name(target.name),money(event.amount,target.currency||account.currency),day(event.date),t('from {account}',{account:escapeHtml(account.name)}));}
  case 'repayment':{const target=record(event.target_id),account=record(event.account_id);return line(t('Repayment recorded'),name(target.name),money(event.amount,target.currency||account.currency),day(event.date),t('from {account}',{account:escapeHtml(account.name)}));}
  case 'mortgage':{const target=record(event.target_id),account=record(event.account_id),currency=target.currency||account.currency;return line(t('Mortgage payment recorded'),name(target.name),t('principal {amount}',{amount:money(event.principal,currency)}),t('interest {amount}',{amount:money(event.interest,currency)}),day(event.date),t('from {account}',{account:escapeHtml(account.name)}));}
  case 'transfer':{const from=record(event.account_id),to=record(event.target_id);const amount=from.currency&&to.currency&&from.currency!==to.currency?`${money(event.amount,from.currency)} → ${money(event.received,to.currency)}`:money(event.amount,from.currency||to.currency);return line(t('Transfer recorded'),`${name(from.name)} → ${name(to.name)}`,amount,day(event.date));}
  case 'reconcile':{const account=record(event.account_id);return line(t('Balance reconciled'),name(account.name),money(event.amount,account.currency),day(event.date));}
  case 'exception':return line(t(event.skip?'Scheduled payment skipped':'Scheduled payment restored'),name(record(event.target_id).name),day(event.date));
  case 'dismiss':return line(t('Payment dismissed'),name(record(event.target_id).name),day(event.date));
  case 'goal':return line(t('Goal saved'),name(event.name),t('target {amount}',{amount:money(event.target,event.currency)}));
  case 'goal_deleted':return t('Goal deleted');
  case 'goal_activity':{const target=goal(event.goal_id);return line(t(event.activity==='contribution'?'Goal contribution':event.activity==='withdrawal'?'Goal withdrawal':'Goal transfer'),name(target.name),money(event.amount,target.currency),day(event.date));}
  case 'goal_funding':{const target=goal(event.goal_id);return line(t('Goal funding updated'),name(target.name),event.enabled&&event.monthly?t('{amount} per month',{amount:money(event.monthly,target.currency)}):t('Funding paused'));}
  case 'movement':{
   const source=record(event.source_id),target=record(event.target_id);
   const units=(value:number,holding:NamedRecord)=>unitKinds.includes(holding.kind)?formatNumber(value,locale):money(value,holding.currency);
   if(event.kind==='interest')return line(t('Interest recorded'),name(target.name),units(event.received,target),day(event.date));
   if(event.kind==='buy')return line(t('Purchase recorded'),name(target.name),units(event.received,target),t('for {amount}',{amount:money(event.sent,source.currency)}),t('from {account}',{account:escapeHtml(source.name)}),day(event.date));
   if(event.kind==='sell')return line(t('Sale recorded'),name(source.name),units(event.sent,source),t('for {amount}',{amount:money(event.received,target.currency)}),t('to {account}',{account:escapeHtml(target.name)}),day(event.date));
   return line(t('Holdings transferred'),`${name(source.name)} → ${name(target.name)}`,units(event.sent,source),day(event.date));
  }
  case 'import':return line(t('Statement imported'),t('{count} added',{count:formatNumber(event.added,locale)}),t('{count} skipped',{count:formatNumber(event.skipped,locale)}));
 }
}
