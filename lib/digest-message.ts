// The morning Telegram digest, in the owner's language: a greeting with one
// line of encouragement, what is overdue or due soon, how net worth moved
// yesterday, and spending against the week before. Pure.
import {income} from './finance';
import {formatDate,formatMoney} from './format';
import {locales,translate,type Language} from './i18n';
import type {DueItem} from './planning';
import {escapeHtml} from './telegram';
const motivation=['Small steps add up to big results.','A clear view of your money is the first step to calm.','Every record you add makes tomorrow easier to plan.','Progress beats perfection. Keep going.'];
export type DigestExtras={
 name?:string;currency?:string;
 /** Net worth in `currency` and its change over the latest day, when two snapshots exist. */
 netWorth?:{amount:number;change:number|null};
 /** Spending over the last seven days and over the seven before. */
 spending?:{current:number;previous:number};
};
/** The overdue and upcoming payments, grouped by day; null when there are none. Also the bot's Upcoming payments answer. */
export function paymentsSection(items:DueItem[],language:Language,today:string):string|null{
 if(!items.length)return null;
 const locale=locales[language],t=(key:string,params?:Record<string,string|number>)=>translate(language,key,params);
 const line=(item:DueItem)=>{
  const amount=formatMoney(item.amount,item.record.currency,locale);
  const kind=item.type==='repayment'||item.type==='installment'?t('repayment'):item.type==='maturity'?t(item.record.kind==='Treasury bill'?'Treasury bill maturity':'deposit maturity'):income.includes(item.record.kind)?t('income'):null;
  return `• ${escapeHtml(item.record.name)} · ${income.includes(item.record.kind)?'+':''}${amount}${kind?' · '+kind:''}`;
 };
 const sections:string[]=[];
 const overdue=items.filter(item=>item.overdue);
 if(overdue.length)sections.push(`<b>${t('Overdue')}</b>\n${overdue.map(item=>`${line(item)} · ${formatDate(item.date,locale)}`).join('\n')}`);
 const byDay=new Map<string,DueItem[]>();
 for(const item of items.filter(item=>!item.overdue))byDay.set(item.date,[...(byDay.get(item.date)??[]),item]);
 for(const [date,dayItems] of byDay)sections.push(`<b>${date===today?t('Today'):formatDate(date,locale)}</b>\n${dayItems.map(line).join('\n')}`);
 return `<b>${t('Upcoming payments')}</b> · ${formatDate(today,locale)}\n\n${sections.join('\n\n')}`;
}
export function digestMessage(items:DueItem[],language:Language,today:string,extras:DigestExtras={}):string{
 const locale=locales[language],t=(key:string,params?:Record<string,string|number>)=>translate(language,key,params);
 const currency=extras.currency??'USD',money=(value:number)=>formatMoney(value,currency,locale);
 const signed=(value:number)=>(value<0?'−':'+')+money(Math.abs(value));
 const name=extras.name?.trim();
 const greeting=`☀️ <b>${name?t('Good morning, {name}',{name:escapeHtml(name)}):t('Good morning')}</b>\n<i>${t(motivation[Math.floor(Date.parse(today)/86400000)%motivation.length])}</i>`;
 const payments=paymentsSection(items,language,today)??t('Nothing is due soon.');
 const facts:string[]=[];
 if(extras.netWorth){
  const {amount,change}=extras.netWorth;
  facts.push(`📈 ${t('Net worth')}: ${money(amount)}${change!==null&&Math.round(change)!==0?' · '+t('{change} since yesterday',{change:signed(change)}):''}`);
 }
 if(extras.spending){
  const {current,previous}=extras.spending,difference=Math.abs(current-previous);
  // Spending is not good or bad news, so the comparison is stated plainly either way.
  if(current>0||previous>0)facts.push(`🧾 ${Math.round(difference)===0||previous<=0?t('Last 7 days you spent {amount}.',{amount:money(current)}):t(current<previous?'Last 7 days you spent {amount}, {change} less than the week before.':'Last 7 days you spent {amount}, {change} more than the week before.',{amount:money(current),change:money(difference)})}`);
 }
 return [greeting,payments,facts.join('\n')].filter(Boolean).join('\n\n');
}
