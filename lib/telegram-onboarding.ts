// The three short questions a new Telegram account answers in the chat:
// language, main currency and a first cash account. Pure, like the record
// flow: given the draft and one input it returns the next draft, the reply and
// what the bot should save. The bot handler owns storage.
import {isCurrency} from './currencies';
import {formatNumberInput} from './format';
import {languageCatalogue,locales,translate,type Language} from './i18n';
import {suggestedCurrencies} from './onboarding';
import type {TelegramMessage} from './telegram';
import {mainMenu} from './telegram-flow';
export type OnboardStep='language'|'currency'|'currency_other'|'account'|'balance';
export type OnboardData={currency?:string;account_name?:string};
export type OnboardDraft={kind:'onboard';step:OnboardStep;data:OnboardData};
export type OnboardEffects={language?:Language;currency?:string;account?:{name:string;amount:number;currency:string};finished?:boolean};
export type OnboardResult={draft:OnboardDraft|null;reply:TelegramMessage|null;effects:OnboardEffects};
export type OnboardContext={language:Language;currency?:string};
const checkMark='✓ ';
const t=(language:Language,key:string,params?:Record<string,string|number>)=>translate(language,key,params);
const rows=<T,>(buttons:T[],perRow:number)=>{const out:T[][]=[];for(let index=0;index<buttons.length;index+=perRow)out.push(buttons.slice(index,index+perRow));return out;};
const chosen=(draft:OnboardDraft,step:OnboardStep,data:Partial<OnboardData>={}):OnboardDraft=>({kind:'onboard',step,data:{...draft.data,...data}});
export const isOnboardDraft=(draft:{kind:string}|null):draft is OnboardDraft=>draft?.kind==='onboard';
/** The prompt for a step, written in `language`. */
export function onboardPrompt(draft:OnboardDraft,language:Language,chat:number):TelegramMessage{
 switch(draft.step){
  case 'language':{
   // A scrollable reply keyboard, three to a row; the language in use comes first, so confirming it takes one tap.
   const ordered=[...languageCatalogue].sort((a,b)=>Number(b.code===language)-Number(a.code===language));
   return {chat_id:chat,text:t(language,'Choose your language'),keyboard:{reply:rows(ordered.map(item=>(item.code===language?checkMark:'')+item.native),3)}};
  }
  case 'currency':return {chat_id:chat,text:t(language,'Which currency do you use most?'),keyboard:{reply:[...rows(suggestedCurrencies,3),[t(language,'Other currency')]]}};
  case 'currency_other':return {chat_id:chat,text:t(language,'Type a currency code, such as USD'),keyboard:{remove:true}};
  case 'account':return {chat_id:chat,text:t(language,'Name your first cash account, for example Wallet.'),keyboard:{reply:[[t(language,'Cash')]]}};
  case 'balance':return {chat_id:chat,text:t(language,'How much is in it? Type 0 if it is empty.'),keyboard:{remove:true}};
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
 switch(draft.step){
  case 'language':{
   // A keyboard tap arrives as the native name; buttons on older messages still send o:lang:<code>.
   const code=callback.startsWith('o:lang:')?callback.slice(7):'',name=text.startsWith(checkMark)?text.slice(checkMark.length):text;
   const language=languageCatalogue.find(item=>item.code===code||(name&&item.native===name))?.code;
   if(!language)return again();
   return move(chosen(draft,'currency'),language,{language});
  }
  case 'currency':{
   if(callback==='o:cur:other'||text===t(ctx.language,'Other currency'))return move(chosen(draft,'currency_other'),ctx.language);
   const code=callback.startsWith('o:cur:')?callback.slice(6):text.toUpperCase();
   if(!isCurrency(code))return again();
   return move(chosen(draft,'account',{currency:code}),ctx.language,{currency:code});
  }
  case 'currency_other':{
   const code=text.toUpperCase();
   if(!/^[A-Z]{3}$/.test(code)||!isCurrency(code))return again(t(ctx.language,'Type a currency code, such as USD'));
   return move(chosen(draft,'account',{currency:code}),ctx.language,{currency:code});
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
