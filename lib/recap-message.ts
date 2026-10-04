// The Sunday Telegram recap: what was saved, where the most went, and which
// goals moved forward. Pure. The share button carries no amounts, so what a
// friend sees is an invitation, not the owner's finances.
import {formatDate} from './format';
import type {Language} from './i18n';
import {escapeHtml,type TelegramMessage} from './telegram';
import {messageKit} from './telegram-kit';
export type RecapInput={
 name?:string;currency:string;from:string;to:string;
 income:number;spending:number;
 top:{label:string;amount:number}|null;
 goalsMoved:number;
 /** The app's address; without it the message has no share button. */
 shareOrigin:string|null;
};
export const shareLink=(origin:string,text:string)=>`https://t.me/share/url?url=${encodeURIComponent(origin)}&text=${encodeURIComponent(text)}`;
export function recapMessage(input:RecapInput,language:Language):Omit<TelegramMessage,'chat_id'>{
 const kit=messageKit(language),{locale,t}=kit;
 const money=(value:number)=>kit.money(value,input.currency),name=input.name?.trim();
 const title=`📊 <b>${name?t('Your week, {name}',{name:escapeHtml(name)}):t('Your week')}</b>\n${formatDate(input.from,locale)} – ${formatDate(input.to,locale)}`;
 if(!input.income&&!input.spending&&!input.goalsMoved)return {text:`${title}\n\n${t("A quiet week. Add this week's records to see your recap.")}`};
 const net=input.income-input.spending,lines=[`💰 ${net>=0?t('You saved {amount} this week.',{amount:money(net)}):t('You spent {amount} more than you earned this week.',{amount:money(-net)})}`];
 if(input.top)lines.push(`🏷 ${t('Top spending: {category} · {amount}',{category:escapeHtml(input.top.label),amount:money(input.top.amount)})}`);
 if(input.goalsMoved>0)lines.push(`🎯 ${t('Goals moved forward: {count}',{count:input.goalsMoved})}`);
 const text=`${title}\n\n${lines.join('\n')}`;
 return input.shareOrigin?{text,keyboard:{inline:[[{text:t('Share my week'),url:shareLink(input.shareOrigin,t('I check in on my money every week with Hoggish 💪'))}]]}}:{text};
}
