"use client";
import { useLanguage } from '@/components/language-provider';
import type { Entry } from '@/lib/finance';
export function CashInvestmentOption({record,onChange,disabled=false}:{record:Entry;onChange?:(enabled:boolean)=>void;disabled?:boolean}){
 const {t}=useLanguage();
 return <div><label className="cash-investment-option"><input type="checkbox" checked={record.is_investment===true} disabled={disabled||!onChange} onChange={event=>onChange?.(event.target.checked)}/><span>{t('Include in investments')}</span></label><p className="muted">{t('This choice is fixed when the account is created. Cash always counts toward net worth.')}</p></div>;
}
