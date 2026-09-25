"use client";

import { useLanguage } from '@/components/language-provider';
import { categoryColor } from '@/lib/category-colors';
import { formatNumber } from '@/lib/format';

/** A monthly budget-use line, not a fabricated spending history. */
export function ExpensePlanChart({ name, category, planned, spent }: {
 name: string; category: string; planned: number; spent: number;
}) {
 const { t, locale } = useLanguage();
 if (planned <= 0) return null;
 const used = spent / planned * 100;
 const label = t('{name} has used {percent}% of its budget.', { name, percent: formatNumber(used, locale, 1) });
 return <div className="expense-plan-usage" role="img" aria-label={label} title={label}>
  <div className="expense-plan-usage-label" aria-hidden="true"><strong className={used > 100 ? 'negative' : undefined}>{formatNumber(used, locale, 1)}%</strong></div>
  <div className="expense-plan-usage-track" aria-hidden="true"><span className="expense-plan-usage-fill" style={{ width: `${Math.min(100, Math.max(0, used))}%`, background: used > 100 ? 'var(--destructive)' : categoryColor(category) }}/></div>
 </div>;
}
