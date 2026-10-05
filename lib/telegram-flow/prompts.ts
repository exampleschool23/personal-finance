// The question the bot asks at each step, with its buttons.
import {expenses,income} from '../finance';
import {formatDate} from '../format';
import {locales,type Language} from '../i18n';
import {escapeHtml,type TelegramButton,type TelegramKeyboard,type TelegramMessage} from '../telegram';
import {keyboardRows,moneyIn as money,t} from '../telegram-kit';
import {canGoBack,cancelButton,controls,currencies,currencyList,find,futureExample,isCash,needsBusiness,newAccountButton,newLiabilityButton,pastExample} from './steps';
import {summary} from './summary';
import {liabilityKinds,type Draft,type FlowContext,type Step} from './types';

const pageSize=8;
/** A long list of choices a page at a time, with ‹ › between pages, any extra rows, and Back and Cancel. */
function choicePage({language,chat,page,back}:Pick<Ask,'language'|'chat'|'page'|'back'>,text:string,options:TelegramButton[],extra:TelegramButton[][]=[]):TelegramMessage{
 const start=page*pageSize,slice=options.slice(start,start+pageSize);
 const nav:TelegramButton[]=[];
 if(page>0)nav.push({text:'‹',callback_data:`f:page:${page-1}`});
 if(start+pageSize<options.length)nav.push({text:'›',callback_data:`f:page:${page+1}`});
 return {chat_id:chat,text,keyboard:{inline:[...keyboardRows(slice,2),...(nav.length?[nav]:[]),...extra,controls(language,back)]}};
}
function categoryOptions(kind:'expense'|'income',ctx:FlowContext):TelegramButton[]{
 const defaults=kind==='expense'?expenses:income;
 const custom=ctx.categories.filter(category=>category.direction===kind).sort((a,b)=>a.name.localeCompare(b.name));
 // Business income is offered only when there is a business to credit it to.
 const offered=defaults.filter(name=>name!=='Business income'||!!ctx.businesses?.length);
 return [...custom.map(category=>({text:category.name,callback_data:'f:cat:'+category.id})),...offered.map(name=>({text:t(ctx.language,name),callback_data:'f:cat:'+name}))];
}
function accountOptions(ctx:FlowContext,currency?:string,exclude?:string):TelegramButton[]{
 return ctx.accounts.filter(isCash).filter(account=>(!currency||account.currency===currency)&&account.id!==exclude).map(account=>({text:`${account.name} · ${money(account.amount,account.currency,ctx.language)}`,callback_data:'f:acc:'+account.id}));
}
const liabilityOptions=(ctx:FlowContext,kinds:string[])=>ctx.liabilities.filter(item=>kinds.includes(item.kind)&&item.amount>0).map(item=>({text:`${item.name} · ${money(item.amount,item.currency,ctx.language)}`,callback_data:'f:tgt:'+item.id}));
/** The buttons under a refused save. A typed entry's card has no Back, so it offers its Change buttons again to correct the account or category. */
export const retryKeyboard=(draft:Draft,ctx:FlowContext):TelegramKeyboard=>draft.data.typed&&draft.step==='confirm'
 ?{inline:[[{text:t(ctx.language,'Change account'),callback_data:'f:chacc'},{text:t(ctx.language,'Change category'),callback_data:'f:chcat'}],[cancelButton(ctx.language)]]}
 :{inline:[controls(ctx.language,canGoBack(draft,ctx))]};

