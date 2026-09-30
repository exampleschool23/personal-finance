// The morning Telegram digest: what is overdue and what falls due in the
// owner's reminder window, in their language. Pure; null when nothing is due.
import {income} from './finance';
import {formatDate,formatMoney} from './format';
import {locales,translate,type Language} from './i18n';
import type {DueItem} from './planning';
import {escapeHtml} from './telegram';
export function digestMessage(items:DueItem[],language:Language,today:string):string|null{
 if(!items.length)return null;
 const locale=locales[language],t=(key:string,params?:Record<string,string|number>)=>translate(language,key,params);
 const line=(item:DueItem)=>{
  const amount=formatMoney(item.record.amount,item.record.currency,locale);
  const kind=item.type==='repayment'?t('repayment'):item.type==='maturity'?t('deposit maturity'):income.includes(item.record.kind)?t('income'):null;
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
