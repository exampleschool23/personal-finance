"use client";
import { InlineError } from '@/components/presentation-foundation/inline-error';
import { InfoHint } from '@/components/presentation-foundation/info-hint';
import { showError, showSaved } from '@/lib/feedback';
import { LoadingPlaceholder } from '@/components/presentation-foundation/loading-placeholder';
import { useEffect, useState } from 'react';

import { countryOptions } from '@/lib/countries';
import { fonts, isFont, resolveFont } from '@/lib/fonts';
import { formatMoney } from '@/lib/format';
import { Plus, X } from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import { languageCatalogue } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { currencyLabel, fiatCurrencies, maxPreferredCurrencies, replacePreferredCurrency, togglePreferredCurrency, type Preferences } from '@/lib/currencies';
export function SettingsPanel({ initial, demo, onSaved, loading, loadError, onRetry, onRestartSetup }: { initial: Preferences; demo: boolean; onSaved: (p: Preferences) => void; loading: boolean; loadError: string; onRetry:()=>void; onRestartSetup?:()=>Promise<void> }) {
  const { t, locale } = useLanguage();
  const [draft, setDraft] = useState(initial);
  const [saved,setSaved]=useState(initial);
  const serialized=JSON.stringify(draft);
  const dirty=serialized!==JSON.stringify(saved);
  // Typing a name waits until the owner pauses or leaves the field; every other change saves at once.
  const typingName=dirty&&JSON.stringify({...draft,display_name:saved.display_name})===JSON.stringify(saved);
  const [committed,setCommitted]=useState('');
  const [failed,setFailed]=useState('');
  const [query, setQuery] = useState('');
  const [currencySearchOpen, setCurrencySearchOpen] = useState(false);
  const [currencyNotice, setCurrencyNotice] = useState<{ code: string; reason: 'full' | 'last' } | null>(null);
  const [busy, setBusy] = useState(false);
  function toggleCurrency(code: string) {
    const result = togglePreferredCurrency(draft.currencies, code);
    if ('blocked' in result) setCurrencyNotice({ code, reason: result.blocked });
    else setDraft({ ...draft, currencies: result.currencies });
  }
  const currencies = fiatCurrencies.filter(c => currencyLabel(c.code, locale).toLowerCase().includes(query.trim().toLowerCase()));
  async function save(snapshot: Preferences) {
    setBusy(true);
    try {
      let next = { ...snapshot, display_name: (snapshot.display_name ?? '').trim() };
      if (!demo) { const response = await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...snapshot, onboarded: undefined }) }); if (!response.ok) { const data = await response.json() as { error: string }; throw Error(data.error); } next = await response.json() as typeof next; }
      onSaved(next); setSaved(next); setDraft(current => JSON.stringify(current) === JSON.stringify(snapshot) ? next : current); showSaved(next.language);
    } catch (error) { setFailed(JSON.stringify(snapshot)); showError((error as Error).message || 'Could not save settings. Try again.'); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    if (loading || loadError || busy || !dirty || serialized === failed) return;
    const timer = setTimeout(() => void save(draft), typingName && committed !== serialized ? 900 : 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, loadError, busy, dirty, serialized, failed, typingName, committed]);
  return <section className="settings-page">
    <header className="preferences-heading"><h2>{t('Profile & preferences')}<InfoHint>{t('Keep your profile details, language, and currency preferences up to date.')}</InfoHint></h2></header>
    {loadError && <InlineError message={t(loadError)}><Button type="button" variant="outline" onClick={onRetry}>{t('Retry loading settings')}</Button></InlineError>}
    {loading ? <LoadingPlaceholder label={t('Loading settings…')}/> : <form onSubmit={event => { event.preventDefault(); setCommitted(serialized); }} className="settings-form preferences-form">
      <fieldset disabled={!!loadError} className="preferences-fields">
        <section className="panel preferences-card"><header><h3>{t('About you')}</h3><p className="muted">{t('Personal details for your profile.')}</p></header>
          <div className="preferences-profile-grid"><label htmlFor="profile-name">{t('Your name (optional)')}<Input id="profile-name" name="name" autoComplete="given-name" maxLength={80} placeholder={t('What should we call you?')} value={draft.display_name ?? ''} onChange={event => setDraft({ ...draft, display_name: event.target.value })} onBlur={() => setCommitted(serialized)}/></label>
          <label htmlFor="profile-country">{t('Country / region (optional)')}<NativeSelect id="profile-country" name="country" autoComplete="country" value={draft.country ?? ''} onChange={event => setDraft({ ...draft, country: event.target.value })}><option value="">{t('Select your country')}</option>{countryOptions(locale).map(country => <option key={country.code} value={country.code}>{country.name}</option>)}</NativeSelect></label></div>
          {onRestartSetup && <p className="muted preferences-setup-again">{t('Want to go through the welcome setup again?')} <Button type="button" variant="outline" size="sm" disabled={busy||dirty} onClick={() => { setBusy(true); onRestartSetup().catch(error => showError((error as Error).message)).finally(() => setBusy(false)); }}>{t('Run setup again')}</Button></p>}
        </section>
        <section className="panel preferences-card"><header><h3>{t('Language')}</h3><p className="muted">{t('Choose the language for the app.')}</p></header>
          <label className="preferences-setting-row">{t('App language')}<NativeSelect value={draft.language} onChange={event => setDraft({ ...draft, language: event.target.value as Preferences['language'] })}>{languageCatalogue.map(item => <option key={item.code} value={item.code}>{item.native}</option>)}</NativeSelect></label>
        </section>
        <section className="panel preferences-card"><header><h3>{t('Appearance')}</h3><p className="muted">{t('Choose the font used across the app. It is saved to your account, so the web and mobile apps match.')}</p></header>
          <label className="preferences-setting-row">{t('Font')}<NativeSelect value={resolveFont(draft.font)} onChange={event => { if (isFont(event.target.value)) setDraft({ ...draft, font: event.target.value }); }}>{fonts.map(font => <option key={font.id} value={font.id}>{font.id === 'inter' ? t('{font} (current)', { font: font.name }) : font.name}</option>)}</NativeSelect></label>
          <p className="font-preview" data-font={resolveFont(draft.font)} aria-hidden="true"><strong>{t('Net worth')} · Итого</strong><span>{formatMoney(1234567, draft.currencies[0], locale)} · AaBbCc ÁáÉé АаБбВв</span></p>
        </section>
        <section className="panel preferences-card"><header><h3>{t('Currencies')}</h3><p className="muted">{t('Choose the currencies you use.')}</p></header>
          <label className="preferences-setting-row">{t('Primary currency')}<NativeSelect value={draft.currencies[0]} onChange={event => setDraft({ ...draft, currencies: [event.target.value, ...draft.currencies.filter(c => c !== event.target.value)] })}>{draft.currencies.map(code => <option key={code} value={code}>{currencyLabel(code, locale)}</option>)}</NativeSelect></label>
          <div className="preferences-currency-section"><h4>{t('Preferred currencies')}</h4><p className="muted">{t('Shown in the top bar and whenever you choose a currency. Choose one or two.')}</p>
            <ul className="preferences-currency-list">{draft.currencies.map((code,index) => <li key={code}><span className="preferences-currency-code">{code}</span><span className="preferences-currency-name">{currencyLabel(code,locale).split(' · ').slice(1).join(' · ')}</span>{index===0?<span className="preferences-primary">{t('Primary')}</span>:<Button type="button" variant="ghost" size="icon" onClick={() => setDraft({ ...draft, currencies: draft.currencies.filter(c => c !== code) })} aria-label={t('Remove {currency}', { currency: code })}><X size={16} aria-hidden="true"/></Button>}</li>)}</ul>
            <Dialog open={currencySearchOpen} onOpenChange={open=>{setCurrencySearchOpen(open);if(!open)setQuery('');}}><DialogTrigger asChild><Button type="button" variant="ghost" className="currency-search-trigger"><Plus size={18} aria-hidden="true"/>{t(draft.currencies.length<maxPreferredCurrencies?'Add currency':'Change currencies')}</Button></DialogTrigger><DialogContent className="currency-search-dialog sm:max-w-xl" showCloseButton={false}><DialogHeader><DialogTitle>{t('Preferred currencies')}</DialogTitle><DialogDescription>{t('Choose one or two currencies. The primary currency opens by default.')}</DialogDescription></DialogHeader><Input aria-label={t('Search currencies')} placeholder={t('Search currencies')} value={query} onChange={e=>setQuery(e.target.value)}/><div className="currency-catalogue">{currencies.map(c => <label key={c.code}><input type="checkbox" checked={draft.currencies.includes(c.code)} onChange={() => toggleCurrency(c.code)}/><span>{currencyLabel(c.code, locale)}</span></label>)}{!currencies.length&&<p className="muted currency-search-empty" role="status">{t('No matching currencies.')}</p>}</div><div className="currency-search-footer"><DialogClose asChild><Button type="button">{t('Done')}</Button></DialogClose></div></DialogContent></Dialog>
            <AlertDialog open={!!currencyNotice} onOpenChange={open=>{if(!open)setCurrencyNotice(null);}}><AlertDialogContent>
              <AlertDialogTitle>{t(currencyNotice?.reason==='last'?'Keep at least one currency':'You already have two currencies')}</AlertDialogTitle>
              <AlertDialogDescription>{currencyNotice&&t(currencyNotice.reason==='last'?'{code} is your only currency, so it can’t be cleared. Pick another currency first.':'You can keep up to two preferred currencies. Choose which one {code} replaces.',{code:currencyNotice.code})}</AlertDialogDescription>
              <AlertDialogFooter>{currencyNotice?.reason==='full'?<><AlertDialogCancel>{t('Cancel')}</AlertDialogCancel>{draft.currencies.map(code=><AlertDialogAction key={code} onClick={()=>setDraft({...draft,currencies:replacePreferredCurrency(draft.currencies,code,currencyNotice.code)})}>{t('Replace {code}',{code})}</AlertDialogAction>)}</>:<AlertDialogAction>{t('OK')}</AlertDialogAction>}</AlertDialogFooter>
            </AlertDialogContent></AlertDialog>
          </div>
        </section>
      </fieldset>
    </form>}
  </section>;
}
