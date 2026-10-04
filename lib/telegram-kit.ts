// The small pieces every Telegram message is written with: translation in the
// owner's language, money through the shared formatter, and keyboard layout.
// Pure, so the bot, the background messages and their tests share one copy.
import {formatMoney} from './format';
import {locales,translate,type Language} from './i18n';
import type {TelegramButton} from './telegram';
export type TextParams=Record<string,string|number>;
/** A translated text in `language`. */
export const t=(language:Language,key:string,params?:TextParams)=>translate(language,key,params);
/** An amount in `language`'s number format, through the shared money formatter. */
export const moneyIn=(value:number,currency:string,language:Language)=>formatMoney(value,currency,locales[language]);
/** Translation, locale and money already bound to one language, for messages written in a single language. */
export function messageKit(language:Language){
 const locale=locales[language];
 return {locale,t:(key:string,params?:TextParams)=>translate(language,key,params),money:(value:number,currency:string)=>formatMoney(value,currency,locale)};
}
/** Buttons laid out `perRow` to a row, the last row holding what is left. */
export function keyboardRows<T>(buttons:readonly T[],perRow:number):T[][]{
 const out:T[][]=[];
 for(let index=0;index<buttons.length;index+=perRow)out.push(buttons.slice(index,index+perRow));
 return out;
}
/** The label of every Back button, so a typed or tapped "‹ Back" is recognised everywhere. */
export const backLabel=(language:Language)=>'‹ '+translate(language,'Back');
/** A Back button in the chat that sends `callback`. */
export const backButton=(language:Language,callback:string):TelegramButton=>({text:backLabel(language),callback_data:callback});
