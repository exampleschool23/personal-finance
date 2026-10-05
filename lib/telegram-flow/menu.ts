// The bot's menus: the keyboard under the text box, More actions, and reading which item a message means.
import {dictionaries,type Language} from '../i18n';
import type {TelegramButton,TelegramKeyboard,TelegramMessage} from '../telegram';
import {keyboardRows,t} from '../telegram-kit';
import type {FlowKind} from './types';

export type MenuKind=FlowKind|'upcoming'|'signout';
const menuItems:Array<{kind:MenuKind;label:string}>=[{kind:'expense',label:'Expense'},{kind:'income',label:'Income'},{kind:'transfer',label:'Transfer'},{kind:'repayment',label:'Pay loan or debt'},{kind:'mortgage',label:'Mortgage payment'},{kind:'upcoming',label:'Upcoming payments'},{kind:'account',label:'Add cash account'},{kind:'liability',label:'Add loan or debt'},{kind:'signout',label:'Sign out'}];
const moreKinds:MenuKind[]=['transfer','repayment','mortgage','upcoming','account','liability','signout'];
const label=(language:Language,kind:MenuKind)=>t(language,menuItems.find(item=>item.kind===kind)!.label);

/** The persistent keyboard under the text box: the two everyday entries, and everything else one tap away. */
export function mainMenu(language:Language):TelegramKeyboard{
 return {reply:[[label(language,'expense'),label(language,'income')],[t(language,'More actions')]]};
}
/** The actions behind More actions, as buttons in the chat. Each sends m:<kind>, which works like typing its label. */
export function moreMenu(language:Language,chat:number):TelegramMessage{
 const button=(kind:MenuKind):TelegramButton=>({text:label(language,kind),callback_data:'m:'+kind});
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
