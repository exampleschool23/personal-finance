"use client";
import { useLanguage } from '@/components/language-provider';
import { NativeSelect } from '@/components/ui/native-select';
import { currencyLabel } from '@/lib/currencies';

export function CurrencySelect({value,currencies,savedCurrency,disabled,onChange}:{value:string;currencies:string[];savedCurrency?:string;disabled?:boolean;onChange:(currency:string)=>void}){
 const {t,locale}=useLanguage();
 const options=[...new Set([...currencies,...(savedCurrency?[savedCurrency]:[])])];
 return <label>{t('Currency')}<NativeSelect value={value} disabled={disabled} onChange={event=>onChange(event.target.value)}>{options.map(code=><option key={code} value={code}>{currencyLabel(code,locale)}</option>)}</NativeSelect></label>;
}
