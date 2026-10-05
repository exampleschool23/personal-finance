"use client";
import { useLanguage } from '@/components/language-provider';
import { BusinessFilter, type BusinessOption } from '@/components/presentation-foundation/business-filter';
import { DatePicker } from '@/components/presentation-foundation/date-picker';
import { OwnerFilter, type OwnerOption } from '@/components/presentation-foundation/owner-filter';
import { NativeSelect } from '@/components/ui/native-select';
import { rangeMonths, reportRangeLabels, reportRanges, type ReportRange, type ReportRangePreset } from '@/lib/business-report';

export type RangeChoice = ReportRangePreset | 'custom';

/** The Reports bar's filters: businesses, owners (in a shared household) and the date range. */
export function ReportFilters({ businesses, business, onBusiness, owners, owner, onOwner, preset, onPreset }: { businesses: readonly BusinessOption[]; business: string[]; onBusiness: (value: string[]) => void; owners: readonly OwnerOption[]; owner: string[]; onOwner: (value: string[]) => void; preset: RangeChoice; onPreset: (preset: RangeChoice) => void }) {
 const { t } = useLanguage();
 return <>
  {businesses.length > 0 && <BusinessFilter businesses={businesses} value={business} onChange={onBusiness}/>}
  {owners.length > 0 && <OwnerFilter owners={owners} value={owner} onChange={onOwner}/>}
  <NativeSelect aria-label={t('Date range')} value={preset} onChange={event => onPreset(event.currentTarget.value as RangeChoice)}>
   {reportRanges.map(item => <option key={item} value={item}>{t(reportRangeLabels[item])}</option>)}
   <option value="custom">{t('Custom range')}</option>
  </NativeSelect>
 </>;
}

/** A custom range: from and to, never past today; reports read at most 24 months of it. */
export function CustomRange({ range, today, onChange }: { range: ReportRange; today: string; onChange: (range: ReportRange) => void }) {
 const { t } = useLanguage();
 return <div className="transactions-tools report-custom-range">
  <DatePicker value={range.from} max={range.to} onChange={from => from && onChange({ ...range, from })}/>
  <DatePicker value={range.to} min={range.from} max={today} onChange={to => to && onChange({ ...range, to })}/>
  {rangeMonths(range).length > 24 && <span className="bulk-bar-note">{t('Reports cover up to 24 months.')}</span>}
 </div>;
}
