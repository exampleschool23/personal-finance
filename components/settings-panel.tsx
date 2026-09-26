"use client";
import { showSaved } from '@/lib/save-feedback';
import { useUnsavedNavigation } from '@/components/discard-changes';
import { LoadingPlaceholder } from '@/components/loading-placeholder';
import { useState } from 'react';

import { countryOptions } from '@/lib/countries';
import { Plus, X } from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { currencyLabel, fiatCurrencies, type Preferences } from '@/lib/currencies';
export function SettingsPanel({ initial, demo, onSaved, loading, loadError, onRetry }: { initial: Preferences; demo: boolean; onSaved: (p: Preferences) => void; loading: boolean; loadError: string; onRetry:()=>void }) {
  const { t, locale } = useLanguage();
  const [draft, setDraft] = useState(initial);
  const [saved,setSaved]=useState(initial);
  const dirty=JSON.stringify(draft)!==JSON.stringify(saved);
  const confirmation=useUnsavedNavigation(!loading&&!loadError&&dirty);
  const [query, setQuery] = useState('');
  const [currencySearchOpen, setCurrencySearchOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const currencies = fiatCurrencies.filter(c => currencyLabel(c.code, locale).toLowerCase().includes(query.trim().toLowerCase()));
  async function save() {
    setBusy(true); setMessage('');
    try {
      let next = { ...draft, display_name: (draft.display_name ?? '').trim() };
      if (!demo) { const response = await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) }); if (!response.ok) { const data = await response.json() as { error: string }; throw Error(data.error); } next = await response.json() as typeof next; }
      onSaved(next); setDraft(next); setSaved(next); showSaved(next.language);
    } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }
  return <section className="settings-page">
    <header className="preferences-heading"><h2>{t('Profile & preferences')}</h2><p className="muted">{t('Keep your profile details, language, and currency preferences up to date.')}</p></header>
    {loadError && <p className="error" role="alert">{t(loadError)} <Button type="button" variant="outline" onClick={onRetry}>{t('Retry loading settings')}</Button></p>}
    {loading ? <LoadingPlaceholder label={t('Loading settings…')}/> : <form onSubmit={event => { event.preventDefault(); if(dirty&&!busy&&!loadError) void save(); }} className="settings-form preferences-form">
      <fieldset disabled={busy || !!loadError} className="preferences-fields">
        <section className="panel preferences-card"><header><h3>{t('About you')}</h3><p className="muted">{t('Personal details for your profile.')}</p></header>
          <div className="preferences-profile-grid"><label htmlFor="profile-name">{t('Your name (optional)')}<Input id="profile-name" name="name" autoComplete="given-name" maxLength={80} placeholder={t('What should we call you?')} value={draft.display_name ?? ''} onChange={event => setDraft({ ...draft, display_name: event.target.value })}/></label>
          <label htmlFor="profile-country">{t('Country / region (optional)')}<NativeSelect id="profile-country" name="country" autoComplete="country" value={draft.country ?? ''} onChange={event => setDraft({ ...draft, country: event.target.value })}><option value="">{t('Select your country')}</option>{countryOptions(locale).map(country => <option key={country.code} value={country.code}>{country.name}</option>)}</NativeSelect></label></div>
        </section>
        <section className="panel preferences-card"><header><h3>{t('Language')}</h3><p className="muted">{t('Choose the language for the app.')}</p></header>
          <label className="preferences-setting-row">{t('App language')}<NativeSelect value={draft.language} onChange={event => setDraft({ ...draft, language: event.target.value as Preferences['language'] })}><option value="en">English</option><option value="ru">Русский</option><option value="uz">O‘zbekcha</option></NativeSelect></label>
        </section>
        <section className="panel preferences-card"><header><h3>{t('Currencies')}</h3><p className="muted">{t('Choose the currencies you use.')}</p></header>
          <label className="preferences-setting-row">{t('Primary currency')}<NativeSelect value={draft.currencies[0]} onChange={event => setDraft({ ...draft, currencies: [event.target.value, ...draft.currencies.filter(c => c !== event.target.value)] })}>{draft.currencies.map(code => <option key={code} value={code}>{currencyLabel(code, locale)}</option>)}</NativeSelect></label>
          <div className="preferences-currency-section"><h4>{t('Preferred currencies')}</h4><p className="muted">{t('Available when choosing a currency.')}</p>
            <ul className="preferences-currency-list">{draft.currencies.map((code,index) => <li key={code}><span className="preferences-currency-code">{code}</span><span className="preferences-currency-name">{currencyLabel(code,locale).split(' · ').slice(1).join(' · ')}</span>{index===0?<span className="preferences-primary">{t('Primary')}</span>:<Button type="button" variant="ghost" size="icon" onClick={() => setDraft({ ...draft, currencies: draft.currencies.filter(c => c !== code) })} aria-label={t('Remove {currency}', { currency: code })}><X size={16} aria-hidden="true"/></Button>}</li>)}</ul>
            <Dialog open={currencySearchOpen} onOpenChange={open=>{setCurrencySearchOpen(open);if(!open)setQuery('');}}><DialogTrigger asChild><Button type="button" variant="ghost" className="currency-search-trigger"><Plus size={18} aria-hidden="true"/>{t('Add currency')}</Button></DialogTrigger><DialogContent className="currency-search-dialog sm:max-w-xl" showCloseButton={false}><DialogHeader><DialogTitle>{t('Preferred currencies')}</DialogTitle><DialogDescription>{t('Choose as many as you need. The primary currency opens by default.')}</DialogDescription></DialogHeader><Input aria-label={t('Search currencies')} placeholder={t('Search currencies')} value={query} onChange={e=>setQuery(e.target.value)}/><div className="currency-catalogue">{currencies.map(c => <label key={c.code}><input type="checkbox" checked={draft.currencies.includes(c.code)} disabled={draft.currencies.length === 1 && draft.currencies.includes(c.code)} onChange={e => setDraft({ ...draft, currencies: e.target.checked ? [...draft.currencies, c.code] : draft.currencies.filter(code => code !== c.code) })}/><span>{currencyLabel(c.code, locale)}</span></label>)}{!currencies.length&&<p className="muted currency-search-empty" role="status">{t('No matching currencies.')}</p>}</div><div className="currency-search-footer"><DialogClose asChild><Button type="button">{t('Done')}</Button></DialogClose></div></DialogContent></Dialog>
          </div>
        </section>
      </fieldset>
      <div className="panel preferences-save-bar"><span className="preferences-save-status" role="status"><span className={dirty?'preferences-status-dot is-dirty':'preferences-status-dot'} aria-hidden="true"/>{t(dirty?'Unsaved changes':'All changes saved')}</span><div><Button type="button" variant="outline" disabled={!dirty||busy} onClick={()=>{setDraft(saved);setMessage('');setQuery('');}}>{t('Discard')}</Button><Button type="submit" disabled={!dirty||busy||!!loadError}>{t(busy?'Saving…':'Save changes')}</Button></div>{message && <p className="error" role="alert">{t(message)}</p>}</div>
    </form>}{confirmation}
  </section>;
}
