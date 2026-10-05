// Advancing the conversation by one message or button: the menu, the controls every question shares, and the
// answer to each question.
import {shiftDay} from '../calendar-days';
import {expenses,income} from '../finance';
import {formatNumber,formatPercent} from '../format';
import {locales} from '../i18n';
import {escapeHtml} from '../telegram';
import {parseDay} from '../telegram-entry';
import {t} from '../telegram-kit';
import {commitFor} from './commit';
import {mainMenu,menuChoice,moreMenu} from './menu';
import {prompt} from './prompts';
import {asksBusiness,backStep,backToCard,buttonSteps,currencyList,find,firstStep,futureExample,isCash,needsBusiness,needsRate,next,numberExamples,pastExample,presetCurrency,presetLiabilityKind,rewind} from './steps';
import {amountWithCurrency,parseAmount,parseAmountOrZero,parseRate,startTyped} from './typed';
import {liabilityKinds,type Draft,type FlowContext,type FlowInput,type FlowResult,type LiabilityKind,type Step} from './types';

/** One answer to the current question, with the ways to reply to it. */
type Answer={draft:Draft;input:FlowInput;ctx:FlowContext;chat:number;callback:string;
 /** The rest of a button's data after `prefix`, or null for another button or typed text. */
 value:(prefix:string)=>string|null;
 /** Moves on to `moved` and asks its question. */
 ask:(moved:Draft)=>FlowResult;
 /** Asks the same question again, unchanged. */
 again:()=>FlowResult;
 /** Says what was wrong and asks the same question again, with the same buttons. */
 invalid:(text:string)=>FlowResult};

