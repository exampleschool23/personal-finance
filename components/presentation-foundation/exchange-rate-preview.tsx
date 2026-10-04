"use client";
import { useLanguage } from '@/components/language-provider';
import { formatDate,formatNumber } from '@/lib/format';
import { InlineError } from '@/components/presentation-foundation/inline-error';
import type { DatedExchangeRate } from '@/lib/dated-exchange-rate';

/** The shape `useDatedExchangeRate` returns; typed structurally so this stays a pure display piece. */
type ExchangeRateState={loading:boolean;error?:string;quote?:DatedExchangeRate;retry:()=>void};

export function ExchangeRatePreview({fx}:{fx:ExchangeRateState}){
 const {t,locale}=useLanguage();
 if(fx.loading)return <p className="muted" role="status">{t('Loading exchange rate for the selected date…')}</p>;
 if(fx.error)return <InlineError message={t(fx.error)} onRetry={fx.retry}/>;
 if(!fx.quote)return null;
 return <p className="muted">{t('Exchange rate: {unit} {from} = {rate} {to} · {source} · effective {date}',{source:fx.quote.source,unit:formatNumber(1,locale),from:fx.quote.from,to:fx.quote.to,rate:formatNumber(fx.quote.rate,locale,8),date:formatDate(fx.quote.effective_date,locale)})}</p>;
}
