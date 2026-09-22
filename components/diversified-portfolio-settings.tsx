"use client";
import { useLanguage } from '@/components/language-provider';
import { FormattedNumberInput } from '@/components/formatted-number-input';
import { InstrumentPicker } from '@/components/instrument-picker';
import { instrumentFor } from '@/lib/market';
import { formatNumber } from '@/lib/format';
import { allocationKinds, type DiversifiedPortfolio } from '@/lib/diversified-portfolio';

export function DiversifiedPortfolioSettings({value,onChange}:{value:DiversifiedPortfolio;onChange:(value:DiversifiedPortfolio)=>void}) {
 const {t,locale}=useLanguage();
 const labels={crypto:'Crypto',stock:'Stock',deposit:'Deposit',business:'Business',cash:'Cash'};
 const total=allocationKinds.reduce((sum,key)=>sum+value[key],0);
 return <fieldset className="diversified-settings"><legend>{t('Diversified portfolio')}</legend>
  <p className="muted">{t('Split each contribution across these investments. Weights must total {target}%. Holdings are not automatically rebalanced.',{target:formatNumber(100,locale)})}</p>
  <div className="diversified-grid">{allocationKinds.map(key=><div className="diversified-sleeve" key={key}>
   <label>{t(labels[key])} · {t('Allocation')} (%)<FormattedNumberInput value={value[key]} max={100} required={false} onValueChange={amount=>onChange({...value,[key]:amount})}/></label>
   {(key==='crypto'||key==='stock')&&<InstrumentPicker kind={key==='crypto'?'Crypto':'Stock'} value={key==='crypto'?value.cryptoSymbol:value.stockSymbol} onChange={name=>{const symbol=instrumentFor({kind:key==='crypto'?'Crypto':'Stock',name})?.symbol;if(symbol)onChange({...value,[key==='crypto'?'cryptoSymbol':'stockSymbol']:symbol});}}/>}
   {key==='stock'&&<p className="muted">{t('Choose SPY for S&P 500, QQQ for Nasdaq-100, or a specific stock or ETF.')}</p>}
   {key==='deposit'&&<p>{t('{currency} deposit · {rate}%',{currency:'UZS',rate:formatNumber(21,locale)})}</p>}
   {key==='business'&&<label>{t('Assumed annual business return')} (%)<FormattedNumberInput value={value.businessRate} required={false} max={1000} onValueChange={businessRate=>onChange({...value,businessRate})}/></label>}
   {key==='cash'&&<p>{t('USD cash · no interest')}</p>}
  </div>)}</div>
  <p role="status" className={Math.abs(total-100)<1e-8?'':'error'}>{t('Total allocation: {total}%',{total:formatNumber(total,locale)})}</p>
  <p className="comparison-note">{t('Business uses your assumed effective annual return, compounded daily in USD. It does not use recorded business performance. This is a hypothetical comparison, not a forecast. Deposit values include historical UZS exchange-rate changes.')}</p>
 </fieldset>;
}
