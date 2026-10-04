// The button conversation the Telegram bot runs. Pure: given the owner's data,
// the draft so far and one input, it returns the next draft, the reply and,
// at the end, what to save. The bot handler owns storage and the database.
import {shiftDay} from './calendar-days';
import {income,expenses,type Entry} from './finance';
import {formatDate,formatNumber,formatPercent} from './format';
import {dictionaries,locales,type Language} from './i18n';
import type {Category} from './planning';
import type {RecordInput} from './record-schema';
import {escapeHtml,type TelegramButton,type TelegramKeyboard,type TelegramMessage} from './telegram';
import {guessCategory,looseNumber,parseDay,parseTypedAmount,parseTypedEntry,currencyCandidates} from './telegram-entry';
import {backButton as back,keyboardRows,moneyIn as money,t} from './telegram-kit';
import {directionOf,type TransactionRule} from './transaction-rules';
export {parseDay} from './telegram-entry';
export type FlowKind='expense'|'income'|'transfer'|'repayment'|'mortgage'|'account'|'liability';
export type Step='category'|'account'|'target'|'amount'|'received'|'interest'|'name'|'date'|'confirm'|'accname'|'currency'|'balance'|'lkind'|'lname'|'duedate'|'rate'|'payment'|'business'|'fxamount'|'fxrate';
/** `typed` marks an entry read from a typed message: its questions return to the confirmation card. `fx_rate` is how many
 * units of the record's currency one unit of the account's currency buys, as `account_exchange_rate` stores it. */
export type DraftData={typed?:boolean;fx_rate?:number;fx_rate_date?:string;id?:string;business_id?:string|null;category?:string;custom_category_id?:string|null;category_name?:string;account_id?:string;target_id?:string;amount?:number;received?:number;interest?:number;name?:string;date?:string;account_name?:string;currency?:string;lkind?:LiabilityKind;rate?:number;payment?:number;resume?:Draft};
export type LiabilityKind='Loan'|'Debt'|'Mortgage';
const liabilityKinds:LiabilityKind[]=['Loan','Debt','Mortgage'];
export type Draft={kind:FlowKind;step:Step;data:DraftData};
export type FlowContext={language:Language;today:string;newId:string;categories:Category[];accounts:Entry[];liabilities:Entry[];currencies?:string[];businesses?:Entry[];records?:Entry[];rules?:TransactionRule[]};
export type FlowInput={text?:string;callback?:string};
type PaymentData={id:string;account_id:string;target_id:string;amount:number;received:number;fee:number;date:string;notes:string};
/** What to save. A record in another currency than its account carries the dated rate's day and the account currency in `fx`;
 * a loan or mortgage payment from an account in another currency is an `fxpayment` with its rate. */