const answers:Record<Step,(answer:Answer)=>FlowResult>={
 category:({draft,ctx,callback,value,ask,again})=>{
  // A typed entry read as an expense can become income, and the other way round; its category is chosen again.
  if(callback==='f:flip'&&draft.data.typed&&(draft.kind==='expense'||draft.kind==='income'))return ask({kind:draft.kind==='expense'?'income':'expense',step:'category',data:{...draft.data,category:undefined,custom_category_id:undefined,category_name:undefined}});
  const answer=chosenCategory(value('f:cat:'),draft,ctx);
  if(!answer)return again();
  // A typed entry returns to its card, unless business income still needs its business.
  if(draft.data.typed)return ask(next(draft,answer.category==='Business income'&&!draft.data.business_id?'business':'confirm',answer));
  return ask(next(draft,asksBusiness(draft,ctx)?'business':'account',answer));
 },
 business:({draft,ctx,value,ask,again})=>{
  const chosen=value('f:biz:');
  const business=(ctx.businesses??[]).find(item=>item.id===chosen);
  // "No business" keeps the entry personal; business income cannot.
  if(!business&&(chosen!=='none'||needsBusiness(draft)))return again();
  return ask(next(draft,draft.data.typed?'confirm':'account',{business_id:business?.id??null}));
 },
 account:({draft,ctx,value,ask,again})=>{
  const chosen=value('f:acc:');const account=chosen?find(ctx.accounts,chosen):undefined;
  if(!account||!isCash(account))return again();
  // Another account means another conversion, so a rate found for the old one is forgotten.
  return ask(next(draft,draft.data.typed?'confirm':draft.kind==='transfer'?'target':'amount',{account_id:account.id,fx_rate:undefined,fx_rate_date:undefined}));
 },
 target:({draft,ctx,value,ask,again})=>{
  const chosen=value('f:tgt:');
  if(draft.kind==='transfer'){
   const to=chosen?find(ctx.accounts,chosen):undefined;
   if(!to||!isCash(to)||to.id===draft.data.account_id)return again();
   return ask(next(draft,'amount',{target_id:to.id}));
  }
  const target=chosen?find(ctx.liabilities,chosen):undefined;
  if(!target||!(draft.kind==='mortgage'?['Mortgage']:['Loan','Debt']).includes(target.kind))return again();
  return ask(next(draft,'account',{target_id:target.id}));
 },
 amount:answerAmount,
 received:({draft,input,ctx,ask,invalid})=>{
  const received=input.text?parseAmount(input.text,ctx.language):null;
  if(received===null)return invalid(t(ctx.language,'Type a positive number, such as {large} or {small}',numberExamples(ctx.language)));
  return ask(next(draft,'date',{received}));
 },
 interest:({draft,input,ctx,callback,ask,invalid})=>{
  const interest=callback==='f:zero'?0:input.text?parseAmountOrZero(input.text,ctx.language):null;
  if(interest===null)return invalid(t(ctx.language,'Type the interest as a number, or 0'));
  return ask(next(draft,'date',{interest}));
 },
 name:({draft,input,ctx,callback,ask,again,invalid})=>{
  const name=callback==='f:skip'?'':(input.text??'').trim();
  if(name.length>120)return invalid(t(ctx.language,'Keep the name under 120 characters.'));
  if(!name&&callback!=='f:skip')return again();
  return ask(next(draft,'date',{name}));
 },
 date:({draft,input,ctx,value,ask,invalid})=>{
  const chosen=value('f:date:');
  const date=chosen==='today'?ctx.today:chosen==='yesterday'?shiftDay(ctx.today,-1):input.text?parseDay(input.text,ctx.today,false,ctx.language):null;
  if(!date)return invalid(t(ctx.language,'Type a past or present date like {date}',{date:pastExample(ctx)}));
  // The id is fixed here so a redelivered update saves the same record once.
  return ask(next(draft,'confirm',{date,id:draft.data.id??ctx.newId}));
 },
 accname:({draft,input,ctx,callback,ask,again,invalid})=>{
  const language=ctx.language,name=callback==='f:accname:cash'?t(language,'Cash'):(input.text??'').trim();
  if(!name)return again();
  if(name.length>120)return invalid(t(language,'Keep the name under 120 characters.'));
  // Two cash accounts with one name would make every account picker ambiguous.
  if(ctx.accounts.some(account=>isCash(account)&&account.name.trim().toLowerCase()===name.toLowerCase()))return invalid(t(language,'You already have a cash account named {name}. Type another name.',{name:escapeHtml(name)}));
  const preset=presetCurrency(draft,ctx);
  return ask(next(draft,preset?'balance':'currency',{account_name:name,id:draft.data.id??ctx.newId,...(preset?{currency:preset}:{})}));
 },
 currency:({draft,ctx,value,ask,again})=>{
  const code=value('f:cur:');
  if(!code||!currencyList(ctx).includes(code))return again();
  return ask(next(draft,draft.kind==='liability'?'amount':draft.kind==='account'?'balance':draft.data.account_id?'confirm':'account',{currency:code,fx_rate:undefined,fx_rate_date:undefined}));
 },
 fxamount:answerConversion,
 fxrate:answerConversion,
 lkind:({draft,ctx,value,ask,again})=>{
  const chosen=value('f:lkind:') as LiabilityKind|null;
  if(!chosen||!liabilityKinds.includes(chosen))return again();
  return ask(next(draft,'lname',{lkind:chosen,id:draft.data.id??ctx.newId}));
 },
 lname:({draft,input,ctx,ask,again,invalid})=>{
  const name=(input.text??'').trim();
  if(!name)return again();
  if(name.length>120)return invalid(t(ctx.language,'Keep the name under 120 characters.'));
  return ask(next(draft,'currency',{name,id:draft.data.id??ctx.newId}));
 },
 duedate:({draft,input,ctx,ask,invalid})=>{
  const date=input.text?parseDay(input.text,ctx.today,true,ctx.language):null;
  if(!date)return invalid(t(ctx.language,'Type a date like {date}',{date:futureExample(ctx)}));
  if(date<ctx.today)return invalid(t(ctx.language,'The due date cannot be in the past. Type today or a later date.'));
  return ask(next(draft,'rate',{date}));
 },
 rate:({draft,input,ctx,callback,ask,invalid})=>{
  const language=ctx.language,rate=callback==='f:zero'?0:input.text?parseRate(input.text,language):null;
  if(rate===null)return invalid(t(language,'Type the rate as a number like {rate} or {percent}, or 0.',{rate:formatNumber(7.5,locales[language]),percent:formatPercent(7.5,locales[language])}));
  if(rate>1000)return invalid(t(language,'The rate must be {max} or less.',{max:formatPercent(1000,locales[language])}));
  return ask(next(draft,'payment',{rate}));
 },
 payment:({draft,input,ctx,callback,ask,invalid})=>{
  const payment=callback==='f:zero'?0:input.text?parseAmountOrZero(input.text,ctx.language):null;
  if(payment===null)return invalid(t(ctx.language,'Type a number such as {large} or {small}, or 0.',numberExamples(ctx.language)));
  return ask(next(draft,'confirm',{payment}));
 },
 balance:({draft,input,ctx,callback,invalid})=>{
  const amount=callback==='f:zero'?0:input.text?parseAmountOrZero(input.text,ctx.language):null;
  if(amount===null)return invalid(t(ctx.language,'Type a number such as {large} or {small}, or 0.',numberExamples(ctx.language)));
  return {draft:null,reply:null,commit:commitFor(next(draft,'balance',{amount}),ctx)};
 },
 confirm:({draft,ctx,callback,again})=>{
  if(callback!=='f:save')return again();
  // A conversion is saved only with the rate the card showed.
  if(needsRate(draft,ctx))return again();
  return {draft:null,reply:null,commit:commitFor(draft,ctx)};
 },
};

