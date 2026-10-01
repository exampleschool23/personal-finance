// The three short questions a new Telegram account answers in the chat:
// language, main currency and a first cash account. Pure, like the record
// flow: given the draft and one input it returns the next draft, the reply and
// what the bot should save. The bot handler owns storage.
import {currencyLabel,fiatCurrencies,isCurrency} from './currencies';
import {formatNumberInput} from './format';
import {languageCatalogue,locales,translate,type Language} from './i18n';
import {suggestedCurrencies} from './onboarding';
import type {TelegramMessage} from './telegram';
import {mainMenu} from './telegram-flow';
export type OnboardStep='language'|'currency'|'currency_other'|'account'|'balance';
export type OnboardData={currency?:string;account_name?:string;search?:string};
export type OnboardDraft={kind:'onboard';step:OnboardStep;data:OnboardData};
export type OnboardEffects={language?:Language;currency?:string;account?:{name:string;amount:number;currency:string};finished?:boolean};
export type OnboardResult={draft:OnboardDraft|null;reply:TelegramMessage|null;effects:OnboardEffects};
export type OnboardContext={language:Language;currency?:string};
const checkMark='✓ ';
const t=(language:Language,key:string,params?:Record<string,string|number>)=>translate(language,key,params);
const rows=<T,>(buttons:T[],perRow:number)=>{const out:T[][]=[];for(let index=0;index<buttons.length;index+=perRow)out.push(buttons.slice(index,index+perRow));return out;};
const searchLimit=30;
// Accents are dropped so "cordoba" finds Córdoba; ł and ø do not decompose, so they are mapped by hand.
const fold=(value:string)=>value.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/ł/g,'l').replace(/ø/g,'o').trim();
/** Every fiat currency, or those whose code or name (in the chat language or English) contains the query. */
export function currencyMatches(query:string,language:Language):string[]{
 const wanted=fold(query);
 if(!wanted)return fiatCurrencies.map(item=>item.code);
 return fiatCurrencies.filter(item=>[item.code,item.name,currencyLabel(item.code,locales[language])].some(text=>fold(text).includes(wanted))).map(item=>item.code);
}
/** The code a keyboard tap stands for: a label such as "EUR · Euro" or a bare code. */
export function currencyFromText(text:string):string|null{
 const code=/^([A-Za-z]{3})(?:\s·\s.+)?$/.exec(text.trim())?.[1].toUpperCase();
 return code&&isCurrency(code)?code:null;
}
const currencyKeyboard=(codes:string[],language:Language)=>rows(codes.map(code=>currencyLabel(code,locales[language])),2);
const backLabel=(language:Language)=>'‹ '+t(language,'Back');
// The question before each one, for the Back button. Going back forgets the answers given after it.
const previous:Record<OnboardStep,OnboardStep|null>={language:null,currency:'language',currency_other:'currency',account:'currency',balance:'account'};
const forget:Record<OnboardStep,Array<keyof OnboardData>>={language:['currency','account_name','search'],currency:['currency','account_name','search'],currency_other:['currency','account_name','search'],account:['account_name'],balance:[]};
// An undefined value removes that answer, so a cleared search or name is not stored as an empty key.
const chosen=(draft:OnboardDraft,step:OnboardStep,data:Partial<OnboardData>={}):OnboardDraft=>({kind:'onboard',step,data:Object.fromEntries(Object.entries({...draft.data,...data}).filter(([,value])=>value!==undefined)) as OnboardData});
export const isOnboardDraft=(draft:{kind:string}|null):draft is OnboardDraft=>draft?.kind==='onboard';
/** The prompt for a step, written in `language`. */
export function onboardPrompt(draft:OnboardDraft,language:Language,chat:number):TelegramMessage{
 switch(draft.step){
  case 'language':{
   // A scrollable reply keyboard, three to a row; the language in use comes first, so confirming it takes one tap.
   const ordered=[...languageCatalogue].sort((a,b)=>Number(b.code===language)-Number(a.code===language));
   return {chat_id:chat,text:t(language,'Choose your language'),keyboard:{reply:rows(ordered.map(item=>(item.code===language?checkMark:'')+item.native),3)}};
  }
  case 'currency':return {chat_id:chat,text:t(language,'Which currency do you use most?'),keyboard:{reply:[...rows(suggestedCurrencies,3),[t(language,'Other currency')],[backLabel(language)]]}};
  case 'currency_other':{
   // The whole list scrolls like the languages; typing part of a name or code narrows it, since a keyboard cannot hold a search box.
   const query=draft.data.search??'',codes=currencyMatches(query,language);
   const text=!query?t(language,'Choose your currency, or type part of its name or code to search, such as peso or EUR.'):codes.length?t(language,'Currencies matching “{query}”',{query}):t(language,'No currency matches “{query}”. Try another word or a code such as USD.',{query});
   return {chat_id:chat,text,keyboard:{reply:[...currencyKeyboard(codes.slice(0,query?searchLimit:codes.length),language),[backLabel(language)]]}};
  }
  case 'account':return {chat_id:chat,text:t(language,'Name your first cash account, for example Wallet.'),keyboard:{reply:[[t(language,'Cash')],[backLabel(language)]]}};
  case 'balance':return {chat_id:chat,text:t(language,'How much is in it? Type 0 if it is empty.'),keyboard:{reply:[['0'],[backLabel(language)]]}};
 }
}
export function startOnboarding(language:Language,chat:number):OnboardResult{
 const draft:OnboardDraft={kind:'onboard',step:'language',data:{}};
 return {draft,reply:onboardPrompt(draft,language,chat),effects:{}};
}
function amountOf(text:string,language:Language){
 const parsed=formatNumberInput(text.trim(),locales[language])??formatNumberInput(text.trim(),'en-US');
 const value=parsed?.value??null;
 return value!==null&&value>=0&&value<=1e15?value:null;
}
/** Advance by one input. A null draft means the chat is set up and returns to the menu. */
export function advanceOnboarding(draft:OnboardDraft,input:{text?:string;callback?:string},ctx:OnboardContext,chat:number):OnboardResult{
 const callback=input.callback??'',text=(input.text??'').trim();
 const again=(message?:string):OnboardResult=>({draft,reply:message?{chat_id:chat,text:message}:onboardPrompt(draft,ctx.language,chat),effects:{}});
 const move=(next:OnboardDraft,language:Language,effects:OnboardEffects={}):OnboardResult=>({draft:next,reply:onboardPrompt(next,language,chat),effects});
 // Back returns to the previous question and forgets what was answered from there on.
 const earlier=previous[draft.step];
 if(earlier&&text===backLabel(ctx.language)){const data={...draft.data};for(const field of forget[earlier])delete data[field];return move({kind:'onboard',step:earlier,data},ctx.language);}
 // Replies take a few seconds, so a second tap on an earlier keyboard can arrive after the bot has moved on. Such a tap changes that earlier answer instead of becoming the next one, so "USD" or "Other currency" is never saved as an account name.
 if(draft.step!=='language'){
  const late=languageCatalogue.find(item=>item.native===(text.startsWith(checkMark)?text.slice(checkMark.length):text))?.code;
  if(late)return move(draft,late,{language:late});
 }
 if(draft.step==='account'||draft.step==='balance'){
  if(text===t(ctx.language,'Other currency'))return move(chosen(draft,'currency_other',{search:undefined}),ctx.language);
  const late=suggestedCurrencies.includes(text)?text:/\s·\s/.test(text)?currencyFromText(text):null;
  if(late)return move(chosen(draft,'account',{currency:late,account_name:undefined}),ctx.language,{currency:late});
 }
 switch(draft.step){
  case 'language':{
   // A keyboard tap arrives as the native name; buttons on older messages still send o:lang:<code>.
   const code=callback.startsWith('o:lang:')?callback.slice(7):'',name=text.startsWith(checkMark)?text.slice(checkMark.length):text;
   const language=languageCatalogue.find(item=>item.code===code||(name&&item.native===name))?.code;
   if(!language)return again();
   return move(chosen(draft,'currency'),language,{language});
  }
  case 'currency':{
   if(callback==='o:cur:other'||text===t(ctx.language,'Other currency'))return move(chosen(draft,'currency_other',{search:undefined}),ctx.language);
   const code=callback.startsWith('o:cur:')?callback.slice(6):text.toUpperCase();
   if(!isCurrency(code))return again();
   return move(chosen(draft,'account',{currency:code}),ctx.language,{currency:code});
  }
  case 'currency_other':{
   // A tap or a typed code chooses; anything else is a search, answered with the matching currencies to tap.
   const code=currencyFromText(text);
   if(code)return move(chosen(draft,'account',{currency:code,search:undefined}),ctx.language,{currency:code});
   if(!text)return again();
   return {draft:chosen(draft,'currency_other',{search:text.slice(0,40)}),reply:onboardPrompt(chosen(draft,'currency_other',{search:text.slice(0,40)}),ctx.language,chat),effects:{}};
  }
  case 'account':{
   const name=callback==='o:name:cash'?t(ctx.language,'Cash'):text;
   if(!name)return again();
   if(name.length>120)return again(t(ctx.language,'Keep the name under 120 characters.'));
   return move(chosen(draft,'balance',{account_name:name}),ctx.language);
  }
  case 'balance':{
   const amount=text?amountOf(text,ctx.language):null;
   if(amount===null)return again(t(ctx.language,'Type a positive number, such as 250000 or 12.50'));
   const currency=draft.data.currency??ctx.currency??'USD';
   return {draft:null,reply:{chat_id:chat,text:t(ctx.language,'You are all set. Use the buttons below to add your first expense.'),keyboard:mainMenu(ctx.language)},effects:{account:{name:draft.data.account_name??t(ctx.language,'Cash'),amount,currency},finished:true}};
  }
 }
}
