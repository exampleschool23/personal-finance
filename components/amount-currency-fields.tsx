"use client";
import { useLanguage } from '@/components/language-provider';
import { FormattedNumberInput } from '@/components/formatted-number-input';
import { CurrencySelect } from '@/components/currency-select';

type Props={amount:number;currency:string;currencies:string[];savedCurrency?:string;disabled?:boolean;label?:string;currencyLocked?:boolean;onAmountChange:(amount:number)=>void;onCurrencyChange:(currency:string)=>void};

export function AmountCurrencyFields({amount,currency,currencies,savedCurrency,disabled,label,currencyLocked=false,onAmountChange,onCurrencyChange}:Props){
 const {t}=useLanguage();
 return <div className="form-grid amount-currency-row"><label className="amount-value-field">{label??t('Amount')}{currencyLocked?` · ${currency}`:''}<FormattedNumberInput value={amount} max={1e15} onValueChange={onAmountChange}/></label>{!currencyLocked&&<CurrencySelect value={currency} currencies={currencies} savedCurrency={savedCurrency} disabled={disabled} onChange={onCurrencyChange}/>}</div>;
}
