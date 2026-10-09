// The morning Telegram digest, in the owner's language: a greeting with one
// line of encouragement, what is overdue or due soon, how net worth moved
// yesterday, and spending against the week before. Pure.
import {income} from './finance';
import {formatDate,formatNumber} from './format';
import type {Language} from './i18n';
import type {DueItem} from './planning';
import {escapeHtml} from './telegram';
import {messageKit} from './telegram-kit';
const motivation=['Small steps add up to big results.','A clear view of your money is the first step to calm.','Every record you add makes tomorrow easier to plan.','Progress beats perfection. Keep going.'];
export type DigestExtras={
 name?:string;currency?:string;
 /** Net worth in `currency` and its change over the latest day, when two snapshots exist. */
 netWorth?:{amount:number;change:number|null};
 /** Spending over the last seven days and over the seven before; `missing` when an amount had no rate, so neither figure is complete. */
 spending?:{current:number;previous:number;missing?:boolean};
};
/** Characters of payment lines one message can hold beside the digest's greeting and figures. */
const paymentsSectionBudget=3200;
const overdueShown=10;
/** The overdue and upcoming payments, grouped by day; null when there are none. Also the bot's Upcoming payments answer. */
export function paymentsSection(items:DueItem[],language:Language,today:string):string|null{
 if(!items.length)return null;
 const {locale,t,money}=messageKit(language);
 const line=(item:DueItem)=>{
  const amount=money(item.amount,item.record.currency);
  const kind=item.type==='repayment'||item.type==='installment'?t('repayment'):item.type==='maturity'?t(item.record.kind==='Treasury bill'?'Treasury bill maturity':item.record.kind==='Bond'?'bond maturity':'deposit maturity'):income.includes(item.record.kind)?t('income'):null;
  return `• ${escapeHtml(item.record.name)} · ${income.includes(item.record.kind)?'+':''}${amount}${kind?' · '+kind:''}`;
 };
 const groups:{title:string;lines:string[]}[]=[];
 const overdue=items.filter(item=>item.overdue);
 // The most recent ten overdue items, newest first, so a long backlog never hides what is due next.
 if(overdue.length)groups.push({title:t('Overdue'),lines:[...overdue].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,overdueShown).map(item=>`${line(item)} · ${formatDate(item.date,locale)}`)});
 const byDay=new Map<string,DueItem[]>();
 for(const item of items.filter(item=>!item.overdue))byDay.set(item.date,[...(byDay.get(item.date)??[]),item]);
 for(const [date,dayItems] of byDay)groups.push({title:date===today?t('Today'):formatDate(date,locale),lines:dayItems.map(line)});
 // Telegram refuses messages over 4,096 characters, so a long list stops early and says how many items are left.
 const sections:string[]=[];let length=0,shown=0;
 for(const group of groups){
  const lines:string[]=[];
  for(const text of group.lines){if(length+text.length+group.title.length>paymentsSectionBudget)break;lines.push(text);length+=text.length+1;shown++;}
  if(!lines.length)break;
  sections.push(`<b>${group.title}</b>\n${lines.join('\n')}`);length+=group.title.length+2;
 }
 const hidden=items.length-shown;
 return `<b>${t('Upcoming payments')}</b> · ${formatDate(today,locale)}\n\n${sections.join('\n\n')}${hidden?`\n• ${t('{count} more',{count:formatNumber(hidden,locale,0)})}`:''}`;
}
export function digestMessage(items:DueItem[],language:Language,today:string,extras:DigestExtras={}):string{
 const kit=messageKit(language),{t}=kit;
 const currency=extras.currency??'USD',money=(value:number)=>kit.money(value,currency);
 const signed=(value:number)=>(value<0?'−':'+')+money(Math.abs(value));
 const name=extras.name?.trim();
 const greeting=`☀️ <b>${name?t('Good morning, {name}',{name:escapeHtml(name)}):t('Good morning')}</b>\n<i>${t(motivation[Math.floor(Date.parse(today)/86400000)%motivation.length])}</i>`;
 const payments=paymentsSection(items,language,today)??t('Nothing is due soon.');
 const facts:string[]=[];
 if(extras.netWorth){
  const {amount,change}=extras.netWorth;
  facts.push(`📈 ${t('Net worth')}: ${money(amount)}${change!==null&&Math.round(change)!==0?' · '+t('{change} since yesterday',{change:signed(change)}):''}`);
 }
 // An incomplete total is never shown as if it were the whole week.
 if(extras.spending?.missing)facts.push(`🧾 ${t('Spending')}: ${t('Exchange rate unavailable.')}`);
 else if(extras.spending){
  const {current,previous}=extras.spending,difference=Math.abs(current-previous);
  // Spending is not good or bad news, so the comparison is stated plainly either way.
  if(current>0||previous>0)facts.push(`🧾 ${Math.round(difference)===0||previous<=0?t('Last 7 days you spent {amount}.',{amount:money(current)}):t(current<previous?'Last 7 days you spent {amount}, {change} less than the week before.':'Last 7 days you spent {amount}, {change} more than the week before.',{amount:money(current),change:money(difference)})}`);
 }
 return [greeting,payments,facts.join('\n')].filter(Boolean).join('\n\n');
}
