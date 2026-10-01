// The button conversation the Telegram bot runs. Pure: given the owner's data,
// the draft so far and one input, it returns the next draft, the reply and,
// at the end, what to save. The bot handler owns storage and the database.
import {isoDate} from './api-validation';
import {income,expenses,type Entry} from './finance';
import {formatDate,formatMoney,formatNumberInput} from './format';
import {dictionaries,locales,translate,type Language} from './i18n';
import type {Category} from './planning';
import type {RecordInput} from './record-schema';
import {escapeHtml,type TelegramButton,type TelegramKeyboard,type TelegramMessage} from './telegram';
export type FlowKind='expense'|'income'|'transfer'|'repayment'|'mortgage'|'account';
export type Step='category'|'account'|'target'|'amount'|'received'|'interest'|'name'|'date'|'confirm'|'accname'|'currency'|'balance';
export type DraftData={id?:string;category?:string;custom_category_id?:string|null;category_name?:string;account_id?:string;target_id?:string;amount?:number;received?:number;interest?:number;name?:string;date?:string;account_name?:string;currency?:string;resume?:Draft};
export type Draft={kind:FlowKind;step:Step;data:DraftData};
export type FlowContext={language:Language;today:string;newId:string;categories:Category[];accounts:Entry[];liabilities:Entry[];currencies?:string[]};
export type FlowInput={text?:string;callback?:string};
export type Commit={type:'record';record:RecordInput;resume?:Draft}|{type:'planning';action:'transfer'|'repayment'|'mortgage';data:{id:string;account_id:string;target_id:string;amount:number;received:number;fee:number;date:string;notes:string}};
export type FlowResult={draft:Draft|null;reply:TelegramMessage|null;commit?:Commit;menu?:'upcoming'};
const menuItems:Array<{kind:FlowKind|'upcoming';label:string}>=[{kind:'expense',label:'Expense'},{kind:'income',label:'Income'},{kind:'transfer',label:'Transfer'},{kind:'repayment',label:'Pay loan or debt'},{kind:'mortgage',label:'Mortgage payment'},{kind:'upcoming',label:'Upcoming payments'},{kind:'account',label:'Add cash account'}];
const pageSize=8;
const t=(language:Language,key:string,params?:Record<string,string|number>)=>translate(language,key,params);
/** The persistent keyboard under the text box. */
export function mainMenu(language:Language):TelegramKeyboard{
 const label=(kind:string)=>t(language,menuItems.find(item=>item.kind===kind)!.label);
 return {reply:[[label('expense'),label('income')],[label('transfer'),label('repayment')],[label('mortgage'),label('upcoming')],[label('account')]]};
}
/** Which menu item a typed label means, in any of the app languages. */
export function menuChoice(text:string):FlowKind|'upcoming'|null{
 const wanted=text.trim().toLowerCase();
 for(const item of menuItems)for(const language of Object.keys(dictionaries) as Language[])if(t(language,item.label).toLowerCase()===wanted)return item.kind;
 return null;
}
const cancelButton=(language:Language):TelegramButton=>({text:t(language,'Cancel'),callback_data:'f:cancel'});
const newAccountButton=(language:Language):TelegramButton=>({text:'+ '+t(language,'Add cash account'),callback_data:'f:newacc'});
const backButton=(language:Language):TelegramButton=>({text:'‹ '+t(language,'Back'),callback_data:'f:back'});
/** The bottom row of every prompt: Back to the previous question when there is one, and Cancel. */
const controls=(language:Language,canGoBack:boolean):TelegramButton[]=>canGoBack?[backButton(language),cancelButton(language)]:[cancelButton(language)];
// The questions each conversation asks, in order. Currency-dependent steps are skipped when they do not apply.
const stepOrder:Record<FlowKind,Step[]>={
 expense:['category','account','amount','name','date','confirm'],
 income:['category','account','amount','name','date','confirm'],
 transfer:['account','target','amount','received','date','confirm'],
 repayment:['target','account','amount','date','confirm'],
 mortgage:['target','account','amount','interest','date','confirm'],
 account:['accname','currency','balance'],
};
// What each question stores, so going back can forget it and everything asked after it.
const stepFields:Record<Step,Array<keyof DraftData>>={category:['category','custom_category_id','category_name'],account:['account_id'],target:['target_id'],amount:['amount'],received:['received'],interest:['interest'],name:['name'],date:['date'],confirm:[],accname:['account_name'],currency:['currency'],balance:[]};
const find=(list:Entry[],id?:string)=>list.find(item=>item.id===id);
/** A new account started from a loan or mortgage payment must use that loan's currency, so the question is not asked. */
const presetCurrency=(draft:Draft,ctx:Pick<FlowContext,'liabilities'>)=>{const from=draft.data.resume;return from&&(from.kind==='repayment'||from.kind==='mortgage')?find(ctx.liabilities,from.data.target_id)?.currency:undefined;};
/** The question asked before the current one, or null at the first question. */
export function backStep(draft:Draft,ctx:Pick<FlowContext,'accounts'|'liabilities'>):Step|null{
 const order=stepOrder[draft.kind].filter(step=>step==='currency'?!presetCurrency(draft,ctx):step!=='received'||(()=>{const from=find(ctx.accounts,draft.data.account_id),to=find(ctx.accounts,draft.data.target_id);return !!from&&!!to&&from.currency!==to.currency;})());
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
 return [...custom.map(category=>({text:category.name,callback_data:'f:cat:'+category.id})),...defaults.map(name=>({text:t(ctx.language,name),callback_data:'f:cat:'+name}))];
}
function accountOptions(ctx:FlowContext,currency?:string,exclude?:string):TelegramButton[]{
 return ctx.accounts.filter(isCash).filter(account=>(!currency||account.currency===currency)&&account.id!==exclude).map(account=>({text:`${account.name} · ${money(account.amount,account.currency,ctx.language)}`,callback_data:'f:acc:'+account.id}));
}
const liabilityOptions=(ctx:FlowContext,kinds:string[])=>ctx.liabilities.filter(item=>kinds.includes(item.kind)&&item.amount>0).map(item=>({text:`${item.name} · ${money(item.amount,item.currency,ctx.language)}`,callback_data:'f:tgt:'+item.id}));
/** The prompt for the draft's current step. */
export function prompt(draft:Draft,ctx:FlowContext,chat:number,page=0):TelegramMessage{
 const language=ctx.language,account=find(ctx.accounts,draft.data.account_id),target=find(ctx.liabilities,draft.data.target_id);
 const controlRow=controls(language,backStep(draft,ctx)!==null);
 switch(draft.step){
  case 'category':return choicePage(language,chat,t(language,draft.kind==='income'?'Choose an income category':'Choose an expense category'),categoryOptions(draft.kind as 'expense'|'income',ctx),page,'page',backStep(draft,ctx)!==null);
  case 'account':{
   const currency=draft.kind==='repayment'||draft.kind==='mortgage'?target?.currency:undefined;
   const options=accountOptions(ctx,currency);
   if(!options.length)return {chat_id:chat,text:t(language,currency?'No cash account uses {currency}. Add one to continue.':'Add a cash account to continue.',{currency:currency??''}),keyboard:{inline:[[newAccountButton(language)],controlRow]}};
   return choicePage(language,chat,t(language,draft.kind==='transfer'?'From which account?':draft.kind==='income'?'Into which account?':'From which account?'),options,page,'page',backStep(draft,ctx)!==null);
  }
  case 'target':{
   if(draft.kind==='transfer'){
    const options=accountOptions(ctx,undefined,draft.data.account_id).map(option=>({...option,callback_data:option.callback_data.replace('f:acc:','f:tgt:')}));
    return options.length?choicePage(language,chat,t(language,'To which account?'),options,page,'page',backStep(draft,ctx)!==null):{chat_id:chat,text:t(language,'Add a second cash account to continue.'),keyboard:{inline:[[newAccountButton(language)],controlRow]}};
   }
   const options=liabilityOptions(ctx,draft.kind==='mortgage'?['Mortgage']:['Loan','Debt']);
   return options.length?choicePage(language,chat,t(language,draft.kind==='mortgage'?'Which mortgage?':'Which loan or debt?'),options,page,'page',backStep(draft,ctx)!==null):{chat_id:chat,text:t(language,draft.kind==='mortgage'?'No open mortgage found.':'No open loan or debt found.'),keyboard:{inline:[controlRow]}};
  }
  case 'amount':{
   const currency=(draft.kind==='repayment'||draft.kind==='mortgage'?target?.currency:account?.currency)??'';
   return {chat_id:chat,text:t(language,draft.kind==='mortgage'?'Type the principal amount in {currency}':'Type the amount in {currency}',{currency}),keyboard:{inline:[controlRow]}};
  }
  case 'received':return {chat_id:chat,text:t(language,'Type the amount received in {currency}',{currency:find(ctx.accounts,draft.data.target_id)?.currency??''}),keyboard:{inline:[controlRow]}};
  case 'interest':return {chat_id:chat,text:t(language,'Type the interest amount in {currency}, or 0',{currency:target?.currency??''}),keyboard:{inline:[[{text:'0',callback_data:'f:zero'}],controlRow]}};
  case 'name':return {chat_id:chat,text:t(language,'Type a name for this record, or skip to use the category'),keyboard:{inline:[[{text:t(language,'Skip'),callback_data:'f:skip'}],controlRow]}};
  case 'date':return {chat_id:chat,text:t(language,'Which day? Choose, or type a date like 2026-09-30'),keyboard:{inline:[[{text:t(language,'Today'),callback_data:'f:date:today'},{text:t(language,'Yesterday'),callback_data:'f:date:yesterday'}],controlRow]}};
  case 'accname':return {chat_id:chat,text:t(language,'Name the cash account, for example Wallet.'),keyboard:{inline:[[{text:t(language,'Cash'),callback_data:'f:accname:cash'}],controlRow]}};
  case 'currency':return {chat_id:chat,text:t(language,'Which currency is this account in?'),keyboard:{inline:[currencyList(ctx).map(code=>({text:code,callback_data:'f:cur:'+code})),controlRow]}};
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
  case 'mortgage':lines.push(`${t(language,'Mortgage payment')} · ${name(target?.name)}`,`${t(language,'principal {amount}',{amount:money(d.amount??0,target?.currency??'',language)})} · ${t(language,'interest {amount}',{amount:money(d.interest??0,target?.currency??'',language)})} · ${day}`,t(language,'from {account}',{account:escapeHtml(account?.name??'')}));break;
 }
 return lines.join('\n');
}
function parseAmount(text:string,language:Language){
 const parsed=formatNumberInput(text.trim(),locales[language])??formatNumberInput(text.trim(),'en-US');
 const value=parsed?.value??null;
 return value!==null&&value>0&&value<=1e15?value:null;
}
export function parseDay(text:string,today:string):string|null{
 const trimmed=text.trim();
 const european=/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(trimmed);
 const candidate=european?`${european[3]}-${european[2].padStart(2,'0')}-${european[1].padStart(2,'0')}`:trimmed;
 return isoDate.safeParse(candidate).success&&candidate<=today?candidate:null;
}
const next=(draft:Draft,step:Step,data:Partial<DraftData>={}):Draft=>({...draft,step,data:{...draft.data,...data}});
function firstStep(kind:FlowKind):Step{return kind==='account'?'accname':kind==='expense'||kind==='income'?'category':kind==='transfer'?'account':'target';}
function commitFor(draft:Draft,ctx:FlowContext):Commit{
 const d=draft.data;
 if(draft.kind==='account'){
  const record:RecordInput={id:d.id??ctx.newId,name:d.account_name??'',kind:'Cash',currency:d.currency??'',amount:d.amount??0,quantity:1,cost:0,rate:0,date:ctx.today,frequency:'Once',notes:'',business_id:null,ownership_percentage:100,estimated_monthly_income:0,estimated_monthly_payment:0};
  return {type:'record',record,resume:d.resume};
 }
 const account=find(ctx.accounts,d.account_id)!;
 if(draft.kind==='expense'||draft.kind==='income'){
  const custom=!!d.custom_category_id;
  const record:RecordInput={id:d.id??ctx.newId,name:(d.name||d.category_name||'').trim(),kind:(custom?(draft.kind==='income'?'Other income':'Other expense'):d.category) as RecordInput['kind'],custom_category_id:d.custom_category_id??null,currency:account.currency,amount:d.amount??0,quantity:0,cost:0,rate:0,date:d.date??ctx.today,frequency:'Once',notes:'',account_id:account.id,payment_type:'regular',estimated_monthly_payment:0,estimated_monthly_income:0,ownership_percentage:100};
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
 if(input.callback==='f:cancel'||/^\/cancel/.test(input.text??''))return cancel();
 if(!draft){
  const choice=input.text?menuChoice(input.text):null;
  if(choice==='upcoming')return {draft:null,reply:null,menu:'upcoming'};
  if(!choice)return {draft:null,reply:{chat_id:chat,text:t(language,'Choose what to add.'),keyboard:mainMenu(language)}};
  const started:Draft={kind:choice,step:firstStep(choice),data:{}};
  return {draft:started,reply:prompt(started,ctx,chat)};
 }
 if(input.text&&menuChoice(input.text))return advance(null,input,ctx,chat);
 const callback=input.callback??'';
 // Back returns to the question before this one. At the first question, or from an old message, the current question is asked again.
 if(callback==='f:back'){
  const earlier=backStep(draft,ctx);
  const moved=earlier?rewind(draft,earlier):draft;
  return {draft:moved,reply:prompt(moved,ctx,chat)};
 }
 // From a dead end the owner can create the missing account here; saving it returns to the interrupted question.
 if(callback==='f:newacc'&&draft.kind!=='account'){
  const started:Draft={kind:'account',step:'accname',data:{id:ctx.newId,resume:draft,currency:presetCurrency({kind:'account',step:'accname',data:{resume:draft}},ctx)}};
  return {draft:started,reply:prompt(started,ctx,chat)};
 }
 const page=/^f:page:(\d+)$/.exec(callback);
 if(page)return {draft,reply:prompt(draft,ctx,chat,Number(page[1]))};
 const invalid=(text:string):FlowResult=>({draft,reply:{chat_id:chat,text,keyboard:{inline:[controls(language,backStep(draft,ctx)!==null)]}}});
 const value=(prefix:string)=>callback.startsWith(prefix)?callback.slice(prefix.length):null;
 switch(draft.step){
  case 'category':{
   const chosen=value('f:cat:');if(chosen===null)return {draft,reply:prompt(draft,ctx,chat)};
   const custom=ctx.categories.find(category=>category.id===chosen&&category.direction===draft.kind);
   const defaults=draft.kind==='income'?income:expenses;
   if(!custom&&!defaults.includes(chosen))return {draft,reply:prompt(draft,ctx,chat)};
   const moved=next(draft,'account',{category:custom?undefined:chosen,custom_category_id:custom?.id??null,category_name:custom?custom.name:t(language,chosen)});
   return {draft:moved,reply:prompt(moved,ctx,chat)};
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
   const step:Step=draft.kind==='transfer'&&from&&to&&from.currency!==to.currency?'received':draft.kind==='mortgage'?'interest':draft.kind==='expense'||draft.kind==='income'?'name':'date';
   const moved=next(draft,step,{amount});return {draft:moved,reply:prompt(moved,ctx,chat)};
  }
  case 'received':{
   const received=input.text?parseAmount(input.text,language):null;
   if(received===null)return invalid(t(language,'Type a positive number, such as 250000 or 12.50'));
   const moved=next(draft,'date',{received});return {draft:moved,reply:prompt(moved,ctx,chat)};
  }
  case 'interest':{
   const interest=callback==='f:zero'?0:input.text?(parseAmount(input.text,language)??(input.text.trim()==='0'?0:null)):null;
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
   const preset=presetCurrency(draft,ctx);
   const moved=next(draft,preset?'balance':'currency',{account_name:name,id:draft.data.id??ctx.newId,...(preset?{currency:preset}:{})});return {draft:moved,reply:prompt(moved,ctx,chat)};
  }
  case 'currency':{
   const code=value('f:cur:');
   if(!code||!currencyList(ctx).includes(code))return {draft,reply:prompt(draft,ctx,chat)};
   const moved=next(draft,'balance',{currency:code});return {draft:moved,reply:prompt(moved,ctx,chat)};
  }
  case 'balance':{
   const amount=callback==='f:zero'?0:input.text?(parseAmount(input.text,language)??(input.text.trim()==='0'?0:null)):null;
   if(amount===null)return invalid(t(language,'Type a positive number, such as 250000 or 12.50'));
   return {draft:null,reply:null,commit:commitFor(next(draft,'balance',{amount}),ctx)};
  }
  case 'confirm':{
   if(callback!=='f:save')return {draft,reply:prompt(draft,ctx,chat)};
   return {draft:null,reply:null,commit:commitFor(draft,ctx)};
  }
 }
}
