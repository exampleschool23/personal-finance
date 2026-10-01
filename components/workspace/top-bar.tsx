"use client";
import { ChevronDown, Plus, RefreshCw } from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import { ThemeToggle } from '@/components/theme-provider';
import { Segmented } from '@/components/presentation-foundation/segmented';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { formatDate, formatNumber } from '@/lib/format';
import { useWorkspace } from '@/components/workspace/workspace-provider';

/** Theme choice for the top bar. The language is chosen once, in onboarding or Settings. */
export function DisplayPreferences() {
 return <div className="preferences"><ThemeToggle/></div>;
}

/** The sticky bar above every screen: where you are, the display currency and the quick expense shortcut. */
/** `pendingSection` names a destination tapped in the drawer whose route is still loading. */
export function TopBar({ pendingSection }: { pendingSection?: string | null }) {
 const { t, locale } = useLanguage();
 const { section: current, currency, setCurrency, preferencesData, demo, market, marketLoading, refresh, quickExpense } = useWorkspace();
 const section = pendingSection ?? current;
 const date = (value: string) => formatDate(value, locale);
 const rateStatus = demo ? t('Illustrative sample prices and exchange rates.')
  : market?.ratesDate && currency !== 'UZS' ? t('Updated {date}', { date: date(market.ratesDate) })
  : market?.fx ? t('1 USD = {rate} UZS · CBU · {date}', { rate: formatNumber(market.fx.rate, locale), date: date(market.fx.date) })
  : t(marketLoading ? 'Fetching prices…' : 'Exchange rate unavailable. Only records in the selected currency are included.');
 return <header className="topbar">
  <div className="topbar-location"><SidebarTrigger aria-label={t('Toggle Sidebar')}/><span>{t(section)}</span></div>
  <div className="topbar-actions">
   <Popover>
    <PopoverTrigger asChild><Button variant="outline" size="sm" className="header-currency-trigger" aria-label={t('Display currency')}>{currency}<ChevronDown size={14} aria-hidden="true"/></Button></PopoverTrigger>
    <PopoverContent align="end" className="header-currency-popover">
     <section className="header-currency-section">
      <h2>{t('Display currency')}</h2>
      <Segmented label={t('Display currency')} options={preferencesData.currencies.map(c => ({ value: c, label: c }))} value={currency} onChange={setCurrency}/>
      <p>{t('Balances converted to {currency}.', { currency })}</p>
     </section>
     <section className="header-currency-section header-currency-rates">
      <div><h2>{t('Exchange rates')}</h2><p>{rateStatus}</p></div>
      <Button variant="outline" size="icon" aria-label={t(marketLoading ? 'Fetching prices…' : 'Refresh prices')} title={t('Refresh prices')} disabled={marketLoading || demo} onClick={refresh}><RefreshCw className={marketLoading ? 'animate-spin motion-reduce:animate-none' : undefined} aria-hidden="true"/></Button>
      {market?.ratesDate && <a className="fx-attribution" href="https://www.exchangerate-api.com" target="_blank" rel="noreferrer">Rates By Exchange Rate API</a>}
     </section>
    </PopoverContent>
   </Popover>
   <Button size="sm" className="quick-expense" aria-label={t('Quick expense')} onClick={quickExpense}><Plus size={16} aria-hidden="true"/><span>{t('Quick expense')}</span></Button>
   <DisplayPreferences/>
  </div>
 </header>;
}
