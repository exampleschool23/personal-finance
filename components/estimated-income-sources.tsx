"use client";

import Link from 'next/link';
import { BriefcaseBusiness, ArrowDownLeft, Check, Clock3 } from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import { CategoryBadge } from '@/components/category-badge';
import { categoryColor } from '@/lib/category-colors';
import { formatMoney, formatMonthYear } from '@/lib/format';
import type { Entry } from '@/lib/finance';
import { monthlyIncomeCards } from '@/lib/monthly-income-cards';
import type { EarningSource } from '@/lib/earning-sources';
import type { CSSProperties } from 'react';

export function EstimatedIncomeSources({ entries, currency, month, earningSources = [] }: { entries: Entry[]; currency: string; month: string; earningSources?: EarningSource[] }) {
 const { t, locale } = useLanguage();
 const sources = monthlyIncomeCards(entries, month, earningSources);
 return <section className="panel income-estimates">
  <div className="panel-title"><div><h2>{t('Your monthly income sources')}</h2><p>{t('Salary, recurring income and asset estimates for {month}.', { month: formatMonthYear(month, locale) })}</p></div><Link href="/assets">{t('Assets & investments')}</Link></div>
  {sources.length ? <ul className="income-source-grid">{sources.map(({ entry, amount, excluded: isExcluded, received }) => {
   return <li key={entry.id} className={isExcluded ? 'income-source-card is-excluded' : 'income-source-card'} style={{ '--source-color': categoryColor(entry.kind) } as CSSProperties}>
    <span className={`income-receipt-indicator${received ? ' is-received' : ''}`} role="img" aria-label={t(received ? 'Income received this month' : 'No income received this month')} title={t(received ? 'Income received this month' : 'No income received this month')}>{received ? <Check size={16} strokeWidth={2.5} aria-hidden="true"/> : <Clock3 size={16} aria-hidden="true"/>}</span>
    <div className="income-source-heading"><span className="income-source-icon">{entry.kind === 'Salary' ? <BriefcaseBusiness size={20}/> : <ArrowDownLeft size={20}/>}</span><strong>{entry.name || t(entry.kind)}</strong><CategoryBadge kind={entry.kind} label={t(entry.kind)}/></div>
    <span className="income-source-amount">{formatMoney(amount, currency, locale)}</span>
   </li>;
  })}</ul> : <p className="muted">{t('No income is included for this month. Add a monthly salary or another income source below.')}</p>}
 </section>;
}
