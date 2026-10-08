"use client";
import { useState } from 'react';
import { attributeColor, BreakdownDonut, TrendChart } from '@/components/business-reports';
import { useCategoryHue } from '@/components/category-icons-context';
import { ShareBars } from '@/components/cash-flow-report';
import { useLanguage } from '@/components/language-provider';
import { PanelTitle } from '@/components/presentation-foundation/panel-title';
import { Segmented } from '@/components/presentation-foundation/segmented';
import { StatTile, StatTiles } from '@/components/presentation-foundation/stat-tile';
import { HOUSEHOLD } from '@/lib/business';
import { attributeTrend, businessKey, intervals, sharesBy, type Attribute, type Direction, type Drill, type Interval, type LedgerLine } from '@/lib/business-report';
import { rankColor } from '@/lib/category-colors';
import { formatMoney, formatNumber } from '@/lib/format';
import { attributeLabels, intervalLabels, type TabProps } from './report-labels';

/** Spending or income: the total, a breakdown by category, group, merchant or business (bars or a donut), and trends. */
export function AttributeTab({ direction, lines, range, rangeLabel, names, groupOf, hasBusinesses, currency, onDrill }: TabProps & { direction: Direction; hasBusinesses: boolean }) {
 const { t, locale } = useLanguage();
 const categoryHue = useCategoryHue();
 const [mode, setMode] = useState<'breakdown' | 'trends'>('breakdown');
 const [attribute, setAttribute] = useState<Attribute>('category');
 const [visual, setVisual] = useState<'bars' | 'donut'>('donut');
 const [stacked, setStacked] = useState(true), [interval, setInterval] = useState<Interval>('month');
 const keyOf = (line: LedgerLine) => attribute === 'category' ? line.category : attribute === 'group' ? groupOf(line.category) : attribute === 'merchant' ? line.name : businessKey(line);
 const label = (key: string) => attribute === 'category' ? names.category(key) : attribute === 'group' ? names.group(key) : attribute === 'merchant' ? key : names.business(key);
 const items = sharesBy(lines, keyOf);
 // Merchants have no colour of their own, so each takes one by its place in the breakdown.
 const rank = new Map(items.map((item, index) => [item.key, index]));
 const color = (key: string) => key === 'other' ? 'var(--muted-foreground)' : attribute === 'merchant' ? rankColor(rank.get(key) ?? 0) : attributeColor(attribute, key, names, categoryHue);
 const drillOf = (key: string): Drill => attribute === 'category' ? { direction, category: key } : attribute === 'merchant' ? { direction, merchant: key } : attribute === 'business' ? { direction, business: key === HOUSEHOLD ? null : key } : { direction, categories: [...new Set(lines.filter(line => groupOf(line.category) === key).map(line => line.category))] };
 const trend = attributeTrend(lines, range, interval, keyOf);
 const total = lines.reduce((sum, line) => sum + line.amount, 0);
 const attributes = (['category', 'group', 'merchant', ...(hasBusinesses ? ['business'] : [])] as Attribute[]);
 return <>
  <StatTiles columns="auto" label={t(direction === 'expense' ? 'Spending' : 'Income')}>
   <StatTile label={t(direction === 'expense' ? 'Total spending' : 'Total income')} value={formatMoney(total, currency, locale)} tone={direction === 'income' && total > 0 ? 'positive' : undefined}/>
   <StatTile label={t('Transactions')} value={formatNumber(lines.length, locale, 0)}/>
  </StatTiles>
  <section className="panel">
   <PanelTitle title={<>{t(mode === 'breakdown' ? 'Breakdown' : 'Trends')} <span className="panel-figure">{rangeLabel}</span></>}>
    <div className="cash-flow-switches">
     <Segmented label={t('Report view')} options={[{ value: 'breakdown', label: t('Breakdown') }, { value: 'trends', label: t('Trends') }] as const} value={mode} onChange={setMode}/>
     <Segmented label={t('Group by')} options={attributes.map(value => ({ value, label: t(attributeLabels[value]) }))} value={attribute} onChange={setAttribute}/>
     {mode === 'breakdown' ? <Segmented label={t('Chart type')} options={[{ value: 'bars', label: t('Bars') }, { value: 'donut', label: t('Donut') }] as const} value={visual} onChange={setVisual}/>
      : <><Segmented label={t('Chart type')} options={[{ value: 'grouped', label: t('Grouped') }, { value: 'stacked', label: t('Stacked') }] as const} value={stacked ? 'stacked' : 'grouped'} onChange={value => setStacked(value === 'stacked')}/>
       <Segmented label={t('Interval')} options={intervals.map(value => ({ value, label: t(intervalLabels[value]) }))} value={interval} onChange={setInterval}/></>}
    </div>
   </PanelTitle>
   {mode === 'trends' ? <TrendChart key={attribute + interval} rows={trend.rows} interval={interval} currency={currency} stacked={stacked} series={trend.keys.map(key => ({ key, label: key === 'other' ? t('Other') : label(key), color: color(key) }))}/>
    : visual === 'donut' ? <BreakdownDonut items={items} label={label} colorOf={color} currency={currency} onSelect={key => onDrill(drillOf(key))}/>
    : <ShareBars items={items} label={label} colorKey={color} currency={currency} onSelect={key => onDrill(drillOf(key))}/>}
  </section>
 </>;
}
