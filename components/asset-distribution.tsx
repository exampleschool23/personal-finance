"use client";
import { useLanguage } from '@/components/language-provider';
import { assetDistribution } from '@/lib/asset-distribution';
import { formatMoney, formatNumber } from '@/lib/format';
import type { Entry } from '@/lib/finance';
const colors = ['#79ac43','#599ec7','#b695d1','#deaa52','#57aaa1','#da8092','#7f8bd0','#ab9976'];
export function AssetDistribution({ entries, currency }: { entries: Entry[]; currency: Entry['currency'] }) {
  const { t, locale } = useLanguage();
  const groups = assetDistribution(entries);
  const total = groups.reduce((sum, group) => sum + group.amount, 0);
  let offset = 0;
  const slices = groups.map((group, index) => {
    const start = offset;
    offset += group.amount / total * 100;
    return `${colors[index % colors.length]} ${start}% ${offset}%`;
  });
  return <section className="panel money-location"><div className="panel-title"><h2>{t('Where your money is')}</h2><span>{t('Grouped by name and category')}</span></div>{total > 0 ? <div className="money-location-body"><div className="money-donut" style={{ background: `conic-gradient(${slices.join(',')})` }} role="img" aria-label={t('Asset distribution. Amounts and percentages are listed alongside.')}><div className="money-donut-center"><span>{t('Total assets')}</span><strong>{formatMoney(total, currency, locale)}</strong></div></div><ul className="money-location-list">{groups.map((group, index) => <li key={group.kind + ':' + group.name}><i aria-hidden="true" style={{ background: colors[index % colors.length] }}/><div className="money-location-name"><strong>{group.name}</strong><small>{t(group.kind)}</small></div><div className="money-location-value"><strong>{formatMoney(group.amount, currency, locale)}</strong><small>{formatNumber(group.amount / total * 100, locale, 1)}%</small></div></li>)}</ul></div> : <div className="empty"><p>{t('Add an asset to see where your money is.')}</p></div>}</section>;
}
