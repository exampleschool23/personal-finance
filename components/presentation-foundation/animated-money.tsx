"use client";
import { useLanguage } from '@/components/language-provider';
import { RollingText } from '@/components/presentation-foundation/rolling-text';
import { formatMoney } from '@/lib/format';

/** A money figure whose digits roll into place like an odometer, and roll up or down when the amount changes. */
export function AnimatedMoney({ value, currency }: { value: number; currency: string }) {
 const { locale } = useLanguage();
 return <RollingText text={formatMoney(value, currency, locale)}/>;
}
