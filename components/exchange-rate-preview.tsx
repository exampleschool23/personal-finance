"use client";
import { useLanguage } from '@/components/language-provider';
import { formatDate,formatNumber } from '@/lib/format';
import { Button } from '@/components/ui/button';
import type { useDatedExchangeRate } from '@/hooks/use-dated-exchange-rate';
export function ExchangeRatePreview({fx}:{fx:ReturnType<typeof useDatedExchangeRate>}){
 const {t,locale}=useLanguage();
 if(fx.loading)return <p className="muted">{t('Loading exchange rate for the selected date…')}</p>;
 if(fx.error)return <p className="error" role="alert">{t(fx.error)} <Button type="button" variant="outline" size="sm" onClick={fx.retry}>{t('Retry')}</Button></p>;
 if(!fx.quote)return null;
 return <p className="muted">{t('Exchange rate: {unit} {from} = {rate} {to} · CBU · effective {date}',{unit:formatNumber(1,locale),from:fx.quote.from,to:fx.quote.to,rate:formatNumber(fx.quote.rate,locale,8),date:formatDate(fx.quote.effective_date,locale)})}</p>;
}
