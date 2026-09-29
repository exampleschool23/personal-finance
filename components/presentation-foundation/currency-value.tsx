"use client";
import { useLanguage } from '@/components/language-provider';
import { currencyLabel } from '@/lib/currencies';

export function CurrencyValue({ currency }: { currency: string }) {
 const { t, locale } = useLanguage();
 return <div className="currency-value"><span>{t('Currency')}</span><strong>{currencyLabel(currency, locale)}</strong></div>;
}
