"use client";
import { CurrencySelect } from '@/components/currency-select';
import { Trash2 } from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import { FormattedNumberInput } from '@/components/formatted-number-input';
import { InstrumentPicker } from '@/components/instrument-picker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { instrumentFor } from '@/lib/market';
import { formatNumber } from '@/lib/format';
import { allocationKinds, portfolioAssets, portfolioAssetCurrency, type PortfolioAsset, type DiversifiedPortfolio } from '@/lib/diversified-portfolio';

export function DiversifiedPortfolioSettings({value,onChange,currencies}:{currencies:string[];value:DiversifiedPortfolio;onChange:(value:DiversifiedPortfolio)=>void}) {
 const {t,locale}=useLanguage();
 const labels={crypto:'Crypto',stock:'Stock',deposit:'Deposit',business:'Business',cash:'Cash',property:'Real estate',custom:'Custom asset'};
 const assets=portfolioAssets(value);
 function update(id:string,patch:Partial<PortfolioAsset>){onChange({...value,assets:assets.map(asset=>asset.id===id?{...asset,...patch}:asset)});}
 function addAsset(kind:PortfolioAsset['kind'],symbol=''){
  if(assets.length>=20)return;
  onChange({...value,assets:[...assets,{id:crypto.randomUUID(),kind,name:'',weight:0,symbol,currency:kind==='stock'||kind==='crypto'?'USD':currencies[0],rate:0}]});
 }
 function renderAsset(asset:PortfolioAsset){
  const market=asset.kind==='crypto'||asset.kind==='stock';
  const remove=<Button type="button" variant="outline" size="icon" className="portfolio-remove" aria-label={t('Remove {symbol}',{symbol:asset.symbol||asset.name||t(labels[asset.kind])})} onClick={()=>onChange({...value,assets:assets.filter(item=>item.id!==asset.id)})}><Trash2 size={16} aria-hidden="true"/></Button>;
  const allocation=<label>{t('Allocation')} (%)<FormattedNumberInput value={asset.weight} max={100} required={false} onValueChange={weight=>update(asset.id,{weight})}/></label>;
  if(market)return <div className="portfolio-instrument-row" key={asset.id}>
   <InstrumentPicker kind={asset.kind==='crypto'?'Crypto':'Stock'} value={asset.symbol} onChange={name=>{const symbol=instrumentFor({kind:asset.kind==='crypto'?'Crypto':'Stock',name})?.symbol;if(symbol)update(asset.id,{symbol});}}/>
   {allocation}{remove}
  </div>;
  return <section className="diversified-sleeve" key={asset.id}>
   <div className="portfolio-section-heading"><h3>{t(labels[asset.kind])}</h3>{remove}</div>
   <div className="portfolio-asset-fields">
    <label>{t('Name')}<Input value={asset.name} maxLength={100} placeholder={t(labels[asset.kind])} onChange={event=>update(asset.id,{name:event.target.value})}/></label>
    <CurrencySelect value={portfolioAssetCurrency(asset)} savedCurrency={portfolioAssetCurrency(asset)} currencies={currencies} onChange={currency=>update(asset.id,{currency})}/>
    {allocation}
    {asset.kind!=='cash'&&<label>{t(asset.kind==='deposit'?'Annual interest rate':'Assumed annual return')} (%)<FormattedNumberInput value={asset.rate} required={false} max={1000} onValueChange={rate=>update(asset.id,{rate})}/></label>}
   </div>
   {asset.kind==='cash'&&<p className="comparison-note">{t('{currency} cash · no interest',{currency:portfolioAssetCurrency(asset)})}</p>}
  </section>;
 }
 return <fieldset className="diversified-settings"><legend className="sr-only">{t('Diversified portfolio')}</legend>
  <p className="muted">{t('Split each contribution across these investments. Weights must total {target}%. Holdings are not automatically rebalanced.',{target:formatNumber(100,locale)})}</p>
  <div className="diversified-grid">{(['crypto','stock'] as const).filter(kind=>assets.some(asset=>asset.kind===kind)).map(kind=><section className="diversified-sleeve portfolio-instrument-group" key={kind} aria-label={t(labels[kind])}>
   <div className="portfolio-instrument-heading"><h3>{t(labels[kind])}</h3><span>{t('Total allocation: {total}%',{total:formatNumber(assets.filter(asset=>asset.kind===kind).reduce((sum,asset)=>sum+asset.weight,0),locale)})}</span></div>
   <div className="portfolio-instrument-list">{assets.filter(asset=>asset.kind===kind).map(renderAsset)}</div>
   <InstrumentPicker kind={kind==='crypto'?'Crypto':'Stock'} value="" actionLabel={t(kind==='crypto'?'Add coin':'Add stock or ETF')} excludedSymbols={assets.filter(asset=>asset.kind===kind).map(asset=>asset.symbol)} disabled={assets.length>=20} onChange={name=>{const symbol=instrumentFor({kind:kind==='crypto'?'Crypto':'Stock',name})?.symbol;if(symbol)addAsset(kind,symbol);}}/>
  </section>)}{assets.filter(asset=>asset.kind!=='crypto'&&asset.kind!=='stock').map(renderAsset)}</div>

  <p>{t('Add portfolio asset')}</p><div className="flex flex-wrap gap-2">{allocationKinds.filter(kind=>(kind!=='crypto'&&kind!=='stock')||!assets.some(asset=>asset.kind===kind)).map(kind=><Button key={kind} type="button" variant="outline" disabled={assets.length>=20} onClick={()=>addAsset(kind)}>{t(labels[kind])}</Button>)}</div>
  <p className="comparison-note">{t('Deposits, businesses, real estate and custom assets use your assumed annual return in the selected currency, compounded daily. Cash earns no interest. Comparisons include historical exchange-rate changes and are hypothetical, not forecasts.')}</p>
 </fieldset>;
}
