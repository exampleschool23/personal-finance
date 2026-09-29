"use client";
import { ArrowDownLeft, ArrowUpRight, Scale } from 'lucide-react';
import { StatTile, StatTiles } from '@/components/presentation-foundation/stat-tile';
import { signTone } from '@/components/presentation-foundation/tone';
import { useLanguage } from '@/components/language-provider';
import { formatMoney, formatNumber } from '@/lib/format';
import { financialTotals, type Entry } from '@/lib/finance';

export function DebtSummary({entries,currency}:{entries:Entry[];currency:string}) {
 const {t,locale}=useLanguage();
 const lent=entries.filter(entry=>entry.kind==='Money lent');
 const {receivable,totalDebt:payable,netLending}=financialTotals(entries);
 const count=(records:Entry[])=>formatNumber(records.reduce((sum,entry)=>sum+(entry.record_count??1),0),locale,0);
 return <StatTiles columns={3}>
  <StatTile label={t('Money owed to you')} icon={<ArrowDownLeft aria-hidden="true"/>} value={formatMoney(receivable,currency,locale)}><p>{t('{count} lending records',{count:count(lent)})}</p></StatTile>
  <StatTile label={t('Money you owe')} icon={<ArrowUpRight aria-hidden="true"/>} value={formatMoney(payable,currency,locale)}><p>{t('Mortgages, loans & other debts')}</p></StatTile>
  {/* A net borrowing position is not a success state, so only a shortfall is coloured. */}
  <StatTile label={t('Net lending position')} icon={<Scale aria-hidden="true"/>} value={formatMoney(netLending,currency,locale)} tone={signTone(netLending,true)}><p>{t('Money owed to you minus your outstanding debts.')}</p></StatTile>
 </StatTiles>;
}
