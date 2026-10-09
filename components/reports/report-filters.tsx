"use client";
import { useLanguage } from '@/components/language-provider';
import { BusinessFilter, type BusinessOption } from '@/components/presentation-foundation/business-filter';
import { DateRangePicker } from '@/components/presentation-foundation/date-range-picker';
import { OwnerFilter, type OwnerOption } from '@/components/presentation-foundation/owner-filter';
import { reportRangeLabels, reportRanges, type ReportRange, type ReportRangePreset } from '@/lib/business-report';

export type RangeChoice = ReportRangePreset | 'custom';

/** The Reports bar's filters: businesses, owners (in a shared household) and the date range, presets beside the calendar. */
export function ReportFilters({ businesses, business, onBusiness, owners, owner, onOwner, preset, range, today, onPreset, onRange }: { businesses: readonly BusinessOption[]; business: string[]; onBusiness: (value: string[]) => void; owners: readonly OwnerOption[]; owner: string[]; onOwner: (value: string[]) => void; preset: RangeChoice; range: ReportRange; today: string; onPreset: (preset: ReportRangePreset) => void; onRange: (range: ReportRange) => void }) {
 const { t } = useLanguage();
 return <>
  {businesses.length > 0 && <BusinessFilter businesses={businesses} value={business} onChange={onBusiness}/>}
  {owners.length > 0 && <OwnerFilter owners={owners} value={owner} onChange={onOwner}/>}
  <DateRangePicker label={t('Date range')} presets={reportRanges} presetLabels={reportRangeLabels} preset={preset} range={range} max={today} onPreset={onPreset} onRange={onRange}/>
 </>;
}
