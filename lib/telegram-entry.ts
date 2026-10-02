// Typed entries for the Telegram bot, read by fixed rules (no AI): "coffee 4.5",
// "taxi 25 000 uzs", "+1500 salary", "lunch 12 eur yesterday", "groceries 30 card".
// Pure: it reads the text and the owner's own data, and proposes an entry that
// the bot shows on a confirmation card. Nothing is saved until the owner presses Save.
import {isoDate} from './api-validation';
import {isCurrency} from './currencies';
import {expenses,income,type Entry} from './finance';
import {numberSymbols} from './format';
import {dictionaries,locales,translate,type Language} from './i18n';
import {shiftDay} from './period-summary';
import type {Category} from './planning';
import {directionOf,ruleChoice,ruleMatches,type TransactionRule} from './transaction-rules';
export type Direction='expense'|'income';
/** A record date typed as ISO (2026-09-30) or day first (30.09.2026); past or today unless `future` allows later days. */
export function parseDay(text:string,today:string,future=false):string|null{
 const trimmed=text.trim();
 const european=/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(trimmed);
 const candidate=european?`${european[3]}-${european[2].padStart(2,'0')}-${european[1].padStart(2,'0')}`:trimmed;
 return isoDate.safeParse(candidate).success&&(future||candidate<=today)?candidate:null;
}
/** A typed number: spaces and apostrophes group digits; a lone comma or dot is decimal unless exactly three digits follow it,
 * in which case it is decimal only when it is the language's decimal mark (1,500 is 1500 in English and 1.5 in Russian;
 * 1.500 is 1.5 in English and 1500 in Russian). With both marks the last one is decimal. */
