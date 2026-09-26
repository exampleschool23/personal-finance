"use client";
import { ArrowDownLeft, ArrowUpRight, Scale } from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import { formatMoney, formatNumber } from '@/lib/format';
import { financialTotals, type Entry } from '@/lib/finance';

export function DebtSummary({entries,currency}:{entries:Entry[];currency:string}) {
 const {t,locale}=useLanguage();
 const lent=entries.filter(entry=>entry.kind==='Money lent');
 const {receivable,totalDebt:payable,netLending}=financialTotals(entries);
 const count=(records:Entry[])=>formatNumber(records.reduce((sum,entry)=>sum+(entry.record_count??1),0),locale,0);
 return <div className="metrics debt-metrics">
  <article><p>{t('Money owed to you')}<ArrowDownLeft size={19}/></p><h2>{formatMoney(receivable,currency,locale)}</h2><small>{t('{count} lending records',{count:count(lent)})}</small></article>
  <article><p>{t('Money you owe')}<ArrowUpRight size={19}/></p><h2>{formatMoney(payable,currency,locale)}</h2><small>{t('Mortgages, loans & other debts')}</small></article>
  <article className={netLending<0?'negative':undefined}><p>{t('Net lending position')}<Scale size={19}/></p><h2>{formatMoney(netLending,currency,locale)}</h2><small>{t('Money owed to you minus your outstanding debts.')}</small></article>
 </div>;
}