/** What every question knows: the draft, the owner's data, the chat, the page of a long list, Back and the control row. */
type Ask={draft:Draft;ctx:FlowContext;chat:number;page:number;back:boolean;controlRow:TelegramButton[];language:Language};
const question=({chat,controlRow}:Ask,text:string,rows:TelegramButton[][]=[]):TelegramMessage=>({chat_id:chat,text,keyboard:{inline:[...rows,controlRow]}});
const zero=[{text:'0',callback_data:'f:zero'}];
/** The currency an amount is typed in: the loan's for a payment, else the one chosen or the account's. */
function amountCurrency({draft,ctx}:Ask){
 const account=find(ctx.accounts,draft.data.account_id),target=find(ctx.liabilities,draft.data.target_id);
 return (draft.kind==='liability'?draft.data.currency:draft.kind==='repayment'||draft.kind==='mortgage'?target?.currency:draft.data.currency??account?.currency)??'';
}
const prompts:Record<Step,(ask:Ask)=>TelegramMessage>={
 category:ask=>{
  const {draft,language}=ask;
  // A typed entry read as the wrong direction is turned around here.
  const flip=draft.data.typed?[[{text:t(language,draft.kind==='income'?'Make it an expense':'Make it income'),callback_data:'f:flip'}]]:[];
  return choicePage(ask,t(language,draft.kind==='income'?'Choose an income category':'Choose an expense category'),categoryOptions(draft.kind as 'expense'|'income',ask.ctx),flip);
 },
 account:ask=>{
  const {draft,language}=ask;
  // Any cash account can pay a loan: one in another currency converts at the day's rate.
  const options=accountOptions(ask.ctx);
  if(!options.length)return question(ask,t(language,'Add a cash account to continue.'),[[newAccountButton(language)]]);
  return choicePage(ask,t(language,draft.kind==='transfer'?'From which account?':draft.kind==='income'?'Into which account?':'From which account?'),options);
 },
 target:ask=>{
  const {draft,ctx,language}=ask;
  if(draft.kind==='transfer'){
   const options=accountOptions(ctx,undefined,draft.data.account_id).map(option=>({...option,callback_data:option.callback_data.replace('f:acc:','f:tgt:')}));
   return options.length?choicePage(ask,t(language,'To which account?'),options):question(ask,t(language,'Add a second cash account to continue.'),[[newAccountButton(language)]]);
  }
  const mortgage=draft.kind==='mortgage',options=liabilityOptions(ctx,mortgage?['Mortgage']:['Loan','Debt']);
  return options.length?choicePage(ask,t(language,mortgage?'Which mortgage?':'Which loan or debt?'),options):question(ask,t(language,mortgage?'No open mortgage found.':'No open loan or debt found.'),[[newLiabilityButton(language)]]);
 },
 amount:ask=>{
  const {draft,ctx,language}=ask,currency=amountCurrency(ask),account=find(ctx.accounts,draft.data.account_id);
  // Expenses and income may be entered in another of the owner's currencies; the account converts it.
  const others=draft.kind==='expense'||draft.kind==='income'?[...new Set([...(ctx.currencies??[]),account?.currency??''])].filter(code=>code&&code!==currency):[];
  const switches=others.length?[others.map(code=>({text:t(language,'In {currency}',{currency:code}),callback_data:'f:amtcur:'+code}))]:[];
  return question(ask,t(language,draft.kind==='liability'?'Type the outstanding amount in {currency}':draft.kind==='mortgage'?'Type the principal amount in {currency}':'Type the amount in {currency}',{currency}),switches);
 },
 received:ask=>question(ask,t(ask.language,'Type the amount received in {currency}',{currency:find(ask.ctx.accounts,ask.draft.data.target_id)?.currency??''})),
 interest:ask=>question(ask,t(ask.language,'Type the interest amount in {currency}, or 0',{currency:find(ask.ctx.liabilities,ask.draft.data.target_id)?.currency??''}),[zero]),
 name:ask=>question(ask,t(ask.language,'Type a name for this record, or skip to use the category'),[[{text:t(ask.language,'Skip'),callback_data:'f:skip'}]]),
 date:ask=>question(ask,t(ask.language,'Which day? Choose, or type a date like {date}',{date:pastExample(ask.ctx)}),[[{text:t(ask.language,'Today'),callback_data:'f:date:today'},{text:t(ask.language,'Yesterday'),callback_data:'f:date:yesterday'}]]),
 accname:ask=>question(ask,t(ask.language,'Name the cash account, for example Wallet.'),[[{text:t(ask.language,'Cash'),callback_data:'f:accname:cash'}]]),
 business:ask=>{
  // Business income must name its business; anything else may stay personal.
  const options=[...(ask.ctx.businesses??[]).map(business=>({text:business.name,callback_data:'f:biz:'+business.id})),...(needsBusiness(ask.draft)?[]:[{text:t(ask.language,'No business'),callback_data:'f:biz:none'}])];
  return choicePage(ask,t(ask.language,'Choose a business'),options);
 },
 lkind:ask=>question(ask,t(ask.language,'Is it a loan, a debt or a mortgage?'),[liabilityKinds.map(kind=>({text:t(ask.language,kind),callback_data:'f:lkind:'+kind}))]),
 lname:ask=>{const kind=ask.draft.data.lkind;return question(ask,t(ask.language,kind==='Mortgage'?'Name it, for example Home mortgage.':kind==='Debt'?'Name it, for example Credit card.':'Name it, for example Car loan.'));},
 duedate:ask=>question(ask,t(ask.language,'When is it due? Type a date like {date}',{date:futureExample(ask.ctx)})),
 rate:ask=>question(ask,t(ask.language,'Type the yearly interest rate in percent, or 0'),[zero]),
 payment:ask=>question(ask,t(ask.language,'Type the monthly payment in {currency}, or 0',{currency:ask.draft.data.currency??''}),[zero]),
 currency:ask=>{const kind=ask.draft.kind;return question(ask,t(ask.language,kind==='liability'?'Which currency is it in?':kind==='account'?'Which currency is this account in?':'Which currency was it?'),[currencyList(ask.ctx).map(code=>({text:code,callback_data:'f:cur:'+code}))]);},
 balance:ask=>question(ask,t(ask.language,'How much is in it? Type 0 if it is empty.'),[zero]),
 fxamount:ask=>{
  const {account:from,record}=currencies(ask.draft,ask.ctx);
  return question(ask,t(ask.language,'There is no {from} to {to} exchange rate for {date}. How much is this in {to}, the currency of {account}?',{from:record??'',to:from?.currency??'',date:formatDate(ask.draft.data.date??ask.ctx.today,locales[ask.language]),account:escapeHtml(from?.name??'')}),[[{text:t(ask.language,'Type the rate instead'),callback_data:'f:fxrate'}]]);
 },
 fxrate:ask=>{
  const {account:from,record}=currencies(ask.draft,ask.ctx);
  return question(ask,t(ask.language,'Type the rate: how many {to} is 1 {from}?',{from:record??'',to:from?.currency??''}),[[{text:t(ask.language,'Type the amount instead'),callback_data:'f:fxamount'}]]);
 },
 confirm:ask=>{
  const {draft,ctx,language}=ask,save=[{text:t(language,'Save'),callback_data:'f:save'}];
  if(!draft.data.typed)return question(ask,summary(draft,ctx),[save]);
  // A typed entry is checked on one card: every guess can be changed before saving.
  const changes:TelegramButton[]=[{text:t(language,'Change category'),callback_data:'f:chcat'},{text:t(language,'Change account'),callback_data:'f:chacc'}];
  if(ctx.businesses?.length)changes.push({text:t(language,'Change business'),callback_data:'f:chbiz'});
  return {chat_id:ask.chat,text:summary(draft,ctx),keyboard:{inline:[save,...keyboardRows(changes,2),[cancelButton(language)]]}};
 },
};
/** The prompt for the draft's current step. */
export function prompt(draft:Draft,ctx:FlowContext,chat:number,page=0):TelegramMessage{
 const back=canGoBack(draft,ctx);
 return prompts[draft.step]({draft,ctx,chat,page,back,controlRow:controls(ctx.language,back),language:ctx.language});
}
