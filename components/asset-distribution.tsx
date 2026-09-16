"use client";
import { useLanguage } from '@/components/language-provider';
import { assetDistribution } from '@/lib/asset-distribution';
import { formatMoney, formatNumber } from '@/lib/format';
import { categoryColor } from '@/lib/category-colors';
import type { Entry } from '@/lib/finance';
export function AssetDistribution({ entries, currency }: { entries: Entry[]; currency: Entry['currency'] }) {
  const { t, locale } = useLanguage();
  const groups = assetDistribution(entries);
  const total = groups.reduce((sum, group) => sum + group.amount, 0);
  const categories = [...new Set(groups.map(group => group.kind))].map(kind => ({ kind, items: groups.filter(group => group.kind === kind), amount: groups.filter(group => group.kind === kind).reduce((sum, group) => sum + group.amount, 0) })).sort((a, b) => b.amount - a.amount);
  let offset = 0;
  const slices = categories.map(group => {
    const start = offset;
    offset += group.amount / total * 100;
    return `${categoryColor(group.kind)} ${start}% ${offset}%`;
  });
  return <section className="panel money-location"><div className="panel-title"><h2>{t('Where your money is')}</h2><span>{t('Grouped by name and category')}</span></div>{total > 0 ? <div className="money-location-body"><div className="money-donut" style={{ background: `conic-gradient(${slices.join(',')})` }} role="img" aria-label={t('Asset distribution. Amounts and percentages are listed alongside.')}><div className="money-donut-center"><span>{t('Total assets')}</span><strong>{formatMoney(total, currency, locale)}</strong></div></div><div className="money-category-list">{categories.map(category => <section className="money-category" key={category.kind}><header><h3><i aria-hidden="true" style={{ background: categoryColor(category.kind) }}/>{t(category.kind)}</h3><div className="money-location-value"><strong>{formatMoney(category.amount, currency, locale)}</strong><small>{formatNumber(category.amount / total * 100, locale, 1)}%</small></div></header><ul>{category.items.map(group => <li key={group.name}><span className="money-location-name">{group.name}</span><div className="money-location-value"><strong>{formatMoney(group.amount, currency, locale)}</strong><small>{formatNumber(group.amount / total * 100, locale, 1)}%</small></div></li>)}</ul></section>)}</div></div> : <div className="empty"><p>{t('Add an asset to see where your money is.')}</p></div>}</section>;
}
