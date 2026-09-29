"use client";
import { useLanguage } from '@/components/language-provider';
import { NativeSelect } from '@/components/ui/native-select';
import { currencyLabel } from '@/lib/currencies';

export function CurrencySelect({value,currencies,savedCurrency,disabled,onChange}:{value:string;currencies:string[];savedCurrency?:string;disabled?:boolean;onChange:(currency:string)=>void}){
 const {t,locale}=useLanguage();
 // Keep the record's own currency selectable even when it is no longer preferred.
 const options=[...new Set([...currencies,...(savedCurrency?[savedCurrency]:[]),value])];
 return <label>{t('Currency')}<NativeSelect value={value} disabled={disabled} onChange={event=>onChange(event.target.value)}>{options.map(code=><option key={code} value={code}>{currencyLabel(code,locale)}</option>)}</NativeSelect></label>;
}