export function looseNumber(raw:string,language:Language):number|null{
 const text=raw.replace(/[\s  '’]/g,'');
 if(!/^\d[\d.,]*$/.test(text)||/[.,]$/.test(text))return null;
 const marks=[...text.matchAll(/[.,]/g)].map(match=>match[0]);
 let normalized:string;
 if(!marks.length)normalized=text;
 else if(new Set(marks).size===2){
  const decimal=marks[marks.length-1],group=decimal==='.'?',':'.';
  if(marks.slice(0,-1).some(mark=>mark!==group))return null;
  normalized=text.split(group).join('').replace(decimal,'.');
 }else if(marks.length>1){
  // One mark repeated groups thousands: 1,000,000 or 1.000.000; every group has three digits.
  if(!text.split(marks[0]).slice(1).every(group=>group.length===3))return null;
  normalized=text.split(marks[0]).join('');
 }else{
  const [whole,fraction]=text.split(marks[0]);
  normalized=fraction.length===3&&marks[0]!==numberSymbols(locales[language]).decimal?whole+fraction:whole+'.'+fraction;
 }
 const value=Number(normalized);
 return Number.isFinite(value)&&value>0&&value<=1e15?value:null;
}
// Symbols and words for currencies. A symbol several currencies share is resolved by the owner's own currencies.
const currencyWords:Record<string,string[]>={
 '$':['USD','CAD','AUD','NZD','SGD','HKD','MXN','ARS','CLP','COP','TWD'],'us$':['USD'],'€':['EUR'],'£':['GBP'],'¥':['JPY','CNY'],'₽':['RUB'],'₸':['KZT'],'₹':['INR'],'₩':['KRW'],'₺':['TRY'],'₴':['UAH'],'₫':['VND'],'₪':['ILS'],'₱':['PHP'],'₦':['NGN'],'৳':['BDT'],'฿':['THB'],'r$':['BRL'],'zł':['PLN'],'kč':['CZK'],'rp':['IDR'],'rm':['MYR'],'lei':['RON'],
 dollar:['USD'],dollars:['USD'],'доллар':['USD'],'долларов':['USD'],'доллара':['USD'],dollarr:['USD'],euro:['EUR'],euros:['EUR'],'евро':['EUR'],yevro:['EUR'],
 'руб':['RUB'],'рубль':['RUB'],'рубля':['RUB'],'рублей':['RUB'],'сум':['UZS'],'сўм':['UZS'],"so'm":['UZS'],'so‘m':['UZS'],'soʻm':['UZS'],'som':['UZS','KGS'],sum:['UZS'],'тенге':['KZT'],tenge:['KZT'],'гривен':['UAH'],'грн':['UAH'],lira:['TRY'],rupee:['INR'],rupees:['INR'],
};
/** The currencies a word or symbol may mean, or null when it names none. */
export function currencyCandidates(word:string):string[]|null{
 const lower=word.toLowerCase();
 if(/^[a-z]{3}$/.test(lower)&&isCurrency(lower.toUpperCase()))return [lower.toUpperCase()];
 return currencyWords[lower]??null;
}
// Date words beyond the translated Today and Yesterday the bot's buttons already use.
const dayWords:Record<string,number>={today:0,yesterday:-1,'day before yesterday':-2,'сегодня':0,'вчера':-1,'позавчера':-2,bugun:0,kecha:-1,'avvalgi kuni':-2,'o‘tgan kuni':-2};
function dateWords(){
 const words=new Map<string,number>(Object.entries(dayWords));
 for(const language of Object.keys(dictionaries) as Language[]){words.set(translate(language,'Today').toLowerCase(),0);words.set(translate(language,'Yesterday').toLowerCase(),-1);}
 return [...words].sort((a,b)=>b[0].length-a[0].length);
}
const fillers=new Set(['for','on','at','from','in','to','paid','spent','за','на','в','из','с','uchun','dan','ga']);
export type TypedEntry={direction?:Direction;amount:number;currency?:string;currencyChoices?:string[];date:string;name:string;account_id?:string};
export type ParseFailure={error:'empty'|'amount'|'date'};
const escapeRegExp=(text:string)=>text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
/** Read one typed message. Returns the proposed entry, or why the text is not an entry. */
export function parseTypedEntry(text:string,ctx:{language:Language;today:string;accounts:Pick<Entry,'id'|'name'|'kind'>[];currencies?:string[]}):TypedEntry|ParseFailure{
 let rest=` ${text.normalize('NFC').replace(/[  ]/g,' ').trim()} `;
 if(!rest.trim()||rest.length>300)return {error:'empty'};
 let date:string|undefined;
 // Typed dates first, so their digits are not read as amounts.
 for(const match of rest.matchAll(/(?<=\s)(\d{4}-\d{2}-\d{2}|\d{1,2}[./]\d{1,2}[./]\d{4})(?=\s)/g)){
  const day=parseDay(match[1],ctx.today);
  if(!day||date)return {error:'date'};
  date=day;rest=rest.replace(match[0],' ');
 }
 for(const [word,shift] of dateWords()){
  const pattern=new RegExp(`(?<=\\s)${escapeRegExp(word)}(?=[\\s,.!]|$)`,'iu');
  if(pattern.test(rest)){if(date)return {error:'date'};date=shiftDay(ctx.today,shift);rest=rest.replace(pattern,' ');}
 }
 // A cash account named in the text, longest names first so "Card 2" wins over "Card"; read before amounts, so its digits are not one.
 let account_id:string|undefined;
 for(const account of [...ctx.accounts].filter(item=>item.kind==='Cash').sort((a,b)=>b.name.length-a.name.length)){
  const pattern=new RegExp(`(?<=^|\\s)${escapeRegExp(account.name.trim())}(?=\\s|$)`,'iu');
  if(account.name.trim()&&pattern.test(rest)){account_id=account.id;rest=rest.replace(pattern,' ');break;}
 }
 // Digits grouped by spaces (25 000) become one number before the text is split into words.
 rest=rest.replace(/(?<=(?:^|[^\d.,])\d{1,3})(?: \d{3})+(?=\D|$)/g,match=>match.replace(/ /g,''));
 const words=rest.split(/\s+/).filter(Boolean);
 type Candidate={index:number;value:number;sign:''|'+'|'-';currency?:string[]};
 const candidates:Candidate[]=[];
 const symbols='[$€£¥₽₸₹₩₺₴₫₪₱₦৳฿]|[A-Za-z]{3}|[Rr]\\$|US\\$|zł|Kč|Rp|RM';
 const shape=new RegExp(`^([+\\-−]?)(${symbols})?(\\d[\\d.,'’]*)(${symbols})?$`,'u');
 words.forEach((word,index)=>{
  const match=shape.exec(word);if(!match)return;
  const value=looseNumber(match[3],ctx.language);if(value===null)return;
  const attached=match[2]??match[4];const currency=attached?currencyCandidates(attached):undefined;
  if(attached&&!currency)return;
  candidates.push({index,value,sign:match[1]==='+'?'+':match[1]?'-':'',currency:currency??undefined});
 });
 // Several numbers: the one carrying a sign or a currency is the amount; otherwise the text is ambiguous.
 const marked=candidates.filter(candidate=>candidate.sign||candidate.currency);
 const besideCurrency=candidates.filter(candidate=>[words[candidate.index+1],words[candidate.index-1]].some(word=>word!==undefined&&!!currencyCandidates(word)));
 const chosen=candidates.length===1?candidates[0]:marked.length===1?marked[0]:!marked.length&&besideCurrency.length===1?besideCurrency[0]:null;
 if(!chosen)return {error:'amount'};
 const used=new Set([chosen.index]);
 let currency=chosen.currency;
 if(!currency){
  // A currency word standing next to the amount (12 eur, eur 12), or anywhere when it is the only one.
  const near=[chosen.index+1,chosen.index-1].find(index=>words[index]!==undefined&&!!currencyCandidates(words[index]));
  const anywhere=words.map((word,index)=>({index,list:used.has(index)?null:currencyCandidates(word)})).filter(item=>item.list);
  const pick=near!==undefined?{index:near,list:currencyCandidates(words[near])}:anywhere.length===1?anywhere[0]:null;
  if(pick?.list){currency=pick.list;used.add(pick.index);}
 }
 const remaining=words.filter((_,index)=>!used.has(index)).join(' ');
 const nameWords=remaining.split(/\s+/).filter(Boolean);
 while(nameWords.length&&fillers.has(nameWords[0].toLowerCase()))nameWords.shift();
 while(nameWords.length&&fillers.has(nameWords[nameWords.length-1].toLowerCase()))nameWords.pop();
 const name=nameWords.join(' ').replace(/^[,.;:!-]+|[,.;:!]+$/g,'').trim();
 if(name.length>120)return {error:'empty'};
 // The owner's own currencies decide a shared symbol; a currency they do not use is asked about.
 const preferred=ctx.currencies??[];
 let resolved:string|undefined,currencyChoices:string[]|undefined;
 if(currency){const own=currency.filter(code=>preferred.includes(code));if(own.length===1)resolved=own[0];else currencyChoices=currency;}
 return {...(chosen.sign?{direction:chosen.sign==='+'?'income':'expense'}:{}),amount:chosen.value,...(resolved?{currency:resolved}:{}),...(currencyChoices?{currencyChoices}:{}),date:date??ctx.today,name,...(account_id?{account_id}:{})};
}
// Words that point at a built-in category, in English, Russian and Uzbek. A word matches a short stem exactly and a stem of
// five or more letters by its start, so Russian endings still match (продукты, аптеке) and "bus" never matches "business".
const keywordKinds:Array<[Entry['kind'],string[]]>=[
 ['Salary',['salary','payroll','paycheck','wage','зарплат','зп','аванс','оклад','maosh','oylik','ish haqi']],
 ['Rent income',['rent income','tenant','арендатор','ijarachi']],
 ['Other income',['income','bonus','refund','cashback','gift received','freelance','dividend','доход','бонус','возврат','кэшбэк','фриланс','дивиденд','premiya','daromad','bonus','qaytim']],
 ['Rent expense',['rent','аренд','квартплат','ijara','kvartira']],
 ['Charity',['charity','donation','donate','zakat','sadaqa','sadaka','благотвор','пожертв','садака','закят','xayriya','ehson']],
 ['Living expense',['coffee','lunch','dinner','breakfast','food','groceries','grocery','supermarket','restaurant','cafe','taxi','uber','bus','metro','fuel','gas','petrol','transport','pharmacy','medicine','internet','phone','electricity','water','utilities','clothes','haircut',
  'кофе','обед','ужин','завтрак','еда','продукт','супермаркет','ресторан','кафе','такси','автобус','метро','бензин','транспорт','аптек','лекарств','интернет','телефон','связь','свет','электричеств','вода','коммунал','одежд','стрижк',
  'qahva','kofe','tushlik','kechki ovqat','nonushta','ovqat','oziq','bozor','restoran','kafe','taksi','avtobus','benzin','transport','dorixona','dori','internet','telefon','svet','suv','kommunal','kiyim','soch']],
];
export type CategoryGuess={direction:Direction;kind:Entry['kind'];custom_category_id:string|null;business_id?:string;account_id?:string;source:'rule'|'history'|'category'|'keyword'|'default'};
const generalKind=(direction:Direction):Entry['kind']=>direction==='income'?'Other income':'Other expense';
/** The category for a typed entry: the owner's rules first, then their last record with the same name, then a category
 * named in the text, then a keyword table, then Other expense or Other income. A typed sign fixes the direction. */
export function guessCategory(entry:{name:string;amount:number;account_id?:string;direction?:Direction},ctx:{rules?:TransactionRule[];records:Entry[];categories:Category[];businesses?:Pick<Entry,'id'>[]}):CategoryGuess{
 const name=entry.name.trim(),lower=name.toLowerCase(),forced=entry.direction;
 const fits=(kind:Entry['kind'])=>{const direction=directionOf(kind);return !!direction&&(!forced||forced===direction);};
 // Business income always names a business, so a guess without one falls back to Other income.
 const usable=(kind:Entry['kind'],business?:string|null)=>kind!=='Business income'||(!!business&&!!ctx.businesses?.some(item=>item.id===business));
 if(name){
  // Rules: the newest matching rule wins, as when the server classifies imported transactions.
  const rules=[...(ctx.rules??[])].sort((a,b)=>(b.created_at??'').localeCompare(a.created_at??''));
  for(const rule of rules){
   const choice=ruleChoice(rule);if(!choice||!fits(choice.kind))continue;
   if(!ruleMatches(rule,{name,kind:generalKind(directionOf(choice.kind)!),frequency:'Once',amount:entry.amount,account_id:entry.account_id}))continue;
   const business=rule.business_id??undefined;
   if(!usable(choice.kind,business))continue;
   return {direction:directionOf(choice.kind)!,kind:choice.kind,custom_category_id:choice.category_id,...(business?{business_id:business}:{}),source:'rule'};
  }
  // The most recent one-time record with the same name.
  const past=ctx.records.filter(record=>record.frequency==='Once'&&record.name.trim().toLowerCase()===lower&&fits(record.kind)&&usable(record.kind,record.business_id))
   .sort((a,b)=>(b.date||'').localeCompare(a.date||''))[0];
  if(past)return {direction:directionOf(past.kind)!,kind:past.kind,custom_category_id:past.custom_category_id??null,...(past.business_id?{business_id:past.business_id}:{}),...(past.account_id?{account_id:past.account_id}:{}),source:'history'};
  // A category of the owner's own named in the text.
  const words=lower.split(/[\s\-–—]+/);
  const custom=ctx.categories.find(category=>(!forced||category.direction===forced)&&(category.name.trim().toLowerCase()===lower||words.includes(category.name.trim().toLowerCase())));
  if(custom)return {direction:custom.direction,kind:generalKind(custom.direction),custom_category_id:custom.id,source:'category'};
  for(const [kind,stems] of keywordKinds){
   if(!fits(kind))continue;
   if(stems.some(stem=>stem.includes(' ')?lower.includes(stem):words.some(word=>word===stem||(stem.length>=5&&word.startsWith(stem)))))return {direction:directionOf(kind)!,kind,custom_category_id:null,source:'keyword'};
  }
 }
 const direction=forced??'expense';
 return {direction,kind:generalKind(direction),custom_category_id:null,source:'default'};
}
/** Whether a kind is one of the built-in income or expense categories. */
export const isEntryKind=(kind:string)=>income.includes(kind)||expenses.includes(kind);
