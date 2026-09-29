"use client";
import { useLanguage } from '@/components/language-provider';
import { formatNumber } from '@/lib/format';

/** The number of items behind a heading or destination, as a pill; a dash while the count is still loading. */
export function Count({ value, loading = false }: { value: number; loading?: boolean }) {
 const { locale } = useLanguage();
 return <span className="count">{loading ? '—' : formatNumber(value, locale, 0)}</span>;
}