export type Commit={type:'record';record:RecordInput;resume?:Draft;fx?:{account_rate_date:string;account_currency:string}}|{type:'planning';action:'transfer'|'repayment'|'mortgage';data:PaymentData}|{type:'fxpayment';action:'repayment'|'mortgage';data:PaymentData;rate:number;rate_date:string;account_currency:string;record_currency:string};
export type FlowResult={draft:Draft|null;reply:TelegramMessage|null;commit?:Commit;menu?:'upcoming'};
const menuItems:Array<{kind:FlowKind|'upcoming'|'signout';label:string}>=[{kind:'expense',label:'Expense'},{kind:'income',label:'Income'},{kind:'transfer',label:'Transfer'},{kind:'repayment',label:'Pay loan or debt'},{kind:'mortgage',label:'Mortgage payment'},{kind:'upcoming',label:'Upcoming payments'},{kind:'account',label:'Add cash account'},{kind:'liability',label:'Add loan or debt'},{kind:'signout',label:'Sign out'}];
const pageSize=8;
/** The persistent keyboard under the text box: the two everyday entries, and everything else one tap away. */
export function mainMenu(language:Language):TelegramKeyboard{
 const label=(kind:string)=>t(language,menuItems.find(item=>item.kind===kind)!.label);
 return {reply:[[label('expense'),label('income')],[t(language,'More actions')]]};
}
type MenuKind=FlowKind|'upcoming'|'signout';
const moreKinds:MenuKind[]=['transfer','repayment','mortgage','upcoming','account','liability','signout'];
/** The actions behind More actions, as buttons in the chat. Each sends m:<kind>, which works like typing its label. */
export function moreMenu(language:Language,chat:number):TelegramMessage{
 const button=(kind:MenuKind):TelegramButton=>({text:t(language,menuItems.find(item=>item.kind===kind)!.label),callback_data:'m:'+kind});
 return {chat_id:chat,text:t(language,'What else would you like to do?'),keyboard:{inline:keyboardRows(moreKinds.map(button),2)}};
}
/** Which menu item a typed label or a More actions button means, in any of the app languages. */
export function menuChoice(text:string):MenuKind|'more'|null{
 const pressed=/^m:(.+)$/.exec(text)?.[1];
 if(pressed)return moreKinds.find(kind=>kind===pressed)??null;
 const wanted=text.trim().toLowerCase();
 for(const item of menuItems)for(const language of Object.keys(dictionaries) as Language[])if(t(language,item.label).toLowerCase()===wanted)return item.kind;
 for(const language of Object.keys(dictionaries) as Language[])if(t(language,'More actions').toLowerCase()===wanted)return 'more';
 return null;
}
const cancelButton=(language:Language):TelegramButton=>({text:t(language,'Cancel'),callback_data:'f:cancel'});
const newAccountButton=(language:Language):TelegramButton=>({text:'+ '+t(language,'Add cash account'),callback_data:'f:newacc'});
const newLiabilityButton=(language:Language):TelegramButton=>({text:'+ '+t(language,'Add loan or debt'),callback_data:'f:newliab'});
const backButton=(language:Language):TelegramButton=>back(language,'f:back');
/** The bottom row of every prompt: Back to the previous question when there is one, and Cancel. */
const controls=(language:Language,canGoBack:boolean):TelegramButton[]=>canGoBack?[backButton(language),cancelButton(language)]:[cancelButton(language)];
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
const find=(list:Entry[],id?:string)=>list.find(item=>item.id===id);
/** Expenses and income may name a business when the owner has one; business income must, as in the app. */
const asksBusiness=(draft:Draft,ctx:Pick<FlowContext,'businesses'>)=>(draft.kind==='expense'||draft.kind==='income')&&!!ctx.businesses?.length;
const needsBusiness=(draft:Draft)=>draft.kind==='income'&&draft.data.category==='Business income';
/** The questions of a typed entry that return to its confirmation card. */
const cardSteps:Step[]=['category','business','account'];
/** Questions answered with buttons only, where typed text would otherwise be ignored. */
const buttonSteps:Step[]=['category','business','account','target','lkind','currency','confirm'];
const backToCard=(draft:Draft)=>!!draft.data.typed&&cardSteps.includes(draft.step)&&!!draft.data.account_id;
/** A new account started from a loan or mortgage payment must use that loan's currency, so the question is not asked. */
const presetCurrency=(draft:Draft,ctx:Pick<FlowContext,'liabilities'>)=>{const from=draft.data.resume;return draft.kind==='account'&&from&&(from.kind==='repayment'||from.kind==='mortgage')?find(ctx.liabilities,from.data.target_id)?.currency:undefined;};
/** A new liability started from the mortgage payment dead end is a mortgage, so its kind is not asked. */
const presetLiabilityKind=(draft:Draft):LiabilityKind|undefined=>draft.kind==='liability'&&draft.data.resume?.kind==='mortgage'?'Mortgage':undefined;
/** Whether Back has somewhere to go: an earlier question, or the conversation a dead end interrupted. */
const canGoBack=(draft:Draft,ctx:Pick<FlowContext,'accounts'|'liabilities'|'businesses'>)=>backToCard(draft)||backStep(draft,ctx)!==null||!!draft.data.resume;
/** The question asked before the current one, or null at the first question. */
function backStep(draft:Draft,ctx:Pick<FlowContext,'accounts'|'liabilities'|'businesses'>):Step|null{
 if(draft.data.typed)return null;
 // A missing exchange rate is asked after the date, so Back returns to the date.
 if(draft.step==='fxamount'||draft.step==='fxrate')return 'date';
 const order=stepOrder[draft.kind].filter(step=>step==='business'?asksBusiness(draft,ctx):step==='currency'?!presetCurrency(draft,ctx):step==='lkind'?!presetLiabilityKind(draft):step!=='received'||(()=>{const from=find(ctx.accounts,draft.data.account_id),to=find(ctx.accounts,draft.data.target_id);return !!from&&!!to&&from.currency!==to.currency;})());
 const index=order.indexOf(draft.step);
 return index>0?order[index-1]:null;
}
/** Return to an earlier question, forgetting its answer and every answer given after it. The record id stays fixed. */
function rewind(draft:Draft,step:Step):Draft{
 const order=stepOrder[draft.kind],data={...draft.data};
 for(const later of order.slice(order.indexOf(step)))for(const field of stepFields[later])delete data[field];
 return {...draft,step,data};
}
function choicePage(language:Language,chat:number,text:string,options:TelegramButton[],page:number,pageField:string,canGoBack:boolean,extra:TelegramButton[][]=[]):TelegramMessage{
 const start=page*pageSize,slice=options.slice(start,start+pageSize);
 const nav:TelegramButton[]=[];
 if(page>0)nav.push({text:'‹',callback_data:`f:${pageField}:${page-1}`});
 if(start+pageSize<options.length)nav.push({text:'›',callback_data:`f:${pageField}:${page+1}`});
 return {chat_id:chat,text,keyboard:{inline:[...keyboardRows(slice,2),...(nav.length?[nav]:[]),...extra,controls(language,canGoBack)]}};
}
const currencyList=(ctx:FlowContext)=>ctx.currencies?.length?ctx.currencies:['USD'];
const isCash=(entry:Entry)=>entry.kind==='Cash';
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
/** The currency a payment or record is entered in, and the account it moves money in: they differ when the bot converts. */
function currencies(draft:Draft,ctx:FlowContext){
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
const liabilityOptions=(ctx:FlowContext,kinds:string[])=>ctx.liabilities.filter(item=>kinds.includes(item.kind)&&item.amount>0).map(item=>({text:`${item.name} · ${money(item.amount,item.currency,ctx.language)}`,callback_data:'f:tgt:'+item.id}));
/** Example dates in the prompts, shown the way the app shows dates (30 September 2026) and accepted when typed back. */
const pastExample=(ctx:FlowContext)=>formatDate(ctx.today,locales[ctx.language]);
const futureExample=(ctx:FlowContext)=>formatDate(`${Number(ctx.today.slice(0,4))+1}-12-31`,locales[ctx.language]);
/** Example amounts in the same way: grouped and with the language's decimal mark (250,000 or 12.5; 250 000 or 12,5). */
const numberExamples=(language:Language)=>({large:formatNumber(250000,locales[language]),small:formatNumber(12.5,locales[language])});
/** Back and Cancel for a draft kept after a refused save, so the answer can be corrected. */
/** The buttons under a refused save. A typed entry's card has no Back, so it offers its Change buttons again to correct the account or category. */
export const retryKeyboard=(draft:Draft,ctx:FlowContext):TelegramKeyboard=>draft.data.typed&&draft.step==='confirm'
 ?{inline:[[{text:t(ctx.language,'Change account'),callback_data:'f:chacc'},{text:t(ctx.language,'Change category'),callback_data:'f:chcat'}],[cancelButton(ctx.language)]]}
 :{inline:[controls(ctx.language,canGoBack(draft,ctx))]};
/** The prompt for the draft's current step. */
export function prompt(draft:Draft,ctx:FlowContext,chat:number,page=0):TelegramMessage{
 const language=ctx.language,account=find(ctx.accounts,draft.data.account_id),target=find(ctx.liabilities,draft.data.target_id);
 const back=canGoBack(draft,ctx),controlRow=controls(language,back);
 switch(draft.step){
  case 'category':{
   // A typed entry read as the wrong direction is turned around here.
   const flip=draft.data.typed?[[{text:t(language,draft.kind==='income'?'Make it an expense':'Make it income'),callback_data:'f:flip'}]]:[];
   return choicePage(language,chat,t(language,draft.kind==='income'?'Choose an income category':'Choose an expense category'),categoryOptions(draft.kind as 'expense'|'income',ctx),page,'page',back,flip);
  }
  case 'account':{
   // Any cash account can pay a loan: one in another currency converts at the day's rate.
   const options=accountOptions(ctx);
   if(!options.length)return {chat_id:chat,text:t(language,'Add a cash account to continue.'),keyboard:{inline:[[newAccountButton(language)],controlRow]}};
   return choicePage(language,chat,t(language,draft.kind==='transfer'?'From which account?':draft.kind==='income'?'Into which account?':'From which account?'),options,page,'page',back);
  }
  case 'target':{
   if(draft.kind==='transfer'){
    const options=accountOptions(ctx,undefined,draft.data.account_id).map(option=>({...option,callback_data:option.callback_data.replace('f:acc:','f:tgt:')}));
    return options.length?choicePage(language,chat,t(language,'To which account?'),options,page,'page',back):{chat_id:chat,text:t(language,'Add a second cash account to continue.'),keyboard:{inline:[[newAccountButton(language)],controlRow]}};
   }
   const options=liabilityOptions(ctx,draft.kind==='mortgage'?['Mortgage']:['Loan','Debt']);
   return options.length?choicePage(language,chat,t(language,draft.kind==='mortgage'?'Which mortgage?':'Which loan or debt?'),options,page,'page',back):{chat_id:chat,text:t(language,draft.kind==='mortgage'?'No open mortgage found.':'No open loan or debt found.'),keyboard:{inline:[[newLiabilityButton(language)],controlRow]}};
  }
  case 'amount':{
   const currency=(draft.kind==='liability'?draft.data.currency:draft.kind==='repayment'||draft.kind==='mortgage'?target?.currency:draft.data.currency??account?.currency)??'';
   // Expenses and income may be entered in another of the owner's currencies; the account converts it.
   const others=draft.kind==='expense'||draft.kind==='income'?[...new Set([...(ctx.currencies??[]),account?.currency??''])].filter(code=>code&&code!==currency):[];
   const switches=others.length?[others.map(code=>({text:t(language,'In {currency}',{currency:code}),callback_data:'f:amtcur:'+code}))]:[];
   return {chat_id:chat,text:t(language,draft.kind==='liability'?'Type the outstanding amount in {currency}':draft.kind==='mortgage'?'Type the principal amount in {currency}':'Type the amount in {currency}',{currency}),keyboard:{inline:[...switches,controlRow]}};
  }
  case 'received':return {chat_id:chat,text:t(language,'Type the amount received in {currency}',{currency:find(ctx.accounts,draft.data.target_id)?.currency??''}),keyboard:{inline:[controlRow]}};
  case 'interest':return {chat_id:chat,text:t(language,'Type the interest amount in {currency}, or 0',{currency:target?.currency??''}),keyboard:{inline:[[{text:'0',callback_data:'f:zero'}],controlRow]}};
  case 'name':return {chat_id:chat,text:t(language,'Type a name for this record, or skip to use the category'),keyboard:{inline:[[{text:t(language,'Skip'),callback_data:'f:skip'}],controlRow]}};
  case 'date':return {chat_id:chat,text:t(language,'Which day? Choose, or type a date like {date}',{date:pastExample(ctx)}),keyboard:{inline:[[{text:t(language,'Today'),callback_data:'f:date:today'},{text:t(language,'Yesterday'),callback_data:'f:date:yesterday'}],controlRow]}};
  case 'accname':return {chat_id:chat,text:t(language,'Name the cash account, for example Wallet.'),keyboard:{inline:[[{text:t(language,'Cash'),callback_data:'f:accname:cash'}],controlRow]}};
  case 'business':{
   // Business income must name its business; anything else may stay personal.
   const options=[...(ctx.businesses??[]).map(business=>({text:business.name,callback_data:'f:biz:'+business.id})),...(needsBusiness(draft)?[]:[{text:t(language,'No business'),callback_data:'f:biz:none'}])];
   return choicePage(language,chat,t(language,'Choose a business'),options,page,'page',back);
  }
  case 'lkind':return {chat_id:chat,text:t(language,'Is it a loan, a debt or a mortgage?'),keyboard:{inline:[liabilityKinds.map(kind=>({text:t(language,kind),callback_data:'f:lkind:'+kind})),controlRow]}};
  case 'lname':return {chat_id:chat,text:t(language,draft.data.lkind==='Mortgage'?'Name it, for example Home mortgage.':draft.data.lkind==='Debt'?'Name it, for example Credit card.':'Name it, for example Car loan.'),keyboard:{inline:[controlRow]}};
  case 'duedate':return {chat_id:chat,text:t(language,'When is it due? Type a date like {date}',{date:futureExample(ctx)}),keyboard:{inline:[controlRow]}};
  case 'rate':return {chat_id:chat,text:t(language,'Type the yearly interest rate in percent, or 0'),keyboard:{inline:[[{text:'0',callback_data:'f:zero'}],controlRow]}};
  case 'payment':return {chat_id:chat,text:t(language,'Type the monthly payment in {currency}, or 0',{currency:draft.data.currency??''}),keyboard:{inline:[[{text:'0',callback_data:'f:zero'}],controlRow]}};
  case 'currency':return {chat_id:chat,text:t(language,draft.kind==='liability'?'Which currency is it in?':draft.kind==='account'?'Which currency is this account in?':'Which currency was it?'),keyboard:{inline:[currencyList(ctx).map(code=>({text:code,callback_data:'f:cur:'+code})),controlRow]}};
  case 'balance':return {chat_id:chat,text:t(language,'How much is in it? Type 0 if it is empty.'),keyboard:{inline:[[{text:'0',callback_data:'f:zero'}],controlRow]}};
  case 'fxamount':{
   const {account:from,record}=currencies(draft,ctx);
   return {chat_id:chat,text:t(language,'There is no {from} to {to} exchange rate for {date}. How much is this in {to}, the currency of {account}?',{from:record??'',to:from?.currency??'',date:formatDate(draft.data.date??ctx.today,locales[language]),account:escapeHtml(from?.name??'')}),keyboard:{inline:[[{text:t(language,'Type the rate instead'),callback_data:'f:fxrate'}],controlRow]}};
  }
  case 'fxrate':{
   const {account:from,record}=currencies(draft,ctx);
   return {chat_id:chat,text:t(language,'Type the rate: how many {to} is 1 {from}?',{from:record??'',to:from?.currency??''}),keyboard:{inline:[[{text:t(language,'Type the amount instead'),callback_data:'f:fxamount'}],controlRow]}};
  }
  case 'confirm':{
   if(!draft.data.typed)return {chat_id:chat,text:summary(draft,ctx),keyboard:{inline:[[{text:t(language,'Save'),callback_data:'f:save'}],controlRow]}};
   // A typed entry is checked on one card: every guess can be changed before saving.
   const changes:TelegramButton[]=[{text:t(language,'Change category'),callback_data:'f:chcat'},{text:t(language,'Change account'),callback_data:'f:chacc'}];
   if(ctx.businesses?.length)changes.push({text:t(language,'Change business'),callback_data:'f:chbiz'});
   return {chat_id:chat,text:summary(draft,ctx),keyboard:{inline:[[{text:t(language,'Save'),callback_data:'f:save'}],...keyboardRows(changes,2),[cancelButton(language)]]}};
  }
 }
}
/** What the owner is about to save, in their language. */
export function summary(draft:Draft,ctx:FlowContext):string{
 const language=ctx.language,d=draft.data,account=find(ctx.accounts,d.account_id),target=find(ctx.liabilities,d.target_id),to=find(ctx.accounts,d.target_id);
 const day=formatDate(d.date??ctx.today,locales[language]);
 const name=(value?:string)=>`<b>${escapeHtml(value??'')}</b>`;
 const lines:string[]=[`<b>${t(language,'Save this?')}</b>`];
 // In another currency than the account: what the account moves, and the rate used, as 1 unit of the entered currency.
 const {record}=currencies(draft,ctx);
 const converted=(amount:number)=>d.fx_rate&&account&&record?` · ≈ ${money(amount/d.fx_rate,account.currency,language)}\n1 ${record} = ${formatNumber(1/d.fx_rate,locales[language],6)} ${account.currency}`:'';
 switch(draft.kind){
  case 'expense':case 'income':{
   lines.push(`${t(language,draft.kind==='expense'?'Expense':'Income')} · ${escapeHtml(d.category_name??'')}`,`${name(d.name||d.category_name)} · ${money(d.amount??0,d.currency??account?.currency??'',language)} · ${day}`,t(language,draft.kind==='income'?'into {account}':'from {account}',{account:escapeHtml(account?.name??'')})+converted(d.amount??0));
   // The business the record will carry: the one chosen here, else the account's own.
   const businessId=d.business_id!==undefined?d.business_id:account?.business_id,business=businessId?find(ctx.businesses??[],businessId):undefined;
   if(business)lines.push(t(language,'Business: {name}',{name:escapeHtml(business.name)}));
   break;
  }
  case 'transfer':lines.push(`${t(language,'Transfer')} · ${name(account?.name)} → ${name(to?.name)}`,`${money(d.amount??0,account?.currency??'',language)}${to&&account&&to.currency!==account.currency?' → '+money(d.received??0,to.currency,language):''} · ${day}`);break;
  case 'repayment':lines.push(`${t(language,'Repayment')} · ${name(target?.name)}`,`${money(d.amount??0,target?.currency??'',language)} · ${day}`,t(language,'from {account}',{account:escapeHtml(account?.name??'')})+converted(d.amount??0));break;
  case 'liability':lines.push(`${t(language,d.lkind??'Loan')} · ${name(d.name)}`,`${money(d.amount??0,d.currency??'',language)} · ${t(language,'Due: {date}',{date:day})}`,`${t(language,'Interest rate')} ${formatPercent(d.rate??0,locales[language])} · ${t(language,'Monthly payment')} ${money(d.payment??0,d.currency??'',language)}`);break;
  case 'mortgage':lines.push(`${t(language,'Mortgage payment')} · ${name(target?.name)}`,`${t(language,'principal {amount}',{amount:money(d.amount??0,target?.currency??'',language)})} · ${t(language,'interest {amount}',{amount:money(d.interest??0,target?.currency??'',language)})} · ${day}`,t(language,'from {account}',{account:escapeHtml(account?.name??'')})+converted((d.amount??0)+(d.interest??0)));break;
 }
 return lines.join('\n');
}
/** A positive amount read by the same rules as a typed entry, so 12,75 is 12.75 in every language and never 1275. */
const parseAmount=(text:string,language:Language)=>parseTypedAmount(text,language);
/** A positive amount, or zero typed as 0. */
const parseAmountOrZero=(text:string,language:Language)=>parseTypedAmount(text,language,{allowZero:true});
/** A yearly rate in percent: a trailing %, spaces and a comma decimal (7,5) are accepted. */
function parseRate(text:string,language:Language):number|null{
 const bare=text.trim().replace(/\s*%$/,'').replace(/\s+/g,'');
 // A comma followed by one or two digits is a decimal comma; rates never need thousands grouping there.
 return parseAmountOrZero(/^\d+,\d{1,2}$/.test(bare)?bare.replace(',','.'):bare,language);
}
const next=(draft:Draft,step:Step,data:Partial<DraftData>={}):Draft=>({...draft,step,data:{...draft.data,...data}});
function firstStep(kind:FlowKind):Step{return kind==='liability'?'lkind':kind==='account'?'accname':kind==='expense'||kind==='income'?'category':kind==='transfer'?'account':'target';}
function commitFor(draft:Draft,ctx:FlowContext):Commit{
 const d=draft.data;
 if(draft.kind==='account'){
  const record:RecordInput={id:d.id??ctx.newId,name:d.account_name??'',kind:'Cash',currency:d.currency??'',amount:d.amount??0,quantity:1,cost:0,rate:0,date:ctx.today,frequency:'Once',notes:'',business_id:null,ownership_percentage:100,estimated_monthly_income:0,estimated_monthly_payment:0};
  return {type:'record',record,resume:d.resume};
 }
 // A loan added here starts today, so its monthly payments fall on today's day of the month.
 if(draft.kind==='liability'){
  const record:RecordInput={id:d.id??ctx.newId,name:d.name??'',kind:d.lkind??'Loan',currency:d.currency??'',amount:d.amount??0,quantity:0,cost:0,rate:d.rate??0,date:d.date??ctx.today,opened_on:ctx.today,frequency:'Once',notes:'',business_id:null,ownership_percentage:100,estimated_monthly_income:0,estimated_monthly_payment:d.payment??0};
  return {type:'record',record,resume:d.resume};
 }
 const account=find(ctx.accounts,d.account_id)!;
 if(draft.kind==='expense'||draft.kind==='income'){
  const custom=!!d.custom_category_id;
  const currency=d.currency??account.currency,converted=currency!==account.currency;
  // A business chosen here (or "No business") wins over the account's own business.
  const business=d.business_id!==undefined?d.business_id:account.business_id??null;
  const record:RecordInput={id:d.id??ctx.newId,name:(d.name||d.category_name||'').trim(),kind:(custom?(draft.kind==='income'?'Other income':'Other expense'):d.category) as RecordInput['kind'],custom_category_id:d.custom_category_id??null,currency,amount:d.amount??0,quantity:0,cost:0,rate:0,date:d.date??ctx.today,frequency:'Once',notes:'',account_id:account.id,...(business?{business_id:business}:{}),payment_type:'regular',estimated_monthly_payment:0,estimated_monthly_income:0,ownership_percentage:100,...(converted?{account_exchange_rate:d.fx_rate}:{})};
  return converted?{type:'record',record,fx:{account_rate_date:d.fx_rate_date??d.date??ctx.today,account_currency:account.currency}}:{type:'record',record};
 }
 const base={id:d.id??ctx.newId,account_id:account.id,target_id:d.target_id!,date:d.date??ctx.today,notes:''};
 if(draft.kind==='transfer')return {type:'planning',action:'transfer',data:{...base,amount:d.amount??0,received:d.received??d.amount??0,fee:0}};
 const target=find(ctx.liabilities,d.target_id);
 const action=draft.kind==='repayment'?'repayment':'mortgage',data={...base,amount:d.amount??0,received:0,fee:action==='mortgage'?d.interest??0:0};
 // Paid from an account in another currency: the app's dated-rate payment functions convert it.
 if(target&&target.currency!==account.currency&&d.fx_rate)return {type:'fxpayment',action,data,rate:d.fx_rate,rate_date:d.fx_rate_date??data.date,account_currency:account.currency,record_currency:target.currency};
 return {type:'planning',action,data};
}
/** An amount typed with one of the owner's currencies (12 eur, $12, 12€), or the currency refused, or null for a plain number. */
function amountWithCurrency(text:string,draft:Draft,ctx:FlowContext):{amount:number;currency:string}|{refused:string}|null{
 const match=/^\s*(\S*?)\s*(\d[\d\s\u00a0\u202f.,'’]*)\s*(\S*)\s*$/u.exec(text);
 if(!match||(!match[1]&&!match[3])||(match[1]&&match[3]))return null;
 const list=currencyCandidates(match[1]||match[3]),amount=looseNumber(match[2].trim(),ctx.language);
 if(!list||amount===null)return null;
 const allowed=[...(ctx.currencies??[]),find(ctx.accounts,draft.data.account_id)?.currency];
 const own=list.filter(code=>allowed.includes(code));
 return own.length===1?{amount,currency:own[0]}:{refused:list[0]};
}
/** A typed message as an entry waiting on its confirmation card, or why it could not be read. Nothing is saved here. */
function startTyped(text:string,ctx:FlowContext):{draft:Draft}|{error:'empty'|'amount'|'date'}{
 const parsed=parseTypedEntry(text,{language:ctx.language,today:ctx.today,accounts:ctx.accounts,currencies:ctx.currencies});
 if('error' in parsed)return parsed;
 const guess=guessCategory({name:parsed.name,amount:parsed.amount,account_id:parsed.account_id,direction:parsed.direction},{rules:ctx.rules,records:ctx.records??[],categories:ctx.categories,businesses:ctx.businesses});
 const cash=ctx.accounts.filter(isCash),has=(id?:string)=>cash.some(account=>account.id===id);
 // The account named in the text, else the one last used for this name, then for this category, then for any entry in the same direction
 // (in the typed currency when one was typed), else one in the typed currency, else the primary currency's.
 const lastUsed=(match:(record:Entry)=>boolean)=>(ctx.records??[]).filter(record=>record.frequency==='Once'&&!!record.account_id&&has(record.account_id)&&match(record)&&(!parsed.currency||cash.find(item=>item.id===record.account_id)?.currency===parsed.currency))
  .sort((a,b)=>(b.date||'').localeCompare(a.date||''))[0]?.account_id??undefined;
 const sameCategory=(record:Entry)=>guess.custom_category_id?record.custom_category_id===guess.custom_category_id:record.kind===guess.kind&&!record.custom_category_id;
 const account=parsed.account_id??(has(guess.account_id)?guess.account_id:undefined)??lastUsed(sameCategory)??lastUsed(record=>directionOf(record.kind)===guess.direction)??(parsed.currency?cash.find(item=>item.currency===parsed.currency)?.id:undefined)??(cash.find(item=>item.currency===ctx.currencies?.[0])??cash[0])?.id;
 const custom=guess.custom_category_id?ctx.categories.find(category=>category.id===guess.custom_category_id):undefined;
 const name=parsed.name?parsed.name.charAt(0).toLocaleUpperCase(locales[ctx.language])+parsed.name.slice(1):'';
 const data:DraftData={typed:true,id:ctx.newId,category:custom?undefined:guess.kind,custom_category_id:custom?.id??null,category_name:custom?custom.name:t(ctx.language,guess.kind),amount:parsed.amount,name,date:parsed.date,...(account?{account_id:account}:{}),...(parsed.currency?{currency:parsed.currency}:{}),...(guess.business_id?{business_id:guess.business_id}:{})};
 const step:Step=parsed.currencyChoices?'currency':account?'confirm':'account';
 return {draft:{kind:guess.direction,step,data}};
}
/** Advance the conversation by one input. A null draft means the owner is at the menu. */
export function advance(draft:Draft|null,input:FlowInput,ctx:FlowContext,chat:number):FlowResult{
 const language=ctx.language;
 const cancel=():FlowResult=>({draft:null,reply:{chat_id:chat,text:t(language,'Cancelled.'),keyboard:mainMenu(language)}});
 // The Cancel button under the phone number request sends its label as text.
 if(input.callback==='f:cancel'||/^\/cancel/.test(input.text??'')||input.text?.trim()===t(language,'Cancel'))return cancel();
 // A More actions button starts its action from anywhere, like typing a menu label.
 const menuInput=input.callback?.startsWith('m:')?input.callback:input.text;
 if(!draft){
  const choice=menuInput?menuChoice(menuInput):null;
  if(choice==='more')return {draft:null,reply:moreMenu(language,chat)};
  if(choice==='upcoming')return {draft:null,reply:null,menu:'upcoming'};
  // Free text is read as a typed entry; what cannot be read gets the menu and an example.
  if(!choice&&input.text){
   const typed=startTyped(input.text,ctx);
   if('draft' in typed)return {draft:typed.draft,reply:prompt(typed.draft,ctx,chat)};
   return {draft:null,reply:{chat_id:chat,text:typed.error==='date'?t(language,'Type a past or present date like {date}',{date:pastExample(ctx)}):t(language,'Choose what to add, or type it, like coffee {small} or +{large} salary.',{small:formatNumber(4.5,locales[language]),large:formatNumber(1500,locales[language])}),keyboard:mainMenu(language)}};
  }
  // Sign out is handled by the bot before the flow; here it is just not something to add.
  if(!choice||choice==='signout')return {draft:null,reply:{chat_id:chat,text:t(language,'Choose what to add.'),keyboard:mainMenu(language)}};
  const started:Draft={kind:choice,step:firstStep(choice),data:{}};
  return {draft:started,reply:prompt(started,ctx,chat)};
 }
 if(menuInput&&menuChoice(menuInput))return advance(null,input,ctx,chat);
 // At a question answered with buttons, a typed entry starts afresh instead of being ignored.
 if(input.text&&buttonSteps.includes(draft.step)){const typed=startTyped(input.text,ctx);if('draft' in typed)return {draft:typed.draft,reply:prompt(typed.draft,ctx,chat)};}
 const callback=input.callback??'';
 // On a typed entry's card each guess can be changed; the answer returns to the card.
 if(draft.data.typed&&draft.step==='confirm'){
  const change:Partial<Record<string,Step>>={'f:chcat':'category','f:chacc':'account',...(ctx.businesses?.length?{'f:chbiz':'business'}:{})};
  const step=change[callback];
  if(step){const moved:Draft={...draft,step};return {draft:moved,reply:prompt(moved,ctx,chat)};}
 }
 // Back returns to the question before this one. At the first question, or from an old message, the current question is asked again.
 if(callback==='f:back'){
  if(backToCard(draft)){const card:Draft={...draft,step:'confirm'};return {draft:card,reply:prompt(card,ctx,chat)};}
  const earlier=backStep(draft,ctx);
  // At the first question of an account or loan started from a dead end, Back returns to the interrupted conversation.
  const moved=earlier?rewind(draft,earlier):draft.data.resume??draft;
  return {draft:moved,reply:prompt(moved,ctx,chat)};
 }
 // From a dead end the owner can create the missing account here; saving it returns to the interrupted question.
 if(callback==='f:newacc'&&draft.kind!=='account'){
  const started:Draft={kind:'account',step:'accname',data:{id:ctx.newId,resume:draft,currency:presetCurrency({kind:'account',step:'accname',data:{resume:draft}},ctx)}};
  return {draft:started,reply:prompt(started,ctx,chat)};
 }
 if(callback==='f:newliab'&&draft.kind!=='liability'){
  const preset=presetLiabilityKind({kind:'liability',step:'lkind',data:{resume:draft}});
  const started:Draft={kind:'liability',step:preset?'lname':'lkind',data:{id:ctx.newId,resume:draft,...(preset?{lkind:preset}:{})}};
  return {draft:started,reply:prompt(started,ctx,chat)};
 }
 const page=/^f:page:(\d+)$/.exec(callback);
 if(page)return {draft,reply:prompt(draft,ctx,chat,Number(page[1]))};
 // A refused answer says what was wrong and asks the same question again, with the same buttons.
 const invalid=(text:string):FlowResult=>({draft,reply:{...prompt(draft,ctx,chat),text}});
 const value=(prefix:string)=>callback.startsWith(prefix)?callback.slice(prefix.length):null;
 switch(draft.step){
  case 'category':{
   // A typed entry read as an expense can become income, and the other way round; its category is chosen again.
   if(callback==='f:flip'&&draft.data.typed&&(draft.kind==='expense'||draft.kind==='income')){
    const moved:Draft={kind:draft.kind==='expense'?'income':'expense',step:'category',data:{...draft.data,category:undefined,custom_category_id:undefined,category_name:undefined}};
    return {draft:moved,reply:prompt(moved,ctx,chat)};
   }
   const chosen=value('f:cat:');if(chosen===null)return {draft,reply:prompt(draft,ctx,chat)};
   const custom=ctx.categories.find(category=>category.id===chosen&&category.direction===draft.kind);
   const defaults=draft.kind==='income'?income:expenses;
   if(!custom&&(!defaults.includes(chosen)||(chosen==='Business income'&&!ctx.businesses?.length)))return {draft,reply:prompt(draft,ctx,chat)};
   const answer={category:custom?undefined:chosen,custom_category_id:custom?.id??null,category_name:custom?custom.name:t(language,chosen)};
   const owed=!custom&&chosen==='Business income';
   // A typed entry returns to its card, unless business income still needs its business.
   if(draft.data.typed){const moved=next(draft,owed&&!draft.data.business_id?'business':'confirm',answer);return {draft:moved,reply:prompt(moved,ctx,chat)};}
   const moved=next(draft,asksBusiness(draft,ctx)?'business':'account',answer);
   return {draft:moved,reply:prompt(moved,ctx,chat)};
  }
  case 'business':{
   const chosen=value('f:biz:');
   const business=(ctx.businesses??[]).find(item=>item.id===chosen);
   // "No business" keeps the entry personal; business income cannot.
   if(!business&&(chosen!=='none'||needsBusiness(draft)))return {draft,reply:prompt(draft,ctx,chat)};
   const moved=next(draft,draft.data.typed?'confirm':'account',{business_id:business?.id??null});return {draft:moved,reply:prompt(moved,ctx,chat)};
  }
  case 'account':{
   const chosen=value('f:acc:');const account=chosen?find(ctx.accounts,chosen):undefined;
   if(!account||!isCash(account))return {draft,reply:prompt(draft,ctx,chat)};
   // Another account means another conversion, so a rate found for the old one is forgotten.
   const moved=next(draft,draft.data.typed?'confirm':draft.kind==='transfer'?'target':'amount',{account_id:account.id,fx_rate:undefined,fx_rate_date:undefined});
   return {draft:moved,reply:prompt(moved,ctx,chat)};
  }
  case 'target':{
   const chosen=value('f:tgt:');
   if(draft.kind==='transfer'){
    const to=chosen?find(ctx.accounts,chosen):undefined;
    if(!to||!isCash(to)||to.id===draft.data.account_id)return {draft,reply:prompt(draft,ctx,chat)};
    const moved=next(draft,'amount',{target_id:to.id});return {draft:moved,reply:prompt(moved,ctx,chat)};
   }
   const target=chosen?find(ctx.liabilities,chosen):undefined;
   if(!target||!(draft.kind==='mortgage'?['Mortgage']:['Loan','Debt']).includes(target.kind))return {draft,reply:prompt(draft,ctx,chat)};
   const moved=next(draft,'account',{target_id:target.id});return {draft:moved,reply:prompt(moved,ctx,chat)};
  }
  case 'amount':{
   const entered=draft.kind==='expense'||draft.kind==='income';
   const switched=value('f:amtcur:');
   if(switched!==null){
    if(!entered||![...(ctx.currencies??[]),find(ctx.accounts,draft.data.account_id)?.currency].includes(switched))return {draft,reply:prompt(draft,ctx,chat)};
    const moved=next(draft,'amount',{currency:switched});return {draft:moved,reply:prompt(moved,ctx,chat)};
   }
   // An expense or income amount may carry one of the owner's currencies: 12 eur, $12, 12€.
   const typed=input.text&&entered?amountWithCurrency(input.text,draft,ctx):null;
   if(typed&&'refused' in typed)return invalid(t(language,'{currency} is not one of your currencies. Type the amount in {own}, or add {currency} in Settings.',{currency:typed.refused,own:find(ctx.accounts,draft.data.account_id)?.currency??''}));
   const amount=typed?typed.amount:input.text?parseAmount(input.text,language):null;
   if(amount===null)return invalid(t(language,'Type a positive number, such as {large} or {small}',numberExamples(language)));
   const target=find(ctx.liabilities,draft.data.target_id);
   if(draft.kind==='repayment'&&target&&amount>target.amount)return invalid(t(language,'Repayment cannot exceed the outstanding balance.'));
   if(draft.kind==='mortgage'&&target&&amount>target.amount)return invalid(t(language,'Principal exceeds the outstanding balance.'));
   const from=find(ctx.accounts,draft.data.account_id),to=find(ctx.accounts,draft.data.target_id);
   const step:Step=draft.kind==='liability'?'duedate':draft.kind==='transfer'&&from&&to&&from.currency!==to.currency?'received':draft.kind==='mortgage'?'interest':draft.kind==='expense'||draft.kind==='income'?'name':'date';
   const moved=next(draft,step,{amount,...(typed?.currency?{currency:typed.currency,fx_rate:undefined,fx_rate_date:undefined}:{})});return {draft:moved,reply:prompt(moved,ctx,chat)};
  }
  case 'received':{
   const received=input.text?parseAmount(input.text,language):null;
   if(received===null)return invalid(t(language,'Type a positive number, such as {large} or {small}',numberExamples(language)));
   const moved=next(draft,'date',{received});return {draft:moved,reply:prompt(moved,ctx,chat)};
  }
  case 'interest':{
   const interest=callback==='f:zero'?0:input.text?parseAmountOrZero(input.text,language):null;
   if(interest===null)return invalid(t(language,'Type the interest as a number, or 0'));
   const moved=next(draft,'date',{interest});return {draft:moved,reply:prompt(moved,ctx,chat)};
  }
  case 'name':{
   const name=callback==='f:skip'?'':(input.text??'').trim();
   if(name.length>120)return invalid(t(language,'Keep the name under 120 characters.'));
   if(!name&&callback!=='f:skip')return {draft,reply:prompt(draft,ctx,chat)};
   const moved=next(draft,'date',{name});return {draft:moved,reply:prompt(moved,ctx,chat)};
  }
  case 'date':{
   const chosen=value('f:date:');
   const date=chosen==='today'?ctx.today:chosen==='yesterday'?shiftDay(ctx.today,-1):input.text?parseDay(input.text,ctx.today,false,language):null;
   if(!date)return invalid(t(language,'Type a past or present date like {date}',{date:pastExample(ctx)}));
   // The id is fixed here so a redelivered update saves the same record once.
   const moved=next(draft,'confirm',{date,id:draft.data.id??ctx.newId});return {draft:moved,reply:prompt(moved,ctx,chat)};
  }
  case 'accname':{
   const name=callback==='f:accname:cash'?t(language,'Cash'):(input.text??'').trim();
   if(!name)return {draft,reply:prompt(draft,ctx,chat)};
   if(name.length>120)return invalid(t(language,'Keep the name under 120 characters.'));
   // Two cash accounts with one name would make every account picker ambiguous.
   if(ctx.accounts.some(account=>isCash(account)&&account.name.trim().toLowerCase()===name.toLowerCase()))return invalid(t(language,'You already have a cash account named {name}. Type another name.',{name:escapeHtml(name)}));
   const preset=presetCurrency(draft,ctx);
   const moved=next(draft,preset?'balance':'currency',{account_name:name,id:draft.data.id??ctx.newId,...(preset?{currency:preset}:{})});return {draft:moved,reply:prompt(moved,ctx,chat)};
  }
  case 'currency':{
   const code=value('f:cur:');
   if(!code||!currencyList(ctx).includes(code))return {draft,reply:prompt(draft,ctx,chat)};
   const moved=next(draft,draft.kind==='liability'?'amount':draft.kind==='account'?'balance':draft.data.account_id?'confirm':'account',{currency:code,fx_rate:undefined,fx_rate_date:undefined});return {draft:moved,reply:prompt(moved,ctx,chat)};
  }
  case 'fxamount':case 'fxrate':{
   if(callback==='f:fxrate'||callback==='f:fxamount'){const moved=next(draft,callback==='f:fxrate'?'fxrate':'fxamount');return {draft:moved,reply:prompt(moved,ctx,chat)};}
   const typed=input.text?parseRate(input.text,language):null;
   if(!typed)return invalid(t(language,'Type a positive number, such as {large} or {small}',numberExamples(language)));
   // The owner's own figure, never a guessed rate: the amount in the account's currency, or what one unit costs there.
   const rate=draft.step==='fxamount'?(draft.data.amount??0)+(draft.kind==='mortgage'?draft.data.interest??0:0):1;
   const moved=next(draft,'confirm',{fx_rate:rate/typed,fx_rate_date:draft.data.date??ctx.today});return {draft:moved,reply:prompt(moved,ctx,chat)};
  }
  case 'lkind':{
   const chosen=value('f:lkind:') as LiabilityKind|null;
   if(!chosen||!liabilityKinds.includes(chosen))return {draft,reply:prompt(draft,ctx,chat)};
   const moved=next(draft,'lname',{lkind:chosen,id:draft.data.id??ctx.newId});return {draft:moved,reply:prompt(moved,ctx,chat)};
  }
  case 'lname':{
   const name=(input.text??'').trim();
   if(!name)return {draft,reply:prompt(draft,ctx,chat)};
   if(name.length>120)return invalid(t(language,'Keep the name under 120 characters.'));
   const moved=next(draft,'currency',{name,id:draft.data.id??ctx.newId});return {draft:moved,reply:prompt(moved,ctx,chat)};
  }
  case 'duedate':{
   const date=input.text?parseDay(input.text,ctx.today,true,language):null;
   if(!date)return invalid(t(language,'Type a date like {date}',{date:futureExample(ctx)}));
   if(date<ctx.today)return invalid(t(language,'The due date cannot be in the past. Type today or a later date.'));
   const moved=next(draft,'rate',{date});return {draft:moved,reply:prompt(moved,ctx,chat)};
  }
  case 'rate':{
   const rate=callback==='f:zero'?0:input.text?parseRate(input.text,language):null;
   if(rate===null)return invalid(t(language,'Type the rate as a number like {rate} or {percent}, or 0.',{rate:formatNumber(7.5,locales[language]),percent:formatPercent(7.5,locales[language])}));
   if(rate>1000)return invalid(t(language,'The rate must be {max} or less.',{max:formatPercent(1000,locales[language])}));
   const moved=next(draft,'payment',{rate});return {draft:moved,reply:prompt(moved,ctx,chat)};
  }
  case 'payment':{
   const payment=callback==='f:zero'?0:input.text?parseAmountOrZero(input.text,language):null;
   if(payment===null)return invalid(t(language,'Type a number such as {large} or {small}, or 0.',numberExamples(language)));
   const moved=next(draft,'confirm',{payment});return {draft:moved,reply:prompt(moved,ctx,chat)};
  }
  case 'balance':{
   const amount=callback==='f:zero'?0:input.text?parseAmountOrZero(input.text,language):null;
   if(amount===null)return invalid(t(language,'Type a number such as {large} or {small}, or 0.',numberExamples(language)));
   return {draft:null,reply:null,commit:commitFor(next(draft,'balance',{amount}),ctx)};
  }
  case 'confirm':{
   if(callback!=='f:save')return {draft,reply:prompt(draft,ctx,chat)};
   // A conversion is saved only with the rate the card showed.
   if(needsRate(draft,ctx))return {draft,reply:prompt(draft,ctx,chat)};
   return {draft:null,reply:null,commit:commitFor(draft,ctx)};
  }
 }
}
