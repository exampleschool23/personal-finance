"use client";
import { investmentPeriodTotals } from '@/lib/investment-period';
import type { InvestmentPortfolioInput } from '@/lib/investment-portfolio';
import { useLanguage } from '@/components/language-provider';
import { formatMoney } from '@/lib/format';
export function InvestmentPeriodSummary({input,start}:{input:InvestmentPortfolioInput;start:string}){
 const {t,locale}=useLanguage();
 const totals=investmentPeriodTotals(input,start);
 return <div><div className="portfolio-headline">{([['invested','Money invested'],['expenses','Expenses paid'],['income','Overall income received']] as const).map(([key,label])=><div key={key}><span>{t(label)}</span><strong>{totals.missing.length?'—':formatMoney(totals[key],input.currency,locale)}</strong></div>)}</div>{!!totals.missing.length&&<p className="muted">{t('Some investment balances or exchange rates are missing.')}</p>}</div>;
}
