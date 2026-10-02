// The button conversation the Telegram bot runs. Pure: given the owner's data,
// the draft so far and one input, it returns the next draft, the reply and,
// at the end, what to save. The bot handler owns storage and the database.
import {isoDate} from './api-validation';
import {income,expenses,type Entry} from './finance';
import {formatDate,formatMoney,formatNumberInput,formatPercent} from './format';
import {dictionaries,locales,translate,type Language} from './i18n';
import type {Category} from './planning';
import type {RecordInput} from './record-schema';
import {escapeHtml,type TelegramButton,type TelegramKeyboard,type TelegramMessage} from './telegram';
export type FlowKind='expense'|'income'|'transfer'|'repayment'|'mortgage'|'account'|'liability';
export type Step='category'|'account'|'target'|'amount'|'received'|'interest'|'name'|'date'|'confirm'|'accname'|'currency'|'balance'|'lkind'|'lname'|'duedate'|'rate'|'payment'|'business';
export type DraftData={id?:string;business_id?:string;category?:string;custom_category_id?:string|null;category_name?:string;account_id?:string;target_id?:string;amount?:number;received?:number;interest?:number;name?:string;date?:string;account_name?:string;currency?:string;lkind?:LiabilityKind;rate?:number;payment?:number;resume?:Draft};
export type LiabilityKind='Loan'|'Debt'|'Mortgage';
const liabilityKinds:LiabilityKind[]=['Loan','Debt','Mortgage'];
export type Draft={kind:FlowKind;step:Step;data:DraftData};
export type FlowContext={language:Language;today:string;newId:string;categories:Category[];accounts:Entry[];liabilities:Entry[];currencies?:string[];businesses?:Entry[]};
export type FlowInput={text?:string;callback?:string};
export type Commit={type:'record';record:RecordInput;resume?:Draft}|{type:'planning';action:'transfer'|'repayment'|'mortgage';data:{id:string;account_id:string;target_id:string;amount:number;received:number;fee:number;date:string;notes:string}};
export type FlowResult={draft:Draft|null;reply:TelegramMessage|null;commit?:Commit;menu?:'upcoming'};
const menuItems:Array<{kind:FlowKind|'upcoming'|'signout';label:string}>=[{kind:'expense',label:'Expense'},{kind:'income',label:'Income'},{kind:'transfer',label:'Transfer'},{kind:'repayment',label:'Pay loan or debt'},{kind:'mortgage',label:'Mortgage payment'},{kind:'upcoming',label:'Upcoming payments'},{kind:'account',label:'Add cash account'},{kind:'liability',label:'Add loan or debt'},{kind:'signout',label:'Sign out'}];
const pageSize=8;
const t=(language:Language,key:string,params?:Record<string,string|number>)=>translate(language,key,params);
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
 const rows:TelegramButton[][]=[];
 for(let index=0;index<moreKinds.length;index+=2)rows.push(moreKinds.slice(index,index+2).map(button));
 return {chat_id:chat,text:t(language,'What else would you like to do?'),keyboard:{inline:rows}};
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
const backButton=(language:Language):TelegramButton=>({text:'‹ '+t(language,'Back'),callback_data:'f:back'});
/** The bottom row of every prompt: Back to the previous question when there is one, and Cancel. */
const controls=(language:Language,canGoBack:boolean):TelegramButton[]=>canGoBack?[backButton(language),cancelButton(language)]:[cancelButton(language)];
// The questions each conversation asks, in order. Currency-dependent steps are skipped when they do not apply.
const stepOrder:Record<FlowKind,Step[]>={
 expense:['category','account','amount','name','date','confirm'],
 income:['category','business','account','amount','name','date','confirm'],
 transfer:['account','target','amount','received','date','confirm'],
 repayment:['target','account','amount','date','confirm'],
 mortgage:['target','account','amount','interest','date','confirm'],
 account:['accname','currency','balance'],
 liability:['lkind','lname','currency','amount','duedate','rate','payment','confirm'],
};
// What each question stores, so going back can forget it and everything asked after it.
const stepFields:Record<Step,Array<keyof DraftData>>={category:['category','custom_category_id','category_name'],account:['account_id'],target:['target_id'],amount:['amount'],received:['received'],interest:['interest'],name:['name'],date:['date'],confirm:[],accname:['account_name'],currency:['currency'],balance:[],lkind:['lkind'],lname:['name'],duedate:['date'],rate:['rate'],payment:['payment'],business:['business_id']};
const find=(list:Entry[],id?:string)=>list.find(item=>item.id===id);
/** Business income must name the business it came from, as in the app. */
const needsBusiness=(draft:Draft)=>draft.kind==='income'&&draft.data.category==='Business income';
/** A new account started from a loan or mortgage payment must use that loan's currency, so the question is not asked. */
const presetCurrency=(draft:Draft,ctx:Pick<FlowContext,'liabilities'>)=>{const from=draft.data.resume;return draft.kind==='account'&&from&&(from.kind==='repayment'||from.kind==='mortgage')?find(ctx.liabilities,from.data.target_id)?.currency:undefined;};
/** A new liability started from the mortgage payment dead end is a mortgage, so its kind is not asked. */
const presetLiabilityKind=(draft:Draft):LiabilityKind|undefined=>draft.kind==='liability'&&draft.data.resume?.kind==='mortgage'?'Mortgage':undefined;
/** Whether Back has somewhere to go: an earlier question, or the conversation a dead end interrupted. */
const canGoBack=(draft:Draft,ctx:Pick<FlowContext,'accounts'|'liabilities'>)=>backStep(draft,ctx)!==null||!!draft.data.resume;
/** The question asked before the current one, or null at the first question. */
export function backStep(draft:Draft,ctx:Pick<FlowContext,'accounts'|'liabilities'>):Step|null{
 const order=stepOrder[draft.kind].filter(step=>step==='business'?needsBusiness(draft):step==='currency'?!presetCurrency(draft,ctx):step==='lkind'?!presetLiabilityKind(draft):step!=='received'||(()=>{const from=find(ctx.accounts,draft.data.account_id),to=find(ctx.accounts,draft.data.target_id);return !!from&&!!to&&from.currency!==to.currency;})());
 const index=order.indexOf(draft.step);
 return index>0?order[index-1]:null;
}
/** Return to an earlier question, forgetting its answer and every answer given after it. The record id stays fixed. */
function rewind(draft:Draft,step:Step):Draft{
 const order=stepOrder[draft.kind],data={...draft.data};
 for(const later of order.slice(order.indexOf(step)))for(const field of stepFields[later])delete data[field];
 return {...draft,step,data};
}
const rows=(buttons:TelegramButton[],perRow=2)=>{const out:TelegramButton[][]=[];for(let index=0;index<buttons.length;index+=perRow)out.push(buttons.slice(index,index+perRow));return out;};
function choicePage(language:Language,chat:number,text:string,options:TelegramButton[],page:number,pageField:string,canGoBack:boolean):TelegramMessage{
 const start=page*pageSize,slice=options.slice(start,start+pageSize);
 const nav:TelegramButton[]=[];
 if(page>0)nav.push({text:'‹',callback_data:`f:${pageField}:${page-1}`});
 if(start+pageSize<options.length)nav.push({text:'›',callback_data:`f:${pageField}:${page+1}`});
 return {chat_id:chat,text,keyboard:{inline:[...rows(slice),...(nav.length?[nav]:[]),controls(language,canGoBack)]}};
}
const currencyList=(ctx:FlowContext)=>ctx.currencies?.length?ctx.currencies:['USD'];
const money=(value:number,currency:string,language:Language)=>formatMoney(value,currency,locales[language]);
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
const liabilityOptions=(ctx:FlowContext,kinds:string[])=>ctx.liabilities.filter(item=>kinds.includes(item.kind)&&item.amount>0).map(item=>({text:`${item.name} · ${money(item.amount,item.currency,ctx.language)}`,callback_data:'f:tgt:'+item.id}));
/** Back and Cancel for a draft kept after a refused save, so the answer can be corrected. */
export const retryKeyboard=(draft:Draft,ctx:FlowContext):TelegramKeyboard=>({inline:[controls(ctx.language,canGoBack(draft,ctx))]});
/** The prompt for the draft's current step. */
export function prompt(draft:Draft,ctx:FlowContext,chat:number,page=0):TelegramMessage{
 const language=ctx.language,account=find(ctx.accounts,draft.data.account_id),target=find(ctx.liabilities,draft.data.target_id);
 const back=canGoBack(draft,ctx),controlRow=controls(language,back);
 switch(draft.step){
  case 'category':return choicePage(language,chat,t(language,draft.kind==='income'?'Choose an income category':'Choose an expense category'),categoryOptions(draft.kind as 'expense'|'income',ctx),page,'page',back);
  case 'account':{
   const currency=draft.kind==='repayment'||draft.kind==='mortgage'?target?.currency:undefined;
   const options=accountOptions(ctx,currency);
   if(!options.length)return {chat_id:chat,text:t(language,currency?'No cash account uses {currency}. Add one to continue.':'Add a cash account to continue.',{currency:currency??''}),keyboard:{inline:[[newAccountButton(language)],controlRow]}};
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
   const currency=(draft.kind==='liability'?draft.data.currency:draft.kind==='repayment'||draft.kind==='mortgage'?target?.currency:account?.currency)??'';
   return {chat_id:chat,text:t(language,draft.kind==='liability'?'Type the outstanding amount in {currency}':draft.kind==='mortgage'?'Type the principal amount in {currency}':'Type the amount in {currency}',{currency}),keyboard:{inline:[controlRow]}};
  }
  case 'received':return {chat_id:chat,text:t(language,'Type the amount received in {currency}',{currency:find(ctx.accounts,draft.data.target_id)?.currency??''}),keyboard:{inline:[controlRow]}};
  case 'interest':return {chat_id:chat,text:t(language,'Type the interest amount in {currency}, or 0',{currency:target?.currency??''}),keyboard:{inline:[[{text:'0',callback_data:'f:zero'}],controlRow]}};
  case 'name':return {chat_id:chat,text:t(language,'Type a name for this record, or skip to use the category'),keyboard:{inline:[[{text:t(language,'Skip'),callback_data:'f:skip'}],controlRow]}};
  case 'date':return {chat_id:chat,text:t(language,'Which day? Choose, or type a date like 2026-09-30'),keyboard:{inline:[[{text:t(language,'Today'),callback_data:'f:date:today'},{text:t(language,'Yesterday'),callback_data:'f:date:yesterday'}],controlRow]}};
  case 'accname':return {chat_id:chat,text:t(language,'Name the cash account, for example Wallet.'),keyboard:{inline:[[{text:t(language,'Cash'),callback_data:'f:accname:cash'}],controlRow]}};
  case 'business':return choicePage(language,chat,t(language,'Choose a business'),(ctx.businesses??[]).map(business=>({text:business.name,callback_data:'f:biz:'+business.id})),page,'page',true);
  case 'lkind':return {chat_id:chat,text:t(language,'Is it a loan, a debt or a mortgage?'),keyboard:{inline:[liabilityKinds.map(kind=>({text:t(language,kind),callback_data:'f:lkind:'+kind})),controlRow]}};
  case 'lname':return {chat_id:chat,text:t(language,draft.data.lkind==='Mortgage'?'Name it, for example Home mortgage.':'Name it, for example Car loan.'),keyboard:{inline:[controlRow]}};
  case 'duedate':return {chat_id:chat,text:t(language,'When is it due? Type a date like 2027-03-31'),keyboard:{inline:[controlRow]}};
  case 'rate':return {chat_id:chat,text:t(language,'Type the yearly interest rate in percent, or 0'),keyboard:{inline:[[{text:'0',callback_data:'f:zero'}],controlRow]}};
  case 'payment':return {chat_id:chat,text:t(language,'Type the monthly payment in {currency}, or 0',{currency:draft.data.currency??''}),keyboard:{inline:[[{text:'0',callback_data:'f:zero'}],controlRow]}};
  case 'currency':return {chat_id:chat,text:t(language,draft.kind==='liability'?'Which currency is it in?':'Which currency is this account in?'),keyboard:{inline:[currencyList(ctx).map(code=>({text:code,callback_data:'f:cur:'+code})),controlRow]}};
  case 'balance':return {chat_id:chat,text:t(language,'How much is in it? Type 0 if it is empty.'),keyboard:{inline:[[{text:'0',callback_data:'f:zero'}],controlRow]}};
  case 'confirm':return {chat_id:chat,text:summary(draft,ctx),keyboard:{inline:[[{text:t(language,'Save'),callback_data:'f:save'}],controlRow]}};
 }
}
/** What the owner is about to save, in their language. */
export function summary(draft:Draft,ctx:FlowContext):string{
 const language=ctx.language,d=draft.data,account=find(ctx.accounts,d.account_id),target=find(ctx.liabilities,d.target_id),to=find(ctx.accounts,d.target_id);
 const day=formatDate(d.date??ctx.today,locales[language]);
 const name=(value?:string)=>`<b>${escapeHtml(value??'')}</b>`;
 const lines:string[]=[`<b>${t(language,'Save this?')}</b>`];
 switch(draft.kind){
  case 'expense':case 'income':lines.push(`${t(language,draft.kind==='expense'?'Expense':'Income')} · ${escapeHtml(d.category_name??'')}`,`${name(d.name||d.category_name)} · ${money(d.amount??0,account?.currency??'',language)} · ${day}`,t(language,draft.kind==='income'?'into {account}':'from {account}',{account:escapeHtml(account?.name??'')}));break;
  case 'transfer':lines.push(`${t(language,'Transfer')} · ${name(account?.name)} → ${name(to?.name)}`,`${money(d.amount??0,account?.currency??'',language)}${to&&account&&to.currency!==account.currency?' → '+money(d.received??0,to.currency,language):''} · ${day}`);break;
  case 'repayment':lines.push(`${t(language,'Repayment')} · ${name(target?.name)}`,`${money(d.amount??0,target?.currency??'',language)} · ${day}`,t(language,'from {account}',{account:escapeHtml(account?.name??'')}));break;
  case 'liability':lines.push(`${t(language,d.lkind??'Loan')} · ${name(d.name)}`,`${money(d.amount??0,d.currency??'',language)} · ${t(language,'Due: {date}',{date:day})}`,`${t(language,'Interest rate')} ${formatPercent(d.rate??0,locales[language])} · ${t(language,'Monthly payment')} ${money(d.payment??0,d.currency??'',language)}`);break;
  case 'mortgage':lines.push(`${t(language,'Mortgage payment')} · ${name(target?.name)}`,`${t(language,'principal {amount}',{amount:money(d.amount??0,target?.currency??'',language)})} · ${t(language,'interest {amount}',{amount:money(d.interest??0,target?.currency??'',language)})} · ${day}`,t(language,'from {account}',{account:escapeHtml(account?.name??'')}));break;
 }
 return lines.join('\n');
}
function parseAmount(text:string,language:Language){
 const parsed=formatNumberInput(text.trim(),locales[language])??formatNumberInput(text.trim(),'en-US');
 const value=parsed?.value??null;
 return value!==null&&value>0&&value<=1e15?value:null;
}
/** A positive amount, or zero typed as 0. */
const parseAmountOrZero=(text:string,language:Language)=>parseAmount(text,language)??(/^0+(?:[.,]0+)?$/.test(text.trim())?0:null);
/** A yearly rate in percent: a trailing %, spaces and a comma decimal (7,5) are accepted. */
export function parseRate(text:string,language:Language):number|null{
 const bare=text.trim().replace(/\s*%$/,'').replace(/\s+/g,'');
 // A comma followed by one or two digits is a decimal comma; rates never need thousands grouping there.
 return parseAmountOrZero(/^\d+,\d{1,2}$/.test(bare)?bare.replace(',','.'):bare,language);
}
export function parseDay(text:string,today:string,future=false):string|null{
 const trimmed=text.trim();
 const european=/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(trimmed);
 const candidate=european?`${european[3]}-${european[2].padStart(2,'0')}-${european[1].padStart(2,'0')}`:trimmed;
 return isoDate.safeParse(candidate).success&&(future||candidate<=today)?candidate:null;
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
  const record:RecordInput={id:d.id??ctx.newId,name:(d.name||d.category_name||'').trim(),kind:(custom?(draft.kind==='income'?'Other income':'Other expense'):d.category) as RecordInput['kind'],custom_category_id:d.custom_category_id??null,currency:account.currency,amount:d.amount??0,quantity:0,cost:0,rate:0,date:d.date??ctx.today,frequency:'Once',notes:'',account_id:account.id,...(d.business_id?{business_id:d.business_id}:{}),payment_type:'regular',estimated_monthly_payment:0,estimated_monthly_income:0,ownership_percentage:100};
  return {type:'record',record};
 }
 const base={id:d.id??ctx.newId,account_id:account.id,target_id:d.target_id!,date:d.date??ctx.today,notes:''};
 if(draft.kind==='transfer')return {type:'planning',action:'transfer',data:{...base,amount:d.amount??0,received:d.received??d.amount??0,fee:0}};
 if(draft.kind==='repayment')return {type:'planning',action:'repayment',data:{...base,amount:d.amount??0,received:0,fee:0}};
 return {type:'planning',action:'mortgage',data:{...base,amount:d.amount??0,received:0,fee:d.interest??0}};
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
  // Sign out is handled by the bot before the flow; here it is just not something to add.
  if(!choice||choice==='signout')return {draft:null,reply:{chat_id:chat,text:t(language,'Choose what to add.'),keyboard:mainMenu(language)}};
  const started:Draft={kind:choice,step:firstStep(choice),data:{}};
  return {draft:started,reply:prompt(started,ctx,chat)};
 }
 if(menuInput&&menuChoice(menuInput))return advance(null,input,ctx,chat);
 const callback=input.callback??'';
 // Back returns to the question before this one. At the first question, or from an old message, the current question is asked again.
 if(callback==='f:back'){
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
   const chosen=value('f:cat:');if(chosen===null)return {draft,reply:prompt(draft,ctx,chat)};
   const custom=ctx.categories.find(category=>category.id===chosen&&category.direction===draft.kind);
   const defaults=draft.kind==='income'?income:expenses;
   if(!custom&&(!defaults.includes(chosen)||(chosen==='Business income'&&!ctx.businesses?.length)))return {draft,reply:prompt(draft,ctx,chat)};
   const moved=next(draft,!custom&&draft.kind==='income'&&chosen==='Business income'?'business':'account',{category:custom?undefined:chosen,custom_category_id:custom?.id??null,category_name:custom?custom.name:t(language,chosen)});
   return {draft:moved,reply:prompt(moved,ctx,chat)};
  }
  case 'business':{
   const business=(ctx.businesses??[]).find(item=>item.id===value('f:biz:'));
   if(!business)return {draft,reply:prompt(draft,ctx,chat)};
   const moved=next(draft,'account',{business_id:business.id});return {draft:moved,reply:prompt(moved,ctx,chat)};
  }
  case 'account':{
   const chosen=value('f:acc:');const account=chosen?find(ctx.accounts,chosen):undefined;
   if(!account||!isCash(account))return {draft,reply:prompt(draft,ctx,chat)};
   const target=find(ctx.liabilities,draft.data.target_id);
   if((draft.kind==='repayment'||draft.kind==='mortgage')&&target&&target.currency!==account.currency)return {draft,reply:prompt(draft,ctx,chat)};
   const moved=next(draft,draft.kind==='transfer'?'target':'amount',{account_id:account.id});
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
   const amount=input.text?parseAmount(input.text,language):null;
   if(amount===null)return invalid(t(language,'Type a positive number, such as 250000 or 12.50'));
   const target=find(ctx.liabilities,draft.data.target_id);
   if(draft.kind==='repayment'&&target&&amount>target.amount)return invalid(t(language,'Repayment cannot exceed the outstanding balance.'));
   if(draft.kind==='mortgage'&&target&&amount>target.amount)return invalid(t(language,'Principal exceeds the outstanding balance.'));
   const from=find(ctx.accounts,draft.data.account_id),to=find(ctx.accounts,draft.data.target_id);
   const step:Step=draft.kind==='liability'?'duedate':draft.kind==='transfer'&&from&&to&&from.currency!==to.currency?'received':draft.kind==='mortgage'?'interest':draft.kind==='expense'||draft.kind==='income'?'name':'date';
   const moved=next(draft,step,{amount});return {draft:moved,reply:prompt(moved,ctx,chat)};
  }
  case 'received':{
   const received=input.text?parseAmount(input.text,language):null;
   if(received===null)return invalid(t(language,'Type a positive number, such as 250000 or 12.50'));
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
   const date=chosen==='today'?ctx.today:chosen==='yesterday'?new Date(Date.parse(ctx.today+'T00:00:00Z')-86400000).toISOString().slice(0,10):input.text?parseDay(input.text,ctx.today):null;
   if(!date)return invalid(t(language,'Type a past or present date like 2026-09-30 or 30.09.2026'));
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
   const moved=next(draft,draft.kind==='liability'?'amount':'balance',{currency:code});return {draft:moved,reply:prompt(moved,ctx,chat)};
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
   const date=input.text?parseDay(input.text,ctx.today,true):null;
   if(!date)return invalid(t(language,'Type a date like 2027-03-31 or 31.03.2027'));
   if(date<ctx.today)return invalid(t(language,'The due date cannot be in the past. Type today or a later date.'));
   const moved=next(draft,'rate',{date});return {draft:moved,reply:prompt(moved,ctx,chat)};
  }
  case 'rate':{
   const rate=callback==='f:zero'?0:input.text?parseRate(input.text,language):null;
   if(rate===null)return invalid(t(language,'Type the rate as a number like 7.5 or 7.5%, or 0.'));
   if(rate>1000)return invalid(t(language,'The rate must be {max} or less.',{max:formatPercent(1000,locales[language])}));
   const moved=next(draft,'payment',{rate});return {draft:moved,reply:prompt(moved,ctx,chat)};
  }
  case 'payment':{
   const payment=callback==='f:zero'?0:input.text?parseAmountOrZero(input.text,language):null;
   if(payment===null)return invalid(t(language,'Type a number such as 250000 or 12.50, or 0.'));
   const moved=next(draft,'confirm',{payment});return {draft:moved,reply:prompt(moved,ctx,chat)};
  }
  case 'balance':{
   const amount=callback==='f:zero'?0:input.text?parseAmountOrZero(input.text,language):null;
   if(amount===null)return invalid(t(language,'Type a number such as 250000 or 12.50, or 0.'));
   return {draft:null,reply:null,commit:commitFor(next(draft,'balance',{amount}),ctx)};
  }
  case 'confirm':{
   if(callback!=='f:save')return {draft,reply:prompt(draft,ctx,chat)};
   return {draft:null,reply:null,commit:commitFor(draft,ctx)};
  }
 }
}
