"use client";
import { ChevronDown, Plus } from 'lucide-react';
import { LanguageSelector, useLanguage } from '@/components/language-provider';
import { ThemeToggle } from '@/components/theme-provider';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { formatDate, formatNumber } from '@/lib/format';
import { useWorkspace } from '@/components/workspace/workspace-provider';

/** Language and theme choices, shared by the top bar and the sign-in screen. */
export function DisplayPreferences() {
 return <div className="preferences"><LanguageSelector compact/><ThemeToggle/></div>;
}

/** The sticky bar above every screen: where you are, the display currency and the quick expense shortcut. */
/** `pendingSection` names a destination tapped in the drawer whose route is still loading. */
export function TopBar({ pendingSection }: { pendingSection?: string | null }) {
 const { t, locale } = useLanguage();
 const { section: current, currency, setCurrency, preferencesData, demo, market, marketLoading, refresh, quickExpense } = useWorkspace();
 const section = pendingSection ?? current;
 const date = (value: string) => formatDate(value, locale);
 return <header className="topbar">
  <div className="topbar-location"><SidebarTrigger aria-label={t('Toggle Sidebar')}/><span>{t(section)}</span></div>
  <div className="topbar-actions">
   <Popover>
    <PopoverTrigger asChild><Button variant="outline" size="sm" className="header-currency-trigger" aria-label={t('Display currency')}>{currency}<ChevronDown size={14} aria-hidden="true"/></Button></PopoverTrigger>
    <PopoverContent align="end" className="header-currency-popover"><div className="header-currency-panel">
     <div className="currency-bar"><div className="currency-switch" aria-label={t("Display currency")}>{preferencesData.currencies.map(c => <button key={c} aria-pressed={currency === c} className={currency === c ? 'selected' : ''} onClick={() => setCurrency(c)}>{c}</button>)}</div><span>{t('Balances converted to {currency}.', { currency })}</span></div>
     <div className="market-bar"><span>{demo ? t('Illustrative sample prices and exchange rates.') : market?.ratesDate && currency !== 'UZS' ? t('Daily exchange rates · {date}', { date: date(market.ratesDate) }) : market?.fx ? t('1 USD = {rate} UZS · CBU · {date}', { rate: formatNumber(market.fx.rate, locale), date: date(market.fx.date) }) : t(marketLoading ? 'Fetching prices…' : 'Exchange rate unavailable. Only records in the selected currency are included.')}</span><Button variant="outline" size="sm" disabled={marketLoading || demo} onClick={refresh}>{t(marketLoading ? 'Fetching prices…' : 'Refresh prices')}</Button></div>
     {market?.ratesDate && <p className="fx-attribution"><a href="https://www.exchangerate-api.com" target="_blank" rel="noreferrer">Rates By Exchange Rate API</a> · {date(market.ratesDate)}</p>}
    </div></PopoverContent>
   </Popover>
   <Button size="sm" className="quick-expense" aria-label={t('Quick expense')} onClick={quickExpense}><Plus size={16} aria-hidden="true"/><span>{t('Quick expense')}</span></Button>
   <DisplayPreferences/>
  </div>
 </header>;
}
