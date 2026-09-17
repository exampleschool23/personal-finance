"use client";

import Link from 'next/link';
import { useLanguage } from '@/components/language-provider';
import { CategoryBadge } from '@/components/category-badge';
import { depositToday } from '@/lib/deposit-interest';
import { formatMoney, formatMonthYear } from '@/lib/format';
import type { Entry } from '@/lib/finance';

export function EstimatedIncomeSources({ entries, currency }: { entries: Entry[]; currency: string }) {
  const { t, locale } = useLanguage();
  if (!entries.length) return null;
  return <section className="panel income-estimates">
    <div className="panel-title"><div><h2>{t('Income from your assets')}</h2><p>{t('Monthly estimates included above. Update them in Assets & investments.')}</p></div><Link href="/assets">{t('Assets & investments')}</Link></div>
    <ul>{entries.map(entry => <li key={entry.id}>
      <div><strong>{entry.name}</strong><CategoryBadge kind={entry.kind} label={t(entry.kind)}/></div>
      <span>{formatMoney(entry.estimated_monthly_income ?? 0, currency, locale)}<small>{entry.kind === 'Deposit' ? t('Estimate for {month}', {month:formatMonthYear(depositToday().slice(0,7),locale)}) : t('Estimated per month')}</small></span>
    </li>)}</ul>
  </section>;
}
