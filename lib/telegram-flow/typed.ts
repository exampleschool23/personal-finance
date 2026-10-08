// Reading what the owner types: amounts, rates, an amount with a currency, and a whole entry such as "coffee 4.5".
import type {Entry} from '../finance';
import {locales,type Language} from '../i18n';
import {currencyCandidates,guessCategory,looseNumber,parseTypedAmount,parseTypedEntry} from '../telegram-entry';
import {t} from '../telegram-kit';
import {directionOf} from '../transaction-rules';
import {find,isCash,onlySchedule} from './steps';
import type {Draft,DraftData,FlowContext,Step} from './types';

/** A positive amount read by the same rules as a typed entry, so 12,75 is 12.75 in every language and never 1275. */
export const parseAmount=(text:string,language:Language)=>parseTypedAmount(text,language);
/** A positive amount, or zero typed as 0. */
export const parseAmountOrZero=(text:string,language:Language)=>parseTypedAmount(text,language,{allowZero:true});
/** A yearly rate in percent: a trailing %, spaces and a comma decimal (7,5) are accepted. */
export function parseRate(text:string,language:Language):number|null{
 const bare=text.trim().replace(/\s*%$/,'').replace(/\s+/g,'');
 // A comma followed by one or two digits is a decimal comma; rates never need thousands grouping there.
 return parseAmountOrZero(/^\d+,\d{1,2}$/.test(bare)?bare.replace(',','.'):bare,language);
}
/** An amount typed with one of the owner's currencies (12 eur, $12, 12€), or the currency refused, or null for a plain number. */
export function amountWithCurrency(text:string,draft:Draft,ctx:FlowContext):{amount:number;currency:string}|{refused:string}|null{
 const match=/^\s*(\S*?)\s*(\d[\d\s\u00a0\u202f.,'’]*)\s*(\S*)\s*$/u.exec(text);
 if(!match||(!match[1]&&!match[3])||(match[1]&&match[3]))return null;
 const list=currencyCandidates(match[1]||match[3]),amount=looseNumber(match[2].trim(),ctx.language);
 if(!list||amount===null)return null;
 const allowed=[...(ctx.currencies??[]),find(ctx.accounts,draft.data.account_id)?.currency];
 const own=list.filter(code=>allowed.includes(code));
 return own.length===1?{amount,currency:own[0]}:{refused:list[0]};
}
type Guess=ReturnType<typeof guessCategory>;
/** The account a typed entry is booked to: the one named in the text, else the one last used for this name, then for
 * this category, then for any entry in the same direction (in the typed currency when one was typed), else one in the
 * typed currency, else the primary currency's. */
function typedAccount(parsed:{account_id?:string;currency?:string},guess:Guess,ctx:FlowContext){
 const cash=ctx.accounts.filter(isCash),has=(id?:string)=>cash.some(account=>account.id===id);
 const inCurrency=(record:Entry)=>!parsed.currency||cash.find(item=>item.id===record.account_id)?.currency===parsed.currency;
 const lastUsed=(match:(record:Entry)=>boolean)=>(ctx.records??[]).filter(record=>record.frequency==='Once'&&!!record.account_id&&has(record.account_id)&&match(record)&&inCurrency(record))
  .sort((a,b)=>(b.date||'').localeCompare(a.date||''))[0]?.account_id??undefined;
 const sameCategory=(record:Entry)=>guess.custom_category_id?record.custom_category_id===guess.custom_category_id:record.kind===guess.kind&&!record.custom_category_id;
 const fallback=()=>(parsed.currency?cash.find(item=>item.currency===parsed.currency)?.id:undefined)??(cash.find(item=>item.currency===ctx.currencies?.[0])??cash[0])?.id;
 return parsed.account_id??(has(guess.account_id)?guess.account_id:undefined)??lastUsed(sameCategory)??lastUsed(record=>directionOf(record.kind)===guess.direction)??fallback();
}
/** A typed message as an entry waiting on its confirmation card, or why it could not be read. Nothing is saved here. */
export function startTyped(text:string,ctx:FlowContext):{draft:Draft}|{error:'empty'|'amount'|'date'}{
 const parsed=parseTypedEntry(text,{language:ctx.language,today:ctx.today,accounts:ctx.accounts,currencies:ctx.currencies});
 if('error' in parsed)return parsed;
 const guess=guessCategory({name:parsed.name,amount:parsed.amount,account_id:parsed.account_id,direction:parsed.direction},{rules:ctx.rules,records:ctx.records??[],categories:ctx.categories,businesses:ctx.businesses,removed:ctx.removed});
 const account=typedAccount(parsed,guess,ctx);
 const custom=guess.custom_category_id?ctx.categories.find(category=>category.id===guess.custom_category_id):undefined;
 const name=parsed.name?parsed.name.charAt(0).toLocaleUpperCase(locales[ctx.language])+parsed.name.slice(1):'';
 const category=custom?{category:undefined,custom_category_id:custom.id,category_name:custom.name}:{category:guess.kind,custom_category_id:null,category_name:t(ctx.language,guess.kind)};
 const data:DraftData={typed:true,id:ctx.newId,...category,amount:parsed.amount,name,date:parsed.date,...(account?{account_id:account}:{}),...(parsed.currency?{currency:parsed.currency}:{}),...(guess.business_id?{business_id:guess.business_id}:{})};
 const step:Step=parsed.currencyChoices?'currency':account?'confirm':'account';
 // The only schedule of its category is shown on the card, by id; with several the owner chooses.
 return {draft:{kind:guess.direction,step,data:{...data,schedule_id:onlySchedule({kind:guess.direction,step,data},ctx)}}};
}
