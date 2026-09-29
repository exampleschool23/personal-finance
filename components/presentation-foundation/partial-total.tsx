import { useLanguage } from '@/components/language-provider';
export function PartialTotal({currencies}:{currencies:string[]}){
 const {t}=useLanguage();return currencies.length?<span className="partial-total" role="status">{t('Partial total · Excluded currencies: {currencies}',{currencies:currencies.join(', ')})}</span>:null;
}
