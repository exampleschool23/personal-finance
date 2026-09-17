"use client";

import Link from 'next/link';
import { BriefcaseBusiness, ArrowDownLeft, ChevronDown } from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import { CategoryBadge } from '@/components/category-badge';
import { categoryColor } from '@/lib/category-colors';
import { formatMoney, formatMonthYear } from '@/lib/format';
import { income, monthly, duplicatesBusinessEstimate, type Entry } from '@/lib/finance';
import type { CSSProperties } from 'react';

export function EstimatedIncomeSources({ entries, currency, month }: { entries: Entry[]; currency: string; month: string }) {
 const { t, locale } = useLanguage();
 const assets = entries.filter(entry => ['Business','Property','Deposit'].includes(entry.kind) && (entry.estimated_monthly_income ?? 0) > 0);
 const businessIds = new Set(assets.filter(entry => entry.kind === 'Business').map(entry => entry.id));
 const recurring = entries.filter(entry => income.includes(entry.kind));
 const included = recurring.filter(entry => monthly(entry, month) > 0 && !duplicatesBusinessEstimate(entry, businessIds));
 const excluded = recurring.filter(entry => !included.includes(entry));
 const sources = [...included.map(entry => ({ entry, amount: monthly(entry, month), asset: false })), ...assets.map(entry => ({ entry, amount: entry.estimated_monthly_income ?? 0, asset: true }))].sort((a,b) => (Number(b.entry.kind === 'Salary') - Number(a.entry.kind === 'Salary')) || b.amount - a.amount);
 return <section className="panel income-estimates">
  <div className="panel-title"><div><h2>{t('Your monthly income sources')}</h2><p>{t('Salary, recurring income and asset estimates for {month}.', { month: formatMonthYear(month, locale) })}</p></div><Link href="/assets">{t('Assets & investments')}</Link></div>
  {sources.length ? <ul className="income-source-grid">{sources.map(({ entry, amount, asset }) => <li key={entry.id} style={{ '--source-color': categoryColor(entry.kind) } as CSSProperties}><div><span className="income-source-icon">{entry.kind === 'Salary' ? <BriefcaseBusiness size={20}/> : <ArrowDownLeft size={20}/>}</span><strong>{entry.name || t(entry.kind)}</strong><CategoryBadge kind={entry.kind} label={t(entry.kind)}/></div><span>{formatMoney(amount, currency, locale)}<small>{t(asset ? 'Estimated per month' : 'Included in monthly income')}</small></span></li>)}</ul> : <p className="muted">{t('No income is included for this month. Add a monthly salary or another income source below.')}</p>}
  {!!excluded.length && <details className="excluded-income" open={excluded.some(entry=>entry.kind==='Salary')}><summary>{t('Income not included this month')}<ChevronDown size={16}/></summary><ul>{excluded.map(entry => <li key={entry.id}><div><strong>{entry.name || t(entry.kind)}</strong><CategoryBadge kind={entry.kind} label={t(entry.kind)}/></div><span>{t(entry.frequency === 'Once' ? 'One-time entry. Choose Every month to include a recurring salary.' : duplicatesBusinessEstimate(entry,businessIds) ? 'Already included in the business estimate.' : 'Outside its start and end dates for this month.')}</span></li>)}</ul><a href="#workspace-records">{t('Review income records')}</a></details>}
 </section>;
}
