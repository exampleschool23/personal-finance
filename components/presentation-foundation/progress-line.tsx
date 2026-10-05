"use client";
import { useLanguage } from '@/components/language-provider';
import { formatPercent } from '@/lib/format';

/** How far a figure is towards its target: the share above a thin line. Spending past its plan turns red; income past its estimate stays green. */
export function ProgressLine({ value, target, tone, label }: { value: number; target: number; tone: 'income' | 'expense'; label?: string }) {
 const { locale } = useLanguage();
 const share = target > 0 ? value / target * 100 : 0;
 const percent = formatPercent(share, locale, 0);
 return <span className="progress-line" data-tone={tone} data-over={tone === 'expense' && value > target || undefined}>
  <small>{label ? `${label} · ${percent}` : percent}</small>
  <span className="progress-track"><span style={{ width: `${Math.min(Math.max(share, 0), 100)}%` }}/></span>
 </span>;
}