/** A category of the draft's direction: one of the owner's own, or a built-in one (business income only with a business). */
function chosenCategory(chosen:string|null,draft:Draft,ctx:FlowContext){
 if(chosen===null)return null;
 const custom=ctx.categories.find(category=>category.id===chosen&&category.direction===draft.kind);
 if(custom)return {category:undefined,custom_category_id:custom.id,category_name:custom.name};
 const defaults=draft.kind==='income'?income:expenses;
 if(!defaults.includes(chosen)||(chosen==='Business income'&&!ctx.businesses?.length))return null;
 return {category:chosen,custom_category_id:null,category_name:t(ctx.language,chosen)};
}
/** Why an amount cannot be paid: a repayment or mortgage principal above what is still owed. */
function amountProblem(draft:Draft,ctx:FlowContext,amount:number){
 const target=find(ctx.liabilities,draft.data.target_id);
 if(!target||amount<=target.amount)return '';
 if(draft.kind==='repayment')return t(ctx.language,'Repayment cannot exceed the outstanding balance.');
 return draft.kind==='mortgage'?t(ctx.language,'Principal exceeds the outstanding balance.'):'';
}
/** An amount, or for expenses and income an amount with one of the owner's currencies: 12 eur, $12, 12€. The
 * In {currency} buttons switch the currency it is typed in. */
function answerAmount({draft,input,ctx,value,ask,again,invalid}:Answer):FlowResult{
 const language=ctx.language,entered=draft.kind==='expense'||draft.kind==='income';
 const own=[...(ctx.currencies??[]),find(ctx.accounts,draft.data.account_id)?.currency];
 const switched=value('f:amtcur:');
 if(switched!==null)return entered&&own.includes(switched)?ask(next(draft,'amount',{currency:switched})):again();
 const typed=input.text&&entered?amountWithCurrency(input.text,draft,ctx):null;
 if(typed&&'refused' in typed)return invalid(t(language,'{currency} is not one of your currencies. Type the amount in {own}, or add {currency} in Settings.',{currency:typed.refused,own:find(ctx.accounts,draft.data.account_id)?.currency??''}));
 const amount=typed?typed.amount:input.text?parseAmount(input.text,language):null;
 if(amount===null)return invalid(t(language,'Type a positive number, such as {large} or {small}',numberExamples(language)));
 const problem=amountProblem(draft,ctx,amount);
 if(problem)return invalid(problem);
 return ask(next(draft,afterAmount(draft,ctx),{amount,...(typed?.currency?{currency:typed.currency,fx_rate:undefined,fx_rate_date:undefined}:{})}));
}
/** The question after the amount: what arrived in another currency, the interest, a name, the due date or the day. */
function afterAmount(draft:Draft,ctx:FlowContext):Step{
 const from=find(ctx.accounts,draft.data.account_id),to=find(ctx.accounts,draft.data.target_id);
 if(draft.kind==='liability')return 'duedate';
 if(draft.kind==='transfer'&&from&&to&&from.currency!==to.currency)return 'received';
 if(draft.kind==='mortgage')return 'interest';
 return draft.kind==='expense'||draft.kind==='income'?'name':'date';
}
/** Without a dated rate the owner gives their own figure, never a guessed rate: the amount in the account's currency,
 * or what one unit costs there. */
