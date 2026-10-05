"use client";
import type { ReportNames } from '@/components/business-reports';
import type { Attribute, Drill, Interval, LedgerLine, ReportRange } from '@/lib/business-report';

export const intervalLabels: Record<Interval, string> = { month: 'Monthly', quarter: 'Quarterly', year: 'Yearly' };
export const attributeLabels: Record<Attribute, string> = { category: 'Category', group: 'Group', merchant: 'Merchant', business: 'Business' };

export type TabProps = { lines: LedgerLine[]; range: ReportRange; rangeLabel: string; names: ReportNames; groupOf: (key: string) => string; currency: string; onDrill: (drill: Drill) => void };
