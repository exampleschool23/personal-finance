"use client";
import { StatTile, StatTiles } from '@/components/presentation-foundation/stat-tile';
import { liabilityTone, signTone } from '@/components/presentation-foundation/tone';
import { useLanguage } from '@/components/language-provider';
import { formatMoney, formatNumber } from '@/lib/format';
import { financialTotals, type Entry } from '@/lib/finance';

export function DebtSummary({entries,currency}:{entries:Entry[];currency:string}) {
 const {t,locale}=useLanguage();
 const lent=entries.filter(entry=>entry.kind==='Money lent');
 const {receivable,totalDebt:payable,netLending}=financialTotals(entries);
 const lentCount=lent.reduce((sum,entry)=>sum+(entry.record_count??1),0);
 return <StatTiles columns={3}>
  <StatTile label={t('Money owed to you')} value={formatMoney(receivable,currency,locale)}><p>{t(lentCount===1?'1 lending record':'{count} lending records',{count:formatNumber(lentCount,locale,0)})}</p></StatTile>
  <StatTile label={t('Money you owe')} value={formatMoney(payable,currency,locale)} tone={liabilityTone(payable)}></StatTile>
  {/* A net borrowing position is not a success state, so only a shortfall is coloured. */}
  <StatTile label={t('Net lending position')} value={formatMoney(netLending,currency,locale)} tone={signTone(netLending,true)}></StatTile>
 </StatTiles>;
}