function answerConversion({draft,input,ctx,callback,ask,invalid}:Answer):FlowResult{
 if(callback==='f:fxrate'||callback==='f:fxamount')return ask(next(draft,callback==='f:fxrate'?'fxrate':'fxamount'));
 const typed=input.text?parseRate(input.text,ctx.language):null;
 if(!typed)return invalid(t(ctx.language,'Type a positive number, such as {large} or {small}',numberExamples(ctx.language)));
 const rate=draft.step==='fxamount'?(draft.data.amount??0)+(draft.kind==='mortgage'?draft.data.interest??0:0):1;
 return ask(next(draft,'confirm',{fx_rate:rate/typed,fx_rate_date:draft.data.date??ctx.today}));
}

/** At the menu: a menu item starts its conversation, and free text is read as a typed entry. */
function fromMenu(menuInput:string|undefined,input:FlowInput,ctx:FlowContext,chat:number):FlowResult{
 const language=ctx.language,choice=menuInput?menuChoice(menuInput):null;
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

/** The buttons every question shares: changing a typed entry's guesses, Back, creating what a dead end is missing,
 * and the pages of a long list. Null when the input is an answer instead. */
function control(draft:Draft,callback:string,ctx:FlowContext,ask:(moved:Draft,page?:number)=>FlowResult):FlowResult|null{
 // On a typed entry's card each guess can be changed; the answer returns to the card.
 if(draft.data.typed&&draft.step==='confirm'){
  const change:Partial<Record<string,Step>>={'f:chcat':'category','f:chacc':'account',...(ctx.businesses?.length?{'f:chbiz':'business'}:{})};
  const step=change[callback];
  if(step)return ask({...draft,step});
 }
 // Back returns to the question before this one. At the first question, or from an old message, the current question is asked again.
 if(callback==='f:back'){
  if(backToCard(draft))return ask({...draft,step:'confirm'});
  const earlier=backStep(draft,ctx);
  // At the first question of an account or loan started from a dead end, Back returns to the interrupted conversation.
  return ask(earlier?rewind(draft,earlier):draft.data.resume??draft);
 }
 // From a dead end the owner can create the missing account here; saving it returns to the interrupted question.
 if(callback==='f:newacc'&&draft.kind!=='account')return ask({kind:'account',step:'accname',data:{id:ctx.newId,resume:draft,currency:presetCurrency({kind:'account',step:'accname',data:{resume:draft}},ctx)}});
 if(callback==='f:newliab'&&draft.kind!=='liability'){
  const preset=presetLiabilityKind({kind:'liability',step:'lkind',data:{resume:draft}});
  return ask({kind:'liability',step:preset?'lname':'lkind',data:{id:ctx.newId,resume:draft,...(preset?{lkind:preset}:{})}});
 }
 const page=/^f:page:(\d+)$/.exec(callback);
 return page?ask(draft,Number(page[1])):null;
}

/** Advance the conversation by one input. A null draft means the owner is at the menu. */
export function advance(draft:Draft|null,input:FlowInput,ctx:FlowContext,chat:number):FlowResult{
 const language=ctx.language;
 // The Cancel button under the phone number request sends its label as text.
 if(input.callback==='f:cancel'||/^\/cancel/.test(input.text??'')||input.text?.trim()===t(language,'Cancel'))return {draft:null,reply:{chat_id:chat,text:t(language,'Cancelled.'),keyboard:mainMenu(language)}};
 // A More actions button starts its action from anywhere, like typing a menu label.
 const menuInput=input.callback?.startsWith('m:')?input.callback:input.text;
 if(!draft)return fromMenu(menuInput,input,ctx,chat);
 if(menuInput&&menuChoice(menuInput))return advance(null,input,ctx,chat);
 // At a question answered with buttons, a typed entry starts afresh instead of being ignored.
 if(input.text&&buttonSteps.includes(draft.step)){const typed=startTyped(input.text,ctx);if('draft' in typed)return {draft:typed.draft,reply:prompt(typed.draft,ctx,chat)};}
 const callback=input.callback??'';
 const ask=(moved:Draft,page?:number):FlowResult=>({draft:moved,reply:prompt(moved,ctx,chat,page)});
 const controlled=control(draft,callback,ctx,ask);
 if(controlled)return controlled;
 return answers[draft.step]({draft,input,ctx,chat,callback,ask,
  value:prefix=>callback.startsWith(prefix)?callback.slice(prefix.length):null,
  again:()=>ask(draft),
  invalid:text=>({draft,reply:{...prompt(draft,ctx,chat),text}})});
}
